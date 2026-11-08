import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueries, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Download,
  FileDown,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Inbox,
  ImageDown,
  RefreshCw,
  Copy,
  Trash2,
  Wand2,
  AlertTriangle,
  Send,
  Tag,
  MousePointerClick,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import {
  fetchPosts,
  fetchPost,
  deletePosts,
  setPostTopic,
  fetchExportPostsWarnings,
  fetchSelectedExportWarnings,
  downloadSelectedPosts,
  buildExportPostsUrl,
  fetchCaptionVariants,
  deleteRejectedPosts,
  startPostPipeline,
  UNASSIGNED_TOPIC,
  type ExportPostsWarnings,
  exportShopeeUrl,
  type LinkStatusFilter,
  type PostListItem,
  type PostSort,
  type MediaFilter,
  type PostFilterParams,
} from '@/lib/api'
import { useTopics } from '@/lib/useTopics'
import { q, useUrlState } from '@/lib/useUrlState'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { confirmDialog } from '@/lib/confirm'
import { datePresets, fmtVN } from '@/lib/dates'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { Pagination } from '@/components/Pagination'
import { useFitToViewport } from '@/lib/useFitToViewport'
import { RescrapeDialog } from '@/components/RescrapeDialog'
import { RefetchMediaDialog } from '@/components/RefetchMediaDialog'
import { ShopeeLinkCheckDialog } from '@/components/ShopeeLinkCheckDialog'
import { PipelineProgress } from '@/components/PipelineProgress'
import { AssignTopicDialog } from '@/components/AssignTopicDialog'
import { PostTopicCell } from '@/components/PostTopicCell'
import { BulkTopicButton } from '@/components/BulkTopicButton'
import { DateRangePicker } from '@/components/ui/date-picker'
import { SearchInput } from '@/components/filters/SearchInput'
import type { FilterChip } from '@/components/filters/FilterChips'
import { FilterPill, FilterPillMulti } from '@/components/filters/FilterPill'
import { SavedViews } from '@/components/filters/SavedViews'
import { PostThumb } from '@/components/PostThumb'
import { LikesChip } from '@/components/LikesChip'
import { cn } from '@/lib/utils'
import { MEDIA_OPTIONS, MEDIA_VALUES } from '@/components/filters/mediaOptions'

const PAGE_SIZE_OPTIONS = ['20', '50', '100', '200'] as const

const POST_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unposted', label: 'Chưa đăng' },
  { value: 'posted', label: 'Đã đăng' },
] as const
const LINK_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'bad', label: 'Link chết hoặc hết hàng' },
  { value: 'review', label: 'Cần xem lại' },
  { value: 'unchecked', label: 'Chưa kiểm tra' },
] as const
const REWRITE_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'yes', label: 'Đã viết lại (đủ 3 bản)' },
  { value: 'no', label: 'Chưa viết lại' },
] as const

const optionLabel = (opts: readonly { value: string; label: string }[], v: string) =>
  opts.find((o) => o.value === v)?.label ?? v

/*
 * Bo loc song tren URL: reload / Back / gui link deu giu nguyen. Ctrl+K mo thang
 * /posts?noShopee=1 va /posts?rewritten=no. page 1-based tren URL.
 */
const POST_FILTERS = {
  q: q.str(),
  from: q.str(),
  to: q.str(),
  // Mac dinh nhieu tim nhat truoc (bai hot nhat de chon dang); 'newest' van chon duoc o nut Sap xep
  sort: q.enum(['newest', 'likes', 'clicks', 'posted'] as const satisfies readonly PostSort[], 'likes'),
  noShopee: q.bool(),
  notUpdated: q.bool(),
  oneShopee: q.bool(),
  postStatus: q.enum(['all', 'unposted', 'posted'] as const, 'all'),
  link: q.enum(['all', 'bad', 'dead', 'out_of_stock', 'review', 'unchecked'] as const, 'all'),
  media: q.enum(MEDIA_VALUES, 'all'),
  rewritten: q.enum(['all', 'yes', 'no'] as const, 'all'),
  reject: q.bool(),
  topics: q.list(),
  page: q.int(1, 1),
  size: q.enum(PAGE_SIZE_OPTIONS, '20'),
}

/** Key bo loc (khong tinh sap xep / so bai moi trang) - "Xoa tat ca" ve mac dinh cac key nay. */
const FILTER_KEYS = [
  'q',
  'from',
  'to',
  'noShopee',
  'notUpdated',
  'oneShopee',
  'postStatus',
  'link',
  'media',
  'rewritten',
  'reject',
  'topics',
  'page',
] as const

const SORT_OPTIONS = [
  { value: 'likes', label: 'Nhiều tim nhất' },
  { value: 'newest', label: 'Mới thu thập' },
  { value: 'clicks', label: 'Nhiều click nhất' },
  { value: 'posted', label: 'Đăng nhiều nhất' },
] as const

