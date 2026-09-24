import ExcelJS from 'exceljs';
import { db } from '../db';
import { upsertAccount, type AccountInput } from '../db/accounts';
import { parseProxyType, parseAppealStatus } from '../db/accountEnums';
import { saveProxyMeta, type ProxyMetaInput } from '../db/proxies';
import { ACCOUNT_TOPICS } from '../db/accountTopics';
import { setPostingTopicsUnsafe } from '../db/postingTopics';
import { getAccountByName } from '../db/accounts';

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

/** Nhan "stable"/"global" khong phan biet hoa-thuong -> chuan hoa ve 'Stable'|'Global'; khac -> null. */
function parsePlatform(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v === 'stable') return 'Stable';
  if (v === 'global') return 'Global';
  return null;
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
  /** Dong co gia tri o cot C/J/K nhung khong khop danh sach cho phep -> de trong o do, van nhan dong. */
  invalidValues: number;
  invalidValueDetails: { name: string; column: string; value: string }[];
}

/**
 * Doc file Excel danh sach account, cot A-L theo thu tu co dinh:
 *   A Profile | B Thiet bi | C Trang thai | D Ngay tao | E Pass_Threads | F Gmail | G Password
 *   | H Proxy | I Platform (Stable|Global) | J Loai proxy | K Chu de (nhieu chu de, ngan cach
 *   bang dau phay, dung cho "Phan phoi bai") | L Ghi chu
 * Gia tri hop le cua cot C va J xem db/accountEnums.ts.
 * Cot C = 'Die' -> tu dong danh dau banned=true (loai khoi Phan phoi bai, badge Die tren UI);
 * moi gia tri khac (ke ca trong/khong hop le) -> banned=false.
 * Bo qua dong 1 (header). Upsert theo Profile (=name).
 */
export async function importAccountsExcel(filePath: string): Promise<AccountImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const invalidValueDetails: { name: string; column: string; value: string }[] = [];
  // Loai proxy + ghi chu cua tung dong -> day sang kho proxy sau khi ghi xong account.
  const proxyMeta: ProxyMetaInput[] = [];

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

      // Cot C/J chi nhan gia tri trong danh sach. Go sai -> bo trong + bao lai cho nguoi dung,
      // khong am tham nhet chuoi la vao DB roi bo loc tren UI khong khop gi ca.
      const rawStatus = cellText(row.getCell(3).value);
      const status = parseAppealStatus(rawStatus);
      if (rawStatus && !status) {
        invalidValueDetails.push({ name, column: 'C (Trạng thái)', value: rawStatus });
      }
      const rawProxyType = cellText(row.getCell(10).value);
      const proxyType = parseProxyType(rawProxyType);
      if (rawProxyType && !proxyType) {
        invalidValueDetails.push({ name, column: 'J (Loại proxy)', value: rawProxyType });
      }

      const input: AccountInput = {
        name,
        device: cellText(row.getCell(2).value) || null,
        banned: status === 'Die',
        created_at: parseCreatedAt(row.getCell(4).value),
        pass_threads: cellText(row.getCell(5).value) || null,
        gmail: cellText(row.getCell(6).value) || null,
        gmail_password: cellText(row.getCell(7).value) || null,
        proxy,
        platform: parsePlatform(cellText(row.getCell(9).value)),
        proxy_type: proxyType,
        appeal_status: status,
        note: cellText(row.getCell(12).value) || null,
      };

      if (proxy) proxyMeta.push({ proxy, proxy_type: proxyType, note: input.note });

      const result = upsertAccount(input);
      if (result.action === 'inserted') inserted++;
      else updated++;

      // Cot K: chu de cua TAI KHOAN DANG (khac chu de cua bai o account_topics).
      // O TRONG = giu nguyen chu de dang co, KHONG xoa - file cu chua co cot nay, import lai
      // khong duoc phep quet sach chu de da gan.
      const rawTopics = cellText(row.getCell(11).value);
      if (rawTopics) {
        const parts = rawTopics.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        const valid = parts.filter((t) => (ACCOUNT_TOPICS as readonly string[]).includes(t));
        for (const bad of parts.filter((t) => !valid.includes(t))) {
          invalidValueDetails.push({ name, column: 'K (Chủ đề)', value: bad });
        }
        const acc = getAccountByName(name);
        // Dung ban Unsafe: dang o trong transaction cua ham nay, mo BEGIN long nhau se throw.
        if (acc) setPostingTopicsUnsafe(acc.id, valid);
      }
    }
    saveProxyMeta(proxyMeta);
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
    invalidValues: invalidValueDetails.length,
    invalidValueDetails,
  };
}
