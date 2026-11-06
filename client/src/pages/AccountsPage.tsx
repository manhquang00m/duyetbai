import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Users,
  Upload,
  Download,
  Pencil,
  ShieldCheck,
  RefreshCw,
  Wand2,
  ArrowDown,
  ArrowUp,
  Copy,
  CopyPlus,
  Tag,
  Plug,
  Info,
  CircleDot,
  Loader2,
  EyeOff,
} from 'lucide-react'
import {
  fetchAccounts,
  updateAccountActive,
  updateAccount,
  deleteAccount,
  deleteAccounts,
  importAccounts,
  exportAccountsUrl,
  checkProxies,
  saveProxies,
  fetchProxies,
  fetchPostingAccounts,
  PROXY_TYPES,
  APPEAL_STATUSES,
  type Account,
  type AccountImportResult,
  type AppealStatus,
} from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { AccountFormDialog } from '@/components/AccountFormDialog'
import { AccountProxyCheckDialog } from '@/components/AccountProxyCheckDialog'
import { AssignPostingTopicsDialog } from '@/components/AssignPostingTopicsDialog'
import { AssignProxyDialog } from '@/components/AssignProxyDialog'
import { PostingTopicsCell } from '@/components/PostingTopicsCell'
import { CloneAccountDialog } from '@/components/CloneAccountDialog'
import { GpmProxySyncDialog } from '@/components/GpmProxySyncDialog'
import { ShadowbanBadge } from '@/components/ShadowbanBadge'
import { ShadowbanCheckDialog } from '@/components/ShadowbanCheckDialog'
import { ShadowbanHistorySheet } from '@/components/ShadowbanHistorySheet'
import { StatusCheckboxFilter, STATUS_NONE } from '@/components/StatusCheckboxFilter'
import { MultiFilterDropdown } from '@/components/ui/filter-dropdown'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { SearchInput } from '@/components/filters/SearchInput'
import { FilterChips, type FilterChip } from '@/components/filters/FilterChips'
import { SavedViews } from '@/components/filters/SavedViews'
import { FileDropOverlay } from '@/components/FileDropOverlay'
import { ImportResultPanel } from '@/components/ImportResultPanel'
import { AccountAvatar } from '@/components/AccountAvatar'
import { cn } from '@/lib/utils'
import { q, useUrlState } from '@/lib/useUrlState'
import { USABLE_STATUSES, accountsNeedingAttention } from '@/lib/accountAttention'
import { confirmDialog } from '@/lib/confirm'
import { maskProxy } from '@/lib/parsers'
import { saneYear } from '@/lib/dates'

const COLSPAN = 10

const VIEW_IDS = ['all', 'attention', 'proxy-die', 'shadowban'] as const
type ViewId = (typeof VIEW_IDS)[number]

/*
 * Bo loc tren URL. view= link tu Tong quan / Ctrl+K (attention, proxy-die, shadowban), q= nhay
 * toi 1 nick, new=1 mo form them account. status mac dinh = trang thai dang dung duoc.
 */
const FILTERS = {
  view: q.enum(VIEW_IDS, 'all'),
  q: q.str(),
  status: q.list(USABLE_STATUSES),
  banned: q.enum(['all', 'live', 'die'] as const, 'all'),
  active: q.enum(['all', 'on', 'off'] as const, 'all'),
  proxy: q.enum(['all', 'none', 'live', 'die', 'unchecked'] as const, 'all'),
  platform: q.enum(['all', 'Stable', 'Global', 'none'] as const, 'all'),
  ptype: q.str('all'),
  sort: q.enum(['default', 'name', 'created'] as const, 'default'),
  dir: q.enum(['asc', 'desc'] as const, 'asc'),
  new: q.bool(),
}

const BANNED_OPTS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'live', label: 'Chỉ LIVE' },
  { value: 'die', label: 'Chỉ DIE' },
]
const ACTIVE_OPTS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'on', label: 'Đang bật' },
  { value: 'off', label: 'Đang tắt' },
]
const PROXY_OPTS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'none', label: 'Chưa có proxy' },
  { value: 'live', label: 'Proxy Live' },
  { value: 'die', label: 'Proxy Die' },
  { value: 'unchecked', label: 'Có proxy, chưa kiểm tra' },
]
const PLATFORM_OPTS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Stable', label: 'Stable' },
  { value: 'Global', label: 'Global' },
  { value: 'none', label: 'Chưa đặt' },
]
const PTYPE_OPTS = [
  { value: 'all', label: 'Tất cả' },
  ...PROXY_TYPES.map((t) => ({ value: t as string, label: t as string })),
  { value: 'none', label: 'Chưa đặt' },
]
const optLabel = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v

const isRunning = (a: Account) => !!a.active && !a.banned
/** Account thuoc view nao (chi account dang chay - giong cach dem o Tong quan / sidebar). */
function inView(a: Account, view: ViewId, attentionIds: Set<number>): boolean {
  if (view === 'all') return true
  if (view === 'attention') return attentionIds.has(a.id)
  if (!isRunning(a)) return false
  if (view === 'proxy-die') return a.proxy_status === 'die'
  return a.shadowban_verdict === 'shadowban' || a.shadowban_verdict === 'suspect'
}

