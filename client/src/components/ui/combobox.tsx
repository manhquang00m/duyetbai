import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react'
import { usePopover, PopoverPanel } from './popover'
import { cn } from '@/lib/utils'

export interface ComboboxItem {
  value: string
  label: string
  /** Chu mo ngay sau nhan (vd user cua proxy). */
  sub?: ReactNode
  /** Sat le phai dong (vd so account dang dung, trang thai). */
  meta?: ReactNode
  /** Nhom: cac item lien ke cung nhom hien chung 1 tieu de. Ben goi tu sap xep theo nhom. */
  group?: string
  /** Chu tim them (khong hien). */
  keywords?: string
  disabled?: boolean
}

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

/**
 * Select co o tim: go de loc, mui ten len/xuong, Enter chon, Escape dong. `onCreate` them dong
 * "Dung «…»" cho gia tri go tay khong co trong danh sach (vd proxy moi).
 */
export function Combobox({
  id,
  value,
  onChange,
  items,
  placeholder = 'Chọn…',
  searchPlaceholder = 'Tìm…',
  emptyText = 'Không có kết quả',
  onCreate,
  createLabel = (q) => `Dùng “${q}”`,
  renderValue,
  panelClassName,
  className,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  items: ComboboxItem[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
  /** Cach hien gia tri da chon tren nut (mac dinh: label cua item). */
  renderValue?: (item: ComboboxItem | undefined, value: string) => ReactNode
  /** Do rong panel (mac dinh toi da 24rem). */
  panelClassName?: string
  className?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const popover = usePopover()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = items.find((i) => i.value === value)

  const shown = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return items
    return items.filter((i) => {
      const hay = fold(`${i.label} ${i.keywords ?? ''}`)
      return tokens.every((t) => hay.includes(t))
    })
  }, [items, query])
  const groupCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of shown) if (i.group) m.set(i.group, (m.get(i.group) ?? 0) + 1)
    return m
  }, [shown])
  const canCreate = !!onCreate && query.trim() !== '' && !items.some((i) => fold(i.label) === fold(query.trim()))
  const total = shown.length + (canCreate ? 1 : 0)

  useEffect(() => {
    if (popover.open) {
      setQuery('')
      setCursor(Math.max(0, items.findIndex((i) => i.value === value)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover.open])
  useEffect(() => setCursor(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const pick = (idx: number) => {
    if (idx < shown.length) {
      const it = shown[idx]
      if (it.disabled) return
      onChange(it.value)
    } else if (canCreate) onCreate!(query.trim())
    popover.setOpen(false)
    popover.triggerRef.current?.focus()
  }

  return (
    <div className={cn('relative', className)}>
      <button
        id={id}
        ref={popover.triggerRef}
        type="button"
        role="combobox"
        aria-expanded={popover.open}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => popover.setOpen(!popover.open)}
        className={cn(
          'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm transition-[box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 sm:h-9',
          invalid && 'border-destructive',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>
          {renderValue ? renderValue(selected, value) : (selected?.label ?? (value || placeholder))}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>
      <PopoverPanel popover={popover} className={cn('w-[min(24rem,calc(100vw-1rem))] p-0', panelClassName)}>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(total - 1, c + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (total > 0) pick(cursor)
              } else if (e.key === 'Tab') popover.setOpen(false)
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1">
          {shown.map((it, idx) => (
            <Fragment key={it.value}>
              {it.group && it.group !== shown[idx - 1]?.group && (
                <div role="presentation" className="flex items-center gap-2 px-2 pb-1 pt-3 text-xs text-muted-foreground first:pt-1.5">
                  <span className="truncate font-medium">{it.group}</span>
                  <span className="tabular-nums">{groupCount.get(it.group)}</span>
                </div>
              )}
              <div
                data-idx={idx}
                role="option"
                aria-selected={it.value === value}
                aria-disabled={it.disabled}
                onMouseEnter={() => setCursor(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(idx)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm sm:py-1.5',
                  idx === cursor && 'bg-accent',
                  it.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', it.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0 flex-1 truncate">
                  <span className={cn('tabular-nums', it.value === value && 'font-medium')}>{it.label}</span>
                  {it.sub && <span className="ml-2 text-xs text-muted-foreground">{it.sub}</span>}
                </span>
                {it.meta && <span className="flex shrink-0 items-center gap-1.5">{it.meta}</span>}
              </div>
            </Fragment>
          ))}
          {canCreate && (
            <div
              data-idx={shown.length}
              role="option"
              aria-selected={false}
              onMouseEnter={() => setCursor(shown.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(shown.length)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm sm:py-1.5',
                cursor === shown.length && 'bg-accent',
              )}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{createLabel(query.trim())}</span>
            </div>
          )}
          {total === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">{emptyText}</div>}
        </div>
      </PopoverPanel>
    </div>
  )
}
