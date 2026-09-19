/**
 * Dau thoi gian gan vao ten file xuat: "2026-09-19_1435".
 * Dung gio MAY CHU (khong phai UTC) - toISOString() se lech mat 1 ngay voi gio VN (UTC+7)
 * moi khi xuat file truoc 7h sang.
 * Co ca gio/phut de xuat nhieu lan trong ngay khong bi trung ten.
 */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(
    d.getMinutes(),
  )}`;
}
