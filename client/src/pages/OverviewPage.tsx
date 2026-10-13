import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, FileText, Image, Inbox, ShoppingBag, Users } from 'lucide-react'
import { fetchStats, fetchPosts } from '@/lib/api'
import { StatCard } from '@/components/StatCard'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function OverviewPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const { data: recent } = useQuery({
    queryKey: ['posts', 'recent'],
    queryFn: () => fetchPosts({ limit: 5, offset: 0 }),
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader title="Tổng quan" description="Thống kê nhanh toàn bộ dữ liệu đã thu thập" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {isLoading || !stats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl sm:h-28" />)
        ) : (
          <>
            <StatCard label="Bài viết" value={stats.posts} icon={FileText} />
            <StatCard label="Media đã tải" value={stats.media} icon={Image} />
            <StatCard label="Link Shopee" value={stats.shopee} icon={ShoppingBag} />
            <StatCard label="Account" value={stats.accounts} icon={Users} />
          </>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold sm:text-lg">Bài gần đây</h2>
          <Link
            to="/posts"
            className="inline-flex min-h-10 items-center gap-0.5 text-sm text-primary hover:underline sm:min-h-0"
          >
            Xem tất cả <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <Card className="divide-y overflow-hidden rounded-xl shadow-sm">
          {!recent &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
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
              className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
            >
              {p.thumb ? (
                <img
                  src={`/media/${p.thumb}`}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-border"
                />
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
  )
}