/** Header sap xep duoc: mui ten chi hien o cot dang sap xep. */
function SortHeader({
  label,
  col,
  sort,
  dir,
  onSort,
}: {
  label: string
  col: 'name' | 'created'
  sort: string
  dir: 'asc' | 'desc'
  onSort: (col: 'name' | 'created') => void
}) {
  const active = sort === col
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
    >
      {label}
      {active && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  )
}

function ProxyCell({
  proxy,
  status,
  checking,
  onRecheck,
}: {
  proxy: string | null
  status?: string | null
  checking: boolean
  onRecheck: (proxy: string) => void
}) {
  if (!proxy) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 space-y-0.5">
        <div className="max-w-[12rem] truncate text-xs tabular-nums md:max-w-[9rem]" title={maskProxy(proxy)}>
          {maskProxy(proxy)}
        </div>
        {status === 'live' ? (
          <span className="whitespace-nowrap text-xs text-muted-foreground">Live</span>
        ) : status === 'die' ? (
          <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-pill-negative px-2 py-0.5 text-[11px] font-medium text-pill-negative-ink">
            Proxy die
          </span>
        ) : (
          <span className="whitespace-nowrap text-xs text-muted-foreground">Chưa kiểm tra</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(proxy).then(
            () => toast.success('Đã copy proxy'),
            () => toast.error('Không copy được'),
          )
        }}
        title="Copy proxy"
        aria-label="Copy proxy"
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:p-1.5"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onRecheck(proxy)}
        disabled={checking}
        title="Kiểm tra lại proxy này"
        aria-label="Kiểm tra lại proxy này"
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 md:p-1.5"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
      </button>
    </div>
  )
}

/** Icon "i" - di chuot/bam de xem huong dan dinh dang file import (thay cho doan mo ta dai). */
function ImportHelp() {
  const popover = usePopover({ placement: 'bottom-end' })
  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        aria-label="Định dạng file import"
        onClick={() => popover.setOpen(!popover.open)}
        onMouseEnter={() => popover.setOpen(true)}
        onMouseLeave={() => popover.setOpen(false)}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground sm:p-1.5"
      >
        <Info className="h-4 w-4" />
      </button>
      <PopoverPanel popover={popover} className="w-96 max-w-[calc(100vw-1.5rem)] p-3 text-xs leading-relaxed">
        <p className="mb-1 font-medium">Định dạng file import</p>
        <p className="text-muted-foreground">
          Cột A→L lần lượt là Profile, Thiết bị, Trạng thái, Ngày tạo, Pass_Threads, Gmail,
          Password, Proxy, Platform (Stable/Global), Loại proxy, Chủ đề đăng, Ghi chú (dòng 1 là
          header). Profile trùng sẽ được cập nhật đè.
        </p>
        <p className="mt-1.5 text-muted-foreground">
          Cột C chỉ nhận: {APPEAL_STATUSES.join(' / ')} (chọn "Die" sẽ tự đánh dấu banned). Cột J
          chỉ nhận: {PROXY_TYPES.join(' / ')}. Cột K là các chủ đề, cách nhau bằng dấu phẩy. Giá
          trị khác sẽ để trống và báo lại.
        </p>
      </PopoverPanel>
    </>
  )
}

/** Nut "Doi trang thai" trong thanh thao tac hang loat. */
function BulkStatusButton({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (status: AppealStatus) => void
}) {
  const popover = usePopover()
  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        disabled={busy}
        onClick={() => popover.setOpen(!popover.open)}
        className={buttonVariants({ size: 'sm', variant: 'outline' })}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDot className="h-4 w-4" />}
        Đổi trạng thái
      </button>
      <PopoverPanel popover={popover} className="p-1">
        {APPEAL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              popover.setOpen(false)
              onPick(s)
            }}
            className="flex w-full items-center rounded px-2 py-2 text-left text-xs hover:bg-accent sm:py-1.5"
          >
            <AppealBadge status={s} />
          </button>
        ))}
      </PopoverPanel>
    </>
  )
}

/**
 * Chi to mau trang thai can xu ly: Die (do) > Dang khang/ngam (vang). Trang thai on hoac chua bat
 * dau (Live, Khang thanh cong, Chua khang, Chua tao nick) la chu xam - tranh ca cot pill xanh.
 */
const APPEAL_PILL: Record<string, string> = {
  'Đang kháng': 'bg-pill-warning text-pill-warning-ink',
  'Đang ngâm': 'bg-pill-warning text-pill-warning-ink',
  Die: 'bg-pill-negative text-pill-negative-ink',
}

function AppealBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>
  const pill = APPEAL_PILL[status]
  if (!pill) return <span className="whitespace-nowrap text-xs text-muted-foreground">{status}</span>
  return (
    <span
      className={cn(
        'inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
        pill,
      )}
    >
      {status}
    </span>
  )
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'whitespace-nowrap text-xs',
        platform === 'Global' ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      {platform}
    </span>
  )
}

