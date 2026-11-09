// Bo link TikTok khoi chu comment cua chu bai. Comment nay duoc giu nguyen chu khi xuat bai
// (services/postExportFields.ts buildComment chi thay link Shopee), nen link TikTok trong do se
// bi dang kem theo - khong mong muon.

// "tiktok.com TikTok - Make Your Day": the xem truoc link Threads tu chen vao cuoi comment
const TIKTOK_CARD_RE = /(?:[\w-]+\.)*tiktok\.com\s+TikTok\s*-\s*Make Your Day/gi;

// Link TikTok (vt./vm./www.tiktok.com/...) kem nhan dung truoc neu co: "Link:" hoac nhan co chu
// "Tiktok:" (vd "Link bot chien ga tren Tiktok:"). Nhan khong duoc chua "/" hay "…" de khong
// bao gio an lan sang 1 link Shopee dung truoc.
const TIKTOK_LINK_RE =
  /(?:(?:\bLink|[^:/…\n]{0,40}\btiktok)\s*:\s*)?(?:https?:\/\/)?(?:[\w-]+\.)*tiktok\.com\/\S*/gi;

export function stripTiktokLinks(text: string): string {
  if (!/tiktok/i.test(text)) return text;
  return text.replace(TIKTOK_CARD_RE, ' ').replace(TIKTOK_LINK_RE, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}
