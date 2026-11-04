import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2 } from 'lucide-react'
import { fetchShadowbanHistory, type ShadowbanCheck, type ViewSnapshot } from '@/lib/api'
import { Sheet } from '@/components/ui/sheet'
import { ShadowbanBadge } from '@/components/ShadowbanBadge'
import { cn } from '@/lib/utils'

interface Props {
  account: string | null
  onClose: () => void
}

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—')
const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'

function parseDetails(c: ShadowbanCheck): { reasons: string[]; errors: string[] } {
  try {
    const d = JSON.parse(c.details ?? 'null') as { reasons?: string[]; errors?: string[] } | null
    return { reasons: d?.reasons ?? [], errors: d?.errors ?? [] }
  } catch {
    return { reasons: [], errors: [] }
  }
}

const flag = (v: number | null) => (v === null ? 'Không check' : v ? 'Có' : 'Không')

/** View tung bai (snapshot moi nhat), xep theo thoi gian dang - 1 series nen khong can legend. */
function ViewsChart({ posts }: { posts: ViewSnapshot[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...posts.map((p) => p.views ?? 0))
  const active = hover !== null ? posts[hover] : null
  return (
    <div>
      <div className="mb-1 flex h-5 items-baseline justify-between text-xs text-muted-foreground">
        <span>View từng bài theo ngày đăng (max {max.toLocaleString('vi-VN')})</span>
        {active && (
          <span className="tabular-nums text-foreground">
            {fmtTime(active.posted_at)} · {(active.views ?? 0).toLocaleString('vi-VN')} view
          </span>
        )}
      </div>
      <div className="flex h-32 items-end gap-0.5 border-b border-border" onMouseLeave={() => setHover(null)}>
        {posts.map((p, i) => (
          // Vung hover cao het khung (lon hon cot) de de tro trung cot thap.
          <div
            key={p.post_code}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
          >
            <div
              className={cn('w-full rounded-t-sm bg-chart-1 transition-opacity', hover !== null && hover !== i && 'opacity-50')}
              style={{ height: `${Math.max(2, ((p.views ?? 0) / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{fmtDay(posts[0]?.posted_at ?? null)}</span>
        <span>{fmtDay(posts[posts.length - 1]?.posted_at ?? null)}</span>
      </div>
    </div>
  )
}

export function ShadowbanHistorySheet({ account, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['shadowban-history', account],
    queryFn: () => fetchShadowbanHistory(account!),
    enabled: !!account,
  })

  // Snapshot moi nhat cua tung bai, cu -> moi theo ngay dang.
  const posts = useMemo(() => {
    const byCode = new Map<string, ViewSnapshot>()
    for (const v of data?.views ?? []) byCode.set(v.post_code, v) // server tra theo checked_at tang dan
    return [...byCode.values()].sort((a, b) => (a.posted_at ?? '').localeCompare(b.posted_at ?? ''))
  }, [data])

  const latest = data?.checks[0]
  const details = latest ? parseDetails(latest) : null

  return (
    <Sheet open={!!account} onClose={onClose}>
      <h2 className="pr-8 text-lg font-medium">Shadowban · {account}</h2>
      {isLoading && <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-muted-foreground" />}

      {!isLoading && !latest && (
        <p className="mt-4 text-sm text-muted-foreground">Nick này chưa được check lần nào.</p>
      )}

      {latest && details && (
        <div className="mt-4 space-y-5">
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <ShadowbanBadge verdict={latest.verdict} />
              <span className="text-xs text-muted-foreground">{fmtTime(latest.checked_at)}</span>
            </div>
            {details.reasons.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {details.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Median view gần đây</dt>
              <dd className="tabular-nums">{latest.recent_median ?? '—'}</dd>
              <dt className="text-muted-foreground">Median bài cũ hơn</dt>
              <dd className="tabular-nums">{latest.baseline_median ?? '—'}</dd>
              <dt className="text-muted-foreground">Profile hiện (không đăng nhập)</dt>
              <dd>{flag(latest.profile_visible)}</dd>
              <dt className="text-muted-foreground">Hiện trong search</dt>
              <dd>{flag(latest.search_visible)}</dd>
              <dt className="text-muted-foreground">Bài hiện / đã đăng (72h)</dt>
              <dd className="tabular-nums">
                {latest.expected_posts === null ? '—' : `${latest.found_posts}/${latest.expected_posts}`}
              </dd>
            </dl>
            {details.errors.length > 0 && (
              <p className="text-xs text-destructive">{details.errors.join(' · ')}</p>
            )}
          </div>

          {posts.length > 0 && <ViewsChart posts={posts} />}

          {posts.length > 0 && (
            <div className="table-scroll max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Ngày đăng</th>
                    <th className="p-2 text-right">View</th>
                    <th className="p-2 text-right">Like</th>
                    <th className="p-2 text-right">Reply</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {[...posts].reverse().map((p) => (
                    <tr key={p.post_code} className="border-b last:border-0">
                      <td className="p-2 text-xs tabular-nums">{fmtTime(p.posted_at)}</td>
                      <td className="p-2 text-right tabular-nums">{p.views ?? '—'}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{p.likes ?? '—'}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{p.replies ?? '—'}</td>
                      <td className="p-2 text-right">
                        <a href={p.post_url} target="_blank" rel="noreferrer" title="Mở bài">
                          <ExternalLink className="inline h-3.5 w-3.5 text-muted-foreground" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data!.checks.length > 1 && (
            <div>
              <h3 className="mb-1 text-sm font-medium">Các lần check trước</h3>
              <ul className="space-y-1 text-xs">
                {data!.checks.slice(1).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{fmtTime(c.checked_at)}</span>
                    <span className="tabular-nums text-muted-foreground">median {c.recent_median ?? '—'}</span>
                    <ShadowbanBadge verdict={c.verdict} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
