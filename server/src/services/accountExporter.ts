import ExcelJS from 'exceljs';
import { listAccounts } from '../db/accounts';
import { listPostingAccounts } from '../db/postingTopics';

/**
 * Xuat file Excel danh sach account DUNG DINH DANG cot A-L nhu file import (xem
 * services/accountImporter.ts) - xuat ra sua tay roi import lai duoc ngay, khong can doi cot.
 * Cot D (Ngay tao) ghi Date THAT (khong phai chuoi) de accountImporter doc lai chinh xac tuyet
 * doi (nhanh dau tien cua parseCreatedAt).
 */
export async function exportAccountsXlsx(filePath: string): Promise<number> {
  const accounts = listAccounts();
  const topicsById = new Map(listPostingAccounts().map((a) => [a.id, a.topics]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('accounts');
  ws.addRow([
    'Profile',
    'Thiết bị',
    'Trạng thái',
    'Ngày tạo',
    'Pass_Threads',
    'Gmail',
    'Password',
    'Proxy',
    'Platform',
    'Loại proxy',
    'Chủ đề',
    'Ghi chú',
  ]);

  for (const a of accounts) {
    ws.addRow([
      a.name,
      a.device ?? '',
      a.appeal_status ?? '',
      new Date(a.created_at),
      a.pass_threads ?? '',
      a.gmail ?? '',
      a.gmail_password ?? '',
      a.proxy ?? '',
      a.platform ?? '',
      a.proxy_type ?? '',
      (topicsById.get(a.id) ?? []).join(', '),
      a.note ?? '',
    ]);
  }

  ws.getColumn(4).numFmt = 'yyyy-mm-dd';
  ws.getColumn(12).alignment = { wrapText: true, vertical: 'top' }; // Ghi chu

  await wb.xlsx.writeFile(filePath);
  return accounts.length;
}