function RowActions({
  onEdit,
  onClone,
  onDelete,
}: {
  onEdit: () => void
  onClone: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-end">
      <Button variant="ghost" size="icon" className="sm:h-8 sm:w-8" onClick={onEdit} aria-label="Sửa account" title="Sửa account">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="sm:h-8 sm:w-8" onClick={onClone} aria-label="Clone account" title="Clone account">
        <CopyPlus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
        onClick={onDelete}
        aria-label="Xoá account"
        title="Xoá account"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function AccountsPage() {
  const qc = useQueryClient()
  const { data: accounts, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const { data: proxiesData } = useQuery({ queryKey: ['proxies'], queryFn: fetchProxies })
  const { data: postingAccounts } = useQuery({
    queryKey: ['posting-accounts'],
    queryFn: fetchPostingAccounts,
  })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [cloningFrom, setCloningFrom] = useState<Account | null>(null)
  const [proxyDialogOpen, setProxyDialogOpen] = useState(false)
  const [recheckAllOpen, setRecheckAllOpen] = useState(false)
  const [gpmSyncOpen, setGpmSyncOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [postingTopicOpen, setPostingTopicOpen] = useState(false)
  const [assignProxyOpen, setAssignProxyOpen] = useState(false)
  const [shadowbanOpen, setShadowbanOpen] = useState(false)
  const [shadowbanAccount, setShadowbanAccount] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [importResult, setImportResult] = useState<AccountImportResult | null>(null)
  const [assigning, setAssigning] = useState(false)

  const { values: f, set: setF } = useUrlState(FILTERS)
  const search = f.q
  const bannedFilter = f.banned
  const activeFilter = f.active
  const proxyFilter = f.proxy
  const platformFilter = f.platform
  const proxyTypeFilter = f.ptype
  // Rong = khong loc. Mac dinh chi hien account dang dung duoc. View khac "Tat ca" da tu gioi han
  // o account dang chay -> bo qua loc trang thai de so khop voi Tong quan.
  const statusApplies = f.view === 'all'
  const appealFilter = useMemo(() => new Set(statusApplies ? f.status : []), [f.status, statusApplies])

  const allAccounts = useMemo(() => accounts ?? [], [accounts])
  const attention = useMemo(() => accountsNeedingAttention(allAccounts), [allAccounts])
  const attentionIds = useMemo(() => new Set(attention.map((x) => x.account.id)), [attention])

  // ?new=1 (tu Ctrl+K) -> mo form them account roi bo param
  useEffect(() => {
    if (!f.new) return
    setEditing(null)
    setFormOpen(true)
    setF({ new: false }, { replace: true })
  }, [f.new, setF])
  // Chu de cua TAI KHOAN DANG (posting_account_topics) - khac chu de cua bai o cot duoi.
  const topicsById = useMemo(
    () => new Map((postingAccounts ?? []).map((a) => [a.id, a.topics])),
    [postingAccounts],
  )

  const { items, hidden } = useMemo(() => {
    const needle = search.trim().toLowerCase()
    // o: view / loc proxy / co ap loc trang thai khong - de dem lai so account bi an khi ra 0 dong
    const pass = (a: Account, o: { view: ViewId; proxy: typeof proxyFilter; status: boolean }) => {
      if (!inView(a, o.view, attentionIds)) return false
      if (needle) {
        const hay = `${a.name} ${a.device ?? ''} ${a.gmail ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      // banned=FALSE -> LIVE, banned=TRUE -> DIE (theo BannedBadge)
      if (bannedFilter === 'live' && a.banned) return false
      if (bannedFilter === 'die' && !a.banned) return false
      if (activeFilter === 'on' && a.active !== 1) return false
      if (activeFilter === 'off' && a.active === 1) return false
      if (o.proxy === 'none' && a.proxy) return false
      if (o.proxy === 'live' && a.proxy_status !== 'live') return false
      if (o.proxy === 'die' && a.proxy_status !== 'die') return false
      if (o.proxy === 'unchecked' && (!a.proxy || a.proxy_status)) return false
      if (platformFilter === 'none' && a.platform) return false
      if ((platformFilter === 'Stable' || platformFilter === 'Global') && a.platform !== platformFilter)
        return false
      if (proxyTypeFilter !== 'all') {
        if (proxyTypeFilter === 'none' ? !!a.proxy_type : a.proxy_type !== proxyTypeFilter)
          return false
      }
      if (o.status && appealFilter.size > 0 && !appealFilter.has(a.appeal_status || STATUS_NONE)) return false
      return true
    }
    const rows = allAccounts.filter((a) => pass(a, { view: f.view, proxy: proxyFilter, status: true }))

    // 0 dong nhung co account khop neu bo loc trang thai mac dinh (an account Die...) hoac view
    // "Proxy die" (chi tinh account dang chay) -> bao so bi an + cach hien, tranh tuong khong co.
    let hidden: { count: number; reason: string; show: Partial<typeof f> } | null = null
    if (rows.length === 0 && allAccounts.length > 0) {
      if (f.view === 'proxy-die') {
        const count = allAccounts.filter((a) => pass(a, { view: 'all', proxy: 'die', status: false })).length
        if (count > 0)
          hidden = {
            count,
            reason: 'có proxy die nhưng account đã Die hoặc đang tắt nên không nằm trong view này',
            show: { view: 'all', proxy: 'die', status: [] },
          }
      } else if (f.view === 'all' && appealFilter.size > 0) {
        const count = allAccounts.filter((a) => pass(a, { view: 'all', proxy: proxyFilter, status: false })).length
        if (count > 0)
          hidden = {
            count,
            reason: 'khớp bộ lọc nhưng đang bị ẩn do lọc Trạng thái (mặc định ẩn account Die, Chưa tạo nick…)',
            show: { status: [] },
          }
      }
    }

    if (f.sort === 'default') return { items: rows, hidden }
    const sign = f.dir === 'asc' ? 1 : -1
    const sorted = [...rows].sort((x, y) =>
      f.sort === 'name'
        ? sign * x.name.localeCompare(y.name, 'vi')
        : sign * (new Date(x.created_at).getTime() - new Date(y.created_at).getTime() || 0),
    )
    return { items: sorted, hidden }
  }, [
    allAccounts,
    attentionIds,
    f.view,
    f.sort,
    f.dir,
    search,
    bannedFilter,
    activeFilter,
    proxyFilter,
    platformFilter,
    proxyTypeFilter,
    appealFilter,
  ])

  const allChecked = items.length > 0 && items.every((a) => sel.has(a.id))
  const someChecked = items.some((a) => sel.has(a.id)) && !allChecked
  // Thao tac hang loat chi tren dong DANG HIEN; dong da chon nhung bi bo loc an thi bao ra.
  const visibleSel = items.filter((a) => sel.has(a.id))
  const visibleIds = visibleSel.map((a) => a.id)
  const hiddenSelCount = sel.size - visibleSel.length

  const viewCounts: Record<ViewId, number> = {
    all: allAccounts.length,
    attention: attention.length,
    'proxy-die': allAccounts.filter((a) => inView(a, 'proxy-die', attentionIds)).length,
    shadowban: allAccounts.filter((a) => inView(a, 'shadowban', attentionIds)).length,
  }
  const VIEW_LABEL: Record<ViewId, string> = {
    all: 'Tất cả',
    attention: 'Cần xử lý',
    'proxy-die': 'Proxy die',
    shadowban: 'Nghi shadowban',
  }

  const moreActive = [bannedFilter, activeFilter, proxyFilter, platformFilter, proxyTypeFilter].filter(
    (v) => v !== 'all',
  ).length
  const chipList: (FilterChip | false | '')[] = [
    search && { key: 'q', label: 'Tìm', value: `“${search}”`, onRemove: () => setF({ q: '' }) },
    bannedFilter !== 'all' && {
      key: 'banned',
      label: 'Banned',
      value: optLabel(BANNED_OPTS, bannedFilter),
      onRemove: () => setF({ banned: 'all' }),
    },
    activeFilter !== 'all' && {
      key: 'active',
      label: 'Active',
      value: optLabel(ACTIVE_OPTS, activeFilter),
      onRemove: () => setF({ active: 'all' }),
    },
    proxyFilter !== 'all' && {
      key: 'proxy',
      label: 'Proxy',
      value: optLabel(PROXY_OPTS, proxyFilter),
      onRemove: () => setF({ proxy: 'all' }),
    },
    platformFilter !== 'all' && {
      key: 'platform',
      label: 'Platform',
      value: optLabel(PLATFORM_OPTS, platformFilter),
      onRemove: () => setF({ platform: 'all' }),
    },
    proxyTypeFilter !== 'all' && {
      key: 'ptype',
      label: 'Loại proxy',
      value: optLabel(PTYPE_OPTS, proxyTypeFilter),
      onRemove: () => setF({ ptype: 'all' }),
    },
    statusApplies &&
      f.status.length > 0 && {
        key: 'status',
        label: 'Trạng thái',
        value: f.status.map((s) => (s === STATUS_NONE ? 'Chưa đặt' : s)).join(', '),
        onRemove: () => setF({ status: [] }),
      },
  ]
  const chips = chipList.filter((c): c is FilterChip => !!c)
  const clearAll = () =>
    setF({ q: '', status: [], banned: 'all', active: 'all', proxy: 'all', platform: 'all', ptype: 'all' })

  const onSort = (col: 'name' | 'created') => {
    if (f.sort !== col) setF({ sort: col, dir: col === 'created' ? 'desc' : 'asc' })
    else if ((f.dir === 'asc') === (col === 'name')) setF({ dir: col === 'name' ? 'desc' : 'asc' })
    else setF({ sort: 'default', dir: 'asc' })
  }

  const recheckMut = useMutation({
    mutationFn: async (proxy: string) => {
      const [result] = await checkProxies([proxy])
      await saveProxies([{ proxy: result.proxy, status: result.status, ip: result.ip }])
      return result
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['proxies'] })
      toast.success(`Proxy ${result.proxy}: ${result.status === 'live' ? 'Live' : 'Die'}`)
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Lỗi kiểm tra proxy'),
  })

  /**
   * Proxy ghi "Local" la proxy chay ngay tren may cua account do -> server khong the ket noi toi,
   * kiem tra chac chan ra Die va lam ban ket qua. Bo qua khi kiem tra.
   * 1 proxy co the dung chung nhieu account nen chi bo khi TAT CA account dung no deu la Local;
   * con 1 account khong phai Local thi proxy do van la proxy that, van phai kiem tra.
   */
  const localOnlyProxies = useMemo(() => {
    const byProxy = new Map<string, { total: number; local: number }>()
    for (const a of allAccounts) {
      const p = a.proxy?.trim()
      if (!p) continue
      const e = byProxy.get(p) ?? { total: 0, local: 0 }
      e.total++
      if (a.proxy_type === 'Local') e.local++
      byProxy.set(p, e)
    }
    return new Set(
      [...byProxy.entries()].filter(([, e]) => e.local === e.total).map(([proxy]) => proxy),
    )
  }, [allAccounts])

  const checkableProxies = (list: (string | null | undefined)[]) => [
    ...new Set(
      list
        .map((p) => p?.trim())
        .filter((p): p is string => !!p && !localOnlyProxies.has(p)),
    ),
  ]

  const allProxies = checkableProxies(allAccounts.map((a) => a.proxy))
  const skippedLocalAll = localOnlyProxies.size

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
    // Chu de dang (K trong file import) hien thi tu query rieng - thieu dong nay thi import
    // xong van thay chu de rong cho toi khi co thao tac khac vo tinh lam moi cache.
    qc.invalidateQueries({ queryKey: ['posting-accounts'] })
  }

  const toggle = (id: number) => {
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
      if (allChecked) items.forEach((a) => next.delete(a.id))
      else items.forEach((a) => next.add(a.id))
      return next
    })
  }

  const activeMut = useMutation({
    mutationFn: (v: { id: number; active: boolean }) => updateAccountActive(v.id, v.active),
    onSuccess: invalidate,
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Không đổi được Active'),
  })
  const activePending = (id: number) => activeMut.isPending && activeMut.variables?.id === id

  const delMut = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => {
      invalidate()
      toast.success('Đã xoá')
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Xoá không thành công'),
  })

  const [bulkDeleting, setBulkDeleting] = useState(false)
  const bulkDelete = async () => {
    const ids = visibleIds
    if (ids.length === 0 || bulkDeleting) return
    const ok = await confirmDialog({
      title: `Xoá ${ids.length} account?`,
      description:
        ids.length <= 3
          ? visibleSel.map((a) => a.name).join(', ')
          : `${visibleSel
              .slice(0, 3)
              .map((a) => a.name)
              .join(', ')} và ${ids.length - 3} account khác. Không hoàn tác được.`,
      confirmLabel: `Xoá ${ids.length} account`,
      destructive: true,
    })
    if (!ok) return
    setBulkDeleting(true)
    try {
      await deleteAccounts(ids)
      setSel(new Set())
      toast.success(`Đã xoá ${ids.length} account`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xoá không thành công')
    } finally {
      setBulkDeleting(false)
      invalidate()
    }
  }

  const [bulkStatusBusy, setBulkStatusBusy] = useState(false)
  const bulkSetStatus = async (status: AppealStatus) => {
    const targets = visibleSel
    if (targets.length === 0) return
    setBulkStatusBusy(true)
    let ok = 0
    const failed: string[] = []
    try {
      for (const a of targets) {
        try {
          // Giong luat import: "Die" <=> banned. Cot Banned da an khoi bang nen phai giu dong bo
          // o day, khong thi account doi tu Die sang Live van bi coi la banned ma khong ai thay.
          await updateAccount(a.id, { appeal_status: status, banned: status === 'Die' })
          ok++
        } catch {
          failed.push(a.name)
        }
      }
    } finally {
      setBulkStatusBusy(false)
      invalidate()
    }
    if (ok > 0) toast.success(`Đã đổi ${ok} account sang "${status}"`)
    if (failed.length > 0)
      toast.error(
        `Không đổi được ${failed.length} account: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}`,
      )
  }

  const selectedProxies = checkableProxies(visibleSel.map((a) => a.proxy))

  const selectedWithoutProxy = visibleSel.filter((a) => !a.proxy)

  const autoAssignProxies = async () => {
    const targets = selectedWithoutProxy
    if (targets.length === 0 || assigning) return

    // Proxy Live va chua bi account nao dung (tinh tren TOAN BO account, khong chi trang dang loc)
    // Account Die khong con dung proxy -> proxy chi con account Die gan = proxy ranh (khop kho proxy).
    const taken = new Set(
      allAccounts
        .filter((a) => a.appeal_status !== 'Die')
        .map((a) => a.proxy)
        .filter((p): p is string => !!p),
    )
    const pool = (proxiesData ?? []).filter((p) => p.status === 'live' && !taken.has(p.proxy))

    if (pool.length === 0) {
      toast.error('Không có proxy Live nào đang rảnh để gán')
      return
    }

    const n = Math.min(targets.length, pool.length)
    let ok = 0
    const failed: string[] = []
    setAssigning(true)
    try {
      for (let i = 0; i < n; i++) {
        try {
          await updateAccount(targets[i].id, { proxy: pool[i].proxy })
          ok++
        } catch {
          failed.push(targets[i].name)
        }
      }
    } finally {
      setAssigning(false)
    }
    setSel(new Set())
    invalidate()
    qc.invalidateQueries({ queryKey: ['proxies'] })
    if (failed.length > 0) toast.error(`Không gán được proxy cho: ${failed.slice(0, 5).join(', ')}`)
    if (ok === targets.length) toast.success(`Đã tự động gán proxy cho ${ok} account`)
    else if (ok > 0) toast.warning(`Đã gán ${ok}/${targets.length} account (không đủ proxy Live rảnh)`)
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (a: Account) => {
    setEditing(a)
    setFormOpen(true)
  }

  const pickImportFile = () => fileRef.current?.click()

  const runImport = async (file: File) => {
    if (importing) return
    setImporting(true)
    try {
      const r = await importAccounts(file)
      invalidate()
      setImportResult(r)
      toast.success(`Import xong: ${r.inserted} thêm mới, ${r.updated} cập nhật`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import lỗi')
    } finally {
      setImporting(false)
    }
  }

  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) runImport(file)
  }

  const confirmDelete = async (a: Account) => {
    const ok = await confirmDialog({
      title: `Xoá account "${a.name}"?`,
      description: 'Account, proxy gán kèm và chủ đề đăng của nó sẽ bị gỡ khỏi hệ thống.',
      confirmLabel: 'Xoá account',
      destructive: true,
    })
    if (ok) delMut.mutate(a.id)
  }
  // Ngay vo ly (vd 31/12/45997 do nhap sai) -> dash xam, gia tri goc trong tooltip
  const fmtDate = (a: Account) => {
    if (!a.created_at) return <span className="text-muted-foreground">—</span>
    const d = new Date(a.created_at)
    const iso = Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}`
    if (!saneYear(iso)) return <span title={a.created_at}>—</span>
    return d.toLocaleDateString('vi-VN')
  }
  const proxyCell = (a: Account) => (
    <ProxyCell
      proxy={a.proxy}
      status={a.proxy_status}
      checking={recheckMut.isPending && recheckMut.variables === a.proxy}
      onRecheck={(proxy) => recheckMut.mutate(proxy)}
    />
  )
  const shadowbanCell = (a: Account) => (
    <button
      type="button"
      onClick={() => setShadowbanAccount(a.name)}
      title={
        a.shadowban_checked_at
          ? `Check lúc ${new Date(a.shadowban_checked_at).toLocaleString('vi-VN')} - bấm xem chi tiết`
          : 'Bấm xem chi tiết'
      }
    >
      <ShadowbanBadge verdict={a.shadowban_verdict} />
    </button>
  )
  const topicsCell = (a: Account) => (
    <PostingTopicsCell
      accountId={a.id}
      topics={topicsById.get(a.id) ?? []}
      compact={2}
      onChanged={() => qc.invalidateQueries({ queryKey: ['posting-accounts'] })}
    />
  )
  const emptyState = (
    <EmptyState
      icon={Users}
      title={
        allAccounts.length === 0
          ? 'Chưa có account'
          : f.view !== 'all' && chips.length === 0
            ? `Không có account nào ${VIEW_LABEL[f.view].toLowerCase()}`
            : 'Không có account khớp bộ lọc'
      }
      description={
        allAccounts.length === 0
          ? 'Thêm account thủ công, import file Excel hoặc kéo file thả vào trang.'
          : hidden
            ? `${hidden.count} account ${hidden.reason}.`
            : chips.length > 0
              ? 'Thử bỏ bớt bộ lọc.'
              : undefined
      }
      action={
        hidden ? (
          <Button variant="outline" size="sm" onClick={() => setF(hidden.show)}>
            Hiện {hidden.count} account
          </Button>
        ) : chips.length > 0 ? (
          <Button variant="outline" size="sm" onClick={clearAll}>
            Xóa bộ lọc
          </Button>
        ) : undefined
      }
    />
  )

  return (
    <div className={cn('mx-auto max-w-8xl space-y-4 sm:space-y-6', sel.size > 0 ? 'pb-40 sm:pb-24' : 'pb-6')}>
      <PageHeader
        title="Accounts"
        description={
          attention.length > 0
            ? `${attention.length} account đang chạy cần xử lý · ${allAccounts.length} account trong kho`
            : 'Kho quản lý account Threads (profile, thiết bị, trạng thái ban, proxy...)'
        }
        primary={{ label: 'Thêm account', shortLabel: 'Thêm', icon: Plus, onClick: openCreate }}
        secondary={[
          { label: 'Đồng bộ GPM', icon: Plug, onClick: () => setGpmSyncOpen(true), title: 'Đồng bộ proxy GPM' },
          {
            label: 'Kiểm tra proxy',
            icon: RefreshCw,
            onClick: () => setRecheckAllOpen(true),
            disabled: allProxies.length === 0,
            title: 'Kiểm tra lại tất cả proxy',
          },
          { label: importing ? 'Đang import…' : 'Import Excel', icon: Upload, onClick: pickImportFile, busy: importing },
          { label: 'Xuất Excel', icon: Download, href: exportAccountsUrl },
        ]}
        extra={
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onImportFile} />
            <ImportHelp />
          </>
        }
      />

      <FileDropOverlay
        accept={['.xlsx', '.xls']}
        label="Thả file Excel để import account"
        onFiles={([file]) => runImport(file)}
        disabled={importing}
      />

      {importResult && (
        <ImportResultPanel
          summary={
            <>
              Lần import gần nhất: <b>{importResult.inserted}</b> thêm mới · <b>{importResult.updated}</b> cập nhật
              {importResult.skipped > 0 && <> · {importResult.skipped} dòng bỏ qua (thiếu Profile)</>}
            </>
          }
          errors={importResult.invalidValueDetails.map((c) => ({
            row: c.name,
            ref: `cột ${c.column}`,
            error: `không nhận giá trị “${c.value}” (để trống)`,
          }))}
          onDismiss={() => setImportResult(null)}
        />
      )}

      <SavedViews
        views={VIEW_IDS.map((id) => ({
          id,
          label: VIEW_LABEL[id],
          count: viewCounts[id],
          active: f.view === id,
          onSelect: () => setF({ view: id }),
        }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(v) => setF({ q: v }, { replace: true })}
          placeholder="Tìm Profile / thiết bị / gmail…"
        />
        {statusApplies && (
          <StatusCheckboxFilter
            selected={appealFilter}
            onChange={(next) => setF({ status: [...next] })}
            includeNone
          />
        )}
        <MultiFilterDropdown
          activeCount={moreActive}
          onClearAll={() => setF({ banned: 'all', active: 'all', proxy: 'all', platform: 'all', ptype: 'all' })}
          groups={[
            { type: 'radio', key: 'proxy', label: 'Proxy', value: proxyFilter, options: PROXY_OPTS, onChange: (v) => setF({ proxy: v as typeof proxyFilter }) },
            { type: 'radio', key: 'banned', label: 'Banned', value: bannedFilter, options: BANNED_OPTS, onChange: (v) => setF({ banned: v as typeof bannedFilter }) },
            { type: 'radio', key: 'active', label: 'Active', value: activeFilter, options: ACTIVE_OPTS, onChange: (v) => setF({ active: v as typeof activeFilter }) },
            { type: 'radio', key: 'platform', label: 'Platform', value: platformFilter, options: PLATFORM_OPTS, onChange: (v) => setF({ platform: v as typeof platformFilter }) },
            { type: 'radio', key: 'ptype', label: 'Loại proxy', value: proxyTypeFilter, options: PTYPE_OPTS, onChange: (v) => setF({ ptype: v }) },
          ]}
        />
        <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
          {items.length} / {allAccounts.length} account
        </span>
      </div>

      <FilterChips chips={chips} onClearAll={clearAll} />

      {/* Mobile: danh sach dang the */}
      <div className="space-y-2 md:hidden">
        {!isLoading && items.length > 0 && (
          <label className="flex items-center gap-2.5 px-1 py-1 text-xs font-medium text-muted-foreground">
            <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
            Chọn tất cả ({items.length})
          </label>
        )}
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="space-y-2 p-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </Card>
          ))}
        {!isLoading &&
          items.map((a) => (
            <Card
              key={a.id}
              className={cn(
                'p-3 transition-colors',
                sel.has(a.id) && 'border-chart-1/30 bg-chart-1/[0.06]',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <Checkbox checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AccountAvatar name={a.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.device || '—'} · {fmtDate(a)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <AppealBadge status={a.appeal_status} />
                      <Switch
                        checked={a.active === 1}
                        disabled={activePending(a.id)}
                        onCheckedChange={(v) => activeMut.mutate({ id: a.id, active: v })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <PlatformBadge platform={a.platform} />
                    {shadowbanCell(a)}
                    {proxyCell(a)}
                  </div>
                  {topicsCell(a)}
                </div>
              </div>
              <div className="mt-2 border-t pt-1">
                <RowActions
                  onEdit={() => openEdit(a)}
                  onClone={() => setCloningFrom(a)}
                  onDelete={() => confirmDelete(a)}
                />
              </div>
            </Card>
          ))}
        {!isLoading && items.length === 0 && <Card>{emptyState}</Card>}
      </div>

      {/* Desktop: bang voi header dinh tren cung */}
      <Card className="hidden overflow-hidden p-0 md:block">
        {/* Chieu cao co dinh theo man hinh: bang tu cuon ben trong, header dinh tren cung. */}
        <div className="table-scroll max-h-[calc(100dvh-16rem)] min-h-[20rem] overflow-y-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-2 py-2.5 text-left">
                  <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
                </th>
                <th className="px-2 py-2.5 text-left">
                  <SortHeader label="Profile · thiết bị" col="name" sort={f.sort} dir={f.dir} onSort={onSort} />
                </th>
                <th className="whitespace-nowrap px-2 py-2.5 text-left">
                  <SortHeader label="Ngày tạo" col="created" sort={f.sort} dir={f.dir} onSort={onSort} />
                </th>
                <th className="px-2 py-2.5 text-left">Proxy</th>
                <th className="whitespace-nowrap px-2 py-2.5 text-left">Platform</th>
                <th className="whitespace-nowrap px-2 py-2.5 text-left">Trạng thái</th>
                <th className="whitespace-nowrap px-2 py-2.5 text-left">Shadowban</th>
                <th className="px-2 py-2.5 text-left" title="Bấm vào ô để sửa chủ đề">
                  Chủ đề
                </th>
                <th className="px-2 py-2.5 text-center">Active</th>
                <th className="px-2 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-2 py-2.5" colSpan={COLSPAN}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading &&
                items.map((a: Account) => (
                  <tr
                    key={a.id}
                    className={cn(
                      'border-b border-rule last:border-0 hover:bg-accent/60',
                      sel.has(a.id) && 'bg-chart-1/[0.06] hover:bg-chart-1/[0.09]',
                    )}
                  >
                    <td className="px-2 py-2.5">
                      <Checkbox checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <AccountAvatar name={a.name} />
                        <div className="min-w-0">
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{a.device || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-xs tabular-nums text-muted-foreground">
                      {fmtDate(a)}
                    </td>
                    <td className="px-2 py-2.5">{proxyCell(a)}</td>
                    <td className="px-2 py-2.5">
                      <PlatformBadge platform={a.platform} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      <AppealBadge status={a.appeal_status} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">{shadowbanCell(a)}</td>
                    <td className="px-2 py-2.5">{topicsCell(a)}</td>
                    <td className="px-2 py-2.5 text-center">
                      <Switch
                        checked={a.active === 1}
                        disabled={activePending(a.id)}
                        onCheckedChange={(v) => activeMut.mutate({ id: a.id, active: v })}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <RowActions
                        onEdit={() => openEdit(a)}
                        onClone={() => setCloningFrom(a)}
                        onDelete={() => confirmDelete(a)}
                      />
                    </td>
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
      </Card>

      {sel.size > 0 && (
        <FloatingBar>
          <span className="px-2 text-sm tabular-nums">
            <span className="font-medium text-chart-1-ink">{visibleSel.length}</span> đã chọn
            {hiddenSelCount > 0 && (
              <span className="text-muted-foreground" title="Đã chọn nhưng đang bị bộ lọc ẩn - thao tác bên dưới bỏ qua các dòng này">
                {' '}
                ({hiddenSelCount} không hiển thị)
              </span>
            )}
          </span>
          {selectedWithoutProxy.length > 0 && (
            <Button size="sm" variant="outline" onClick={autoAssignProxies} disabled={assigning}>
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Tự động gán
              proxy ({selectedWithoutProxy.length})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAssignProxyOpen(true)} disabled={visibleSel.length === 0}>
            <Plug className="h-4 w-4" /> Gán proxy
          </Button>
          <BulkStatusButton busy={bulkStatusBusy || visibleSel.length === 0} onPick={bulkSetStatus} />
          <Button size="sm" variant="outline" onClick={() => setPostingTopicOpen(true)} disabled={visibleSel.length === 0}>
            <Tag className="h-4 w-4" /> Gán chủ đề đăng
          </Button>
          <Button size="sm" variant="outline" onClick={() => setProxyDialogOpen(true)} disabled={visibleSel.length === 0}>
            <ShieldCheck className="h-4 w-4" /> Kiểm tra proxy
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShadowbanOpen(true)} disabled={visibleSel.length === 0}>
            <EyeOff className="h-4 w-4" /> Check shadowban
          </Button>
          <Button size="sm" variant="outline" onClick={bulkDelete} disabled={visibleSel.length === 0 || bulkDeleting}>
            {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />} Xóa
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </FloatingBar>
      )}

      <AssignPostingTopicsDialog
        open={postingTopicOpen}
        accountIds={visibleIds}
        onClose={() => setPostingTopicOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['posting-accounts'] })}
      />

      {assignProxyOpen && (
        <AssignProxyDialog
          accounts={visibleSel}
          proxies={proxiesData ?? []}
          onClose={() => setAssignProxyOpen(false)}
          onDone={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['proxies'] })
          }}
        />
      )}

      <AccountFormDialog
        open={formOpen}
        account={editing}
        onClose={() => setFormOpen(false)}
        onSaved={invalidate}
      />

      <CloneAccountDialog
        open={!!cloningFrom}
        sourceAccount={cloningFrom}
        onClose={() => setCloningFrom(null)}
        onSaved={invalidate}
      />

      <AccountProxyCheckDialog
        open={proxyDialogOpen}
        proxies={selectedProxies}
        onClose={() => setProxyDialogOpen(false)}
      />

      <AccountProxyCheckDialog
        open={recheckAllOpen}
        proxies={allProxies}
        description={
          `${allProxies.length} proxy (đã bỏ trùng) trên toàn bộ account` +
          (skippedLocalAll ? ` · bỏ qua ${skippedLocalAll} proxy Local` : '')
        }
        onClose={() => setRecheckAllOpen(false)}
      />

      <GpmProxySyncDialog open={gpmSyncOpen} onClose={() => setGpmSyncOpen(false)} />

      <ShadowbanCheckDialog
        open={shadowbanOpen}
        accounts={visibleSel.map((a) => a.name)}
        onClose={() => setShadowbanOpen(false)}
      />

      <ShadowbanHistorySheet account={shadowbanAccount} onClose={() => setShadowbanAccount(null)} />
    </div>
  )
}