/** 3 bo loc bool cua nhom "Shopee" - gop vao 1 pill chon nhieu. */
const SHOPEE_FLAGS = [
  { value: 'noShopee', label: 'Chưa có link shopee' },
  { value: 'notUpdated', label: 'Chưa cập nhật link mới' },
  { value: 'oneShopee', label: 'Đúng 1 cmt shopee' },
] as const

/*
 * View theo viec can lam. Moi view la 1 bo tham so URL (cung ten voi POST_FILTERS) - view dang chon
 * khi cac bo loc khop dung bo nay. /posts?noShopee=1 va ?rewritten=no (Ctrl+K) roi dung vao view.
 */
const POST_VIEWS: { id: string; label: string; params: Record<string, unknown>; api: PostFilterParams }[] = [
  { id: 'all', label: 'Tất cả', params: {}, api: {} },
  { id: 'noShopee', label: 'Chưa có link Shopee', params: { noShopee: true }, api: { noShopee: true } },
  { id: 'notRewritten', label: 'Chưa viết lại', params: { rewritten: 'no' }, api: { rewritten: 'no' } },
  { id: 'badLink', label: 'Link hỏng', params: { link: 'bad' }, api: { linkStatus: 'bad' } },
  { id: 'unposted', label: 'Chưa đăng', params: { postStatus: 'unposted' }, api: { postStatus: 'unposted' } },
  // Khong link / link chet / het hang / can xem lai, chua dang - xoa 1 lan o day
  { id: 'reject', label: 'Bị loại', params: { reject: true }, api: { reject: true } },
]

const SCRAPED_PRESETS = [datePresets.today(), datePresets.lastDays(7), datePresets.lastDays(30), datePresets.thisMonth()]
/** Trang thai on/chua lam: chu xam, khong pill. Pill mau chi danh cho cai can xu ly. */
const QUIET = 'whitespace-nowrap text-xs text-muted-foreground'
const PILL = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium'
const COLSPAN = 8

function UpdateStatus({ shopee, updated }: { shopee: number; updated: number }) {
  if (shopee === 0) return <span className="text-muted-foreground">—</span>
  if (updated >= shopee)
    return (
      <span className={QUIET}>Xong</span>
    )
  if (updated > 0)
    return (
      <span className={cn(PILL, 'bg-pill-warning tabular-nums text-pill-warning-ink')}>
        {updated}/{shopee}
      </span>
    )
  return <span className={QUIET}>Chưa</span>
}

/** So ban caption AI da viet lai cho bai (xem trang "Viết lại caption" > "Viết lại caption kho bài"). */
function RewriteStatus({ count }: { count: number }) {
  if (count >= 3)
    return (
      <span className={cn(QUIET, 'inline-flex items-center gap-1')}>
        <Wand2 className="h-3 w-3" /> Đủ 3 bản
      </span>
    )
  if (count > 0)
    return (
      <span className={cn(PILL, 'bg-pill-warning tabular-nums text-pill-warning-ink')}>{count}/3</span>
    )
  return <span className={QUIET}>Chưa</span>
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
      <span className={QUIET}>Chưa KT</span>
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
      className={cn(PILL, cls)}
      title={title}
    >
      {text}
    </span>
  )

  if (dead_link_count > 0)
    return pill(
      'bg-pill-negative text-pill-negative-ink',
      dead_link_count > 1 ? `Link chết (${dead_link_count})` : 'Link chết',
    )
  if (oos_link_count > 0)
    return pill(
      'bg-pill-warning text-pill-warning-ink',
      oos_link_count > 1 ? `Hết hàng (${oos_link_count})` : 'Hết hàng',
    )
  if (unknown_link_count > 0)
    return pill(
      'bg-pill-warning text-pill-warning-ink',
      'Cần xem lại',
    )
  return (
    <span className={QUIET} title={title}>
      OK
    </span>
  )
}

function PostStatusBadge({ status }: { status: PostListItem['post_status'] }) {
  if (status === 'posted')
    return (
      <span className={cn(PILL, 'bg-pill-positive text-pill-positive-ink')}>
        <Send className="h-3 w-3" /> Đã đăng
      </span>
    )
  if (status === 'exported')
    return (
      <span className={cn(PILL, 'bg-pill-warning text-pill-warning-ink')}>Đã xuất</span>
    )
  return <span className={QUIET}>Mới</span>
}

function CommentChip({ count }: { count: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap tabular-nums',
        count > 1
          ? 'rounded-full bg-pill-warning px-1.5 py-0.5 text-[11px] font-medium text-pill-warning-ink'
          : 'text-xs text-muted-foreground',
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
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
      {label}:
      {children}
    </span>
  )
}

interface PostItemProps {
  post: PostListItem
  selected: boolean
  /** Bai dang mo (hoac vua dong) o Sheet chi tiet - to dam de khong lac cho. */
  current?: boolean
  /** shift = giu Shift khi tich: chon/bo ca khoang tu o tich truoc. */
  onToggle: (shift: boolean) => void
  onOpen: () => void
  onTopicChange: (topic: string | null) => Promise<void>
}

