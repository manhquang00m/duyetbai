import { useEffect, useRef } from 'react'
import { AlertTriangle, Ban, Check, Heart, Inbox, Loader2, Plus } from 'lucide-react'
import type { ManualCandidate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { PostThumb } from '@/components/PostThumb'
import { SearchInput } from '@/components/filters/SearchInput'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { shortDay } from './shared'

export interface PendingGap {
  postId: string
  uses: { date: string; account: string }[]
}

const usesText = (uses: { date: string; account: string }[]) =>
  uses
    .slice(0, 3)
    .map((u) => `${shortDay(u.date)} @${u.account}`)
    .join(', ')

/** Cot giua: bai thuoc chu de cua nick, nhieu like nhat truoc. Gan = 1 click (hoac Enter). */
export function CandidateList({
  accountName,
  targetDayLabel,
  accountTopics,
  topics,
  onTopicsChange,
  search,
  onSearchChange,
  hideUsed,
  onHideUsedChange,
  items,
  total,
  loading,
  fetching,
  hasMore,
  loadingMore,
  onLoadMore,
  activeIndex,
  onActiveIndexChange,
  assigningId,
  pending,
  onAssign,
  onConfirmGap,
  onCancelGap,
  className,
}: {
  accountName: string | null
  targetDayLabel: string
  accountTopics: string[]
  topics: string[]
  onTopicsChange: (t: string[]) => void
  search: string
  onSearchChange: (v: string) => void
  hideUsed: boolean
  onHideUsedChange: (v: boolean) => void
  items: ManualCandidate[]
  total: number
  loading: boolean
  fetching: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  activeIndex: number
  onActiveIndexChange: (i: number) => void
  assigningId: string | null
  pending: PendingGap | null
  onAssign: (c: ManualCandidate) => void
  onConfirmGap: () => void
  onCancelGap: () => void
  className?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Giu dong dang chon (phim j/k) luon trong tam nhin
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const toggleTopic = (t: string) =>
    onTopicsChange(topics.includes(t) ? topics.filter((x) => x !== t) : [...topics, t])

  return (
    <section className={cn('flex min-h-0 flex-col rounded-xl border bg-card', className)} aria-label="Danh sách bài">
      <div className="space-y-2.5 border-b p-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-sm font-medium">
            {accountName ? (
              <>
                Bài cho <span className="text-chart-1-ink">@{accountName}</span>
              </>
            ) : (
              'Bài'
            )}
          </h2>
          <span className="text-xs text-muted-foreground">
            gán vào <strong className="font-medium text-foreground">{targetDayLabel}</strong> · nhiều tim nhất
            trước
          </span>
          <span className="ml-auto flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            {fetching && !loading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {total.toLocaleString('vi-VN')} bài
          </span>
        </div>

        {accountTopics.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc chủ đề">
            <TopicChip active={topics.length === 0} onClick={() => onTopicsChange([])}>
              Tất cả chủ đề
            </TopicChip>
            {accountTopics.map((t) => (
              <TopicChip key={t} active={topics.includes(t)} onClick={() => toggleTopic(t)}>
                {t}
              </TopicChip>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Tìm caption, mã bài, @tác giả…"
            className="sm:max-w-sm"
            aria-label="Tìm bài"
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground sm:ml-auto">
            <Switch checked={hideUsed} onCheckedChange={onHideUsedChange} />
            Ẩn bài đã dùng quanh ngày này
          </label>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex gap-3 p-3">
                <Skeleton className="h-14 w-14" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={search || hideUsed ? 'Không có bài nào khớp bộ lọc' : 'Kho chưa có bài cho chủ đề này'}
            description={
              search || hideUsed
                ? 'Thử xoá ô tìm hoặc tắt "Ẩn bài đã dùng".'
                : 'Bài cần có link Shopee còn hàng, link mới và ảnh/video tải được mới vào kho.'
            }
          />
        ) : (
          <ul className="divide-y">
            {items.map((c, i) => (
              <CandidateRow
                key={c.post_id}
                c={c}
                rank={i + 1}
                index={i}
                active={i === activeIndex}
                assigning={assigningId === c.post_id}
                pending={pending?.postId === c.post_id ? pending : null}
                onFocusRow={() => onActiveIndexChange(i)}
                onAssign={() => onAssign(c)}
                onConfirmGap={onConfirmGap}
                onCancelGap={onCancelGap}
              />
            ))}
          </ul>
        )}
        {hasMore && !loading && (
          <div className="p-3 text-center">
            <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Tải thêm · còn {(total - items.length).toLocaleString('vi-VN')} bài
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function TopicChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function CandidateRow({
  c,
  rank,
  index,
  active,
  assigning,
  pending,
  onFocusRow,
  onAssign,
  onConfirmGap,
  onCancelGap,
}: {
  c: ManualCandidate
  rank: number
  index: number
  active: boolean
  assigning: boolean
  pending: PendingGap | null
  onFocusRow: () => void
  onAssign: () => void
  onConfirmGap: () => void
  onCancelGap: () => void
}) {
  const blocked = c.state === 'same_account' || c.state === 'full'
  return (
    <li
      data-index={index}
      onClick={onFocusRow}
      className={cn(
        'group relative px-3 py-2.5 transition-colors',
        active ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_var(--color-primary)]' : 'hover:bg-accent/50',
        blocked && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums text-muted-foreground">
          {rank}
        </span>
        <PostThumb thumb={c.thumb} className="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
              <Heart className="h-3.5 w-3.5 fill-current text-chart-1" aria-hidden />
              {c.likes?.trim() || '—'}
            </span>
            <StateBadge c={c} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-foreground/90">{c.caption || <em>(không có caption)</em>}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 leading-5">{c.topic}</span>
            {c.username && <span className="truncate">@{c.username}</span>}
            <span>{c.variant_count > 0 ? `${c.variant_count} caption` : 'caption gốc'}</span>
          </div>
        </div>
        <div className="shrink-0 self-center">
          {blocked ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {c.state === 'same_account' ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
              {c.state === 'same_account' ? 'Đã gán' : 'Hết caption'}
            </span>
          ) : (
            <Button
              size="sm"
              variant={c.state === 'gap' ? 'outline' : 'default'}
              onClick={(e) => {
                e.stopPropagation()
                onFocusRow()
                onAssign()
              }}
              disabled={assigning || !!pending}
              aria-label={`Gán bài ${c.post_id}`}
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Gán
            </Button>
          )}
        </div>
      </div>

      {pending && (
        <div
          role="alertdialog"
          aria-label="Xác nhận gán bài đã dùng gần đây"
          className="ml-9 mt-2 flex flex-col gap-2 rounded-lg border border-amber-300/60 bg-pill-warning p-2.5 text-xs text-pill-warning-ink sm:flex-row sm:items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <AlertTriangle className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="flex-1">
            Bài đã dùng ở ngày liền kề ({usesText(pending.uses)}). Vẫn gán?
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" onClick={onConfirmGap} disabled={assigning} data-autofocus>
              {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
              Vẫn gán <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">Enter</kbd>
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelGap}>
              Huỷ
            </Button>
          </span>
        </div>
      )}
    </li>
  )
}

function StateBadge({ c }: { c: ManualCandidate }) {
  if (c.state === 'gap')
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-pill-warning px-2 py-0.5 text-[11px] font-medium text-pill-warning-ink"
        title={`Đã dùng: ${usesText(c.uses)}`}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Đã dùng {c.uses[0] ? shortDay(c.uses[0].date) : 'gần đây'}
      </span>
    )
  if (c.state === 'same_account')
    return (
      <span className="rounded-full bg-pill-neutral px-2 py-0.5 text-[11px] font-medium text-pill-neutral-ink">
        Đã gán ngày này
      </span>
    )
  if (c.state === 'full')
    return (
      <span
        className="rounded-full bg-pill-negative px-2 py-0.5 text-[11px] font-medium text-pill-negative-ink"
        title={`Đã dùng: ${usesText(c.uses)}`}
      >
        Hết caption trong ngày
      </span>
    )
  return null
}
