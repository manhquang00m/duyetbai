import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export interface FilterChip {
  key: string
  /** Ten bo loc, vd "Proxy". */
  label: string
  /** Gia tri dang loc, vd "Die". */
  value: ReactNode
  onRemove: () => void
}

/**
 * Hang tom tat bo loc dang bat: moi bo loc 1 chip co nut X, "Xoa tat ca", va so ket qua o ben phai.
 * Khong co bo loc nao thi khong ve gi (tong so da nam o tieu de trang).
 */
export function FilterChips({
  chips,
  onClearAll,
  count,
}: {
  chips: FilterChip[]
  onClearAll: () => void
  count?: ReactNode
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex h-7 max-w-full shrink-0 items-center gap-1 rounded-full border bg-card pl-2.5 pr-1 text-xs"
        >
          <span className="text-muted-foreground">{c.label}:</span>
          <span className="truncate font-medium">{c.value}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Bỏ lọc ${c.label}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Xóa tất cả
        </button>
      )}
      {count && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>}
    </div>
  )
}