/** dd/MM, them nam khi khac nam nay. */
const formatScraped = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // Tu ghep: toLocaleDateString('vi-VN') bo nam thi ra "20-10"
  const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return d.getFullYear() === new Date().getFullYear() ? dm : `${dm}/${d.getFullYear()}`
}

function PostStats({ post: p, className }: { post: PostListItem; className?: string }) {
  const muted = 'text-muted-foreground font-normal'
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-0.5', className)}>
      <LikesChip likes={p.likes} />
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 text-xs font-medium tabular-nums text-chart-1-ink',
          p.click_count === 0 && muted,
        )}
        title={`${p.click_count} click`}
      >
        <MousePointerClick className="h-3 w-3" />
        {p.click_count}
      </span>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground',
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

/** Dong bang (>= xl). */
function PostRow({ post: p, selected, current, onToggle, onOpen, onTopicChange }: PostItemProps) {
  return (
    <tr
      onClick={onOpen}
      data-post-id={p.post_id}
      aria-current={current || undefined}
      className={cn(
        'cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50',
        selected && 'bg-chart-1/[0.06]',
        // Vach cam ben trai = bai dang/vua xem (khong phai bong do)
        current && 'bg-muted/60 shadow-[inset_2px_0_0_var(--color-chart-1)]',
      )}
    >
      <td className="py-2 pl-3 pr-2">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={(_, e) => onToggle(e.shiftKey)} />
          <PostThumb thumb={p.thumb} className="h-12 w-12" />
          {/* Caption la noi dung chinh -> 2 dong; so lieu dua len cung dong ten */}
          <div className="min-w-0 max-w-[26rem] space-y-0.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="truncate font-medium">@{p.username || '—'}</span>
              <PostStats post={p} className="shrink-0 flex-nowrap" />
            </div>
            <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{p.caption || '—'}</p>
          </div>
        </div>
      </td>
      {/* 2 moc thoi gian xep chong 1 o: ngay dang (muc) / ngay thu thap (xam) */}
      <td className="whitespace-nowrap px-2 py-2 tabular-nums">
        <div className="text-xs">{p.post_date || '—'}</div>
        <div className="text-[11px] text-muted-foreground">Thu thập {formatScraped(p.scraped_at)}</div>
      </td>
      <td className="max-w-[12rem] px-2 py-2">
        <div className="mb-1">
          <CommentChip count={p.distinct_comment_count} />
        </div>
        <div className="truncate text-xs text-muted-foreground">{p.comment || '—'}</div>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center">
        <RewriteStatus count={p.variant_count} />
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center">
        <UpdateStatus shopee={p.shopee_count} updated={p.new_count} />
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center">
        <LinkHealthBadge post={p} />
      </td>
      <td className="max-w-[9rem] px-2 py-2 text-xs">
        <PostTopicCell topic={p.topic} onChange={onTopicChange} />
      </td>
      <td className="px-2 py-2 text-center">
        <div className="flex flex-col items-center gap-1">
          <PostStatusBadge status={p.post_status} />
          {p.assigned_account && (
            <span className="max-w-[7rem] truncate text-[11px] text-muted-foreground">@{p.assigned_account}</span>
          )}
        </div>
      </td>
    </tr>
  )
}

