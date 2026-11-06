import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { usePopover, PopoverPanel } from './popover'
import { buttonVariants } from './button'
import { cn } from '@/lib/utils'
import { addDaysIso, fmtVN, fromIso, parseDateInput, todayIso, type DatePreset } from '@/lib/dates'
import { filterPillClass } from '@/components/filters/pillClass'

/*
 * Chon ngay / khoang ngay kieu VN (dd/MM/yyyy), thay <input type=date> (hien mm/dd/yyyy theo locale
 * trinh duyet). Gia tri vao/ra van la ISO yyyy-MM-dd nen API khong doi. O ngay go tay duoc:
 * "4/11", "04/11/2026", "hom qua". Preset do trang truyen vao (moi trang co ky bao cao rieng).
 */

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function short(iso: string, withYear: boolean) {
  const s = fmtVN(iso)
  return withYear ? s : s.slice(0, 5)
}

function rangeLabel(from: string, to: string) {
  if (!from && !to) return ''
  if (from && to && from === to) return fmtVN(from)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${from ? short(from, !sameYear) : '…'} – ${to ? fmtVN(to) : '…'}`
}

function DateText({
  label,
  value,
  onCommit,
  autoFocus,
}: {
  label: string
  value: string
  onCommit: (iso: string) => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState(fmtVN(value))
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setText(fmtVN(value))
    setBad(false)
  }, [value])
  const commit = () => {
    if (!text.trim()) {
      onCommit('')
      return
    }
    const iso = parseDateInput(text)
    if (!iso) {
      setBad(true)
      return
    }
    setBad(false)
    onCommit(iso)
  }
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        aria-invalid={bad || undefined}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/15',
          bad && 'border-destructive',
        )}
      />
      {bad && <span className="block text-[11px] text-destructive">Không đọc được ngày</span>}
    </label>
  )
}

function PresetList({
  presets,
  isActive,
  onPick,
}: {
  presets: DatePreset[]
  isActive: (p: DatePreset) => boolean
  onPick: (p: DatePreset) => void
}) {
  if (presets.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 sm:w-32 sm:flex-col sm:flex-nowrap">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p)}
          className={cn(
            'rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
            isActive(p) && 'bg-active font-medium',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

const stepBtn =
  'flex h-9 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 sm:h-8'

export function DateRangePicker({
  from,
  to,
  onChange,
  presets = [],
  placeholder = 'Mọi ngày',
  label,
  clearable = false,
  stepper = false,
  max,
  variant = 'button',
  className,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  presets?: DatePreset[]
  placeholder?: string
  /** Tien to tren nut, vd "Thu thập". */
  label?: string
  clearable?: boolean
  /** Nut ‹ › lui/tien nguyen 1 ky (do dai bang khoang dang chon). */
  stepper?: boolean
  max?: string
  /** "pill": kieu nut cua thanh loc (vien net dut khi trong, co ✕ khi dang loc). */
  variant?: 'button' | 'pill'
  className?: string
}) {
  const popover = usePopover()
  const has = !!(from || to)
  const pill = variant === 'pill'
  const active = presets.find((p) => {
    const [f, t] = p.range()
    return f === from && t === to
  })
  const span = from && to ? Math.round(((fromIso(to)?.getTime() ?? 0) - (fromIso(from)?.getTime() ?? 0)) / 86400000) + 1 : 0
  const step = (dir: 1 | -1) => onChange(addDaysIso(from, dir * span), addDaysIso(to, dir * span))
  const nextDisabled = !!max && !!to && addDaysIso(to, span) > max

  const set = (f: string, t: string) => {
    // Nguoi dung go nguoc (tu > den) -> doi cho, khong bao loi
    if (f && t && f > t) onChange(t, f)
    else onChange(f, t)
  }

  return (
    <div className={cn('inline-flex items-center', className)}>
      {stepper && span > 0 && (
        <button type="button" className={stepBtn} onClick={() => step(-1)} aria-label="Kỳ trước">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div className={cn('relative', pill && filterPillClass(has))}>
        <button
          ref={popover.triggerRef}
          type="button"
          onClick={() => popover.setOpen(!popover.open)}
          aria-expanded={popover.open}
          aria-haspopup="dialog"
          className={
            pill
              ? cn('flex h-full items-center gap-1.5 rounded-full pl-3 tabular-nums outline-none', has ? 'pr-1.5' : 'pr-3')
              : cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'tabular-nums',
                  has && clearable && 'border-foreground/60 text-foreground',
                )
          }
        >
          <CalendarDays className="h-3.5 w-3.5 opacity-60" />
          {label && (
            <span className="text-muted-foreground">
              {label}
              {pill && has && ':'}
            </span>
          )}
          {active ? (
            <span className={cn(pill && 'font-medium')}>
              {active.label}
              <span className="ml-1.5 font-normal text-muted-foreground">{rangeLabel(from, to)}</span>
            </span>
          ) : has ? (
            <span className={cn(pill && 'font-medium')}>{rangeLabel(from, to)}</span>
          ) : (
            !pill && <span className="text-muted-foreground">{placeholder}</span>
          )}
        </button>
        {pill && has && clearable && (
          <button
            type="button"
            onClick={() => onChange('', '')}
            aria-label={`Bỏ lọc ${label ?? 'ngày'}`}
            className="mr-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <PopoverPanel popover={popover} className="w-[min(22rem,calc(100vw-1rem))] p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <PresetList
              presets={presets}
              isActive={(p) => p === active}
              onPick={(p) => {
                const [f, t] = p.range()
                onChange(f, t)
                popover.setOpen(false)
              }}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <DateText label="Từ ngày" value={from} onCommit={(v) => set(v, to)} autoFocus={presets.length === 0} />
              <DateText label="Đến ngày" value={to} onCommit={(v) => set(from, v)} />
              <p className="text-[11px] text-muted-foreground">Gõ 4/11, 04/11/2026 hoặc "hôm qua"</p>
              {clearable && has && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('', '')
                    popover.setOpen(false)
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Bỏ lọc ngày
                </button>
              )}
            </div>
          </div>
        </PopoverPanel>
      </div>
      {stepper && span > 0 && (
        <button type="button" className={stepBtn} onClick={() => step(1)} disabled={nextDisabled} aria-label="Kỳ sau">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** 1 ngay, co ‹ › lui/tien 1 ngay. Hien "Hôm nay"/"Hôm qua" khi trung. */
export function DatePicker({
  value,
  onChange,
  presets = [],
  max,
  className,
}: {
  value: string
  onChange: (iso: string) => void
  presets?: DatePreset[]
  max?: string
  className?: string
}) {
  const popover = usePopover()
  const today = todayIso()
  const d = fromIso(value)
  const rel = value === today ? 'Hôm nay' : value === addDaysIso(today, -1) ? 'Hôm qua' : d ? WEEKDAY[d.getDay()] : ''
  const nextDisabled = !!max && addDaysIso(value, 1) > max

  return (
    <div className={cn('inline-flex items-center', className)}>
      <button type="button" className={stepBtn} onClick={() => onChange(addDaysIso(value, -1))} aria-label="Ngày trước">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="relative">
        <button
          ref={popover.triggerRef}
          type="button"
          onClick={() => popover.setOpen(!popover.open)}
          aria-expanded={popover.open}
          aria-haspopup="dialog"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'tabular-nums')}
        >
          <CalendarDays className="h-3.5 w-3.5 opacity-60" />
          {rel && <span className="text-muted-foreground">{rel}</span>}
          {fmtVN(value)}
        </button>
        <PopoverPanel popover={popover} className="w-[min(18rem,calc(100vw-1rem))] space-y-3 p-3">
          <PresetList
            presets={presets}
            isActive={(p) => p.range()[0] === value}
            onPick={(p) => {
              onChange(p.range()[0])
              popover.setOpen(false)
            }}
          />
          <DateText
            label="Ngày"
            value={value}
            autoFocus
            onCommit={(v) => {
              if (v) {
                onChange(v)
                popover.setOpen(false)
              }
            }}
          />
        </PopoverPanel>
      </div>
      <button
        type="button"
        className={stepBtn}
        onClick={() => onChange(addDaysIso(value, 1))}
        disabled={nextDisabled}
        aria-label="Ngày sau"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
