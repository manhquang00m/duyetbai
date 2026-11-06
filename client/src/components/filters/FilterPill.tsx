import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { filterPillClass } from './pillClass'

export interface PillOption {
  value: string
  label: string
}

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

/** Nut ✕ nam trong pill dang loc - nut rieng, khong mo menu. */
function ClearButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`Bỏ lọc ${label}`}
      className="-ml-1 mr-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

/**
 * Pill chon 1 gia tri. Chua loc: "Dang ▾" (vien net dut); dang loc: "Dang: Chua dang ✕". Bam lai
 * option dang chon = bo loc. `neutral`: luon hien gia tri, khong to nhu dang loc, khong co ✕
 * (dung cho Sap xep).
 */
export function FilterPill({
  label,
  value,
  emptyValue = 'all',
  options,
  onChange,
  icon,
  neutral = false,
}: {
  label: string
  value: string
  emptyValue?: string
  options: readonly PillOption[]
  onChange: (v: string) => void
  icon?: ReactNode
  neutral?: boolean
}) {
  const popover = usePopover()
  const active = !neutral && value !== emptyValue
  const current = options.find((o) => o.value === value)?.label
  const shown = neutral ? options : options.filter((o) => o.value !== emptyValue)

  return (
    <div className={filterPillClass(active, neutral ? 'border-solid' : undefined)}>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        className={cn('flex h-full items-center gap-1.5 rounded-full pl-3 outline-none', active ? 'pr-1.5' : 'pr-2.5')}
      >
        {icon}
        <span className={cn(active && 'text-muted-foreground')}>
          {label}
          {active && ':'}
        </span>
        {(active || neutral) && current && (
          <span className={cn('max-w-[12rem] truncate', active ? 'font-medium' : 'text-foreground')}>{current}</span>
        )}
        {!active && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
      </button>
      {active && <ClearButton label={label} onClear={() => onChange(emptyValue)} />}
      <PopoverPanel popover={popover} className="min-w-[12rem]">
        {shown.map((o) => (
          <button
            key={o.value}
            type="button"
            role="menuitemradio"
            aria-checked={o.value === value}
            onClick={() => {
              onChange(o.value === value && !neutral ? emptyValue : o.value)
              popover.setOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent sm:py-1.5',
              o.value === value && 'font-medium',
            )}
          >
            {o.label}
            {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        ))}
      </PopoverPanel>
    </div>
  )
}

/**
 * Pill chon nhieu (checkbox). Gia tri tren pill: "Cho meo" hoac "Cho meo +2" (doi bang `summarize`).
 * Danh sach dai hon 8 muc co o tim. Menu khong tu dong khi tich.
 */
export function FilterPillMulti({
  label,
  values,
  options,
  onChange,
  summarize,
}: {
  label: string
  values: string[]
  options: readonly PillOption[]
  onChange: (values: string[]) => void
  summarize?: (selected: PillOption[]) => string
}) {
  const popover = usePopover()
  const [query, setQuery] = useState('')
  const active = values.length > 0
  const selected = options.filter((o) => values.includes(o.value))
  const text = summarize
    ? summarize(selected)
    : selected.length > 1
      ? `${selected[0].label} +${selected.length - 1}`
      : (selected[0]?.label ?? '')
  const searchable = options.length > 8
  const shown = useMemo(() => {
    const t = fold(query.trim())
    return t ? options.filter((o) => fold(o.label).includes(t)) : options
  }, [options, query])

  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])

  return (
    <div className={filterPillClass(active)}>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => {
          setQuery('')
          popover.setOpen(!popover.open)
        }}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        className={cn('flex h-full items-center gap-1.5 rounded-full pl-3 outline-none', active ? 'pr-1.5' : 'pr-2.5')}
      >
        <span className={cn(active && 'text-muted-foreground')}>
          {label}
          {active && ':'}
        </span>
        {active && <span className="max-w-[12rem] truncate font-medium">{text}</span>}
        {!active && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
      </button>
      {active && <ClearButton label={label} onClear={() => onChange([])} />}
      <PopoverPanel popover={popover} className="w-60 p-1.5">
        {searchable && (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Tìm ${label.toLowerCase()}…`}
            aria-label={`Tìm ${label.toLowerCase()}`}
            className="mb-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
          />
        )}
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {shown.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-2 text-sm hover:bg-accent sm:gap-2 sm:py-1.5"
            >
              <Checkbox checked={values.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span className="min-w-0 truncate">{o.label}</span>
            </label>
          ))}
          {shown.length === 0 && <div className="px-2 py-2 text-sm text-muted-foreground">Không có “{query}”</div>}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded-sm border-t px-2 pb-1 pt-2 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            Bỏ chọn
          </button>
        )}
      </PopoverPanel>
    </div>
  )
}
