import ExcelJS from 'exceljs';
import { db } from '../db';
import { upsertAccount, type AccountInput } from '../db/accounts';

/** Lay text tu cell exceljs (co the la hyperlink/richtext/object/Date). */
function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const o = value as { text?: unknown; hyperlink?: unknown; result?: unknown };
    if (o.text != null) return String(o.text);
    if (o.hyperlink != null) return String(o.hyperlink);
    if (o.result != null) return String(o.result);
  }
  return String(value).trim();
}

const BANNED_TRUE = new Set(['1', 'true', 'x', 'yes', 'banned', 'co', 'da ban', 'ban']);

function parseBanned(raw: string): boolean {
  const v = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // bo dau
  if (!v) return false;
  return BANNED_TRUE.has(v);
}

/** Nhan Date object (exceljs tu parse cell dinh dang ngay) hoac chuoi dd/mm/yyyy | yyyy-mm-dd. */
function parseCreatedAt(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  const s = cellText(raw).trim();
  if (!s) return new Date().toISOString();

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const generic = new Date(s);
  if (!Number.isNaN(generic.getTime())) return generic.toISOString();
  return new Date().toISOString();
}

export interface AccountImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
  /** So dong bi bo qua proxy vi proxy da duoc gan cho 1 account khac (van tao/cap nhat account, chi khong gan proxy). */
  proxyConflicts: number;
  proxyConflictDetails: { name: string; proxy: string; heldBy: string }[];
}

/**
 * Doc file Excel danh sach account, cot A-H theo thu tu co dinh:
 *   A Profile | B Thiet bi | C Banned | D Ngay tao | E Pass_Threads | F Gmail | G Password | H Proxy
 * Bo qua dong 1 (header). Upsert theo Profile (=name).
 */
export async function importAccountsExcel(filePath: string): Promise<AccountImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const proxyConflictDetails: { name: string; proxy: string; heldBy: string }[] = [];

  // Gom toan bo vao 1 transaction: tranh moi dong ghi 1 commit rieng (rat cham voi file
  // nhieu dong, de bi timeout/dut ket noi giua chung du du lieu van ghi duoc tung phan).
  db.exec('BEGIN');
  try {
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = cellText(row.getCell(1).value);
      if (!name) {
        skipped++;
        continue;
      }

      const proxy = cellText(row.getCell(8).value) || null;
      const input: AccountInput = {
        name,
        device: cellText(row.getCell(2).value) || null,
        banned: parseBanned(cellText(row.getCell(3).value)),
        created_at: parseCreatedAt(row.getCell(4).value),
        pass_threads: cellText(row.getCell(5).value) || null,
        gmail: cellText(row.getCell(6).value) || null,
        gmail_password: cellText(row.getCell(7).value) || null,
        proxy,
      };

      const result = upsertAccount(input);
      if (result.action === 'inserted') inserted++;
      else updated++;
      if (result.proxyConflictWith && proxy) {
        proxyConflictDetails.push({ name, proxy, heldBy: result.proxyConflictWith });
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    inserted,
    updated,
    skipped,
    total: inserted + updated + skipped,
    proxyConflicts: proxyConflictDetails.length,
    proxyConflictDetails,
  };
}
