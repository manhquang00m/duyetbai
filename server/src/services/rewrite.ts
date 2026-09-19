import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { db } from '../db';
import { getSetting } from '../db/settings';
import { cellText } from './importer';
import { chatComplete } from './llm';
import { fileStamp } from '../utils/fileStamp';
import { EXPORT_DIR } from '../config';

export interface RewriteRow {
  id: number;
  batch_id: string;
  row_index: number;
  original: string;
  rewritten: string | null;
  error: string | null;
}

export interface RewriteBatch {
  batch_id: string;
  file_name: string;
  file_path: string;
  src_col: number;
  dest_col: number;
  created_at: string;
}

export const DEFAULT_REWRITE_PROMPT = [
  'Ban la copywriter tieng Viet chuyen viet caption ban hang affiliate.',
  'Nhiem vu: viet lai caption duoi day cho muot, tu nhien va thu hut hon.',
  'Yeu cau:',
  '- Dien dat KHAC ban goc (khong chep lai nguyen cau), nhung giu dung y va thong tin san pham.',
  '- Giu nguyen moi hashtag va moi placeholder dang [[LINK1]], [[LINK2]]: khong sua, khong bo, khong them moi.',
  '- Khong bia them thong tin, gia, khuyen mai khong co trong ban goc.',
  '- Giu DUNG ten va loai san pham nhu ban goc, tuyet doi khong doi sang san pham khac.',
  '- Giu do dai tuong duong ban goc, viet bang tieng Viet co dau.',
  '- CHI tra ve caption da viet lai, khong giai thich, khong them tieu de.',
].join('\n');

const REWRITE_PROMPT_KEY = 'rewrite_prompt';

export function getRewritePrompt(): string {
  return getSetting(REWRITE_PROMPT_KEY) || DEFAULT_REWRITE_PROMPT;
}

// ===== Bao ve link: AI rat de sua lech/bia lai URL nen thay bang placeholder truoc khi gui,
// nhan ket qua thi thay nguoc lai -> link ve dung tung ky tu, khong phu thuoc AI co ngoan hay khong.
const URL_RE = /https?:\/\/\S+/gi;
const PLACEHOLDER_RE = /\[\[\s*LINK\s*(\d+)\s*\]\]/gi;

function maskLinks(text: string): { masked: string; links: string[] } {
  const links: string[] = [];
  const masked = text.replace(URL_RE, (m) => {
    links.push(m);
    return `[[LINK${links.length}]]`;
  });
  return { masked, links };
}

function unmaskLinks(text: string, links: string[]): string {
  const restored = text.replace(PLACEHOLDER_RE, (m, idx: string) => links[Number(idx) - 1] ?? m);
  // AI co the lam rot han placeholder -> noi lai link bi thieu xuong cuoi, tha thua con hon mat link.
  const missing = links.filter((l) => !restored.includes(l));
  return missing.length ? [restored, ...missing].join('\n') : restored;
}

