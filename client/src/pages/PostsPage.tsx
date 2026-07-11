import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Download,
  FileDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Inbox,
  RefreshCw,
  Copy,
  Trash2,
  Wand2,
  AlertTriangle,
} from 'lucide-react'
import {
  fetchPosts,
  fetchPost,
  deletePosts,
  fetchExportPostsWarnings,
  exportPostsUrl,
  exportShopeeUrl,
  type PostListItem,
} from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { RescrapeDialog } from '@/components/RescrapeDialog'
import { BeautifyDialog } from '@/components/BeautifyDialog'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20
const COLSPAN = 6

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          active ? 'bg-primary-foreground' : 'bg-muted-foreground/40',
        )}
      />
      {children}
    </button>
  )
}

function UpdateStatus({ shopee, updated }: { shopee: number; updated: number }) {
  if (shopee === 0) return <span className="text-muted-foreground">—</span>
  if (updated >= shopee)
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        Đã update
      </span>
    )
  if (updated > 0)
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
        {updated}/{shopee}
      </span>
    )
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Chưa
    </span>
  )
}

export function PostsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [noShopee, setNoShopee] = useState(false)
  const [notUpdated, setNotUpdated] = useState(false)
  const [oneShopee, setOneShopee] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [rescrapeIds, setRescrapeIds] = useState<string[] | null>(null)
  const [beautifyIds, setBeautifyIds] = useState<string[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [exportWarn, setExportWarn] = useState<{ notUpdated: number; multiComment: number } | null>(
    null,
  )
  const [checkingExport, setCheckingExport] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['posts', search, page, noShopee, notUpdated, oneShopee],
    queryFn: () =>
      fetchPosts({
        search,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        noShopee,
        notUpdated,
        oneShopee,
      }),
    placeholderData: keepPreviousData,
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
  const filterActive = noShopee || notUpdated || oneShopee

  const allChecked = items.length > 0 && items.every((i) => sel.has(i.post_id))
  const someChecked = items.some((i) => sel.has(i.post_id)) && !allChecked

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['posts'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
    qc.invalidateQueries({ queryKey: ['post'] })
  }

  const toggle = (id: string) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSel((prev) => {
      const next = new Set(prev)
      if (allChecked) items.forEach((i) => next.delete(i.post_id))
      else items.forEach((i) => next.add(i.post_id))
      return next
    })
  }

  const doDelete = async () => {
    const ids = [...sel]
    if (ids.length === 0) return
    if (!confirm(`Xoá ${ids.length} bài (kèm media đã tải)?`)) return
    await deletePosts(ids)
    setSel(new Set())
    invalidateAll()
    toast.success(`Đã xoá ${ids.length} bài`)
  }

  const resetPage = () => setPage(0)
  const clearFilters = () => {
    setNoShopee(false)
    setNotUpdated(false)
    setOneShopee(false)
    resetPage()
  }

  const doExportPosts = () => {
    window.location.href = exportPostsUrl
  }

  const onExportPostsClick = async () => {
    setCheckingExport(true)
    try {
      const w = await fetchExportPostsWarnings()
      if (w.notUpdated > 0 || w.multiComment > 0) {
        setExportWarn(w)
      } else {
        doExportPosts()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không kiểm tra được dữ liệu trước khi xuất')
    } finally {
      setCheckingExport(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bài viết</h1>
          <p className="text-sm text-muted-foreground">{total} bài</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={exportShopeeUrl} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <FileDown className="h-4 w-4" /> Shopee input
          </a>
          <Button size="sm" onClick={onExportPostsClick} disabled={checkingExport}>
            <Download className="h-4 w-4" /> posts.xlsx
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm caption / user / post id..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPage()
            }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Lọc</span>
          <FilterChip
            active={noShopee}
            onClick={() => {
              setNoShopee((v) => !v)
              resetPage()
            }}
          >
            Chưa có link shopee
          </FilterChip>
          <FilterChip
            active={notUpdated}
            onClick={() => {
              setNotUpdated((v) => !v)
              resetPage()
            }}
          >
            Chưa cập nhật link mới
          </FilterChip>
          <FilterChip
            active={oneShopee}
            onClick={() => {
              setOneShopee((v) => !v)
              resetPage()
            }}
          >
            Đúng 1 cmt shopee
          </FilterChip>
          {filterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onCheckedChange={toggleAll}
                    />
                    Bài viết
                  </div>
                </th>
                <th className="p-2.5 text-left font-medium">Ngày</th>
                <th className="p-2.5 text-left font-medium">Comment</th>
                <th className="p-2.5 text-right font-medium">Tim</th>
                <th className="p-2.5 text-center font-medium">Shopee</th>
                <th className="p-2.5 text-center font-medium">Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p: PostListItem) => (
                <tr
                  key={p.post_id}
                  onClick={() => setDetailId(p.post_id)}
                  className={cn(
                    'cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50',
                    sel.has(p.post_id) && 'bg-primary/5',
                  )}
                >
                  <td className="p-2.5">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        checked={sel.has(p.post_id)}
                        onCheckedChange={() => toggle(p.post_id)}
                      />
                      {p.thumb ? (
                        <img
                          src={`/media/${p.thumb}`}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded-md bg-muted" />
                      )}
                      <div className="min-w-0 max-w-[16rem]">
                        <div className="font-medium">@{p.username || '—'}</div>
                        <div className="truncate text-xs text-muted-foreground">{p.caption}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-2.5 text-xs text-muted-foreground">
                    {p.post_date || '—'}
                  </td>
                  <td className="max-w-[16rem] p-2.5">
                    <span
                      className={cn(
                        'mb-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                        p.shopee_count > 1
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground',
                      )}
                      title="Số link shopee đã lưu (khớp với Detail)"
                    >
                      <MessageCircle className="h-3 w-3" />
                      {p.shopee_count} cmt shopee
                    </span>
                    <div className="truncate text-xs text-muted-foreground">{p.comment || '—'}</div>
                  </td>
                  <td className="whitespace-nowrap p-2.5 text-right text-xs tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {p.likes || '0'}
                    </span>
                  </td>
                  <td className="p-2.5 text-center tabular-nums font-medium">{p.shopee_count}</td>
                  <td className="p-2.5 text-center">
                    <UpdateStatus shopee={p.shopee_count} updated={p.new_count} />
                  </td>
                </tr>
              ))}

              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2.5">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-9 w-9 rounded-md" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5"><Skeleton className="h-3 w-14" /></td>
                    <td className="p-2.5"><Skeleton className="h-3 w-32" /></td>
                    <td className="p-2.5"><Skeleton className="ml-auto h-3 w-16" /></td>
                    <td className="p-2.5"><Skeleton className="mx-auto h-3 w-6" /></td>
                    <td className="p-2.5"><Skeleton className="mx-auto h-5 w-14 rounded-full" /></td>
                  </tr>
                ))}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={COLSPAN} className="p-0">
                    <EmptyState
                      icon={Inbox}
                      title={isError ? 'Lỗi tải dữ liệu' : 'Không có bài nào'}
                      description={
                        isError
                          ? 'Kiểm tra server đang chạy ở :3000.'
                          : filterActive
                            ? 'Không có bài khớp bộ lọc.'
                            : 'Sang tab Thu thập để tải bài về.'
                      }
                      action={
                        !isError &&
                        !filterActive && (
                          <Link to="/batch" className={cn(buttonVariants({ size: 'sm' }))}>
                            Đi tới Thu thập
                          </Link>
                        )
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Trang {page + 1}/{maxPage + 1}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= maxPage}
            onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          >
            Sau <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Thanh action noi khi co chon */}
      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-3 py-2 shadow-lg">
          <span className="px-2 text-sm font-medium">{sel.size} đã chọn</span>
          <Button size="sm" variant="outline" onClick={() => setRescrapeIds([...sel])}>
            <RefreshCw className="h-4 w-4" /> Lấy lại comment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBeautifyIds([...sel])}>
            <Wand2 className="h-4 w-4" /> Làm đẹp video
          </Button>
          <Button size="sm" variant="outline" onClick={doDelete}>
            <Trash2 className="h-4 w-4 text-destructive" /> Xóa
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      <Sheet open={!!detailId} onClose={() => setDetailId(null)} className="max-w-3xl">
        {detailId && <PostDetail id={detailId} onRescrape={(ids) => setRescrapeIds(ids)} />}
      </Sheet>

      <RescrapeDialog
        open={!!rescrapeIds}
        postIds={rescrapeIds ?? []}
        onClose={() => {
          setRescrapeIds(null)
          invalidateAll()
        }}
        onDone={invalidateAll}
      />

      <BeautifyDialog
        open={!!beautifyIds}
        postIds={beautifyIds ?? []}
        onClose={() => {
          setBeautifyIds(null)
          invalidateAll()
        }}
        onDone={invalidateAll}
      />

      <Dialog open={!!exportWarn} onClose={() => setExportWarn(null)} className="max-w-md">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold">Dữ liệu chưa hoàn thiện</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {(exportWarn?.notUpdated ?? 0) > 0 && (
                <li>
                  <strong className="text-foreground">{exportWarn?.notUpdated}</strong> bài chưa cập
                  nhật link mới (còn link Shopee gốc).
                </li>
              )}
              {(exportWarn?.multiComment ?? 0) > 0 && (
                <li>
                  <strong className="text-foreground">{exportWarn?.multiComment}</strong> bài có nhiều
                  hơn 1 comment Shopee — file chỉ xuất comment sớm nhất, có thể sót link ở các comment
                  còn lại.
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setExportWarn(null)}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              setExportWarn(null)
              doExportPosts()
            }}
          >
            Vẫn xuất file
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function PostDetail({ id, onRescrape }: { id: string; onRescrape: (ids: string[]) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['post', id], queryFn: () => fetchPost(id) })

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải...</p>
  if (!data) return <p className="text-sm text-destructive">Không tìm thấy.</p>

  const caption = String(data.post.caption ?? '')
  const url = String(data.post.url ?? '')

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(
      () => toast.success('Đã copy URL'),
      () => toast.error('Không copy được'),
    )
  }

  return (
    <div className="space-y-5 pr-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">@{String(data.post.username ?? '')}</h2>
          <p className="text-xs text-muted-foreground">
            {String(data.post.post_date ?? '')} · {String(data.post.likes ?? '')} tim ·{' '}
            {String(data.post.comments ?? '')} cmt
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyUrl}>
            <Copy className="h-4 w-4" /> Copy URL
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRescrape([id])}>
            <RefreshCw className="h-4 w-4" /> Lấy lại comment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {data.media.map((m) =>
          m.type === 'video' ? (
            <div key={m.file} className="space-y-1.5">
              <video src={m.url} controls className="w-full rounded-lg" />
              {m.processedUrl && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Bản đã làm đẹp</div>
                  <video src={m.processedUrl} controls className="w-full rounded-lg ring-1 ring-primary/40" />
                  <a
                    href={m.processedUrl}
                    download
                    className="inline-block text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Tải bản đã làm đẹp
                  </a>
                </div>
              )}
            </div>
          ) : (
            <img key={m.file} src={m.url} alt="" className="w-full rounded-lg" />
          ),
        )}
      </div>

      <div>
        <div className="mb-1 text-sm font-medium">Caption</div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{caption}</p>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Link Shopee ({data.shopee.length})</div>
        <ul className="space-y-2 text-sm">
          {data.shopee.map((s, i) => (
            <li key={i} className="rounded-lg border p-3">
              <div className="mb-1 text-muted-foreground">{s.comment}</div>
              <a
                href={s.link}
                target="_blank"
                rel="noreferrer"
                className="break-all text-primary underline"
              >
                {s.link}
              </a>
              {s.new_link && (
                <div className="mt-1 break-all text-xs text-green-600 dark:text-green-400">
                  → {s.new_link}
                </div>
              )}
            </li>
          ))}
          {data.shopee.length === 0 && <li className="text-muted-foreground">Không có.</li>}
        </ul>
      </div>
    </div>
  )
}
