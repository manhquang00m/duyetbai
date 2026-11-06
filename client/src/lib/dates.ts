/**
 * Ngay dang chuoi ISO "yyyy-MM-dd" theo gio may (API cua server dung dang nay). Hien thi kieu VN
 * dd/MM/yyyy. Khong dung Date.toISOString() vi no doi sang UTC (lech 1 ngay truoc 7h sang).
 */
export function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fromIso(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getMonth() === Number(m[2]) - 1 ? d : null
}

export const todayIso = () => toIso(new Date())

export function addDaysIso(iso: string, days: number): string {
  const d = fromIso(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return toIso(d)
}

export function fmtVN(iso: string | null | undefined): string {
  const d = iso ? fromIso(iso) : null
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Doc ngay go tay: "4/11", "04/11/2026", "4-11-26", "2026-11-04", "hom nay", "hom qua".
 * Thieu nam -> nam nay. Sai -> null.
 */
export function parseDateInput(input: string): string | null {
  const s = input.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  if (!s) return null
  if (s === 'hom nay' || s === 'nay') return todayIso()
  if (s === 'hom qua' || s === 'qua') return addDaysIso(todayIso(), -1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fromIso(s) ? s : null
  const m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})(?:[/.\-\s](\d{2}|\d{4}))?$/)
  if (!m) return null
  const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear()
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]))
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null
  return toIso(d)
}

/** Ngay vo ly (nam > 2100 hoac < 2000, vd 31/12/45997 do du lieu nhap sai) -> null de hien dash. */
export function saneYear(iso: string | null | undefined): boolean {
  const y = iso ? Number(iso.slice(0, 4)) : NaN
  return y >= 2000 && y <= 2100
}

export interface DatePreset {
  label: string
  /** [from, to] ISO, tinh luc bam (khong co dinh luc render). */
  range: () => [string, string]
}

export const datePresets = {
  today: (label = 'Hôm nay'): DatePreset => ({ label, range: () => [todayIso(), todayIso()] }),
  yesterday: (label = 'Hôm qua'): DatePreset => ({
    label,
    range: () => {
      const y = addDaysIso(todayIso(), -1)
      return [y, y]
    },
  }),
  /** n ngay gan nhat; endOffset -1 = ket thuc hom qua (bao cao Shopee tre 1 ngay). */
  lastDays: (n: number, endOffset = 0, label = `${n} ngày`): DatePreset => ({
    label,
    range: () => {
      const end = addDaysIso(todayIso(), endOffset)
      return [addDaysIso(end, -(n - 1)), end]
    },
  }),
  thisMonth: (label = 'Tháng này'): DatePreset => ({
    label,
    range: () => {
      const d = new Date()
      return [toIso(new Date(d.getFullYear(), d.getMonth(), 1)), todayIso()]
    },
  }),
  lastMonth: (label = 'Tháng trước'): DatePreset => ({
    label,
    range: () => {
      const d = new Date()
      return [toIso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), toIso(new Date(d.getFullYear(), d.getMonth(), 0))]
    },
  }),
}