/** The bai viet tren mobile/tablet (< xl): cung du lieu + handler voi PostRow. */
function PostCard({ post: p, selected, current, onToggle, onOpen, onTopicChange }: PostItemProps) {
  return (
    <div
      onClick={onOpen}
      data-post-id={p.post_id}
      aria-current={current || undefined}
      className={cn(
        'flex cursor-pointer gap-3 p-3 transition-colors hover:bg-muted/40 active:bg-muted/60',
        selected && 'bg-chart-1/[0.06]',
        current && 'bg-muted/60 shadow-[inset_2px_0_0_var(--color-chart-1)]',
      )}
    >
      <div className="pt-1">
        <Checkbox checked={selected} onCheckedChange={(_, e) => onToggle(e.shiftKey)} />
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
  const topicOptions = useTopics()
  const qc = useQueryClient()
  const { values: f, set: setF, reset: resetF, isDefault: isDefaultF } = useUrlState(POST_FILTERS)
  const search = f.q
  const debouncedSearch = useDebouncedValue(search, 300)
  const page = f.page - 1
  const pageSize = Number(f.size)
  const { noShopee, notUpdated, oneShopee, sort, topics } = f
  const postStatus = f.postStatus === 'all' ? undefined : f.postStatus
  const mediaFilter: MediaFilter | undefined = f.media === 'all' ? undefined : f.media
  const linkStatus: LinkStatusFilter | undefined = f.link === 'all' ? undefined : f.link
  const rewritten = f.rewritten === 'all' ? undefined : f.rewritten
  const scrapedFrom = f.from
  const scrapedTo = f.to
  /** Moi lan doi bo loc -> ve trang 1. */
  const setFilter = (patch: Partial<typeof f>, opts?: { replace?: boolean }) => setF({ ...patch, page: 1 }, opts)
  const setPage = (p: number) => setF({ page: p + 1 })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [rescrapeIds, setRescrapeIds] = useState<string[] | null>(null)
  const [refetchMediaIds, setRefetchMediaIds] = useState<string[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [exportWarn, setExportWarn] = useState<ExportPostsWarnings | null>(null)
  const [checkingExport, setCheckingExport] = useState(false)
  const [exportScope, setExportScope] = useState<'filter' | 'selected'>('filter')
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
    reject: f.reject,
    scrapedFrom,
    scrapedTo,
    topics,
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'posts',
      debouncedSearch,
      page,
      pageSize,
      noShopee,
      notUpdated,
      oneShopee,
      postStatus,
      mediaFilter,
      linkStatus,
      rewritten,
      f.reject,
      scrapedFrom,
      scrapedTo,
      topics,
      sort,
    ],
    queryFn: () =>
      fetchPosts({
        search: debouncedSearch,
        limit: pageSize,
        offset: page * pageSize,
        noShopee,
        notUpdated,
        oneShopee,
        postStatus,
        mediaFilter,
        linkStatus,
        rewritten,
        reject: f.reject,
        scrapedFrom: scrapedFrom || undefined,
        scrapedTo: scrapedTo || undefined,
        topics,
        sort,
      }),
    placeholderData: keepPreviousData,
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  // View dang chon: moi key loc (tru page) bang dung tham so cua view, con lai o mac dinh.
  const activeView = POST_VIEWS.find((v) =>
    FILTER_KEYS.every((k) => {
      if (k === 'page') return true
      const want = v.params[k]
      return want === undefined ? isDefaultF(k) : f[k] === want
    }),
  )?.id
  // So bai moi view (limit 1, chi lay total) - key ['posts', ...] nen invalidateAll lam moi luon.
  const viewCounts = useQueries({
    queries: POST_VIEWS.map((v) => ({
      queryKey: ['posts', 'view-count', v.id],
      queryFn: () => fetchPosts({ limit: 1, offset: 0, ...v.api }),
      staleTime: 30_000,
    })),
  })
  const openView = (params: Record<string, unknown>) => {
    resetF([...FILTER_KEYS])
    if (Object.keys(params).length) setF(params as Partial<typeof f>)
  }

  const chips: FilterChip[] = []
  if (search) chips.push({ key: 'q', label: 'Tìm', value: `“${search}”`, onRemove: () => setFilter({ q: '' }) })
  if (scrapedFrom || scrapedTo)
    chips.push({
      key: 'scraped',
      label: 'Thu thập',
      value: `${fmtVN(scrapedFrom) || '…'} – ${fmtVN(scrapedTo) || '…'}`,
      onRemove: () => setFilter({ from: '', to: '' }),
    })
  if (noShopee) chips.push({ key: 'noShopee', label: 'Shopee', value: 'Chưa có link', onRemove: () => setFilter({ noShopee: false }) })
  if (notUpdated)
    chips.push({ key: 'notUpdated', label: 'Cập nhật', value: 'Chưa cập nhật link mới', onRemove: () => setFilter({ notUpdated: false }) })
  if (oneShopee)
    chips.push({ key: 'oneShopee', label: 'Comment', value: 'Đúng 1 cmt shopee', onRemove: () => setFilter({ oneShopee: false }) })
  if (postStatus)
    chips.push({
      key: 'postStatus',
      label: 'Trạng thái đăng',
      value: optionLabel(POST_STATUS_OPTIONS, postStatus),
      onRemove: () => setFilter({ postStatus: 'all' }),
    })
  if (linkStatus)
    chips.push({ key: 'link', label: 'Link Shopee', value: optionLabel(LINK_OPTIONS, linkStatus), onRemove: () => setFilter({ link: 'all' }) })
  if (mediaFilter)
    chips.push({ key: 'media', label: 'Media', value: optionLabel(MEDIA_OPTIONS, mediaFilter), onRemove: () => setFilter({ media: 'all' }) })
  if (rewritten)
    chips.push({
      key: 'rewritten',
      label: 'Viết lại',
      value: optionLabel(REWRITE_OPTIONS, rewritten),
      onRemove: () => setFilter({ rewritten: 'all' }),
    })
  if (f.reject)
    chips.push({ key: 'reject', label: 'Lọc', value: 'Bị loại', onRemove: () => setFilter({ reject: false }) })
  if (topics.length > 0)
    chips.push({
      key: 'topics',
      label: 'Chủ đề',
      value: topics.map((t) => (t === UNASSIGNED_TOPIC ? 'Chưa gán chủ đề' : t)).join(', '),
      onRemove: () => setFilter({ topics: [] }),
    })
  const filterActive = chips.length > 0
  const onlySearch = chips.length === 1 && !!search

  // Bai da chon nhung khong nam o trang dang xem (trang khac / bi bo loc an) - van bi tac dong
  const shownIds = new Set(items.map((i) => i.post_id))
  const hiddenSelected = [...sel].filter((id) => !shownIds.has(id)).length

  const allChecked = items.length > 0 && items.every((i) => sel.has(i.post_id))
  const someChecked = items.some((i) => sel.has(i.post_id)) && !allChecked

  const [checkLinkIds, setCheckLinkIds] = useState<string[] | null>(null)
  const [backlogJobId, setBacklogJobId] = useState<string | null>(null)
  const [backlogStarting, setBacklogStarting] = useState(false)

  // "Xu ly kho": chay luong tu dong cho moi bai chua dang (kiem tra link chua kiem tra -> phan loai ->
  // viet lai bai dat chua du ban). Ket qua + nut xoa bai bi loai nam trong dialog.
  const runBacklog = async () => {
    const ok = await confirmDialog({
      title: 'Xử lý kho bài chưa đăng?',
      description:
        'Kiểm tra các link Shopee chưa kiểm tra, phân loại bài, rồi viết lại caption (AI) cho bài đạt còn thiếu bản. Bài đã đăng không bị đụng tới. Chưa xoá gì — cuối cùng bạn tự bấm xoá bài bị loại.',
      confirmLabel: 'Chạy',
    })
    if (!ok) return
    setBacklogStarting(true)
    try {
      const { jobId } = await startPostPipeline({ scope: 'backlog' })
      setBacklogJobId(jobId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi khởi động')
    } finally {
      setBacklogStarting(false)
    }
  }

  // View "Bi loai" khong kem loc khac -> xoa het (server tu tinh lai danh sach, vuot gioi han 200/trang)
  const deleteAllRejected = async () => {
    const ok = await confirmDialog({
      title: `Xoá ${total} bài bị loại?`,
      description: 'Không có link Shopee, link chết, hết hàng hoặc cần xem lại (bài đã đăng không tính). Xoá luôn media đã tải, không hoàn tác được.',
      confirmLabel: `Xoá ${total} bài`,
      destructive: true,
    })
    if (!ok) return
    try {
      const r = await deleteRejectedPosts()
      toast.success(`Đã xoá ${r.deleted} bài bị loại`)
      setSel(new Set())
      invalidateAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xoá bài')
    }
  }

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

  // Vi tri o tich gan nhat tren trang - Shift+tich chon/bo ca khoang tu do (nhu Gmail). Doi trang /
  // bo loc thi moc cu vo nghia -> xoa.
  const lastToggled = useRef<number | null>(null)
  useEffect(() => {
    lastToggled.current = null
  }, [data])
  const toggle = (id: string, shift = false) => {
    const idx = items.findIndex((i) => i.post_id === id)
    const from = lastToggled.current
    setSel((prev) => {
      const next = new Set(prev)
      const on = !prev.has(id)
      const range =
        shift && from !== null && idx >= 0 && from !== idx
          ? items.slice(Math.min(from, idx), Math.max(from, idx) + 1)
          : items.filter((i) => i.post_id === id)
      for (const it of range) {
        if (on) next.add(it.post_id)
        else next.delete(it.post_id)
      }
      return next
    })
    lastToggled.current = idx
  }

  // Sheet chi tiet: nut ‹ › / phim ←→ (j k) chuyen bai trong trang; dong lai van to bai vua xem.
  const [lastOpened, setLastOpened] = useState<string | null>(null)
  const detailIdx = detailId ? items.findIndex((i) => i.post_id === detailId) : -1
  const openDetail = (id: string) => {
    setDetailId(id)
    setLastOpened(id)
  }
  const stepDetail = (dir: 1 | -1) => {
    const next = items[detailIdx + dir]
    if (next) openDetail(next.post_id)
  }
  useEffect(() => {
    if (!detailId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowRight' || e.key === 'j') stepDetail(1)
      else if (e.key === 'ArrowLeft' || e.key === 'k') stepDetail(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // Bai dang xem luon nam trong khung nhin phia sau Sheet
  useEffect(() => {
    if (!detailId) return
    const el = [...document.querySelectorAll<HTMLElement>(`[data-post-id="${CSS.escape(detailId)}"]`)].find(
      (x) => x.offsetParent,
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [detailId])

  // Man hinh rong (bang): khung danh sach vua khit man hinh, cuon ben trong
  const listRef = useRef<HTMLDivElement>(null)
  const listMaxH = useFitToViewport(listRef)
  // Doi trang: ve dau khung cuon; man hinh nho (cuon theo trang) thi dua dau danh sach len duoi thanh tren cung
  const goPage = (p: number) => {
    setPage(p)
    if (listRef.current) listRef.current.scrollTop = 0
    const top = listRef.current?.getBoundingClientRect().top ?? 0
    if (top < 48) window.scrollTo({ top: window.scrollY + top - 64 })
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
    const ok = await confirmDialog({
      title: `Xóa ${ids.length} bài?`,
      description: (
        <>
          Xóa luôn media đã tải, không hoàn tác được.
          {hiddenSelected > 0 && ` Gồm ${hiddenSelected} bài không hiển thị ở trang này.`}
        </>
      ),
      confirmLabel: `Xóa ${ids.length} bài`,
      destructive: true,
    })
    if (!ok) return
    try {
      await deletePosts(ids)
      setSel(new Set())
      toast.success(`Đã xoá ${ids.length} bài`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa bài thất bại')
    } finally {
      invalidateAll()
    }
  }

  const clearFilters = () => resetF([...FILTER_KEYS])

  const changeTopic = async (postId: string, topic: string | null) => {
    await setPostTopic(postId, topic)
    invalidateAll()
  }

  const doExportPosts = () => {
    window.location.href = buildExportPostsUrl(activeFilters)
  }

  const hasExportWarn = (w: ExportPostsWarnings) =>
    w.notUpdated > 0 || w.multiComment > 0 || w.badLink > 0 || w.unknownLink > 0

  const doExportSelected = async () => {
    const ids = [...sel]
    setCheckingExport(true)
    try {
      await downloadSelectedPosts(ids)
      toast.success(`Đã xuất ${ids.length} bài ra Excel`)
      invalidateAll() // xuat file gan account + doi trang thai bai -> lam moi danh sach
    } catch {
      toast.error('Xuất file thất bại')
    } finally {
      setCheckingExport(false)
    }
  }

  const onExportSelectedClick = async () => {
    setCheckingExport(true)
    try {
      const w = await fetchSelectedExportWarnings([...sel])
      if (hasExportWarn(w)) {
        setExportScope('selected')
        setExportWarn(w)
        setCheckingExport(false)
      } else {
        await doExportSelected()
      }
    } catch {
      toast.error('Không kiểm tra được dữ liệu trước khi xuất')
      setCheckingExport(false)
    }
  }

  const onExportPostsClick = async () => {
    setCheckingExport(true)
    try {
      const w = await fetchExportPostsWarnings(activeFilters)
      if (hasExportWarn(w)) {
        setExportScope('filter')
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
          : onlySearch
            ? `Không có bài nào khớp “${search}”.`
            : filterActive
              ? 'Không có bài khớp bộ lọc.'
              : 'Sang tab Thu thập để tải bài về.'
      }
      action={
        !isError &&
        (filterActive ? (
          <Button size="sm" variant="outline" onClick={clearFilters}>
            {onlySearch ? 'Xóa tìm kiếm' : 'Xóa bộ lọc'}
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
          filterActive ? (
            <span className="tabular-nums">
              {total.toLocaleString('vi-VN')} / {(viewCounts[0].data?.total ?? total).toLocaleString('vi-VN')} bài theo bộ lọc
              <span className="hidden sm:inline"> · nút Xuất chỉ lấy các bài này</span>
            </span>
          ) : (
            <span className="tabular-nums">{total.toLocaleString('vi-VN')} bài</span>
          )
        }
        primary={{
          label: 'Xuất posts.xlsx',
          shortLabel: 'Xuất',
          icon: Download,
          onClick: onExportPostsClick,
          busy: checkingExport,
          title: filterActive ? 'Xuất các bài đang lọc' : 'Xuất toàn bộ bài',
        }}
        secondary={[
          {
            label: 'Xử lý kho',
            icon: Workflow,
            onClick: runBacklog,
            busy: backlogStarting,
            title: 'Kiểm tra link → phân loại → viết lại caption cho bài chưa đăng',
          },
          { label: 'Gán chủ đề', icon: Tag, onClick: () => setTopicDialogOpen(true) },
          { label: 'Shopee input', icon: FileDown, href: exportShopeeUrl },
        ]}
      />

      {/* View theo viec can lam */}
      <SavedViews
        views={POST_VIEWS.map((v, i) => ({
          id: v.id,
          label: v.label,
          count: viewCounts[i].data?.total,
          active: activeView === v.id,
          onSelect: () => openView(v.params),
        }))}
      />

      {/* Tim + sap xep */}
      <div className="flex items-center gap-2">
        <SearchInput
          className="sm:max-w-sm"
          placeholder="Tìm caption / user / post id…"
          value={search}
          onChange={(v) => setFilter({ q: v }, { replace: true })}
        />
        {/* Phone: o tim chiem het hang, Sap xep xuong cuoi hang pill */}
        <div className="ml-auto hidden shrink-0 sm:block">
          <FilterPill
            label="Sắp xếp"
            neutral
            value={sort}
            emptyValue="likes"
            options={SORT_OPTIONS}
            onChange={(v) => setFilter({ sort: v as typeof sort })}
          />
        </div>
      </div>

      {/* Moi nhom loc 1 pill: chua loc = vien net dut; dang loc = hien gia tri + nut bo. Phone: cuon ngang. */}
      <div className="overflow-x-auto py-0.5">
        <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
          <DateRangePicker
            variant="pill"
            label="Thu thập"
            from={scrapedFrom}
            to={scrapedTo}
            onChange={(from, to) => setFilter({ from, to })}
            presets={SCRAPED_PRESETS}
            clearable
          />
          <FilterPill
            label="Đăng"
            value={f.postStatus}
            options={POST_STATUS_OPTIONS}
            onChange={(v) => setFilter({ postStatus: v as typeof f.postStatus })}
          />
          <FilterPill
            label="Link"
            value={f.link}
            options={LINK_OPTIONS}
            onChange={(v) => setFilter({ link: v as typeof f.link })}
          />
          <FilterPill
            label="Media"
            value={f.media}
            options={MEDIA_OPTIONS}
            onChange={(v) => setFilter({ media: v as typeof f.media })}
          />
          <FilterPill
            label="Viết lại"
            value={f.rewritten}
            options={REWRITE_OPTIONS}
            onChange={(v) => setFilter({ rewritten: v as typeof f.rewritten })}
          />
          <FilterPillMulti
            label="Chủ đề"
            values={topics}
            options={[
              ...topicOptions.map((t) => ({ value: t, label: t })),
              { value: UNASSIGNED_TOPIC, label: 'Chưa gán chủ đề' },
            ]}
            onChange={(v) => setFilter({ topics: v })}
          />
          <FilterPillMulti
            label="Shopee"
            values={SHOPEE_FLAGS.filter((o) => f[o.value]).map((o) => o.value)}
            options={SHOPEE_FLAGS}
            onChange={(v) => setFilter({ noShopee: v.includes('noShopee'), notUpdated: v.includes('notUpdated'), oneShopee: v.includes('oneShopee') })}
          />
          {filterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-8 shrink-0 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Xóa lọc
            </button>
          )}
          <div className="sm:hidden">
          <FilterPill
            label="Sắp xếp"
            neutral
            value={sort}
            emptyValue="likes"
            options={SORT_OPTIONS}
            onChange={(v) => setFilter({ sort: v as typeof sort })}
          />
          </div>
        </div>
      </div>

      {/* Table (lg+) / card list (< lg) */}
      {activeView === 'reject' && total > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="font-medium tabular-nums">{total.toLocaleString('vi-VN')}</span> bài bị loại: không có link
            Shopee, link chết, hết hàng hoặc cần xem lại. Bài đã đăng không tính.
          </span>
          <Button size="sm" variant="destructive" onClick={deleteAllRejected}>
            <Trash2 className="h-4 w-4" /> Xoá tất cả {total.toLocaleString('vi-VN')} bài
          </Button>
        </div>
      )}

      {/* Man hinh nho: overflow-clip giu bo goc, cuon theo trang. >= xl: cao toi da vua man hinh
          (useFitToViewport), cuon trong khung, thead dinh o dau khung. */}
      <div
        ref={listRef}
        className="overflow-clip rounded-xl border bg-card xl:overflow-y-auto xl:overscroll-contain"
        style={listMaxH ? { maxHeight: listMaxH } : undefined}
      >
        <div className="xl:hidden">
          {(items.length > 0 || isLoading) && (
            <div className="flex items-center gap-2.5 border-b bg-card px-3 py-2.5 text-xs font-medium text-muted-foreground">
              <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
              <span className="ml-1">Chọn tất cả trang này</span>
            </div>
          )}
          {/* Tablet: 2 cot the; -mb-px de vien duoi hang cuoi chong len vien khung */}
          <div className="divide-y md:-mb-px md:grid md:grid-cols-2 md:divide-y-0 md:[&>*]:border-b md:[&>*:nth-child(odd)]:border-r">
            {items.map((p: PostListItem) => (
              <PostCard
                key={p.post_id}
                post={p}
                selected={sel.has(p.post_id)}
                current={p.post_id === (detailId ?? lastOpened)}
                onToggle={(shift) => toggle(p.post_id, shift)}
                onOpen={() => openDetail(p.post_id)}
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

        {/* Bang (>= xl) cuon trong khung listRef; tieu de cot dinh o dau khung */}
        <div className="hidden xl:block">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-xs text-muted-foreground [&>th]:font-medium [&>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
                <th className="py-2.5 pl-3 pr-2 text-left">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onCheckedChange={toggleAll}
                    />
                    <span className="ml-0.5">Bài viết</span>
                  </div>
                </th>
                <th className="whitespace-nowrap px-2 py-2.5 text-left" title="Ngày đăng gốc / ngày thu thập">
                  Ngày
                </th>
                <th className="whitespace-nowrap px-2 py-2.5 text-left">Comment</th>
                <th className="whitespace-nowrap px-2 py-2.5 text-center" title="Số bản caption AI đã viết lại (tối đa 3)">
                  Viết lại
                </th>
                <th className="whitespace-nowrap px-2 py-2.5 text-center" title="Số link Shopee đã thay bằng link mới">
                  Cập nhật
                </th>
                <th
                  className="whitespace-nowrap px-2 py-2.5 text-center"
                  title="Tình trạng link Shopee: chết / hết hàng / cần xem lại"
                >
                  Link
                </th>
                <th className="whitespace-nowrap px-2 py-2.5 text-left">Chủ đề</th>
                <th className="whitespace-nowrap px-2 py-2.5 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p: PostListItem) => (
                <PostRow
                  key={p.post_id}
                  post={p}
                  selected={sel.has(p.post_id)}
                  current={p.post_id === (detailId ?? lastOpened)}
                  onToggle={(shift) => toggle(p.post_id, shift)}
                  onOpen={() => openDetail(p.post_id)}
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

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={goPage}
        sizeOptions={PAGE_SIZE_OPTIONS}
        onSize={(size) => setF({ size: size as typeof f.size, page: 1 })}
      />

      {/* Thanh action noi khi co chon */}
      {sel.size > 0 && (
        <FloatingBar>
          <span className="px-2 text-sm tabular-nums">
            <span className="font-medium text-chart-1-ink">{sel.size}</span> đã chọn
            {hiddenSelected > 0 && <span className="text-muted-foreground"> ({hiddenSelected} không hiển thị)</span>}
          </span>
          <Button size="sm" variant="outline" onClick={() => setRescrapeIds([...sel])}>
            <RefreshCw className="h-4 w-4" /> Lấy lại comment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRefetchMediaIds([...sel])}>
            <ImageDown className="h-4 w-4" /> Crawl lại media
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCheckLinkIds([...sel])}>
            <ShieldCheck className="h-4 w-4" /> Kiểm tra link
          </Button>
          <BulkTopicButton postIds={[...sel]} onDone={invalidateAll} />
          <Button size="sm" variant="outline" onClick={onExportSelectedClick} disabled={checkingExport}>
            <Download className="h-4 w-4" /> Xuất Excel
          </Button>
          <Button size="sm" variant="outline" onClick={doDelete}>
            <Trash2 className="h-4 w-4 text-destructive" /> Xóa
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </FloatingBar>
      )}

      <Sheet open={!!detailId} onClose={() => setDetailId(null)} className="max-w-3xl">
        {detailId && (
          <>
            {detailIdx >= 0 && (
              <div className="mb-4 flex items-center gap-1 pr-10 text-xs text-muted-foreground">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 px-0 sm:h-8 sm:w-8"
                  disabled={detailIdx <= 0}
                  onClick={() => stepDetail(-1)}
                  aria-label="Bài trước"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 px-0 sm:h-8 sm:w-8"
                  disabled={detailIdx >= items.length - 1}
                  onClick={() => stepDetail(1)}
                  aria-label="Bài sau"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="ml-1.5 tabular-nums">
                  Bài {detailIdx + 1}/{items.length} trong trang
                </span>
                <span className="ml-auto hidden items-center gap-1 sm:inline-flex">
                  <kbd className="font-sans rounded border px-1 text-[11px]">←</kbd>
                  <kbd className="font-sans rounded border px-1 text-[11px]">→</kbd>
                  chuyển bài
                </span>
              </div>
            )}
            <PostDetail
              id={detailId}
              onRescrape={(ids) => setRescrapeIds(ids)}
              onRefetchMedia={(ids) => setRefetchMediaIds(ids)}
            />
          </>
        )}
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

      <RefetchMediaDialog
        open={!!refetchMediaIds}
        postIds={refetchMediaIds ?? []}
        onClose={() => {
          setRefetchMediaIds(null)
          invalidateAll()
        }}
        onDone={invalidateAll}
      />

      <ShopeeLinkCheckDialog
        open={!!checkLinkIds}
        postIds={checkLinkIds ?? []}
        onClose={() => setCheckLinkIds(null)}
        onDone={invalidateAll}
      />

      <Dialog open={!!backlogJobId} onClose={() => setBacklogJobId(null)} className="max-w-2xl">
        <h2 className="pr-8 text-lg font-semibold">Xử lý kho</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Đóng cửa sổ này thì job vẫn chạy tiếp ở server.
        </p>
        <PipelineProgress
          className="mt-4"
          jobId={backlogJobId}
          planned={{ checkLinks: true, rewrite: true }}
          onEnd={invalidateAll}
        />
      </Dialog>

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
              if (exportScope === 'selected') void doExportSelected()
              else doExportPosts()
            }}
          >
            Vẫn xuất file
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function PostDetail({
  id,
  onRescrape,
  onRefetchMedia,
}: {
  id: string
  onRescrape: (ids: string[]) => void
  onRefetchMedia: (ids: string[]) => void
}) {
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
          <Button variant="outline" size="sm" onClick={() => onRefetchMedia([id])}>
            <ImageDown className="h-4 w-4" /> Crawl lại media
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
                    className="max-h-[70dvh] w-full rounded-lg bg-black"
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
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Caption gốc</div>
        <p className="whitespace-pre-wrap text-sm">{caption}</p>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          Caption viết lại bằng AI
          {(variants.data?.length ?? 0) > 0 && ` (${variants.data!.length}/3)`}
        </div>
        {variants.isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
        {!variants.isLoading && (variants.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa có bản nào — chạy ở trang "Viết lại caption" &gt; "Viết lại caption kho bài".
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
        <div className="mb-2 text-xs font-medium text-muted-foreground">
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
