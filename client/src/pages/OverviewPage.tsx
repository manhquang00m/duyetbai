import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Inbox } from 'lucide-react'
import { fetchStats, fetchPosts, fetchAccounts, type Account } from '@/lib/api'
import { StatCard, StatStrip } from '@/components/StatCard'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ShadowbanBadge } from '@/components/ShadowbanBadge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const ATTENTION_ROWS = 5

/** Ly do 1 account can xu ly, theo thu tu nang -> nhe. null = binh thuong. */
function attentionReason(a: Account): string | null {
  if (!a.active || a.banned) return null
  if (a.shadowban_verdict === 'shadowban') return 'Nghi shadowban'
  if (a.proxy_status === 'die') return 'Proxy die'
  if (a.shadowban_verdict === 'suspect') return 'Nghi ngờ shadowban'
  if (!a.proxy) return 'Chưa có proxy'
  return null
}

const REASON_RANK: Record<string, number> = {
  'Nghi shadowban': 0,
  'Proxy die': 1,
  'Nghi ngờ shadowban': 2,
  'Chưa có proxy': 3,
}

export function OverviewPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const { data: recent } = useQuery({
    queryKey: ['posts', 'recent'],
    queryFn: () => fetchPosts({ limit: 5, offset: 0 }),
  })

  const running = (accounts ?? []).filter((a) => a.active && !a.banned)
  const attention = running
    .map((a) => ({ account: a, reason: attentionReason(a) }))
    .filter((x): x is { account: Account; reason: string } => x.reason !== null)
    .sort((x, y) => REASON_RANK[x.reason] - REASON_RANK[y.reason])

  const finding = !accounts
    ? 'Đang tải trạng thái account…'
    : attention.length === 0
      ? `${running.length} account đang chạy, không account nào cần xử lý.`
      : `${attention.length} trong ${running.length} account đang chạy cần xử lý.`

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Tổng quan" description={finding} />

      {isLoading || !stats ? (
        <Skeleton className="h-[86px] rounded-lg" />
      ) : (
        <StatStrip className="grid-cols-2 lg:grid-cols-4">
          <StatCard label="Bài viết" value={stats.posts} />
          <StatCard label="Media đã tải" value={stats.media} />
          <StatCard label="Link Shopee" value={stats.shopee} />
          <StatCard label="Account" value={stats.accounts} />
        </StatStrip>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">Account cần xử lý</h2>
            <Link
              to="/accounts"
              className="inline-flex min-h-10 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
            >
              Mở Accounts <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <Card className="overflow-hidden">
            {!accounts &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex h-12 items-center justify-between border-b border-rule px-4 last:border-0">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            {attention.slice(0, ATTENTION_ROWS).map(({ account: a, reason }) => (
              <div
                key={a.id}
                className="flex h-12 items-center justify-between gap-3 border-b border-rule px-4 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                </div>
                {reason.includes('shadowban') ? (
                  <ShadowbanBadge verdict={a.shadowban_verdict} />
                ) : (
                  <span
                    className={
                      reason === 'Proxy die'
                        ? 'shrink-0 whitespace-nowrap rounded-full bg-pill-negative px-2 py-0.5 text-[11px] font-medium text-pill-negative-ink'
                        : 'shrink-0 whitespace-nowrap text-xs text-muted-foreground'
                    }
                  >
                    {reason}
                  </span>
                )}
              </div>
            ))}
            {accounts && attention.length > ATTENTION_ROWS && (
              <Link
                to="/accounts"
                className="flex h-10 items-center px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Xem thêm {attention.length - ATTENTION_ROWS} account
              </Link>
            )}
            {accounts && attention.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Không có account nào bị proxy die hay nghi shadowban.
              </p>
            )}
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">Bài gần đây</h2>
            <Link
              to="/posts"
              className="inline-flex min-h-10 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground sm:min-h-0"
            >
              Xem tất cả <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <Card className="overflow-hidden">
            {!recent &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-rule px-4 py-3 last:border-0">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            {(recent?.items ?? []).map((p) => (
              <Link
                key={p.post_id}
                to="/posts"
                className="flex items-center gap-3 border-b border-rule px-4 py-3 transition-colors last:border-0 hover:bg-accent"
              >
                {p.thumb ? (
                  <img src={`/media/${p.thumb}`} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">@{p.username || '—'}</div>
                  <div className="truncate text-sm text-muted-foreground">{p.caption}</div>
                </div>
                <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.post_date}</div>
              </Link>
            ))}
            {recent && recent.items.length === 0 && (
              <EmptyState icon={Inbox} title="Chưa có bài nào" description="Sang tab Thu thập để tải bài về." />
            )}
          </Card>
        </section>
      </div>
    </div>
  )
}
