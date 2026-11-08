import type { Account } from '@/lib/api'

/** Trang thai "dang dung duoc" - mac dinh cua bang Accounts. */
export const USABLE_STATUSES = ['Live'] as const
/** Trang thai duoc nhan bai (them "Dang ngam" de gan chu de truoc) - Phan phoi bai, Nhat ky dang. */
export const POSTING_STATUSES = ['Live', 'Đang ngâm'] as const

export type AttentionReason = 'shadowban' | 'proxy-die' | 'suspect' | 'no-proxy'

export const REASON_LABEL: Record<AttentionReason, string> = {
  shadowban: 'Nghi shadowban',
  'proxy-die': 'Proxy die',
  suspect: 'Nghi ngờ shadowban',
  'no-proxy': 'Chưa có proxy',
}

/** Nang -> nhe. Thu tu nay cung la thu tu hang "Viec can lam" o Tong quan. */
export const REASON_ORDER: AttentionReason[] = ['shadowban', 'proxy-die', 'suspect', 'no-proxy']

/** Ly do 1 account dang chay can xu ly. null = binh thuong hoac account khong chay. */
export function attentionReason(a: Account): AttentionReason | null {
  if (!a.active || a.banned) return null
  if (a.shadowban_verdict === 'shadowban') return 'shadowban'
  if (a.proxy_status === 'die') return 'proxy-die'
  if (a.shadowban_verdict === 'suspect') return 'suspect'
  if (!a.proxy) return 'no-proxy'
  return null
}

export function accountsNeedingAttention(accounts: Account[]) {
  return accounts
    .map((account) => ({ account, reason: attentionReason(account) }))
    .filter((x): x is { account: Account; reason: AttentionReason } => x.reason !== null)
    .sort((x, y) => REASON_ORDER.indexOf(x.reason) - REASON_ORDER.indexOf(y.reason))
}
