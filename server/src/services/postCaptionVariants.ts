import { db } from '../db';
import { getSetting, setSetting } from '../db/settings';
import { listRewritablePosts } from '../db/distribution';
import ExcelJS from 'exceljs';
import { maskLinks, unmaskLinks } from './rewrite';
import { chatComplete } from './llm';
import { cellText } from './importer';

export const VARIANT_COUNT = 3;

export const DEFAULT_VARIANT_PROMPT = [
  'Ban la copywriter tieng Viet chuyen viet caption ban hang affiliate.',
  `Nhiem vu: viet lai caption duoi day thanh ${VARIANT_COUNT} phien ban KHAC NHAU - khac ca ban`,
  'goc lan khac nhau giua cac phien ban voi nhau (khong chi doi vai tu).',
  'Yeu cau cho MOI phien ban:',
  '- Dien dat khac nhau ro ret, nhung giu dung y va thong tin san pham.',
  '- Giu nguyen moi hashtag va moi placeholder dang [[LINK1]], [[LINK2]]: khong sua, khong bo, khong them moi.',
  '- Khong bia them thong tin, gia, khuyen mai khong co trong ban goc.',
  '- Giu DUNG ten va loai san pham nhu ban goc, tuyet doi khong doi sang san pham khac.',
  '- Giu do dai tuong duong ban goc, viet bang tieng Viet co dau.',
  `Dinh dang tra ve: DUNG ${VARIANT_COUNT} dong, moi dong bat dau bang "1. ", "2. "... theo thu tu,`,
  'khong giai thich, khong tieu de, khong dong trong.',
].join('\n');

const VARIANT_PROMPT_KEY = 'variant_rewrite_prompt';

export function getVariantRewritePrompt(): string {
  return getSetting(VARIANT_PROMPT_KEY) || DEFAULT_VARIANT_PROMPT;
}

export function saveVariantRewritePrompt(prompt: string): void {
  setSetting(VARIANT_PROMPT_KEY, prompt || DEFAULT_VARIANT_PROMPT);
}

export interface VariantStatusRow {
  post_id: string;
  caption: string;
  topic: string | null;
  variant_count: number;
}

/**
 * Bai hop le cho viec viet lai (tap bai Phan phoi bai se dung toi, ke ca bai chua cap nhat link
 * Shopee moi - xem listRewritablePosts), kem so ban da co - bai CHUA DU 3 ban len dau de xu ly
 * truoc (cung tinh than uu tien "chua lam" nhu popup gan chu de theo tac gia).
 */
export function listVariantStatus(): VariantStatusRow[] {
  const clean = listRewritablePosts();
  if (clean.length === 0) return [];

  const captionOf = new Map(
    (
      db
        .prepare(
          `SELECT post_id, caption FROM posts WHERE post_id IN (${clean.map(() => '?').join(',')})`,
        )
        .all(...clean.map((c) => c.post_id)) as { post_id: string; caption: string }[]
    ).map((r) => [r.post_id, r.caption]),
  );
  const countOf = new Map(
    (
      db
        .prepare(
          `SELECT post_id, COUNT(*) AS n FROM post_caption_variants
            WHERE post_id IN (${clean.map(() => '?').join(',')}) GROUP BY post_id`,
        )
        .all(...clean.map((c) => c.post_id)) as { post_id: string; n: number }[]
    ).map((r) => [r.post_id, r.n]),
  );

  return clean
    .map((c) => ({
      post_id: c.post_id,
      caption: captionOf.get(c.post_id) ?? '',
      topic: c.topic,
      variant_count: countOf.get(c.post_id) ?? 0,
    }))
    .sort((a, b) => a.variant_count - b.variant_count);
}

/** Bai hop le nhung CHUA DU 3 ban - dung cho job hang loat (mac dinh khong lam lai bai da xong). */
export function listMissingPostIds(): string[] {
  return listVariantStatus()
    .filter((r) => r.variant_count < VARIANT_COUNT)
    .map((r) => r.post_id);
}

/** 3 ban caption da viet cho 1 bai (rong neu chua viet) - dung khi bung dong xem tren UI. */
export function listVariantsForPost(postId: string): { variant_index: number; caption: string }[] {
  return db
    .prepare(
      'SELECT variant_index, caption FROM post_caption_variants WHERE post_id = ? ORDER BY variant_index',
    )
    .all(postId) as { variant_index: number; caption: string }[];
}

const insertVariant = db.prepare(
  `INSERT INTO post_caption_variants (post_id, variant_index, caption, created_at)
   VALUES (?, ?, ?, ?)`,
);
const clearVariants = db.prepare('DELETE FROM post_caption_variants WHERE post_id = ?');
const countVariants = db.prepare(
  'SELECT COUNT(*) AS n FROM post_caption_variants WHERE post_id = ?',
);
const captionFor = db.prepare('SELECT caption FROM posts WHERE post_id = ?');

