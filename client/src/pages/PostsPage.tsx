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
  MessageCircle,
  Inbox,
  RefreshCw,
  Copy,
  Trash2,
  Wand2,
  AlertTriangle,
  Send,
  Tag,
  Heart,
  MousePointerClick,
} from 'lucide-react'
import {
  fetchPosts,
  fetchPost,
  deletePosts,
  setPostTopic,
  fetchExportPostsWarnings,
  buildExportPostsUrl,
  fetchCaptionVariants,
  ACCOUNT_TOPICS,
  UNASSIGNED_TOPIC,
  type ExportPostsWarnings,
  exportShopeeUrl,
  type LinkStatusFilter,
  type PostListItem,
  type PostSort,
  type MediaFilter,
} from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { RescrapeDialog } from '@/components/RescrapeDialog'
import { AssignTopicDialog } from '@/components/AssignTopicDialog'
import { PostTopicCell } from '@/components/PostTopicCell'
import { BulkTopicButton } from '@/components/BulkTopicButton'
import { MultiFilterDropdown, SingleFilterDropdown, TopicFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const
const COLSPAN = 9

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

/** So ban caption AI da viet lai cho bai (xem trang "Phân phối bài" > "Viết lại caption kho bài"). */
function RewriteStatus({ count }: { count: number }) {
  if (count >= 3)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        <Wand2 className="h-3 w-3" /> Đã viết lại
      </span>
    )
  if (count > 0)
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
        {count}/3
      </span>
    )
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Chưa
    </span>
  )
}

/**
 * Nhan suc khoe link Shopee cua 1 BAI (tong hop tu tung link trong bai).
 * Uu tien hien cai nghiem trong nhat: link chet > het hang > can xem lai > on.
 */
function LinkHealthBadge({ post }: { post: PostListItem }) {
  const { shopee_count, dead_link_count, oos_link_count, unknown_link_count, checked_link_count } =
    post
  if (shopee_count === 0) return <span className="text-muted-foreground">—</span>
  if (checked_link_count === 0)
    return (
      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Chưa KT
      </span>
    )

  const title = [
    dead_link_count > 0 && `${dead_link_count} link chết`,
    oos_link_count > 0 && `${oos_link_count} link hết hàng`,
    unknown_link_count > 0 && `${unknown_link_count} link chưa xác định được`,
    `đã kiểm tra ${checked_link_count}/${shopee_count} link`,
  ]
    .filter(Boolean)
    .join(' · ')

  const pill = (cls: string, text: string) => (
    <span
      className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', cls)}
      title={title}
    >
      {text}
    </span>
  )

  if (dead_link_count > 0)
    return pill(
      'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
      dead_link_count > 1 ? `Link chết (${dead_link_count})` : 'Link chết',
    )
  if (oos_link_count > 0)
    return pill(
      'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
      oos_link_count > 1 ? `Hết hàng (${oos_link_count})` : 'Hết hàng',
    )
  if (unknown_link_count > 0)
    return pill(
      'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
      'Cần xem lại',
    )
  return pill('bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', 'Link OK')
}

function PostStatusBadge({ status }: { status: PostListItem['post_status'] }) {
  if (status === 'posted')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        <Send className="h-3 w-3" /> Đã đăng
      </span>
    )
  if (status === 'exported')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
        Đã xuất
      </span>
    )
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Mới
    </span>
  )
}

function PostThumb({ thumb, className }: { thumb: string | null; className: string }) {
  return thumb ? (
    <img
      src={`/media/${thumb}`}
      alt=""
      loading="lazy"
      className={cn('shrink-0 rounded-md object-cover ring-1 ring-border', className)}
    />
  ) : (
    <div className={cn('shrink-0 rounded-md bg-muted', className)} />
  )
}

function CommentChip({ count }: { count: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        count > 1
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
          : 'bg-muted text-muted-foreground',
      )}
      title="Số comment khác nhau có link shopee (1 comment nhiều link vẫn tính là 1)"
    >
      <MessageCircle className="h-3 w-3" />
      {count} cmt shopee
    </span>
  )
}

function LabeledBadge({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      {label}
      {children}
    </span>
  )
}

interface PostItemProps {
  post: PostListItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onTopicChange: (topic: string | null) => Promise<void>
}

const formatScraped = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '—'

function LikesChip({ likes }: { likes: string | null }) {
  const v = likes?.trim()
  if (!v) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums text-rose-500"
      title={`${v} tim`}
    >
      <Heart className="h-3 w-3 fill-current" />
      {v}
    </span>
  )
}

