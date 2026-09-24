// Toan ngay THUAN CHUOI 'YYYY-MM-DD'.
// KHONG dung new Date().toISOString().slice(0,10): buoi toi gio VN (UTC+7) se bi keo lui
// thanh ngay hom truoc -> "Ngay dang" trong file xuat ra sai mot ngay.

/** Hom nay theo gio MAY DANG CHAY (khong phai UTC). */
export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Cong them n ngay (n am duoc) vao chuoi 'YYYY-MM-DD', tra ve chuoi cung dinh dang. */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Dung UTC o ca hai dau -> khong dinh gio mua he / lech mui gio khi cong ngay.
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  const dt = new Date(t);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return addDays(dateStr, 0) === dateStr;
}
