import { CalendarPlus, Loader2, X } from 'lucide-react'
import type { PlanItem } from '@/lib/api'
import { PostThumb } from '@/components/PostThumb'
import { LikesChip } from '@/components/LikesChip'
import { cn } from '@/lib/utils'
import { dayLabel } from './shared'

/**
 * Cot phai: lich cua nick dang chon theo tung ngay trong ke hoach. Ngay dang chon = DICH cua nut
 * Gan (vien hong). Moi bai: doi ban caption (bam chip vN), bo gan (X, co Hoan tac).
 */
export function ScheduleColumn({
  accountName,
  dates,
  selectedDate,
  onSelectDate,
  items,
  flashId,
  busyIds,
  onRemove,
  onCycleVariant,
  className,
}: {
  accountName: string | null
  dates: string[]
  selectedDate: string
  onSelectDate: (d: string) => void
  items: PlanItem[]
  flashId: number | null
  busyIds: Set<number>
  onRemove: (it: PlanItem) => void
  onCycleVariant: (it: PlanItem) => void
  className?: string
}) {
  const byDate = new Map<string, PlanItem[]>()
  for (const it of items) {
    if (!byDate.has(it.post_date)) byDate.set(it.post_date, [])
    byDate.get(it.post_date)!.push(it)
  }

  return (
    <section className={cn('flex min-h-0 flex-col rounded-xl border bg-card', className)} aria-label="Lịch của nick">
      <div className="flex items-baseline justify-between border-b p-3">
        <h2 className="truncate text-sm font-medium">
          {accountName ? (
            <>
              Lịch của <span className="text-chart-1-ink">@{accountName}</span>
            </>
          ) : (
            'Lịch'
          )}
        </h2>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{items.length} bài</span>
      </div>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {dates.map((d) => {
          const list = byDate.get(d) ?? []
          const selected = d === selectedDate
          return (
            <li
              key={d}
              data-date={d}
              className={cn(
                'rounded-lg border transition-colors',
                selected ? 'border-primary ring-1 ring-primary/40' : 'border-border',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDate(d)}
                aria-pressed={selected}
                className={cn(
                  'flex w-full items-center gap-2 rounded-t-lg px-2.5 py-1.5 text-left text-xs',
                  selected ? 'bg-primary/[0.07]' : 'hover:bg-accent',
                  list.length === 0 && 'rounded-b-lg',
                )}
              >
                <span className={cn('font-medium', selected && 'text-chart-1-ink')}>{dayLabel(d)}</span>
                <span className="text-muted-foreground">· {list.length === 0 ? 'trống' : `${list.length} bài`}</span>
                {selected && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-medium leading-4 text-primary-foreground">
                    đang gán vào
                  </span>
                )}
              </button>
              {list.length === 0 ? (
                !selected && (
                  <button
                    type="button"
                    onClick={() => onSelectDate(d)}
                    className="flex w-full items-center gap-1.5 px-2.5 pb-2 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Chọn ngày này để gán
                  </button>
                )
              ) : (
                <ul className="space-y-1 p-1.5 pt-0.5">
                  {list.map((it) => (
                    <ScheduleItem
                      key={it.id}
                      it={it}
                      flash={it.id === flashId}
                      busy={busyIds.has(it.id)}
                      onRemove={() => onRemove(it)}
                      onCycleVariant={() => onCycleVariant(it)}
                    />
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ScheduleItem({
  it,
  flash,
  busy,
  onRemove,
  onCycleVariant,
}: {
  it: PlanItem
  flash: boolean
  busy: boolean
  onRemove: () => void
  onCycleVariant: () => void
}) {
  const canCycle = (it.variant_count ?? 0) > 1
  return (
    <li
      className={cn(
        'group flex items-center gap-2 rounded-md p-1 transition-colors duration-700',
        flash ? 'bg-primary/15' : 'hover:bg-accent/60',
      )}
    >
      <PostThumb thumb={it.thumb} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <LikesChip likes={it.likes} className="font-medium text-foreground" />
          <button
            type="button"
            onClick={onCycleVariant}
            disabled={!canCycle || busy}
            title={
              canCycle
                ? `Đang dùng bản caption ${it.caption_variant}/${it.variant_count} — bấm để đổi bản khác`
                : 'Caption gốc (bài chưa có bản viết lại)'
            }
            className={cn(
              'rounded px-1 text-[10px] font-medium leading-4',
              canCycle ? 'bg-muted text-foreground hover:bg-primary/15' : 'bg-muted text-muted-foreground',
            )}
          >
            {it.caption_variant ? `v${it.caption_variant}` : 'gốc'}
          </button>
        </div>
        <p className="truncate text-xs text-muted-foreground" title={it.caption ?? ''}>
          {it.caption || it.post_id}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label="Bỏ gán bài này"
        className="shrink-0 rounded p-1 text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </li>
  )
}
