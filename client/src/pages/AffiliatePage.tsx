import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Upload,
  Info,
  AlertTriangle,
  ExternalLink,
  Loader2,
  MousePointerClick,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  importAffiliateFiles,
  fetchAffSummary,
  fetchAffPosts,
  fetchAffAccounts,
  fetchAffPostDetail,
  fetchAffCoverage,
  ACCOUNT_TOPICS,
  type AffFilterParams,
  type AffPostRow,
  type AffAccountRow,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')
/** Ngay theo gio MAY (khong dung toISOString - buoi toi VN se ra ngay hom truoc). */
function localDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const money = (milli: number) => `${Math.round(milli / 1000).toLocaleString('vi-VN')}đ`
const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—')
const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

type View = 'clicks' | 'cr' | 'zero' | 'commission'
const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: 'clicks', label: 'Click nhiều nhất', hint: 'Sắp theo số click' },
  { value: 'cr', label: 'Chuyển đổi tốt nhất', hint: 'Bài có đơn, sắp theo tỉ lệ đơn/click' },
  { value: 'zero', label: 'Nhiều click, 0 đơn', hint: 'Có click nhưng chưa ra đơn nào' },
  { value: 'commission', label: 'Hoa hồng cao nhất', hint: 'Sắp theo tổng hoa hồng (chờ + hoàn thành)' },
]

function applyView(rows: AffPostRow[], view: View): AffPostRow[] {
  const cr = (r: AffPostRow) => (r.clicks > 0 ? r.orders / r.clicks : 0)
  const comm = (r: AffPostRow) => r.pending_milli + r.completed_milli
  switch (view) {
    case 'clicks':
      return [...rows].sort((a, b) => b.clicks - a.clicks || b.orders - a.orders)
    case 'cr':
      return rows
        .filter((r) => r.orders > 0)
        .sort((a, b) => cr(b) - cr(a) || b.orders - a.orders)
    case 'zero':
      return rows.filter((r) => r.clicks > 0 && r.orders === 0).sort((a, b) => b.clicks - a.clicks)
    case 'commission':
      return [...rows].sort((a, b) => comm(b) - comm(a))
  }
}

function ImportHelp() {
  const popover = usePopover({ placement: 'bottom-end' })
  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        aria-label="Hướng dẫn import"
        onClick={() => popover.setOpen(!popover.open)}
        onMouseEnter={() => popover.setOpen(true)}
        onMouseLeave={() => popover.setOpen(false)}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Info className="h-4 w-4" />
      </button>
      <PopoverPanel popover={popover} className="w-[min(24rem,calc(100vw-1.5rem))] p-3 text-xs leading-relaxed">
        <p className="mb-1 font-medium">Lấy file từ Shopee Affiliate</p>
        <p className="text-muted-foreground">
          Vào dashboard Shopee Affiliate, xuất 2 báo cáo dạng CSV: <b>Báo cáo Click</b> và{' '}
          <b>Báo cáo Hoa hồng</b>. Có thể chọn cả 2 file cùng lúc, hệ thống tự nhận loại file.
        </p>
        <p className="mt-1.5 text-muted-foreground">
          Import lại file mới không bị trùng: click đã có sẽ bỏ qua, đơn hàng sẽ được cập nhật trạng
          thái/hoa hồng mới nhất. Nên xuất khoảng ngày chồng lên lần trước.
        </p>
      </PopoverPanel>
    </>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums sm:mt-1.5 sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  )
}

function HeroKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="relative col-span-full overflow-hidden border-primary/30 bg-gradient-to-br from-primary to-primary/70 p-4 text-primary-foreground shadow-md sm:p-5">
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
      <div className="relative">
        <div className="text-sm font-medium text-primary-foreground/80">{label}</div>
        <div className="mt-1 truncate text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">{value}</div>
        {sub && <div className="mt-1 text-xs text-primary-foreground/75">{sub}</div>}
      </div>
    </Card>
  )
}

/** So gon de in tren dau cot: 1.234 -> 1,2k; 1.234.567 -> 1,2tr. */
function compact(n: number): string {
  const fmt = (v: number) => (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v))).replace('.', ',')
  if (n >= 1_000_000) return `${fmt(n / 1_000_000)}tr`
  if (n >= 1_000) return `${fmt(n / 1_000)}k`
  return String(n)
}

