import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Download, Inbox } from 'lucide-react'
import {
  fetchAccounts,
  fetchAffSummary,
  fetchPostRunsDay,
  fetchPosts,
  fetchStats,
  type AffSummary,
  type PostRunDayRow,
} from '@/lib/api'
import { accountsNeedingAttention, REASON_LABEL, type AttentionReason } from '@/lib/accountAttention'
import { datePresets, fmtVN, todayIso } from '@/lib/dates'
import { StatCard, StatStrip } from '@/components/StatCard'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ShadowbanBadge } from '@/components/ShadowbanBadge'
import { AccountAvatar } from '@/components/AccountAvatar'
import { PostThumb } from '@/components/PostThumb'
import { BarsPlot, type DailyPoint } from '@/components/charts/DailyBars'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/*
 * Cau hoi cua man: "Hom nay can xu ly gi, affiliate dang chay ra sao?"
 * - Lon nhat: hoa hong 7 ngay (con so + cot theo ngay, mau cam Shopee).
 * - Ben canh: tien do dang bai hom nay.
 * - Hang duoi: viec can lam (account loi) va bai moi thu thap, cung 5 dong 64px de 2 cot bang day.
 * - Cuoi: so lieu kho (bai, media, link, account) - nho, khong tranh cho voi cau tra loi.
 */

const LIST_ROWS = 5
// Bao cao Shopee tre 1 ngay -> 7 ngay ket thuc hom qua (giong preset "7 ngay" o trang Affiliate).
const AFF_WEEK = datePresets.lastDays(7, -1)

const money = (dong: number) => `${dong.toLocaleString('vi-VN')}đ`

function BlockHeader({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
      <h2 className="min-w-0 truncate text-sm font-medium">{title}</h2>
      {aside}
    </div>
  )
}

function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-10 shrink-0 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
    >
      {children} <ChevronRight className="h-4 w-4" />
    </Link>
  )
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex h-10 items-center justify-between border-t border-rule px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children} <ChevronRight className="h-4 w-4" />
    </Link>
  )
}

function BlockError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="px-4 py-6 text-sm text-muted-foreground">
      Không tải được {what}.{' '}
      <button type="button" onClick={onRetry} className="text-foreground underline decoration-input underline-offset-4">
        Thử lại
      </button>
    </div>
  )
}

/** Du 7 cot (ngay khong co don = 0) de truc ngay lien mach. */
function weekBars(summary: AffSummary, from: string): DailyPoint[] {
  const byDate = new Map(summary.dailyByOrderDate.map((d) => [d.date, d.commission_milli]))
  const out: DailyPoint[] = []
  const d = new Date(`${from}T00:00:00`)
  for (let i = 0; i < 7; i++) {
    const p = (n: number) => String(n).padStart(2, '0')
    const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    out.push({ date: iso, value: Math.round((byDate.get(iso) ?? 0) / 1000) })
    d.setDate(d.getDate() + 1)
  }
  return out
}

function CommissionHero() {
  const [from, to] = AFF_WEEK.range()
  const q = useQuery({
    queryKey: ['aff-summary', { from, to, topics: [] }],
    queryFn: () => fetchAffSummary({ from, to, topics: [] }),
  })
  const bars = q.data ? weekBars(q.data, from) : []
  // Cung 1 bien voi con so lon o trang Affiliate (preset 7 ngay, theo ngay dat hang): lam tron 1 lan
  // tu tong goc, khong cong cac cot da lam tron (lech 1-3d).
  const total = q.data ? Math.round((q.data.byOrderDate.pendingMilli + q.data.byOrderDate.completedMilli) / 1000) : 0
  return (
    <Card className="flex min-w-0 flex-col lg:col-span-2">
      <BlockHeader
        title="Hoa hồng 7 ngày"
        aside={<MoreLink to="/affiliate">Xem Affiliate</MoreLink>}
      />
      {q.isError ? (
        <BlockError what="số liệu affiliate" onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-3 px-4 pb-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[132px] w-full" />
        </div>
      ) : (
        <div className="px-4 pb-4">
          <div className="text-[32px] font-semibold leading-10 tabular-nums">{money(total)}</div>
          <div className="text-sm text-muted-foreground">
            <span className="tabular-nums">
              {fmtVN(from).slice(0, 5)} – {fmtVN(to)}
            </span>{' '}
            · <span className="tabular-nums">{q.data.byOrderDate.orders.toLocaleString('vi-VN')}</span> đơn theo ngày đặt
            hàng, chưa tính đơn hủy · báo cáo Shopee trễ 1 ngày
          </div>
          <div className="mt-3">
            <BarsPlot data={bars} unit="đ" label="Hoa hồng theo ngày đặt hàng" height={132} />
          </div>
        </div>
      )}
    </Card>
  )
}