function PostStats({ post: p }: { post: PostListItem }) {
  const muted = 'text-muted-foreground/60'
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
      <LikesChip likes={p.likes} />
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums text-sky-600 dark:text-sky-400',
          p.click_count === 0 && muted,
        )}
        title={`${p.click_count} click`}
      >
        <MousePointerClick className="h-3 w-3" />
        {p.click_count}
      </span>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400',
          p.posted_count === 0 && muted,
        )}
        title={`Đã đăng thành công ${p.posted_count} lần`}
      >
        <Send className="h-3 w-3" />
        {p.posted_count}
      </span>
    </div>
  )
}

/** Dong bang (>= lg). */
function PostRow({ post: p, selected, onToggle, onOpen, onTopicChange }: PostItemProps) {
  return (
    <tr
      onClick={onOpen}
      className={cn(
        'cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50',
        selected && 'bg-primary/5',
      )}
    >
      <td className="p-2.5">
        <div className="flex items-center gap-2.5">
          <Checkbox checked={selected} onCheckedChange={onToggle} />
          <PostThumb thumb={p.thumb} className="h-9 w-9" />
          <div className="min-w-0 max-w-[16rem]">
            <div className="truncate font-medium">@{p.username || '—'}</div>
            <div className="truncate text-xs text-muted-foreground">{p.caption}</div>
            <PostStats post={p} />
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap p-2.5 text-xs tabular-nums text-muted-foreground">
        {p.post_date || '—'}
      </td>
      <td className="whitespace-nowrap p-2.5 text-xs tabular-nums text-muted-foreground">
        {formatScraped(p.scraped_at)}
      </td>
      <td className="max-w-[16rem] p-2.5">
        <div className="mb-1">
          <CommentChip count={p.distinct_comment_count} />
        </div>
        <div className="truncate text-xs text-muted-foreground">{p.comment || '—'}</div>
      </td>
      <td className="p-2.5 text-center">
        <RewriteStatus count={p.variant_count} />
      </td>
      <td className="p-2.5 text-center">
        <UpdateStatus shopee={p.shopee_count} updated={p.new_count} />
      </td>
      <td className="p-2.5 text-center">
        <LinkHealthBadge post={p} />
      </td>
      <td className="max-w-[10rem] p-2.5 text-xs">
        <PostTopicCell topic={p.topic} onChange={onTopicChange} />
      </td>
      <td className="p-2.5 text-center">
        <div className="flex flex-col items-center gap-1">
          <PostStatusBadge status={p.post_status} />
          {p.assigned_account && (
            <span className="text-[11px] text-muted-foreground">@{p.assigned_account}</span>
          )}
        </div>
      </td>
    </tr>
  )
}

/** The bai viet tren mobile/tablet (< lg): cung du lieu + handler voi PostRow. */
function PostCard({ post: p, selected, onToggle, onOpen, onTopicChange }: PostItemProps) {
  return (
    <div
      onClick={onOpen}
      className={cn(
        'flex cursor-pointer gap-3 p-3 transition-colors active:bg-muted/60',
        selected && 'bg-primary/5',
      )}
    >
      <div className="pt-1">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>
      <PostThumb thumb={p.thumb} className="h-12 w-12" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">@{p.username || '—'}</div>
            <div className="text-[11px] tabular-nums text-muted-foreground">
              {p.post_date || '—'} · thu thập {formatScraped(p.scraped_at)}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <PostStatusBadge status={p.post_status} />
            {p.assigned_account && (
              <span className="max-w-[7rem] truncate text-[11px] text-muted-foreground">
                @{p.assigned_account}
              </span>
            )}
          </div>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{p.caption}</p>
        <PostStats post={p} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <CommentChip count={p.distinct_comment_count} />
          <LabeledBadge label="Viết lại">
            <RewriteStatus count={p.variant_count} />
          </LabeledBadge>
          <LabeledBadge label="Cập nhật">
            <UpdateStatus shopee={p.shopee_count} updated={p.new_count} />
          </LabeledBadge>
          <LabeledBadge label="Link">
            <LinkHealthBadge post={p} />
          </LabeledBadge>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Tag className="h-3 w-3 shrink-0" />
          <PostTopicCell topic={p.topic} onChange={onTopicChange} />
        </div>
      </div>
    </div>
  )
}

