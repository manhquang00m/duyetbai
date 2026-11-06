import { useEffect, useState, type ReactNode } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { DateRangePicker } from '@/components/ui/date-picker'
import { PostThumb } from '@/components/PostThumb'
import { q, useUrlState } from '@/lib/useUrlState'
import { addDaysIso, datePresets, fmtVN } from '@/lib/dates'
import { confirmDialog } from '@/lib/confirm'
import { cn } from '@/lib/utils'

const MIN_RUNS = 30

const PRESETS = [datePresets.lastDays(7), datePresets.lastDays(14), datePresets.lastDays(30)]
const [DEF_FROM, DEF_TO] = PRESETS[1].range()
const URL_SCHEMA = { from: q.str(DEF_FROM), to: q.str(DEF_TO) }

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
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </Card>
  )
}

/** 1 o KPI trong strip chia vach 1px: nhan xam tren, so muc weight thuong. */
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="truncate text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-2xl font-normal tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

// Icon tron, khong o mau: do = can xu ly, xanh = nen lam them, xam = thong tin.
const TONE = {
  bad: { icon: AlertTriangle, cls: 'text-negative' },
  good: { icon: TrendingUp, cls: 'text-positive' },
  info: { icon: Info, cls: 'text-muted-foreground' },
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
            <t.icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.cls)} aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-medium">{it.title}</div>
              <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{it.detail}</div>
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
      <div className={cn('h-full rounded-full bg-chart-1', className)} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  )
}

