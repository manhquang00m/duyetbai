import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, ExternalLink, Lightbulb, TrendingUp, Info, BarChart3, Loader2, Trash2 } from 'lucide-react'
import {
  deletePosts,
  fetchInsights,
  type InsightCounts,
  type InsightDimension,
  type InsightPost,
  type InsightsReport,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'

const MIN_RUNS = 30

const pad = (n: number) => String(n).padStart(2, '0')
function localDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const PRESETS = [7, 14, 30] as const

const rate = (g: InsightCounts) => (g.runs > 0 ? g.clicks / g.runs : 0)
const hitRate = (g: InsightCounts) => (g.runs > 0 ? g.hits / g.runs : 0)
const num = (n: number) => n.toLocaleString('vi-VN')
const dec = (n: number) => n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (x: number) => `${Math.round(x * 100)}%`
const money = (milli: number) => `${Math.round(milli / 1000).toLocaleString('vi-VN')}đ`
const dt = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—')

function Section({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b px-3 py-2.5 sm:px-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </Card>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  )
}

const TONE = {
  bad: { icon: AlertTriangle, cls: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10' },
  good: { icon: TrendingUp, cls: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  info: { icon: Info, cls: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
} as const

function InsightList({ items }: { items: InsightsReport['insights'] }) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Chưa đủ dữ liệu để rút ra nhận định trong khoảng này.</p>
  }
  return (
    <ul className="divide-y">
      {items.map((it, i) => {
        const t = TONE[it.tone]
        return (
          <li key={i} className="flex gap-3 px-3 py-3 sm:px-4">
            <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', t.bg)}>
              <t.icon className={cn('h-4 w-4', t.cls)} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{it.title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{it.detail}</div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Thanh ngang ti le (0..1) dung trong bang. */
function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full bg-primary', className)} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  )
}

function DimensionCard({ d, avg }: { d: InsightDimension; avg: number }) {
  const max = Math.max(0.01, ...d.rows.map(rate))
  return (
    <Section title={d.title} hint={d.note}>
      <table className="w-full text-xs">
        <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">Nhóm</th>
            <th className="px-2 py-2 text-right font-medium">Lượt</th>
            <th className="px-2 py-2 text-right font-medium">Click</th>
            <th className="w-[38%] px-3 py-2 text-left font-medium">Click / lượt</th>
            <th className="px-3 py-2 text-right font-medium" title="Tỉ lệ lượt đăng có ít nhất 1 click">
              Có click
            </th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((g) => {
            const r = rate(g)
            const few = g.runs < MIN_RUNS
            return (
              <tr key={g.key} className={cn('border-b last:border-0', few && 'opacity-50')} title={few ? 'Ít dữ liệu, chưa đáng tin' : undefined}>
                <td className="px-3 py-1.5 font-medium">{g.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{num(g.runs)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(g.clicks)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-9 shrink-0 text-right font-semibold tabular-nums', r >= avg * 1.3 && 'text-emerald-600 dark:text-emerald-400', r <= avg * 0.5 && 'text-red-600 dark:text-red-400')}>
                      {dec(r)}
                    </span>
                    <Meter value={r / max} className={r >= avg ? 'bg-emerald-500' : 'bg-primary/60'} />
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pct(hitRate(g))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Section>
  )
}

function TrendBars({ data }: { data: InsightsReport['trend'] }) {
  const max = Math.max(0.01, ...data.map(rate))
  return (
    <div className="flex h-44 items-end gap-1 px-3 pb-2 pt-6 sm:px-4">
      {data.map((d) => {
        const r = rate(d)
        return (
          <div key={d.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.date}: ${dec(r)} click/lượt · ${num(d.clicks)} click / ${num(d.runs)} lượt · ${pct(hitRate(d))} lượt có click`}>
            <span className="hidden text-[10px] font-medium tabular-nums sm:block">{dec(r)}</span>
            <div className="w-full max-w-7 rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${Math.max(2, (r / max) * 100)}px` }} />
            <span className="text-[10px] text-muted-foreground">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PostCell({ p }: { p: InsightPost }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {p.thumb ? (
        <img src={`/media/${p.thumb}`} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
      )}
      <div className="min-w-0">
        <div className="line-clamp-2 text-xs">{p.caption || <em className="text-muted-foreground">(không có caption)</em>}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
          {p.topic && <span className="rounded bg-muted px-1.5 py-px">{p.topic}</span>}
          {p.likes && <span>♥ {p.likes}</span>}
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground" onClick={(e) => e.stopPropagation()}>
              bài gốc <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function PostTable({
  posts,
  showMoney,
  selected,
  onSelectedChange,
}: {
  posts: InsightPost[]
  showMoney?: boolean
  selected?: Set<string>
  onSelectedChange?: (next: Set<string>) => void
}) {
  const selectable = !!selected && !!onSelectedChange
  const allChecked = selectable && posts.length > 0 && posts.every((p) => selected.has(p.post_id))
  const toggle = (id: string) => {
    if (!selected || !onSelectedChange) return
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }
  return (
    <div className="table-scroll max-h-[30rem] overflow-y-auto">
      <table className="w-full min-w-[40rem] text-xs">
        <thead className="sticky top-0 z-10 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {selectable && (
              <th className="w-8 py-2 pl-3">
                <Checkbox
                  checked={allChecked}
                  indeterminate={!allChecked && posts.some((p) => selected.has(p.post_id))}
                  onCheckedChange={(v) => onSelectedChange(v ? new Set(posts.map((p) => p.post_id)) : new Set())}
                />
              </th>
            )}
            <th className="px-3 py-2 text-left font-medium">Bài</th>
            <th className="px-2 py-2 text-right font-medium" title="Lượt đăng trong khoảng / tổng số lần đã đăng">
              Lượt
            </th>
            <th className="px-2 py-2 text-right font-medium">Click</th>
            <th className="px-2 py-2 text-right font-medium">Click/lượt</th>
            {showMoney && <th className="px-2 py-2 text-right font-medium">Đơn</th>}
            {showMoney && <th className="px-3 py-2 text-right font-medium">Hoa hồng</th>}
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr
              key={p.post_id}
              className={cn('border-b last:border-0', selectable && 'cursor-pointer', selected?.has(p.post_id) && 'bg-primary/5')}
              onClick={selectable ? () => toggle(p.post_id) : undefined}
            >
              {selectable && (
                <td className="py-2 pl-3">
                  <Checkbox checked={selected.has(p.post_id)} onCheckedChange={() => toggle(p.post_id)} />
                </td>
              )}
              <td className="max-w-[24rem] px-3 py-2">
                <PostCell p={p} />
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                {p.runs}
                {p.total_runs !== p.runs && <span className="text-[10px]">/{p.total_runs}</span>}
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums">{num(p.clicks)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{dec(rate(p))}</td>
              {showMoney && <td className="px-2 py-2 text-right tabular-nums">{p.orders || '—'}</td>}
              {showMoney && <td className="px-3 py-2 text-right tabular-nums">{p.commission_milli ? money(p.commission_milli) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DeadPosts({ dead }: { dead: InsightsReport['deadPosts'] }) {
  const qc = useQueryClient()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const del = useMutation({
    mutationFn: (ids: string[]) => deletePosts(ids),
    onSuccess: (r) => {
      toast.success(`Đã xoá ${r.deleted} bài`)
      setSel(new Set())
      qc.invalidateQueries({ queryKey: ['insights'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Xoá thất bại'),
  })
  const ids = dead.posts.filter((p) => sel.has(p.post_id)).map((p) => p.post_id)
  return (
    <Section title="Bài nên dừng" hint={`${num(dead.count)} bài đã đăng ≥ 3 lần mà 0 click · tốn ${num(dead.runs)} lượt trong khoảng`}>
      {dead.posts.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
            <span className="text-muted-foreground">{ids.length > 0 ? `Đã chọn ${ids.length} bài` : 'Tích chọn bài để xoá khỏi kho'}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={ids.length === 0 || del.isPending}
              onClick={() => {
                if (confirm(`Xoá ${ids.length} bài (kèm media đã tải)? Không hoàn tác được.`)) del.mutate(ids)
              }}
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
              Xoá {ids.length > 0 ? ids.length : ''} bài
            </Button>
          </div>
          <PostTable posts={dead.posts} selected={sel} onSelectedChange={setSel} />
        </>
      ) : (
        <p className="p-4 text-xs text-muted-foreground">Không có bài nào đăng nhiều mà không ra click.</p>
      )}
    </Section>
  )
}

function AccountTable({ rows }: { rows: InsightsReport['accounts'] }) {
  return (
    <div className="table-scroll max-h-[32rem] overflow-y-auto">
      <table className="w-full min-w-[48rem] text-xs">
        <thead className="sticky top-0 z-10 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Nick</th>
            <th className="px-2 py-2 text-right font-medium">Lượt</th>
            <th className="px-2 py-2 text-right font-medium">Click</th>
            <th className="px-2 py-2 text-right font-medium">Click/lượt</th>
            <th className="px-2 py-2 text-right font-medium">Có click</th>
            <th className="px-3 py-2 text-center font-medium" title="Click/lượt: 7 ngày trước đó → 7 ngày gần nhất">
              Xu hướng
            </th>
            <th className="px-2 py-2 text-right font-medium">Đơn</th>
            <th className="px-2 py-2 text-right font-medium">Hoa hồng</th>
            <th className="px-3 py-2 text-right font-medium">Click gần nhất</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const dead = a.runs >= 10 && a.clicks === 0
            const prev = rate(a.previous)
            const cur = rate(a.recent)
            const falling = a.previous.runs >= 10 && a.recent.runs >= 5 && prev >= 0.3 && cur < prev * 0.5
            return (
              <tr key={a.account} className={cn('border-b last:border-0', dead && 'bg-red-50/60 dark:bg-red-500/5')}>
                <td className="px-3 py-2">
                  <div className="font-medium">{a.account}</div>
                  {(a.status || dead) && (
                    <div className={cn('text-[10px]', dead ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                      {dead ? '0 click — kiểm tra reach' : a.status}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{a.runs}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{num(a.clicks)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{dec(rate(a))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(hitRate(a))}</td>
                <td className="px-3 py-2 text-center tabular-nums">
                  {a.previous.runs > 0 || a.recent.runs > 0 ? (
                    <span className={cn('inline-flex items-center gap-1', falling && 'text-red-600 dark:text-red-400', cur > prev * 1.3 && a.recent.runs >= 5 && 'text-emerald-600 dark:text-emerald-400')}>
                      {a.previous.runs ? dec(prev) : '—'} <ArrowRight className="h-3 w-3" /> {a.recent.runs ? dec(cur) : '—'}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{a.orders || '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{a.commission_milli ? money(a.commission_milli) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{dt(a.last_click)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LagBars({ lag }: { lag: InsightsReport['lag'] }) {
  const total = lag.reduce((s, l) => s + l.clicks, 0)
  return (
    <div className="space-y-1.5 p-3 sm:p-4">
      {lag.map((l) => (
        <div key={l.label} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-muted-foreground">{l.label}</span>
          <Meter value={total ? l.clicks / Math.max(...lag.map((x) => x.clicks)) : 0} />
          <span className="w-10 shrink-0 text-right tabular-nums">{total ? pct(l.clicks / total) : '—'}</span>
        </div>
      ))}
    </div>
  )
}

export function InsightsPage() {
  const [from, setFrom] = useState(localDate(-14))
  const [to, setTo] = useState(localDate(0))
  const validRange = from <= to
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', from, to],
    queryFn: () => fetchInsights(from, to),
    enabled: validRange,
  })

  const o = data?.overview
  const avg = o ? rate(o) : 0
  const dims = data?.dimensions ?? []
  const byId = (id: string) => dims.find((d) => d.id === id)
  const hourDim = byId('hour')

  return (
    <div className="mx-auto max-w-8xl space-y-4 sm:space-y-5">
      <PageHeader
        title="Phân tích & chiến lược"
        description="Nội dung nào, nick nào, giờ nào mang về click — tính từ nhật ký đăng + báo cáo click Shopee thật trong DB"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none sm:text-xs" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none sm:text-xs" />
        </div>
        <div className="flex items-center gap-1">
          {PRESETS.map((d) => {
            const active = from === localDate(-d) && to === localDate(0)
            return (
              <Button
                key={d}
                size="sm"
                variant={active ? 'default' : 'ghost'}
                aria-pressed={active}
                onClick={() => {
                  setFrom(localDate(-d))
                  setTo(localDate(0))
                }}
              >
                {d} ngày
              </Button>
            )
          })}
        </div>
        {!validRange && <span className="text-xs text-destructive">Ngày bắt đầu phải trước ngày kết thúc</span>}
      </div>

      {data && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Khoảng lọc theo ngày đăng. Dữ liệu click tới {dt(data.dataUntil)}; lượt đăng sau {dt(data.cutoff)} chưa tính vì chưa kịp nhận click.
          Click được gán cho lượt đăng gần nhất trước lúc click (Shopee không ghi nick). Đây là tương quan, nên kiểm chứng bằng cách thử
          nghiệm vài ngày trước khi đổi toàn bộ chiến lược.
        </p>
      )}

      {isError && <EmptyState icon={AlertTriangle} title="Không tải được phân tích" description="Kiểm tra server đã chạy bản mới chưa." />}

      {isLoading || !data || !o ? (
        !isError && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )
      ) : o.runs === 0 ? (
        <EmptyState icon={BarChart3} title="Chưa có lượt đăng nào trong khoảng này" description="Chọn khoảng ngày khác hoặc kiểm tra Nhật ký đăng." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Lượt đăng" value={num(o.runs)} sub={`${num(o.posts)} bài · ${o.accounts} nick`} />
            <Kpi label="Click" value={num(o.clicks)} sub={o.unattributedClicks ? `+ ${num(o.unattributedClicks)} click chưa gán được` : undefined} />
            <Kpi label="Click / lượt đăng" value={dec(avg)} />
            <Kpi label="Lượt có click" value={pct(hitRate(o))} sub={`${num(o.hits)} lượt`} />
            <Kpi label="Đơn hàng" value={num(o.orders)} />
            <Kpi label="Hoa hồng" value={money(o.commission_milli)} sub="không tính đơn hủy" />
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <Section title="Nhận định & đề xuất" hint="Tự rút ra từ số liệu, cần ≥ 30 lượt mỗi nhóm" className="lg:col-span-3">
              <InsightList items={data.insights} />
            </Section>
            <div className="space-y-3 lg:col-span-2">
              <Section title="Click / lượt đăng theo ngày" hint="rê chuột xem chi tiết">
                <TrendBars data={data.trend} />
              </Section>
              <Section
                title="Click đến sau khi đăng bao lâu"
                hint={data.lagMedianHours != null ? `một nửa trong ${data.lagMedianHours.toFixed(1).replace('.', ',')} giờ đầu` : undefined}
              >
                <LagBars lag={data.lag} />
              </Section>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Bài nên đăng tiếp" hint="Click/lượt cao, mới đăng ≤ 3 lần">
              {data.repostCandidates.length > 0 ? (
                <PostTable posts={data.repostCandidates} />
              ) : (
                <p className="p-4 text-xs text-muted-foreground">Chưa có bài nào nổi bật mà còn ít lượt đăng.</p>
              )}
            </Section>
            <DeadPosts dead={data.deadPosts} />
          </div>

          <Section title="Bài nhiều click nhất" hint="Top 20 trong khoảng">
            <PostTable posts={data.topPosts} showMoney />
          </Section>

          <Section title="Nick nào mang về click" hint="Đỏ = đăng ≥ 10 lượt mà 0 click">
            <AccountTable rows={data.accounts} />
          </Section>

          <div className="flex items-center gap-2 pt-1 text-sm font-semibold">
            <Lightbulb className="h-4 w-4 text-amber-500" /> Content nào ra click
            <span className="text-xs font-normal text-muted-foreground">Xanh = cao hơn trung bình {dec(avg)} click/lượt · mờ = ít dữ liệu</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {['topic', 'nth', 'likes', 'length', 'media', 'variant'].map((id) => {
              const d = byId(id)
              return d ? <DimensionCard key={id} d={d} avg={avg} /> : null
            })}
          </div>
          {hourDim && <DimensionCard d={hourDim} avg={avg} />}

          {data.products.length > 0 && (
            <Section title="Sản phẩm ra hoa hồng" hint="Top 10 trong khoảng">
              <div className="table-scroll">
                <table className="w-full min-w-[32rem] text-xs">
                  <thead className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
                      <th className="px-2 py-2 text-left font-medium">Shop</th>
                      <th className="px-2 py-2 text-right font-medium">Đơn</th>
                      <th className="px-3 py-2 text-right font-medium">Hoa hồng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.item_name} className="border-b last:border-0">
                        <td className="max-w-[26rem] truncate px-3 py-2">{p.item_name}</td>
                        <td className="max-w-[12rem] truncate px-2 py-2 text-muted-foreground">{p.shop_name ?? '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.orders}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{money(p.commission_milli)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
