import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, Image, ShoppingBag, Users } from 'lucide-react'
import { fetchStats, fetchPosts } from '@/lib/api'
import { StatCard } from '@/components/StatCard'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function OverviewPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: fetchStats })
  const { data: recent } = useQuery({
    queryKey: ['posts', 'recent'],
    queryFn: () => fetchPosts({ limit: 5, offset: 0 }),
  })

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">Thống kê nhanh toàn bộ dữ liệu đã thu thập</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading || !stats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Bài viết" value={stats.posts} icon={FileText} />
            <StatCard label="Media đã tải" value={stats.media} icon={Image} />
            <StatCard label="Link Shopee" value={stats.shopee} icon={ShoppingBag} />
            <StatCard label="Account" value={stats.accounts} icon={Users} />
          </>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bài gần đây</h2>
          <Link to="/posts" className="text-sm text-primary hover:underline">
            Xem tất cả →
          </Link>
        </div>
        <Card className="divide-y">
          {(recent?.items ?? []).map((p) => (
            <Link
              key={p.post_id}
              to="/posts"
              className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50"
            >
              {p.thumb ? (
                <img src={`/media/${p.thumb}`} alt="" className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-md bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">@{p.username || '—'}</div>
                <div className="truncate text-sm text-muted-foreground">{p.caption}</div>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">{p.post_date}</div>
            </Link>
          ))}
          {recent && recent.items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Chưa có bài nào.</div>
          )}
        </Card>
      </div>
    </div>
  )
}