export function PostsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0])
  const [noShopee, setNoShopee] = useState(false)
  const [notUpdated, setNotUpdated] = useState(false)
  const [oneShopee, setOneShopee] = useState(false)
  const [postStatus, setPostStatus] = useState<'unposted' | 'posted' | undefined>(undefined)
  const [mediaFilter, setMediaFilter] = useState<MediaFilter | undefined>(undefined)
  const [linkStatus, setLinkStatus] = useState<LinkStatusFilter | undefined>(undefined)
  const [rewritten, setRewritten] = useState<'yes' | 'no' | undefined>(undefined)
  const [scrapedFrom, setScrapedFrom] = useState('')
  const [scrapedTo, setScrapedTo] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [sort, setSort] = useState<PostSort>('newest')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [rescrapeIds, setRescrapeIds] = useState<string[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [exportWarn, setExportWarn] = useState<ExportPostsWarnings | null>(null)
  const [checkingExport, setCheckingExport] = useState(false)
  const [topicDialogOpen, setTopicDialogOpen] = useState(false)

  const activeFilters = {
    search,
    noShopee,
    notUpdated,
    oneShopee,
    postStatus,
    mediaFilter,
    linkStatus,
    rewritten,
    scrapedFrom,
    scrapedTo,
    topics,
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'posts',
      search,
      page,
      pageSize,
      noShopee,
      notUpdated,
      oneShopee,
      postStatus,
      mediaFilter,
      linkStatus,
      rewritten,
      scrapedFrom,
      scrapedTo,
      topics,
      sort,
    ],
    queryFn: () =>
      fetchPosts({
        search,
        limit: pageSize,
        offset: page * pageSize,
        noShopee,
        notUpdated,
        oneShopee,
        postStatus,
        mediaFilter,
        linkStatus,
        rewritten,
        scrapedFrom: scrapedFrom || undefined,
        scrapedTo: scrapedTo || undefined,
        topics,
        sort,
      }),
    placeholderData: keepPreviousData,
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  const activeFilterCount = [
    noShopee,
    notUpdated,
    oneShopee,
    !!postStatus,
    !!mediaFilter,
    !!linkStatus,
    !!rewritten,
    !!scrapedFrom || !!scrapedTo,
    topics.length > 0,
  ].filter(Boolean).length
  const filterActive = activeFilterCount > 0

  const allChecked = items.length > 0 && items.every((i) => sel.has(i.post_id))
  const someChecked = items.some((i) => sel.has(i.post_id)) && !allChecked

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['posts'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
    qc.invalidateQueries({ queryKey: ['post'] })
    // Xoá bài / lấy lại comment / kiểm tra link Shopee đều có thể đổi kho "bài sạch" (Phân phối
    // bài) và số bài chưa viết lại caption - cac trang do dung query rieng, lam moi luon o day.
    qc.invalidateQueries({ queryKey: ['dist-pool'] })
    qc.invalidateQueries({ queryKey: ['caption-variant-status'] })
    qc.invalidateQueries({ queryKey: ['account-topics'] })
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
    setPostStatus(undefined)
    setMediaFilter(undefined)
    setLinkStatus(undefined)
    setRewritten(undefined)
    setScrapedFrom('')
    setScrapedTo('')
    setTopics([])
    resetPage()
  }

  const toggleTopic = (topic: string) => {
    setTopics((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]))
    resetPage()
  }

  const changeTopic = async (postId: string, topic: string | null) => {
    await setPostTopic(postId, topic)
    invalidateAll()
  }

  const doExportPosts = () => {
    window.location.href = buildExportPostsUrl(activeFilters)
  }

  const onExportPostsClick = async () => {
    setCheckingExport(true)
    try {
      const w = await fetchExportPostsWarnings(activeFilters)
      if (w.notUpdated > 0 || w.multiComment > 0 || w.badLink > 0 || w.unknownLink > 0) {
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

  const emptyState = (
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
        (filterActive ? (
          <Button size="sm" variant="outline" onClick={clearFilters}>
            Xóa bộ lọc
          </Button>
        ) : (
          <Link to="/batch" className={cn(buttonVariants({ size: 'sm' }))}>
            Đi tới Thu thập
          </Link>
        ))
      }
    />
  )

  return (
    <div className="mx-auto max-w-8xl space-y-4 pb-20">
      <PageHeader
        title="Bài viết"
        description={
          <>
            <span className="tabular-nums">{total} bài</span>
            <span className="mt-0.5 block text-xs">
              {filterActive ? (
                <>
                  Sẽ xuất <strong className="tabular-nums text-foreground">{total}</strong> bài theo bộ lọc hiện tại
                </>
              ) : (
                <>
                  Sẽ xuất toàn bộ <strong className="tabular-nums text-foreground">{total}</strong> bài (chưa lọc)
                </>
              )}
            </span>
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setTopicDialogOpen(true)}>
              <Tag className="h-4 w-4" /> Gán chủ đề
            </Button>
            <a href={exportShopeeUrl} className={cn(buttonVariants({ variant: 'outline' }))}>
              <FileDown className="h-4 w-4" /> Shopee input
            </a>
            <Button onClick={onExportPostsClick} disabled={checkingExport}>
              <Download className="h-4 w-4" /> posts.xlsx
            </Button>
          </>
        }
      />

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
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
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <span className="shrink-0 text-xs text-muted-foreground">Thu thập</span>
          <Input
            type="date"
            aria-label="Thu thập từ ngày"
            value={scrapedFrom}
            onChange={(e) => {
              setScrapedFrom(e.target.value)
              resetPage()
            }}
            className="min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            aria-label="Thu thập đến ngày"
            value={scrapedTo}
            onChange={(e) => {
              setScrapedTo(e.target.value)
              resetPage()
            }}
            className="min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <SingleFilterDropdown
          label="Sắp xếp"
          activeWhen="newest"
          value={sort}
          onChange={(v) => {
            setSort(v)
            resetPage()
          }}
          options={[
            { value: 'newest', label: 'Mới thu thập' },
            { value: 'likes', label: 'Nhiều tim nhất' },
            { value: 'clicks', label: 'Nhiều click nhất' },
            { value: 'posted', label: 'Đăng nhiều nhất' },
          ]}
        />
        <MultiFilterDropdown
          activeCount={activeFilterCount}
          onClearAll={() => {
            clearFilters()
          }}
          groups={[
            {
              type: 'checkbox',
              key: 'noShopee',
              label: 'Chưa có link shopee',
              checked: noShopee,
              onToggle: () => {
                setNoShopee((v) => !v)
                resetPage()
              },
            },
            {
              type: 'checkbox',
              key: 'notUpdated',
              label: 'Chưa cập nhật link mới',
              checked: notUpdated,
              onToggle: () => {
                setNotUpdated((v) => !v)
                resetPage()
              },
            },
            {
              type: 'checkbox',
              key: 'oneShopee',
              label: 'Đúng 1 cmt shopee',
              checked: oneShopee,
              onToggle: () => {
                setOneShopee((v) => !v)
                resetPage()
              },
            },
            {
              type: 'radio',
              key: 'postStatus',
              label: 'Trạng thái đăng',
              value: postStatus ?? 'all',
              onChange: (v: string) => {
                setPostStatus(v === 'all' ? undefined : (v as 'unposted' | 'posted'))
                resetPage()
              },
              options: [
                { value: 'all', label: 'Tất cả' },
                { value: 'unposted', label: 'Chưa đăng' },
                { value: 'posted', label: 'Đã đăng' },
              ],
            },
            {
              type: 'radio',
              key: 'linkStatus',
              label: 'Tình trạng link Shopee',
              value: linkStatus ?? 'all',
              onChange: (v: string) => {
                setLinkStatus(v === 'all' ? undefined : (v as LinkStatusFilter))
                resetPage()
              },
              options: [
                { value: 'all', label: 'Tất cả' },
                { value: 'bad', label: 'Link chết hoặc hết hàng' },
                { value: 'review', label: 'Cần xem lại' },
                { value: 'unchecked', label: 'Chưa kiểm tra' },
              ],
            },
            {
              type: 'radio',
              key: 'mediaFilter',
              label: 'Media',
              value: mediaFilter ?? 'all',
              onChange: (v: string) => {
                setMediaFilter(v === 'all' ? undefined : (v as MediaFilter))
                resetPage()
              },
              options: [
                { value: 'all', label: 'Tất cả' },
                { value: 'imageOnly', label: 'Chỉ có ảnh' },
                { value: 'videoOnly', label: 'Chỉ có video' },
                { value: 'complete', label: 'Đủ cả ảnh & video' },
                { value: 'missing', label: 'Thiếu ảnh hoặc video' },
              ],
            },
            {
              type: 'radio',
              key: 'rewritten',
              label: 'Viết lại caption AI',
              value: rewritten ?? 'all',
              onChange: (v: string) => {
                setRewritten(v === 'all' ? undefined : (v as 'yes' | 'no'))
                resetPage()
              },
              options: [
                { value: 'all', label: 'Tất cả' },
                { value: 'yes', label: 'Đã viết lại (đủ 3 bản)' },
                { value: 'no', label: 'Chưa viết lại' },
              ],
            },
          ]}
        />
        <TopicFilterDropdown
          label="Chủ đề"
          options={ACCOUNT_TOPICS}
          selected={topics}
          onToggle={toggleTopic}
          onClear={() => {
            setTopics([])
            resetPage()
          }}
          unassignedValue={UNASSIGNED_TOPIC}
        />
        </div>
      </div>

      {/* Table (lg+) / card list (< lg) */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="lg:hidden">
          {(items.length > 0 || isLoading) && (
            <div className="flex items-center gap-2.5 border-b bg-muted/40 px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
              <span className="ml-1">Chọn tất cả trang này</span>
            </div>
          )}
          <div className="divide-y">
            {items.map((p: PostListItem) => (
              <PostCard
                key={p.post_id}
                post={p}
                selected={sel.has(p.post_id)}
                onToggle={() => toggle(p.post_id)}
                onOpen={() => setDetailId(p.post_id)}
                onTopicChange={(topic) => changeTopic(p.post_id, topic)}
              />
            ))}
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3">
                  <Skeleton className="mt-1 h-4 w-4 rounded" />
                  <Skeleton className="h-12 w-12 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
          </div>
          {!isLoading && items.length === 0 && emptyState}
        </div>

        <div className="table-scroll hidden max-h-[calc(100dvh-22rem)] min-h-[20rem] overflow-y-auto lg:block">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
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
                <th className="p-2.5 text-left font-medium">Thu thập</th>
                <th className="p-2.5 text-left font-medium">Comment</th>
                <th className="p-2.5 text-center font-medium">Viết lại</th>
                <th className="p-2.5 text-center font-medium">Cập nhật</th>
                <th className="p-2.5 text-center font-medium">Link</th>
                <th className="p-2.5 text-left font-medium">Chủ đề</th>
                <th className="p-2.5 text-center font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p: PostListItem) => (
                <PostRow
                  key={p.post_id}
                  post={p}
                  selected={sel.has(p.post_id)}
                  onToggle={() => toggle(p.post_id)}
                  onOpen={() => setDetailId(p.post_id)}
                  onTopicChange={(topic) => changeTopic(p.post_id, topic)}
                />
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
                    <td className="p-2.5"><Skeleton className="h-3 w-14" /></td>
                    <td className="p-2.5"><Skeleton className="h-3 w-32" /></td>
                    <td className="p-2.5"><Skeleton className="mx-auto h-3 w-6" /></td>
                    <td className="p-2.5"><Skeleton className="mx-auto h-5 w-14 rounded-full" /></td>
                    <td className="p-2.5"><Skeleton className="mx-auto h-5 w-16 rounded-full" /></td>
                    <td className="p-2.5"><Skeleton className="h-3 w-16" /></td>
                    <td className="p-2.5"><Skeleton className="mx-auto h-5 w-14 rounded-full" /></td>
                  </tr>
                ))}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={COLSPAN} className="p-0">
                    {emptyState}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="tabular-nums">
            Trang {page + 1}/{maxPage + 1}
          </span>
          <SingleFilterDropdown
            label="Số bài/trang"
            value={String(pageSize)}
            activeWhen={String(PAGE_SIZE_OPTIONS[0])}
            options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => {
              setPageSize(Number(v))
              setPage(0)
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 sm:h-8"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 sm:h-8"
            disabled={page >= maxPage}
            onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          >
            Sau <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Thanh action noi khi co chon */}
      {sel.size > 0 && (
        <FloatingBar>
          <span className="px-2 text-sm font-medium tabular-nums">{sel.size} đã chọn</span>
          <Button size="sm" variant="outline" onClick={() => setRescrapeIds([...sel])}>
            <RefreshCw className="h-4 w-4" /> Lấy lại comment
          </Button>
          <BulkTopicButton postIds={[...sel]} onDone={invalidateAll} />
          <Button size="sm" variant="outline" onClick={doDelete}>
            <Trash2 className="h-4 w-4 text-destructive" /> Xóa
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </FloatingBar>
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

      <AssignTopicDialog
        open={topicDialogOpen}
        onClose={() => setTopicDialogOpen(false)}
        onSaved={invalidateAll}
      />

      <Dialog open={!!exportWarn} onClose={() => setExportWarn(null)} className="max-w-md">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 pr-6">
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
              {(exportWarn?.badLink ?? 0) > 0 && (
                <li>
                  <strong className="text-foreground">{exportWarn?.badLink}</strong> bài có link
                  Shopee đã chết hoặc hết hàng — cần xem và xử lý trước.
                </li>
              )}
              {(exportWarn?.unknownLink ?? 0) > 0 && (
                <li>
                  <strong className="text-foreground">{exportWarn?.unknownLink}</strong> bài có link
                  chưa xác định được tình trạng.
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
  const variants = useQuery({
    queryKey: ['caption-variants', id],
    queryFn: () => fetchCaptionVariants(id),
  })

  if (isLoading)
    return (
      <div className="space-y-4 pr-8" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-56" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="aspect-[3/4] rounded-lg" />
          <Skeleton className="aspect-[3/4] rounded-lg" />
        </div>
        <Skeleton className="h-16 w-full" />
      </div>
    )
  if (!data) return <p className="text-sm text-destructive">Không tìm thấy.</p>

  const caption = String(data.post.caption ?? '')
  const url = String(data.post.url ?? '')

  // Gom cac dong shopee cung 1 comment (nhieu link) lai voi nhau, chi hien comment 1 lan.
  const shopeeGroups: { comment: string; entries: typeof data.shopee }[] = []
  for (const s of data.shopee) {
    const g = shopeeGroups.find((g) => g.comment === s.comment)
    if (g) g.entries.push(s)
    else shopeeGroups.push({ comment: s.comment, entries: [s] })
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(
      () => toast.success('Đã copy URL'),
      () => toast.error('Không copy được'),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">@{String(data.post.username ?? '')}</h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {String(data.post.post_date ?? '')} · {String(data.post.likes ?? '')} tim ·{' '}
            {String(data.post.comments ?? '')} cmt
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button variant="outline" size="sm" onClick={copyUrl}>
            <Copy className="h-4 w-4" /> Copy URL
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRescrape([id])}>
            <RefreshCw className="h-4 w-4" /> Lấy lại comment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        {data.media.map((m) =>
          m.type === 'video' ? (
            <div key={m.file} className="space-y-1.5">
              <video src={m.url} controls className="max-h-[70dvh] w-full rounded-lg bg-black" />
              {m.processedUrl && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Bản đã làm đẹp</div>
                  <video
                    src={m.processedUrl}
                    controls
                    className="max-h-[70dvh] w-full rounded-lg bg-black ring-1 ring-primary/40"
                  />
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
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caption gốc</div>
        <p className="whitespace-pre-wrap text-sm">{caption}</p>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Caption viết lại bằng AI
          {(variants.data?.length ?? 0) > 0 && ` (${variants.data!.length}/3)`}
        </div>
        {variants.isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
        {!variants.isLoading && (variants.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa có bản nào — chạy ở trang "Phân phối bài" &gt; "Viết lại caption kho bài".
          </p>
        )}
        {!variants.isLoading && (variants.data?.length ?? 0) > 0 && (
          <ul className="space-y-2">
            {variants.data!.map((v) => (
              <li key={v.variant_index} className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="mr-1.5 font-medium text-muted-foreground">
                  Bản {v.variant_index}:
                </span>
                <span className="whitespace-pre-wrap">{v.caption}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Link Shopee ({data.shopee.length}
          {shopeeGroups.length !== data.shopee.length ? ` · ${shopeeGroups.length} comment` : ''})
        </div>
        <ul className="space-y-2 text-sm">
          {shopeeGroups.map((g, i) => (
            <li key={i} className="rounded-lg border p-3">
              <div className="mb-1.5 text-muted-foreground">{g.comment}</div>
              <div className="space-y-1.5">
                {g.entries.map((s, j) => (
                  <div key={j} className="rounded-md bg-muted/40 p-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                        Gốc:
                      </span>
                      <a
                        href={s.link}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary underline"
                      >
                        {s.link}
                      </a>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                        Mới:
                      </span>
                      {s.new_link ? (
                        <a
                          href={s.new_link}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-green-600 underline dark:text-green-400"
                        >
                          {s.new_link}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa cập nhật</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))}
          {data.shopee.length === 0 && <li className="text-muted-foreground">Không có.</li>}
        </ul>
      </div>
    </div>
  )
}