function DimensionCard({ d, avg }: { d: InsightDimension; avg: number }) {
  const max = Math.max(0.01, ...d.rows.map(rate))
  return (
    <Section title={d.title} hint={d.note}>
      <table className="w-full text-[13px]">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 text-left">Nhóm</th>
            <th className="px-2 py-2 text-right">Lượt</th>
            <th className="px-2 py-2 text-right">Click</th>
            <th className="w-[38%] px-3 py-2 text-left">Click / lượt</th>
            <th className="px-3 py-2 text-right" title="Tỉ lệ lượt đăng có ít nhất 1 click">
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
                    <span className={cn('w-9 shrink-0 text-right font-medium tabular-nums', r <= avg * 0.5 && 'text-negative')}>
                      {dec(r)}
                    </span>
                    <Meter value={r / max} className={r >= avg ? 'bg-chart-1' : 'bg-muted-foreground/40'} />
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
            <span className="hidden text-[11px] font-medium tabular-nums sm:block">{dec(r)}</span>
            <div className="w-full max-w-7 rounded-t-sm bg-chart-1 group-hover:opacity-80" style={{ height: `${Math.max(2, (r / max) * 100)}px` }} />
            <span className="text-[11px] text-muted-foreground">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PostCell({ p }: { p: InsightPost }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PostThumb thumb={p.thumb} className="h-10 w-10" />
      <div className="min-w-0">
        <div className="line-clamp-2 text-xs">{p.caption || <em className="text-muted-foreground">(không có caption)</em>}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {p.topic && <span className="rounded bg-muted px-1.5 py-px">{p.topic}</span>}
          {p.likes && <span>{p.likes} tim</span>}
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
      <table className="w-full min-w-[40rem] text-[13px]">
        <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
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
            <th className="px-3 py-2 text-left">Bài</th>
            <th className="px-2 py-2 text-right" title="Lượt đăng trong khoảng / tổng số lần đã đăng">
              Lượt
            </th>
            <th className="px-2 py-2 text-right">Click</th>
            <th className="px-2 py-2 text-right">Click/lượt</th>
            {showMoney && <th className="px-2 py-2 text-right">Đơn</th>}
            {showMoney && <th className="px-3 py-2 text-right">Hoa hồng</th>}
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
                {p.total_runs !== p.runs && <span className="text-[11px]">/{p.total_runs}</span>}
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
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Xoá ${ids.length} bài khỏi kho?`,
                  description: 'Xoá kèm media đã tải. Không hoàn tác được.',
                  confirmLabel: `Xoá ${ids.length} bài`,
                  destructive: true,
                })
                if (ok) del.mutate(ids)
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
      <table className="w-full min-w-[48rem] text-[13px]">
        <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Nick</th>
            <th className="px-2 py-2 text-right">Lượt</th>
            <th className="px-2 py-2 text-right">Click</th>
            <th className="px-2 py-2 text-right">Click/lượt</th>
            <th className="px-2 py-2 text-right">Có click</th>
            <th className="px-3 py-2 text-center" title="Click/lượt: 7 ngày trước đó → 7 ngày gần nhất">
              Xu hướng
            </th>
            <th className="px-2 py-2 text-right">Đơn</th>
            <th className="px-2 py-2 text-right">Hoa hồng</th>
            <th className="px-3 py-2 text-right">Click gần nhất</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const dead = a.runs >= 10 && a.clicks === 0
            const prev = rate(a.previous)
            const cur = rate(a.recent)
            const falling = a.previous.runs >= 10 && a.recent.runs >= 5 && prev >= 0.3 && cur < prev * 0.5
            return (
              <tr key={a.account} className={'border-b last:border-0'}>
                <td className="px-3 py-2">
                  <div className="font-medium">{a.account}</div>
                  {(a.status || dead) && (
                    <div className={cn('text-[11px]', dead ? 'text-negative' : 'text-muted-foreground')}>
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
                    <span className={cn('inline-flex items-center gap-1', falling && 'text-negative', cur > prev * 1.3 && a.recent.runs >= 5 && 'text-positive')}>
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
  const url = useUrlState(URL_SCHEMA)
  const { from, to } = url.values
  const validRange = !!from && !!to && from <= to
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', from, to],
    queryFn: () => fetchInsights(from, to),
    enabled: validRange,
  })

  const o = data?.overview
  // Ngay cuoi co du lieu click: khoang loc nam sau ngay nay thi chac chan rong -> goi y lui ve.
  const cutoffDay = data?.cutoff?.slice(0, 10) ?? null
  // Mo trang khong chon ngay (mac dinh) ma khoang mac dinh nam sau ngay co bao cao click -> tu lui ve
  // 14 ngay toi ngay do, thay vi mo ra trang trong. Nguoi dung tu chon ngay thi giu nguyen.
  const usingDefault = url.isDefault('from') && url.isDefault('to')
  const shouldSnap = usingDefault && !!o && o.runs === 0 && !!cutoffDay && from > cutoffDay
  const setUrl = url.set
  useEffect(() => {
    if (shouldSnap && cutoffDay) setUrl({ from: addDaysIso(cutoffDay, -13), to: cutoffDay }, { replace: true })
  }, [shouldSnap, cutoffDay, setUrl])
  const avg = o ? rate(o) : 0
  const dims = data?.dimensions ?? []
  const byId = (id: string) => dims.find((d) => d.id === id)
  const hourDim = byId('hour')

  return (
    <div className="mx-auto max-w-8xl space-y-4">
      <PageHeader
        title="Phân tích & chiến lược"
        description="Nội dung nào, nick nào, giờ nào mang về click — tính từ nhật ký đăng + báo cáo click Shopee thật trong DB"
      />

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker from={from} to={to} onChange={(f, t) => url.set({ from: f, to: t })} presets={PRESETS} stepper />
        {!validRange && <span className="text-xs text-destructive">Chọn đủ ngày bắt đầu và kết thúc</span>}
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
            <Skeleton className="h-[86px] rounded-lg" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )
      ) : o.runs === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Chưa có lượt đăng nào trong khoảng này"
          description={
            cutoffDay && from > cutoffDay
              ? `Lượt đăng sau ${fmtVN(cutoffDay)} chưa được tính vì chưa có báo cáo click.`
              : 'Chọn khoảng ngày khác hoặc kiểm tra Nhật ký đăng.'
          }
          action={
            cutoffDay && from > cutoffDay ? (
              <Button size="sm" variant="outline" onClick={() => url.set({ from: addDaysIso(cutoffDay, -13), to: cutoffDay })}>
                Xem 14 ngày tới {fmtVN(cutoffDay)}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Lượt đăng" value={num(o.runs)} sub={`${num(o.posts)} bài · ${o.accounts} nick`} />
            <Kpi label="Click" value={num(o.clicks)} sub={o.unattributedClicks ? `+ ${num(o.unattributedClicks)} click chưa gán được` : undefined} />
            <Kpi label="Click / lượt đăng" value={dec(avg)} />
            <Kpi label="Lượt có click" value={pct(hitRate(o))} sub={`${num(o.hits)} lượt`} />
            <Kpi label="Đơn hàng" value={num(o.orders)} />
            <Kpi label="Hoa hồng" value={money(o.commission_milli)} sub="không tính đơn hủy" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Section title="Nhận định & đề xuất" hint="Tự rút ra từ số liệu, cần ≥ 30 lượt mỗi nhóm" className="lg:col-span-3">
              <InsightList items={data.insights} />
            </Section>
            <div className="space-y-4 lg:col-span-2">
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2">
            <h2 className="inline-flex items-center gap-2 text-base font-medium">
              <Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden /> Content nào ra click
            </h2>
            <span className="text-xs text-muted-foreground">Thanh cam = cao hơn trung bình {dec(avg)} click/lượt · đỏ = dưới một nửa · mờ = ít dữ liệu</span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {['topic', 'nth', 'likes', 'length', 'media', 'variant'].map((id) => {
              const d = byId(id)
              return d ? <DimensionCard key={id} d={d} avg={avg} /> : null
            })}
          </div>
          {hourDim && <DimensionCard d={hourDim} avg={avg} />}

          {data.products.length > 0 && (
            <Section title="Sản phẩm ra hoa hồng" hint="Top 10 trong khoảng">
              <div className="table-scroll">
                <table className="w-full min-w-[32rem] text-[13px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Sản phẩm</th>
                      <th className="px-2 py-2 text-left">Shop</th>
                      <th className="px-2 py-2 text-right">Đơn</th>
                      <th className="px-3 py-2 text-right">Hoa hồng</th>
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