function PostingToday() {
  const today = todayIso()
  const q = useQuery({ queryKey: ['post-runs-day', today], queryFn: () => fetchPostRunsDay(today) })
  const planned = (q.data ?? []).filter((r: PostRunDayRow) => r.in_plan)
  const n = {
    planned: planned.length,
    commented: planned.filter((r) => r.state === 'commented').length,
    posted: planned.filter((r) => r.state === 'posted').length,
    missing: planned.filter((r) => r.state === 'missing').length,
  }
  const done = n.commented + n.posted
  const pct = (v: number) => (n.planned > 0 ? `${(v / n.planned) * 100}%` : '0%')
  return (
    <Card className="flex min-w-0 flex-col">
      <BlockHeader title="Đăng bài hôm nay" aside={<MoreLink to="/post-log">Nhật ký</MoreLink>} />
      {q.isError ? (
        <BlockError what="nhật ký đăng" onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-3 px-4 pb-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : n.planned === 0 ? (
        <div className="flex flex-1 flex-col justify-center px-4 pb-4 text-sm text-muted-foreground">
          Hôm nay chưa có lịch đăng.{' '}
          <Link to="/distribution" className="mt-1 text-foreground underline decoration-input underline-offset-4">
            Lập kế hoạch phân phối
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col px-4 pb-4">
          <div className="text-2xl leading-10 tabular-nums">
            {done}
            <span className="text-base text-muted-foreground"> / {n.planned} bài đã đăng</span>
          </div>
          {/* Thanh tien do: phan da xong (dang + CMT) dam, phan thieu CMT nhat hon, con lai la nen */}
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="bg-foreground" style={{ width: pct(n.commented) }} />
            <div className="bg-foreground/35" style={{ width: pct(n.posted) }} />
          </div>
          <dl className="mt-3 space-y-0.5 text-sm">
            <div className="flex h-8 items-center justify-between gap-2">
              <dt className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden />
                Hoàn tất (đăng + CMT)
              </dt>
              <dd className="tabular-nums">{n.commented}</dd>
            </div>
            <div className="flex h-8 items-center justify-between gap-2">
              <dt className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-foreground/35" aria-hidden />
                Thiếu CMT
              </dt>
              <dd>
                {n.posted > 0 ? (
                  <Link
                    to="/post-log?tab=posted"
                    className="rounded-full bg-pill-warning px-2 py-0.5 text-[11px] font-medium tabular-nums text-pill-warning-ink"
                    title="Bài không có link affiliate - nên comment bù"
                  >
                    {n.posted} cần CMT bù
                  </Link>
                ) : (
                  <span className="tabular-nums">0</span>
                )}
              </dd>
            </div>
            <div className="flex h-8 items-center justify-between gap-2">
              <dt className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted ring-1 ring-inset ring-border" aria-hidden />
                Chưa báo cáo
              </dt>
              <dd className="tabular-nums text-muted-foreground">{n.missing}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  )
}

const REASON_VIEW: Partial<Record<AttentionReason, string>> = {
  'proxy-die': 'proxy-die',
  shadowban: 'shadowban',
}

function ReasonMark({ reason, verdict }: { reason: AttentionReason; verdict: Parameters<typeof ShadowbanBadge>[0]['verdict'] }) {
  if (reason === 'shadowban' || reason === 'suspect') return <ShadowbanBadge verdict={verdict} />
  if (reason === 'proxy-die')
    return (
      <span className="shrink-0 whitespace-nowrap rounded-full bg-pill-negative px-2 py-0.5 text-[11px] font-medium text-pill-negative-ink">
        {REASON_LABEL[reason]}
      </span>
    )
  return <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{REASON_LABEL[reason]}</span>
}

function AttentionList() {
  const q = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const attention = q.data ? accountsNeedingAttention(q.data) : []
  const count = (r: AttentionReason) => attention.filter((x) => x.reason === r).length
  const byView = (['proxy-die', 'shadowban'] as const).filter((r) => count(r) > 0)
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <BlockHeader
        title={
          <>
            Việc cần làm
            {attention.length > 0 && (
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">{attention.length} account</span>
            )}
          </>
        }
        aside={
          byView.length > 0 && (
            <div className="hidden shrink-0 items-center gap-3 text-xs sm:flex">
              {byView.map((r) => (
                <Link
                  key={r}
                  to={`/accounts?view=${REASON_VIEW[r]}`}
                  className="text-muted-foreground underline decoration-input underline-offset-4 hover:text-foreground hover:decoration-foreground"
                >
                  <span className="tabular-nums">{count(r)}</span> {REASON_LABEL[r].toLowerCase()}
                </Link>
              ))}
            </div>
          )
        }
      />
      <div className="flex-1">
        {q.isError && <BlockError what="danh sách account" onRetry={() => q.refetch()} />}
        {!q.data &&
          !q.isError &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex h-16 items-center gap-3 border-t border-rule px-4">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          ))}
        {attention.slice(0, LIST_ROWS).map(({ account: a, reason }) => (
          <Link
            key={a.id}
            to={`/accounts?q=${encodeURIComponent(a.name)}`}
            className="flex h-16 items-center gap-3 border-t border-rule px-4 transition-colors hover:bg-accent"
          >
            <AccountAvatar name={a.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.name}</div>
              <div className="truncate text-xs text-muted-foreground">{a.device || '—'}</div>
            </div>
            <ReasonMark reason={reason} verdict={a.shadowban_verdict} />
          </Link>
        ))}
        {q.data && attention.length === 0 && (
          <EmptyState icon={CheckCircle2} title="Không có việc gì cần làm" description="Mọi account đang chạy đều có proxy sống, chưa dính shadowban." />
        )}
      </div>
      {attention.length > 0 && (
        <FooterLink to="/accounts?view=attention">
          {attention.length > LIST_ROWS ? `Xem thêm ${attention.length - LIST_ROWS} account` : 'Mở danh sách cần xử lý'}
        </FooterLink>
      )}
    </Card>
  )
}

function RecentPosts() {
  const q = useQuery({ queryKey: ['posts', 'recent'], queryFn: () => fetchPosts({ limit: LIST_ROWS, offset: 0 }) })
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <BlockHeader
        title="Bài mới thu thập"
        aside={
          q.data && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {q.data.total.toLocaleString('vi-VN')} bài trong kho
            </span>
          )
        }
      />
      <div className="flex-1">
        {q.isError && <BlockError what="bài viết" onRetry={() => q.refetch()} />}
        {!q.data &&
          !q.isError &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex h-16 items-center gap-3 border-t border-rule px-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        {(q.data?.items ?? []).map((p) => (
          <Link
            key={p.post_id}
            to={`/posts?q=${encodeURIComponent(p.post_id)}`}
            className="flex h-16 items-center gap-3 border-t border-rule px-4 transition-colors hover:bg-accent"
          >
            <PostThumb thumb={p.thumb} className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">@{p.username || '—'}</div>
              <div className="truncate text-sm text-muted-foreground">{p.caption || '(không có caption)'}</div>
            </div>
            <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.post_date}</div>
          </Link>
        ))}
        {q.data && q.data.items.length === 0 && (
          <EmptyState icon={Inbox} title="Chưa có bài nào" description="Dán link bài Threads ở trang Thu thập để tải về." />
        )}
      </div>
      {q.data && q.data.items.length > 0 && <FooterLink to="/posts">Xem tất cả bài viết</FooterLink>}
    </Card>
  )
}

export function OverviewPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const { data: accounts, isError: accountsError } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })

  const running = (accounts ?? []).filter((a) => a.active && !a.banned)
  const attention = accounts ? accountsNeedingAttention(accounts) : []
  const finding = accountsError
    ? 'Không tải được trạng thái account.'
    : !accounts
      ? 'Đang tải trạng thái account…'
      : attention.length === 0
        ? `${running.length} account đang chạy, không account nào cần xử lý.`
        : `${attention.length} trong ${running.length} account đang chạy cần xử lý.`

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Tổng quan"
        description={finding}
        primary={{ label: 'Thu thập bài', shortLabel: 'Thu thập', icon: Download, to: '/batch' }}
      />

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
        <CommissionHero />
        <PostingToday />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <AttentionList />
        <RecentPosts />
      </div>

      {isLoading || !stats ? (
        <Skeleton className="h-[62px] rounded-lg" />
      ) : (
        <StatStrip className="grid-cols-2 sm:grid-cols-4">
          <StatCard size="compact" label="Bài viết" value={stats.posts} />
          <StatCard size="compact" label="Media đã tải" value={stats.media} />
          <StatCard size="compact" label="Link Shopee" value={stats.shopee} />
          <StatCard size="compact" label="Account" value={stats.accounts} />
        </StatStrip>
      )}
    </div>
  )
}
