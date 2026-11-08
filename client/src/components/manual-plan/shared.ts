import { fromIso } from '@/lib/dates'
import type { PostingAccount } from '@/lib/api'
import { POSTING_STATUSES } from '@/lib/accountAttention'

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** 'YYYY-MM-DD' -> 'T2 10/11' (gon, du nhan ra ngay trong tuan). */
export function dayLabel(iso: string): string {
  const d = fromIso(iso)
  if (!d) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${WEEKDAY[d.getDay()]} ${p(d.getDate())}/${p(d.getMonth() + 1)}`
}

/** 'YYYY-MM-DD' -> '10/11' */
export const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Nick dung de dang (khop dieu kien server listDistributionCandidates, tru dieu kien co chu de). */
export const isPostingAccount = (a: PostingAccount) =>
  a.active === 1 && a.banned === 0 && (POSTING_STATUSES as readonly string[]).includes(a.appeal_status ?? '')

export const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}