/** Cot theo ngay, 1 chuoi, so in san tren dau cot (tooltip khi re chuot cho so day du). */
function DailyBars({
  title,
  data,
  unit,
}: {
  title: string
  data: { date: string; value: number }[]
  unit: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560
  const H = 160
  const top = 18
  const bottom = 20
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((s, d) => s + d.value, 0)
  const slot = data.length > 0 ? W / data.length : W
  const barW = Math.max(2, Math.min(28, slot - 2))
  const labelEvery = Math.ceil(data.length / 10)
  const valueFont = data.length > 20 ? 9 : 11
  const plotH = H - top - bottom
  return (
    <Card className="relative p-3 sm:p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          Tổng <b className="font-semibold text-foreground tabular-nums">{total.toLocaleString('vi-VN')}</b> {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label={title}>
        <line
          x1={0}
          x2={W}
          y1={top + plotH}
          y2={top + plotH}
          className="stroke-border"
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0
          const x = i * slot + (slot - barW) / 2
          const r = Math.min(4, barW / 2, h)
          const y = top + plotH - h
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* vung bat chuot rong hon cot */}
              <rect x={i * slot} y={top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  className={cn('fill-primary', hover !== null && hover !== i && 'opacity-40')}
                />
              )}
              {d.value > 0 && (
                <text
                  x={i * slot + slot / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={valueFont}
                  className="hidden fill-foreground font-medium tabular-nums sm:block"
                >
                  {compact(d.value)}
                </text>
              )}
              {i % labelEvery === 0 && (
                <text
                  x={i * slot + slot / 2}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-10 rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
          style={{ left: `calc(${((hover + 0.5) / data.length) * 100}% )`, transform: 'translateX(-50%)' }}
        >
          <div className="text-muted-foreground">{shortDate(data[hover].date)}</div>
          <div className="font-medium tabular-nums">
            {data[hover].value.toLocaleString('vi-VN')} {unit}
          </div>
        </div>
      )}
    </Card>
  )
}

