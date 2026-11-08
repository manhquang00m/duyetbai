/**
 * Cac gia tri hop le cho cot J (Loai proxy) va cot C (Trang thai) trong file import account.
 * Giu nguyen dau tieng Viet vi day la gia tri hien thi thang len UI.
 *
 * LUU Y: danh sach nay duoc lap lai o client/src/lib/api.ts (PROXY_TYPES / APPEAL_STATUSES) -
 * sua ben nay phai sua ca ben kia.
 */
export const PROXY_TYPES = [
  'Tạp hóa mmo',
  'Proxy trung gian - proxy.vn',
  'Local',
  'Proxy gốc - proxy.vn',
  'Data center - proxy.vn',
] as const;

// Ten field/hang APPEAL_STATUSES giu nguyen de do doi (da wiring san UI/API), nhung y nghia GIO
// LA "trang thai chung" cua account. 'Die' la gia tri DUY NHAT tu dong danh dau banned=true luc
// import - xem services/accountImporter.ts.
// 'Khang thanh cong' / 'Chua khang' / 'Dang khang' DA GOP VAO 'Live' (migration o db/index.ts);
// file Excel cu con ghi cac gia tri do van import duoc - xem LEGACY_TO_LIVE ben duoi.
export const APPEAL_STATUSES = ['Live', 'Đang ngâm', 'Chưa tạo nick', 'Die'] as const;

/** Gia tri trang thai cu, gio tinh la 'Live' (giu de doc file import doi cu). */
export const LEGACY_LIVE_STATUSES = ['Kháng thành công', 'Chưa kháng', 'Đang kháng', 'Thành công'] as const;

export type ProxyType = (typeof PROXY_TYPES)[number];
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

/** Bo dau + gom khoang trang, de so khop gia tri nguoi dung go tay trong Excel. */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function matchOption<T extends string>(options: readonly T[], raw: string): T | null {
  const v = normalize(raw);
  if (!v) return null;
  return options.find((o) => normalize(o) === v) ?? null;
}

/**
 * Doc o Excel ve dung 1 gia tri trong danh sach (khong phan biet hoa-thuong/dau).
 * Gia tri la (go sai, khong co trong danh sach) -> null, de import khong im lang nhan rac vao DB.
 */
export function parseProxyType(raw: string): ProxyType | null {
  return matchOption(PROXY_TYPES, raw);
}

export function parseAppealStatus(raw: string): AppealStatus | null {
  if (matchOption(LEGACY_LIVE_STATUSES, raw)) return 'Live';
  return matchOption(APPEAL_STATUSES, raw);
}
