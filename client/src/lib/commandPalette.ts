
export const OPEN_EVENT = 'command-palette:open'

/** Mo Ctrl+K tu bat ky dau (nut tim o sidebar / top bar). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/*
 * View = 1 bo tham so URL cua trang dich. Ten param phai khop useUrlState o trang do
 * (AccountsPage: view; PostsPage: noShopee, rewritten; ProxyPage: tab).
 */
export const VIEWS: { label: string; to: string; keywords?: string }[] = [
  { label: 'Account cần xử lý', to: '/accounts?view=attention', keywords: 'loi van de' },
  { label: 'Account proxy die', to: '/accounts?view=proxy-die' },
  { label: 'Account nghi shadowban', to: '/accounts?view=shadowban' },
  { label: 'Bài chưa có link Shopee', to: '/posts?noShopee=1', keywords: 'thieu link' },
  { label: 'Bài chưa viết lại', to: '/posts?rewritten=no', keywords: 'rewrite caption' },
  { label: 'Bài bị loại (cần xoá)', to: '/posts?reject=1', keywords: 'loai xoa link chet het hang' },
  { label: 'Proxy die', to: '/proxy?tab=die' },
]