// ===== DB =====
const insertBatch = db.prepare(
  `INSERT INTO rewrite_batches (batch_id, file_name, file_path, src_col, dest_col, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const insertRow = db.prepare(
  'INSERT INTO rewrite_rows (batch_id, row_index, original) VALUES (?, ?, ?)',
);
const selectBatch = db.prepare('SELECT * FROM rewrite_batches WHERE batch_id = ?');
const selectRows = db.prepare('SELECT * FROM rewrite_rows WHERE batch_id = ? ORDER BY row_index');
const selectRow = db.prepare('SELECT * FROM rewrite_rows WHERE id = ?');
const updateRowOk = db.prepare('UPDATE rewrite_rows SET rewritten = ?, error = NULL WHERE id = ?');
const updateRowErr = db.prepare('UPDATE rewrite_rows SET error = ? WHERE id = ?');

export function getBatch(batchId: string): RewriteBatch | null {
  return (selectBatch.get(batchId) as RewriteBatch | undefined) ?? null;
}

export function listRows(batchId: string): RewriteRow[] {
  return selectRows.all(batchId) as unknown as RewriteRow[];
}

export function getRow(id: number): RewriteRow | null {
  return (selectRow.get(id) as RewriteRow | undefined) ?? null;
}

/** Luu ban sua tay (khong goi AI). */
export function saveRewritten(id: number, text: string): void {
  updateRowOk.run(text, id);
}

/**
 * Doc file Excel vua upload -> tao 1 batch + cac dong caption.
 * File goc duoc GIU LAI (khong xoa nhu luong import Shopee) vi luc xuat con mo lai de ghi de
 * dung o, giu nguyen toan bo cac cot/sheet khac.
 */
export async function createRewriteBatch(
  filePath: string,
  fileName: string,
  opts: { srcCol?: number; destCol?: number } = {},
): Promise<{ batchId: string; total: number }> {
  const srcCol = opts.srcCol ?? 2; // B = Caption
  const destCol = opts.destCol ?? 11; // K = noi ghi caption goc luc xuat

  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    await wb.csv.readFile(filePath);
  } else {
    await wb.xlsx.readFile(filePath);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File khong co sheet nao');

  const batchId = randomUUID();
  insertBatch.run(batchId, fileName, filePath, srcCol, destCol, new Date().toISOString());

  let total = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const text = cellText(ws.getRow(r).getCell(srcCol).value).trim();
    if (!text) continue; // o rong -> bo qua, khong tao dong vo nghia
    insertRow.run(batchId, r, text);
    total += 1;
  }
  return { batchId, total };
}

/** Viet lai 1 dong bang AI roi luu ket qua. Dung cho ca job hang loat lan nut "viet lai dong nay". */
export async function rewriteRow(id: number): Promise<{ ok: boolean; text?: string; error?: string }> {
  const row = getRow(id);
  if (!row) return { ok: false, error: 'khong tim thay dong' };

  try {
    const { masked, links } = maskLinks(row.original);
    const out = await chatComplete(getRewritePrompt(), masked);
    const text = unmaskLinks(out, links);
    updateRowOk.run(text, id);
    return { ok: true, text };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    updateRowErr.run(msg, id);
    return { ok: false, error: msg };
  }
}

/**
 * Mo lai file goc, ghi caption goc sang cot K va ban viet lai vao cot B, xuat file moi.
 * exceljs giu nguyen cac cot/sheet con lai nen file van tha thang vao tool auto dang duoc.
 */
export async function exportRewriteBatch(batchId: string): Promise<{ path: string; name: string }> {
  const batch = getBatch(batchId);
  if (!batch) throw new Error('Khong tim thay batch');
  if (!fs.existsSync(batch.file_path)) {
    throw new Error('File goc cua batch nay khong con tren dia, hay upload lai');
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(batch.file_path);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File khong co sheet nao');

  ws.getRow(1).getCell(batch.dest_col).value = 'Caption gốc';
  for (const row of listRows(batchId)) {
    const target = ws.getRow(row.row_index);
    target.getCell(batch.dest_col).value = row.original;
    target.getCell(batch.src_col).value = row.rewritten || row.original;
  }
  ws.getColumn(batch.src_col).alignment = { wrapText: true, vertical: 'top' };
  ws.getColumn(batch.dest_col).alignment = { wrapText: true, vertical: 'top' };

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const out = path.join(EXPORT_DIR, `rewrite_${batchId}.xlsx`);
  await wb.xlsx.writeFile(out);

  // Ten file tai ve lay tu ten file goc nhung da lam sach - duong dan thi luon do server tu dat.
  const safeBase = path
    .basename(batch.file_name, path.extname(batch.file_name))
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .slice(0, 80);
  return { path: out, name: `${safeBase || 'caption'}_viet_lai_${fileStamp()}.xlsx` };
}