function PostDetailSheet({
  post,
  filter,
  onClose,
}: {
  post: AffPostRow | null
  filter: AffFilterParams
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['aff-post', post?.post_id, filter],
    queryFn: () => fetchAffPostDetail(post!.post_id, filter),
    enabled: !!post,
  })
  return (
    <Sheet open={!!post} onClose={onClose} className="max-w-2xl">
      {post && (
        <div className="space-y-4">
          <div className="flex gap-3 pr-10">
            {post.thumb ? (
              <img src={`/media/${post.thumb}`} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-lg bg-muted" />
            )}
            <div className="min-w-0">
              <div className="break-all font-mono text-xs text-muted-foreground">
                {post.post_id} {post.username && `· @${post.username}`}
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{post.caption || <em>(không có caption)</em>}</p>
              {post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Mở bài gốc
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            <div className="rounded-lg border p-2">
              <div className="text-muted-foreground">Click</div>
              <div className="text-lg font-semibold tabular-nums">{post.clicks}</div>
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-muted-foreground">Đơn</div>
              <div className="text-lg font-semibold tabular-nums">{post.orders}</div>
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-muted-foreground">Chờ duyệt</div>
              <div className="text-sm font-semibold tabular-nums">{money(post.pending_milli)}</div>
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-muted-foreground">Hoàn thành</div>
              <div className="text-sm font-semibold tabular-nums">{money(post.completed_milli)}</div>
            </div>
          </div>

          {post.accounts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tài khoản đã đăng bài này: <span className="text-foreground">{post.accounts.join(', ')}</span>
            </p>
          )}

          {isLoading && <Skeleton className="h-32 w-full" />}
          {data && data.daily.length > 0 && (
            <DailyBars
              title="Click theo ngày"
              unit="click"
              data={data.daily.map((d) => ({ date: d.date, value: d.clicks }))}
            />
          )}

          {data && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                Sản phẩm đã bán ({data.orders.length} dòng)
              </h3>
              {data.orders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có đơn nào trong khoảng ngày này.</p>
              ) : (
                <div className="table-scroll max-h-[50dvh] overflow-y-auto rounded-lg border sm:max-h-96">
                  <table className="w-full min-w-[30rem] text-xs">
                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left font-medium">Sản phẩm</th>
                        <th className="p-2 text-left font-medium">Trạng thái</th>
                        <th className="p-2 text-left font-medium">Click → Đặt</th>
                        <th className="p-2 text-right font-medium">Hoa hồng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((o, i) => (
                        <tr key={`${o.order_id}-${i}`} className="border-b last:border-0">
                          <td className="max-w-[16rem] p-2">
                            <div className="line-clamp-2">{o.item_name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {o.order_id} · SL {o.quantity}
                            </div>
                          </td>
                          <td className="whitespace-nowrap p-2">
                            <OrderStatus status={o.order_status} />
                          </td>
                          <td className="whitespace-nowrap p-2 text-muted-foreground">
                            {o.clicked_at?.slice(5, 16)} → {o.ordered_at?.slice(5, 16)}
                          </td>
                          <td className="p-2 text-right tabular-nums">{money(o.net_commission_milli)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

function PostThumb({ thumb }: { thumb: string | null }) {
  return thumb ? (
    <img src={`/media/${thumb}`} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md object-cover sm:h-9 sm:w-9" />
  ) : (
    <div className="h-10 w-10 shrink-0 rounded-md bg-muted sm:h-9 sm:w-9" />
  )
}

function referrersText(r: AffPostRow): string {
  return (
    Object.entries(r.referrers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ') || '—'
  )
}

function PostCard({ r, onSelect }: { r: AffPostRow; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full space-y-2 p-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
    >
      <div className="flex items-center gap-2.5">
        <PostThumb thumb={r.thumb} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs">{r.caption || <em>(không có caption)</em>}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {r.post_id} {r.username && `· @${r.username}`}
          </div>
        </div>
        {r.topic && (
          <span className="max-w-[7rem] shrink-0 truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {r.topic}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs tabular-nums">
        <div>
          <div className="text-[10px] text-muted-foreground">Click</div>
          <div className="font-semibold">{r.clicks}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Đơn</div>
          <div className="font-semibold">
            {r.orders}
            {r.cancelled_orders > 0 && (
              <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">(+{r.cancelled_orders})</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">CR</div>
          <div className="font-semibold">{pct(r.orders, r.clicks)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground">Hoàn thành</div>
          <div className="truncate font-semibold">{money(r.completed_milli)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">Chờ duyệt {money(r.pending_milli)}</span>
        <span className="min-w-0 truncate">{referrersText(r)}</span>
      </div>
    </button>
  )
}

function OrderStatus({ status }: { status: string | null }) {
  const cls =
    status === 'Hoàn thành'
      ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
      : status === 'Đã hủy'
        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', cls)}>
      {status ?? '—'}
    </span>
  )
}

const PRESETS = [
  { days: 1, label: 'Hôm nay', hint: 'Click + hoa hồng của hôm qua (báo cáo Shopee trễ 1 ngày)' },
  { days: 7, label: '7 ngày' },
  { days: 15, label: '15 ngày' },
  { days: 30, label: '30 ngày' },
] as const

function AccountStats({ rows, loading }: { rows: AffAccountRow[] | undefined; loading: boolean }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2.5">
        <h2 className="text-sm font-semibold">Click theo tài khoản</h2>
        <span className="text-xs text-muted-foreground">
          Sub_id → bài, đối chiếu nhật ký đăng: click gán cho tài khoản đăng bài đó gần nhất trước lúc click
        </span>
      </div>
      {loading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">Không có click nào trong khoảng ngày này</p>
      ) : (
        <div className="table-scroll max-h-[24rem] overflow-y-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left font-medium">Tài khoản</th>
                <th className="p-2.5 text-right font-medium">Click</th>
                <th
                  className="p-2.5 text-right font-medium"
                  title="Trong ngày click chỉ đúng tài khoản này đăng bài đó. Phần còn lại là click từ bài đăng hôm trước, hoặc ngày đó có nhiều tài khoản cùng đăng"
                >
                  Khớp trong ngày
                </th>
                <th className="p-2.5 text-right font-medium">Bài có click</th>
                <th className="p-2.5 text-right font-medium">Đơn</th>
                <th className="p-2.5 text-right font-medium">Hoa hồng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account ?? '__none'} className="border-b last:border-0">
                  <td className="p-2.5 font-medium">
                    {r.account ?? (
                      <span className="italic text-muted-foreground" title="Lúc click chưa có tài khoản nào đăng bài đó trong nhật ký">
                        Không xác định
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-right font-semibold tabular-nums">{r.clicks.toLocaleString('vi-VN')}</td>
                  <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                    {r.account ? r.exact_clicks.toLocaleString('vi-VN') : '—'}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">{r.posts}</td>
                  <td className="p-2.5 text-right tabular-nums">{r.orders.toLocaleString('vi-VN')}</td>
                  <td className="p-2.5 text-right font-medium tabular-nums">{money(r.commission_milli)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function AffiliatePage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [from, setFrom] = useState(localDate(-7))
  const [to, setTo] = useState(localDate(-1))
  const [topic, setTopic] = useState<string>('all')
  const [basis, setBasis] = useState<'click' | 'order'>('order')
  const [view, setView] = useState<View>('clicks')
  const [selected, setSelected] = useState<AffPostRow | null>(null)
  const [showUnmatched, setShowUnmatched] = useState(false)

  const filter: AffFilterParams = useMemo(
    () => ({ from, to, topics: topic === 'all' ? [] : [topic] }),
    [from, to, topic],
  )
  const validRange = from <= to
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['aff-summary', filter],
    queryFn: () => fetchAffSummary(filter),
    enabled: validRange,
  })
  const { data: postsData, isLoading: loadingPosts } = useQuery({
    queryKey: ['aff-posts', filter],
    queryFn: () => fetchAffPosts(filter),
    enabled: validRange,
  })
  const { data: accountRows, isLoading: loadingAccounts } = useQuery({
    queryKey: ['aff-accounts', filter],
    queryFn: () => fetchAffAccounts(filter),
    enabled: validRange,
  })
  const { data: coverage } = useQuery({ queryKey: ['aff-coverage'], queryFn: fetchAffCoverage })

  const rows = useMemo(() => applyView(postsData?.posts ?? [], view), [postsData, view])

  const setPreset = (days: number) => {
    setFrom(localDate(-days))
    setTo(localDate(-1))
  }

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setImporting(true)
    try {
      const results = await importAffiliateFiles(files)
      for (const r of results) {
        if ('error' in r) {
          toast.error(`${r.fileName}: ${r.error}`)
          continue
        }
        const label = r.kind === 'click' ? 'Click' : 'Hoa hồng'
        toast.success(
          `${label} · ${r.fileName}: ${r.inserted} mới` +
            (r.updated ? `, ${r.updated} cập nhật` : '') +
            (r.skipped ? `, ${r.skipped} đã có/bỏ qua` : '') +
            (r.unmatchedSubIds ? ` · ${r.unmatchedSubIds} Sub_id không khớp bài` : ''),
        )
      }
      for (const key of ['aff-summary', 'aff-posts', 'aff-accounts', 'aff-coverage', 'aff-post']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi import')
    } finally {
      setImporting(false)
    }
  }

  // 2 bao cao lech khoang ngay -> ty le chuyen doi bi sai (click thieu hoac don thieu).
  const coverageGap =
    coverage?.clickMax &&
    coverage?.orderClickMax &&
    Math.abs(
      new Date(coverage.clickMax.slice(0, 10)).getTime() -
        new Date(coverage.orderClickMax.slice(0, 10)).getTime(),
    ) >
      86_400_000


  const basisLabel = basis === 'click' ? 'click' : 'đặt hàng'
  const totals = summary && (basis === 'order' ? summary.byOrderDate : summary)

  const basisToggle = (
    <div className="flex w-fit gap-0.5 rounded-lg border bg-muted/40 p-0.5 text-xs">
      {(
        [
          ['click', 'Theo ngày click'],
          ['order', 'Theo ngày đặt hàng'],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => setBasis(v)}
          className={cn(
            'rounded-md px-2.5 py-1.5 font-medium transition-colors sm:py-1',
            basis === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="mx-auto max-w-8xl space-y-4 sm:space-y-5">
      <PageHeader
        title="Hiệu quả Affiliate"
        description="Bài nào được click nhiều, click nào ra đơn — từ báo cáo Click + Hoa hồng của Shopee"
        actions={
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={onFiles}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import CSV
            </Button>
            <ImportHelp />
          </div>
        }
      />

      {coverage && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Dữ liệu click:{' '}
            {coverage.clickMin
              ? `${coverage.clickMin.slice(0, 10)} → ${coverage.clickMax?.slice(0, 10)}`
              : 'chưa có'}
          </span>
          <span>
            Dữ liệu hoa hồng (theo giờ click):{' '}
            {coverage.orderClickMin
              ? `${coverage.orderClickMin.slice(0, 10)} → ${coverage.orderClickMax?.slice(0, 10)}`
              : 'chưa có'}
          </span>
          {coverageGap && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> 2 báo cáo lệch khoảng ngày — tỉ lệ chuyển đổi
              có thể chưa chính xác, nên xuất cả 2 cùng khoảng
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none sm:text-xs" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none sm:text-xs" />
        </div>
        <div className="flex items-center gap-1">
          {PRESETS.map((p) => {
            const active = from === localDate(-p.days) && to === localDate(-1)
            return (
              <Button
                key={p.days}
                size="sm"
                variant={active ? 'default' : 'ghost'}
                aria-pressed={active}
                title={'hint' in p ? p.hint : undefined}
                onClick={() => setPreset(p.days)}
              >
                {p.label}
              </Button>
            )
          })}
        </div>
        <SingleFilterDropdown
          label="Chủ đề"
          value={topic}
          onChange={setTopic}
          options={[{ value: 'all', label: 'Tất cả' }, ...ACCOUNT_TOPICS.map((t) => ({ value: t, label: t }))]}
        />
        {basisToggle}
        {!validRange && <span className="w-full text-xs text-destructive sm:w-auto">Ngày bắt đầu phải trước ngày kết thúc</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
        {loadingSummary || !summary || !totals ? (
          <>
            <Skeleton className="col-span-full h-28 rounded-xl" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <HeroKpi
              label={`Tổng hoa hồng · theo ngày ${basisLabel}`}
              value={money(totals.pendingMilli + totals.completedMilli)}
              sub={`Chờ duyệt ${money(totals.pendingMilli)} · Hoàn thành ${money(totals.completedMilli)} · không tính đơn đã hủy`}
            />
            <Kpi label="Click" value={summary.clicks.toLocaleString('vi-VN')} />
            <Kpi
              label={`Đơn hàng · ngày ${basisLabel}`}
              value={totals.orders.toLocaleString('vi-VN')}
              sub={totals.cancelledOrders ? `+ ${totals.cancelledOrders} đơn đã hủy` : undefined}
            />
            <Kpi
              label="Tỉ lệ chuyển đổi"
              value={pct(summary.orders, summary.clicks)}
              sub={`${summary.convertedClicks} click ra đơn · luôn theo ngày click`}
            />
            <Kpi label="Hoa hồng chờ duyệt" value={money(totals.pendingMilli)} />
            <Kpi label="Hoa hồng hoàn thành" value={money(totals.completedMilli)} />
          </>
        )}
      </div>

      {summary && (
        <div className="grid gap-3 lg:grid-cols-2">
          <DailyBars
            title="Click theo ngày"
            unit="click"
            data={summary.daily.map((d) => ({ date: d.date, value: d.clicks }))}
          />
          <DailyBars
            title={`Đơn hàng theo ngày ${basisLabel}`}
            unit="đơn"
            data={(basis === 'click' ? summary.daily : summary.dailyByOrderDate).map((d) => ({
              date: d.date,
              value: d.orders,
            }))}
          />
          <DailyBars
            title={`Hoa hồng theo ngày ${basisLabel}`}
            unit="đ"
            data={(basis === 'click' ? summary.daily : summary.dailyByOrderDate).map((d) => ({
              date: d.date,
              value: Math.round(d.commission_milli / 1000),
            }))}
          />
        </div>
      )}
      {summary && summary.byReferrer.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Người giới thiệu (Shopee ghi nhận, chỉ để tham khảo):{' '}
          {summary.byReferrer.map((r) => `${r.referrer} ${r.clicks}`).join(' · ')}
          <br />
          Đơn của những ngày gần đây còn tăng thêm vì Shopee ghi nhận đơn vài ngày sau click.
        </p>
      )}

      <AccountStats rows={accountRows} loading={loadingAccounts} />

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="table-scroll flex min-w-0 flex-1 items-center gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                title={v.hint}
                onClick={() => setView(v.value)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors sm:py-1.5',
                  view === v.value ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span className="shrink-0 whitespace-nowrap pr-1 text-xs tabular-nums text-muted-foreground">
            {rows.length} bài
          </span>
        </div>

        {loadingPosts && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {!loadingPosts && rows.length === 0 && (
          <EmptyState
            icon={MousePointerClick}
            title={(postsData?.posts.length ?? 0) === 0 ? 'Chưa có dữ liệu' : 'Không có bài nào khớp'}
            description={
              (postsData?.posts.length ?? 0) === 0
                ? 'Import báo cáo Click và Hoa hồng từ Shopee Affiliate để bắt đầu.'
                : 'Thử đổi khoảng ngày hoặc chế độ xem.'
            }
          />
        )}

        {!loadingPosts && rows.length > 0 && (
          <div className="divide-y md:hidden">
            {rows.map((r) => (
              <PostCard key={r.post_id} r={r} onSelect={() => setSelected(r)} />
            ))}
          </div>
        )}

        <div
          className={cn(
            'table-scroll hidden max-h-[calc(100dvh-20rem)] min-h-[16rem] overflow-y-auto',
            !loadingPosts && rows.length > 0 && 'md:block',
          )}
        >
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left font-medium">Bài</th>
                <th className="p-2.5 text-left font-medium">Chủ đề</th>
                <th className="p-2.5 text-right font-medium">Click</th>
                <th className="p-2.5 text-right font-medium">Đơn</th>
                <th className="p-2.5 text-right font-medium" title="Số đơn / số click trong khoảng ngày">
                  CR
                </th>
                <th className="p-2.5 text-right font-medium">Chờ duyệt</th>
                <th className="p-2.5 text-right font-medium">Hoàn thành</th>
                <th className="p-2.5 text-left font-medium">Nguồn click</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                  <tr
                    key={r.post_id}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="max-w-[22rem] p-2.5">
                      <div className="flex items-center gap-2.5">
                        <PostThumb thumb={r.thumb} />
                        <div className="min-w-0">
                          <div className="truncate text-xs">{r.caption || <em>(không có caption)</em>}</div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {r.post_id} {r.username && `· @${r.username}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-2.5 text-xs text-muted-foreground">{r.topic ?? '—'}</td>
                    <td className="p-2.5 text-right tabular-nums">{r.clicks}</td>
                    <td className="p-2.5 text-right tabular-nums">
                      {r.orders}
                      {r.cancelled_orders > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(+{r.cancelled_orders} hủy)</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right tabular-nums">{pct(r.orders, r.clicks)}</td>
                    <td className="whitespace-nowrap p-2.5 text-right tabular-nums">{money(r.pending_milli)}</td>
                    <td className="whitespace-nowrap p-2.5 text-right tabular-nums">{money(r.completed_milli)}</td>
                    <td className="whitespace-nowrap p-2.5 text-[11px] text-muted-foreground">
                      {referrersText(r)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {postsData && postsData.unmatched.length > 0 && (
        <Card className="p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setShowUnmatched((v) => !v)}
            aria-expanded={showUnmatched}
            className="-my-1 flex min-h-10 items-center gap-1 py-1 text-left text-sm font-medium sm:min-h-0"
          >
            {showUnmatched ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Sub_id không khớp bài nào ({postsData.unmatched.length})
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            Click/đơn mang Sub_id không trùng bài nào trong hệ thống — thường là bài đã xoá hoặc link tạo từ
            nơi khác.
          </p>
          {showUnmatched && (
            <div className="table-scroll mt-2">
            <table className="w-full min-w-[22rem] text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-1.5 text-left font-medium">Sub_id1</th>
                  <th className="p-1.5 text-right font-medium">Click</th>
                  <th className="p-1.5 text-right font-medium">Đơn</th>
                  <th className="p-1.5 text-right font-medium">Hoa hồng</th>
                </tr>
              </thead>
              <tbody>
                {postsData.unmatched.map((u) => (
                  <tr key={u.sub_id1} className="border-t">
                    <td className="p-1.5 font-mono">{u.sub_id1}</td>
                    <td className="p-1.5 text-right tabular-nums">{u.clicks}</td>
                    <td className="p-1.5 text-right tabular-nums">{u.orders}</td>
                    <td className="p-1.5 text-right tabular-nums">{money(u.commission_milli)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      )}

      <PostDetailSheet post={selected} filter={filter} onClose={() => setSelected(null)} />
    </div>
  )
}