/** Ghi de du VARIANT_COUNT ban cua 1 bai trong 1 transaction. */
function saveVariants(postId: string, variants: string[]): void {
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    clearVariants.run(postId);
    variants.forEach((caption, i) => insertVariant.run(postId, i + 1, caption, now));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const LINE_RE = /^\s*(\d+)\.\s*(.+)$/gm;

/** Parse dung DUNG VARIANT_COUNT dong danh so 1..N - thieu/lech thi coi ca lan goi la loi. */
function parseVariants(text: string): string[] {
  const found = new Map<number, string>();
  for (const m of text.matchAll(LINE_RE)) {
    const idx = Number(m[1]);
    const body = m[2].trim();
    if (idx >= 1 && idx <= VARIANT_COUNT && body) found.set(idx, body);
  }
  if (found.size !== VARIANT_COUNT) {
    throw new Error(
      `AI tra ve ${found.size}/${VARIANT_COUNT} phien ban hop le - thu lai hoac sua prompt`,
    );
  }
  const out: string[] = [];
  for (let i = 1; i <= VARIANT_COUNT; i++) out.push(found.get(i)!);
  return out;
}

/**
 * Viet lai VARIANT_COUNT ban cho 1 bai bang 1 request AI duy nhat, luu ca 3 trong 1 transaction.
 * force=false: bo qua neu da du ban (tiet kiem quota khi chay hang loat).
 */
export async function generateVariantsForPost(
  postId: string,
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!force) {
    const n = (countVariants.get(postId) as { n: number }).n;
    if (n >= VARIANT_COUNT) return { ok: true };
  }

  const row = captionFor.get(postId) as { caption: string } | undefined;
  if (!row) return { ok: false, error: 'khong tim thay bai' };

  try {
    const { masked, links } = maskLinks(row.caption);
    const out = await chatComplete(getVariantRewritePrompt(), masked);
    const variants = parseVariants(out).map((v) => unmaskLinks(v, links));

    saveVariants(postId, variants);
    return { ok: true };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    return { ok: false, error: msg };
  }
}

// ===== Viet lai ngoai app (vd Claude): xuat caption goc -> dien 3 ban -> nhap lai =====
// Link duoc thay bang [[LINKn]] nhu khi gui Gemini; luc nhap tinh lai tu caption goc trong DB.
const HEADER = ['POST_ID', 'Caption gốc', 'Bản 1', 'Bản 2', 'Bản 3'];
const COL_POST = 1;
const COL_FIRST_VARIANT = 3;
const MAX_VARIANT_LEN = 5000;

export async function exportVariantsXlsx(filePath: string, scope: 'missing' | 'all'): Promise<number> {
  const rows = listVariantStatus().filter((r) => scope === 'all' || r.variant_count < VARIANT_COUNT);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('captions');
  ws.addRow(HEADER);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow([r.post_id, maskLinks(r.caption).masked, '', '', '']);
  ws.getColumn(1).width = 18;
  for (let c = 2; c <= 5; c++) {
    ws.getColumn(c).width = 60;
    ws.getColumn(c).alignment = { wrapText: true, vertical: 'top' };
  }

  const guide = wb.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 120;
  guide.getColumn(1).alignment = { wrapText: true, vertical: 'top' };
  [
    'CÁCH DÙNG: đưa file này cho AI (vd Claude) kèm prompt bên dưới, yêu cầu trả lại file .xlsx GIỮ NGUYÊN cấu trúc sheet "captions".',
    '- Chỉ điền cột C, D, E (Bản 1/2/3). Không sửa cột A (POST_ID) và không đổi thứ tự cột.',
    '- Giữ nguyên các placeholder [[LINK1]], [[LINK2]]... — app tự thay lại link thật khi nhập.',
    '- Mỗi dòng phải đủ 3 bản mới được lưu; dòng để trống sẽ bị bỏ qua.',
    '',
    'PROMPT (giọng văn đang cấu hình trong app):',
    getVariantRewritePrompt(),
  ].forEach((line) => guide.addRow([line]));

  await wb.xlsx.writeFile(filePath);
  return rows.length;
}

export interface VariantImportResult {
  saved: number;
  skipped: number; // dong chua dien ban nao
  errors: { row: number; postId: string; error: string }[];
}

export async function importVariantsXlsx(filePath: string): Promise<VariantImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet('captions') ?? wb.worksheets[0];
  if (!ws) throw new Error('File không có sheet nào');

  const result: VariantImportResult = { saved: 0, skipped: 0, errors: [] };
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const postId = cellText(row.getCell(COL_POST).value).trim();
    const variants = Array.from({ length: VARIANT_COUNT }, (_, i) =>
      cellText(row.getCell(COL_FIRST_VARIANT + i).value).trim(),
    );
    const filled = variants.filter(Boolean).length;
    if (!postId && filled === 0) continue;
    if (filled === 0) {
      result.skipped++;
      continue;
    }
    const fail = (error: string) => result.errors.push({ row: r, postId, error });
    if (filled < VARIANT_COUNT) {
      fail(`Mới có ${filled}/${VARIANT_COUNT} bản — cần đủ cả 3`);
      continue;
    }
    const post = captionFor.get(postId) as { caption: string } | undefined;
    if (!post) {
      fail('POST_ID không có trong kho bài');
      continue;
    }
    if (variants.some((v) => v.length > MAX_VARIANT_LEN)) {
      fail(`Có bản dài quá ${MAX_VARIANT_LEN} ký tự`);
      continue;
    }
    const { links } = maskLinks(post.caption);
    const badPlaceholder = variants
      .flatMap((v) => [...v.matchAll(/\[\[\s*LINK\s*(\d+)\s*\]\]/gi)].map((m) => Number(m[1])))
      .find((n) => n < 1 || n > links.length);
    if (badPlaceholder !== undefined) {
      fail(`Có [[LINK${badPlaceholder}]] nhưng caption gốc chỉ có ${links.length} link`);
      continue;
    }
    saveVariants(
      postId,
      variants.map((v) => unmaskLinks(v, links)),
    );
    result.saved++;
  }
  return result;
}
