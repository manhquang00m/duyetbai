import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

// 5 hue cach nhau 72 do, tranh vung cam (~35 do oklch) cua mau du lieu Shopee. Tint chi de nhan ra
// nguoi/nick, khong mang nghia du lieu va khong vao chu giai bieu do.
const HUES = [75, 147, 219, 291, 3]

/** FNV-1a: ten gan giong nhau (vumaianh107 / vyanh7869) van roi vao hue khac nhau. */
function hueOf(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0
  return HUES[h % HUES.length]
}

function initialOf(name: string): string {
  const m = name.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]/i)
  return (m?.[0] ?? '?').toUpperCase()
}

const SIZE = { sm: 'h-6 w-6 text-[11px]', md: 'h-7 w-7 text-xs', lg: 'h-8 w-8 text-sm' }

/** Chu cai dau tren nen nhat theo mau rieng, on dinh theo ten - nhan ra nick bang mat thay vi doc. */
export function AccountAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: keyof typeof SIZE
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('avatar-tint inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium', SIZE[size], className)}
      style={{ '--h': hueOf(name) } as CSSProperties}
    >
      {initialOf(name)}
    </span>
  )
}
