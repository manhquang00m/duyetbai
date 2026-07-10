import ExcelJS from 'exceljs';
import { db } from '../db';

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
}

/**
 * Buoc 3: doc file Shopee tra ve, cap nhat shopee_entries.new_link theo link goc.
 * Mac dinh cot1 = link goc, cot2 = link moi; co the chi dinh bang ten header.
 */
export async function importShopeeLinks(
  filePath: string,
  opts: ImportOpts = {},
): Promise<{ updated: number; headers: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
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
  const newIdx = resolveCol(opts.newCol, 2);

  const upd = db.prepare('UPDATE shopee_entries SET new_link = ? WHERE link = ?');
  let updated = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const orig = cellText(row.getCell(origIdx).value).trim();
    const neu = cellText(row.getCell(newIdx).value).trim();
    if (!orig || !neu) continue;
    const res = upd.run(neu, orig);
    updated += Number(res.changes ?? 0);
  }

  return { updated, headers: headers.filter(Boolean) };
}
