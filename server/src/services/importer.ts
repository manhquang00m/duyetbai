import ExcelJS from 'exceljs';
import { db } from '../db';
import { cleanSubId } from '../utils/postId';

/** Lay text tu cell exceljs (co the la hyperlink/richtext/object). */
function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const o = value as { text?: unknown; hyperlink?: unknown; result?: unknown };
    if (o.text != null) return String(o.text);
    if (o.hyperlink != null) return String(o.hyperlink);
    if (o.result != null) return String(o.result);
  }
  return String(value);
}

export interface ImportOpts {
  origCol?: string | number; // ten header (chua chuoi) hoac chi so cot 1-based
  newCol?: string | number;
  subIdCol?: string | number; // cot Sub_id1 (= POST_ID da lam sach), dung de doi chieu cho chac
  isCsv?: boolean; // file .csv (Shopee tra ve) thay vi .xlsx
}

/**
 * Buoc 3: doc file Shopee tra ve, cap nhat shopee_entries.new_link.
 * Dinh dang chuan Shopee (A->H): Lien ket chinh, Sub_id1..Sub_id5, Lien ket chuyen doi, Ly do that bai
 * -> mac dinh cot1 = link goc, cot7 = link moi, cot2 = Sub_id1 (POST_ID).
 * Doi chieu theo CA link VA Sub_id1 (post_id da lam sach) de tranh nham khi nhieu dong trung link goc;
 * neu file khong co Sub_id1 (hoac khong khop dong nao) thi fallback ve doi chieu theo link nhu cu.
 */
export async function importShopeeLinks(
  filePath: string,
  opts: ImportOpts = {},
): Promise<{ updated: number; headers: string[] }> {
  const wb = new ExcelJS.Workbook();
  if (opts.isCsv) {
    await wb.csv.readFile(filePath);
  } else {
    await wb.xlsx.readFile(filePath);
  }
  const ws = wb.worksheets[0];

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = cellText(cell.value);
  });

  const resolveCol = (spec: string | number | undefined, fallback: number): number => {
    if (spec == null) return fallback;
    if (typeof spec === 'number') return spec;
    const idx = headers.findIndex(
      (h) => h && h.toLowerCase().includes(String(spec).toLowerCase()),
    );
    return idx > 0 ? idx : fallback;
  };
  const origIdx = resolveCol(opts.origCol, 1);
  const newIdx = resolveCol(opts.newCol, 7);
  const subIdIdx = resolveCol(opts.subIdCol, 2);

  const findByLink = db.prepare('SELECT id, post_id FROM shopee_entries WHERE link = ?');
  const updById = db.prepare('UPDATE shopee_entries SET new_link = ? WHERE id = ?');
  const updByLinkOnly = db.prepare('UPDATE shopee_entries SET new_link = ? WHERE link = ?');

  let updated = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const orig = cellText(row.getCell(origIdx).value).trim();
    const neu = cellText(row.getCell(newIdx).value).trim();
    const subId1 = cellText(row.getCell(subIdIdx).value).trim();
    if (!orig || !neu) continue;

    if (subId1) {
      // Co Sub_id1 (post_id) -> doi chieu chinh xac theo link + post_id, khong khop thi bo qua
      // (tranh cap nhat nham dong cua bai khac lo trung link).
      const candidates = findByLink.all(orig) as { id: number; post_id: string }[];
      const match = candidates.find((c) => cleanSubId(c.post_id) === subId1);
      if (match) {
        updById.run(neu, match.id);
        updated += 1;
      }
    } else {
      // File khong co cot Sub_id1 (vd file cu) -> fallback doi chieu theo link nhu truoc
      const res = updByLinkOnly.run(neu, orig);
      updated += Number(res.changes ?? 0);
    }
  }

  return { updated, headers: headers.filter(Boolean) };
}
