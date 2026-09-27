/**
 * Chuoi tien Shopee ("6230.825", "145000", "", "--") -> so nguyen milli-dong (x1000).
 * Parse tu CHUOI, khong qua float, de cong don khong bi sai so. Phan le > 3 chu so bi cat bo
 * (Shopee chi xuat toi 3 chu so). Gia tri khong hop le -> 0.
 */
export function parseMilli(raw: unknown): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/[,\s₫]/g, '');
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return 0;
  const [, sign, int, frac = ''] = m;
  const milli = Number(int) * 1000 + Number(frac.slice(0, 3).padEnd(3, '0'));
  return sign === '-' ? -milli : milli;
}

/** milli-dong -> dong (lam tron), chi dung de hien thi. */
export function milliToDong(milli: number): number {
  return Math.round(milli / 1000);
}
