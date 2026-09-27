import { useMemo, useRef, useState, type ChangeEvent } from 'react'
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
  Search,
  Wand2,
  Copy,
  CopyPlus,
  Tag,
  Plug,
  Info,
  CircleDot,
  Loader2,
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
  type AppealStatus,
} from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { AccountFormDialog } from '@/components/AccountFormDialog'
import { AccountProxyCheckDialog } from '@/components/AccountProxyCheckDialog'
import { AssignPostingTopicsDialog } from '@/components/AssignPostingTopicsDialog'
import { PostingTopicsCell } from '@/components/PostingTopicsCell'
import { CloneAccountDialog } from '@/components/CloneAccountDialog'
import { GpmProxySyncDialog } from '@/components/GpmProxySyncDialog'
import { StatusCheckboxFilter, STATUS_NONE } from '@/components/StatusCheckboxFilter'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const COLSPAN = 10

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
    <div className="flex items-center gap-1.5">
      <div className="space-y-0.5">
        <div className="max-w-[9rem] truncate text-xs text-muted-foreground">{proxy}</div>
        {status === 'live' ? (
          <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
            Live
          </span>
        ) : status === 'die' ? (
          <span className="inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
            Die
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Chưa kiểm tra
          </span>
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
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Copy className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => onRecheck(proxy)}
        disabled={checking}
        title="Kiểm tra lại proxy này"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn('h-3 w-3', checking && 'animate-spin')} />
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
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Info className="h-4 w-4" />
      </button>
      <PopoverPanel popover={popover} className="w-96 p-3 text-xs leading-relaxed">
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
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
          >
            <AppealBadge status={s} />
          </button>
        ))}
      </PopoverPanel>
    </>
  )
}

/** Mau theo muc do nghiem trong: Die (do) > Dang khang/ngam (vang) > Chua khang/tao (xam) > Thanh cong/Live (xanh). */
const APPEAL_CLASS: Record<string, string> = {
  'Kháng thành công': 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  Live: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  'Chưa kháng': 'bg-muted text-muted-foreground',
  'Chưa tạo nick': 'bg-muted text-muted-foreground',
  'Đang kháng': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  'Đang ngâm': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Die: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

function AppealBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
        APPEAL_CLASS[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {status}
    </span>
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
  const [sel, setSel] = useState<Set<number>>(new Set())

  const [search, setSearch] = useState('')
  const [bannedFilter, setBannedFilter] = useState<'all' | 'live' | 'die'>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'on' | 'off'>('all')
  const [proxyFilter, setProxyFilter] = useState<'all' | 'none' | 'live' | 'die' | 'unchecked'>(
    'all',
  )
  const [platformFilter, setPlatformFilter] = useState<'all' | 'Stable' | 'Global' | 'none'>('all')
  const [proxyTypeFilter, setProxyTypeFilter] = useState<string>('all')
  // Rong = khong loc. Mac dinh chi hien account dang dung duoc.
  const [appealFilter, setAppealFilter] = useState<Set<string>>(
    () => new Set(['Live', 'Kháng thành công', 'Chưa kháng']),
  )

  const allAccounts = accounts ?? []
  // Chu de cua TAI KHOAN DANG (posting_account_topics) - khac chu de cua bai o cot duoi.
  const topicsById = useMemo(
    () => new Map((postingAccounts ?? []).map((a) => [a.id, a.topics])),
    [postingAccounts],
  )

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allAccounts.filter((a) => {
      if (q) {
        const hay = `${a.name} ${a.device ?? ''} ${a.gmail ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      // banned=FALSE -> LIVE, banned=TRUE -> DIE (theo BannedBadge)
      if (bannedFilter === 'live' && a.banned) return false
      if (bannedFilter === 'die' && !a.banned) return false
      if (activeFilter === 'on' && a.active !== 1) return false
      if (activeFilter === 'off' && a.active === 1) return false
      if (proxyFilter === 'none' && a.proxy) return false
      if (proxyFilter === 'live' && a.proxy_status !== 'live') return false
      if (proxyFilter === 'die' && a.proxy_status !== 'die') return false
      if (proxyFilter === 'unchecked' && (!a.proxy || a.proxy_status)) return false
      if (platformFilter === 'none' && a.platform) return false
      if ((platformFilter === 'Stable' || platformFilter === 'Global') && a.platform !== platformFilter)
        return false
      if (proxyTypeFilter !== 'all') {
        if (proxyTypeFilter === 'none' ? !!a.proxy_type : a.proxy_type !== proxyTypeFilter)
          return false
      }
      if (appealFilter.size > 0 && !appealFilter.has(a.appeal_status || STATUS_NONE)) return false
      return true
    })
  }, [
    allAccounts,
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
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => {
      invalidate()
      toast.success('Đã xoá')
    },
  })

  const bulkDelete = async () => {
    const ids = [...sel]
    if (ids.length === 0) return
    if (!confirm(`Xoá ${ids.length} account đã chọn?`)) return
    await deleteAccounts(ids)
    setSel(new Set())
    invalidate()
    toast.success(`Đã xoá ${ids.length} account`)
  }

  const [bulkStatusBusy, setBulkStatusBusy] = useState(false)
  const bulkSetStatus = async (status: AppealStatus) => {
    const ids = [...sel]
    if (ids.length === 0) return
    setBulkStatusBusy(true)
    let ok = 0
    try {
      for (const id of ids) {
        try {
          // Giong luat import: "Die" <=> banned. Cot Banned da an khoi bang nen phai giu dong bo
          // o day, khong thi account doi tu Die sang Live van bi coi la banned ma khong ai thay.
          await updateAccount(id, { appeal_status: status, banned: status === 'Die' })
          ok++
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Lỗi đổi trạng thái')
        }
      }
    } finally {
      setBulkStatusBusy(false)
      invalidate()
    }
    if (ok > 0) toast.success(`Đã đổi ${ok} account sang "${status}"`)
  }

  const selectedProxies = checkableProxies(items.filter((a) => sel.has(a.id)).map((a) => a.proxy))

  const selectedWithoutProxy = items.filter((a) => sel.has(a.id) && !a.proxy)

  const autoAssignProxies = async () => {
    const targets = selectedWithoutProxy
    if (targets.length === 0) return

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
    for (let i = 0; i < n; i++) {
      try {
        await updateAccount(targets[i].id, { proxy: pool[i].proxy })
        ok++
      } catch (err) {
        toast.error(`"${targets[i].name}": ${err instanceof Error ? err.message : 'lỗi gán proxy'}`)
      }
    }
    setSel(new Set())
    invalidate()
    qc.invalidateQueries({ queryKey: ['proxies'] })
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

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const r = await importAccounts(file)
      invalidate()
      toast.success(
        `Import xong: ${r.inserted} thêm mới, ${r.updated} cập nhật` +
          (r.skipped ? `, ${r.skipped} dòng bỏ qua (thiếu Profile)` : '') +
          (r.invalidValues ? `, ${r.invalidValues} ô sai giá trị (để trống)` : ''),
      )
      for (const c of r.invalidValueDetails.slice(0, 5)) {
        toast.warning(`"${c.name}": cột ${c.column} không nhận giá trị "${c.value}"`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import lỗi')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-8xl space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Kho quản lý account Threads (profile, thiết bị, trạng thái ban, proxy...)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onImportFile}
          />
          <Button variant="outline" size="sm" onClick={() => setGpmSyncOpen(true)}>
            <Plug className="h-4 w-4" /> Đồng bộ proxy GPM
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRecheckAllOpen(true)}
            disabled={allProxies.length === 0}
          >
            <RefreshCw className="h-4 w-4" /> Kiểm tra lại tất cả proxy
          </Button>
          <div className="flex items-center">
            <Button variant="outline" size="sm" onClick={pickImportFile} disabled={importing}>
              <Upload className="h-4 w-4" /> {importing ? 'Đang import...' : 'Import Excel'}
            </Button>
            <ImportHelp />
          </div>
          <a href={exportAccountsUrl} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Download className="h-4 w-4" /> Xuất Excel
          </a>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Thêm account
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm Profile / thiết bị / gmail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <SingleFilterDropdown
          label="Banned"
          value={bannedFilter}
          onChange={setBannedFilter}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'live', label: 'Chỉ LIVE' },
            { value: 'die', label: 'Chỉ DIE' },
          ]}
        />
        <SingleFilterDropdown
          label="Active"
          value={activeFilter}
          onChange={setActiveFilter}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'on', label: 'Đang bật' },
            { value: 'off', label: 'Đang tắt' },
          ]}
        />
        <SingleFilterDropdown
          label="Proxy"
          value={proxyFilter}
          onChange={setProxyFilter}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'none', label: 'Chưa có proxy' },
            { value: 'live', label: 'Proxy Live' },
            { value: 'die', label: 'Proxy Die' },
            { value: 'unchecked', label: 'Có proxy, chưa kiểm tra' },
          ]}
        />
        <SingleFilterDropdown
          label="Platform"
          value={platformFilter}
          onChange={setPlatformFilter}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'Stable', label: 'Stable' },
            { value: 'Global', label: 'Global' },
            { value: 'none', label: 'Chưa đặt' },
          ]}
        />
        <SingleFilterDropdown
          label="Loại proxy"
          value={proxyTypeFilter}
          onChange={setProxyTypeFilter}
          options={[
            { value: 'all', label: 'Tất cả' },
            ...PROXY_TYPES.map((t) => ({ value: t, label: t })),
            { value: 'none', label: 'Chưa đặt' },
          ]}
        />
        <StatusCheckboxFilter selected={appealFilter} onChange={setAppealFilter} includeNone />
        <span className="text-xs text-muted-foreground">{items.length}/{allAccounts.length} account</span>
      </div>

      <Card className="overflow-hidden p-0">
        {/* Chieu cao co dinh theo man hinh: bang tu cuon ben trong, header dinh tren cung. */}
        <div className="max-h-[calc(100vh-16rem)] min-h-[20rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">
                  <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
                </th>
                <th className="p-2.5 text-left font-medium">Profile</th>
                <th className="p-2.5 text-left font-medium">Thiết bị</th>
                <th className="p-2.5 text-left font-medium">Ngày tạo</th>
                <th className="p-2.5 text-left font-medium">Proxy</th>
                <th className="p-2.5 text-center font-medium">Platform</th>
                <th className="p-2.5 text-center font-medium">Trạng thái</th>
                <th className="p-2.5 text-left font-medium" title="Bấm vào ô để sửa chủ đề">
                  Chủ đề
                </th>
                <th className="p-2.5 text-center font-medium">Active</th>
                <th className="p-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2.5" colSpan={COLSPAN}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading &&
                items.map((a: Account) => (
                  <tr
                    key={a.id}
                    className={cn(
                      'border-b last:border-0 hover:bg-muted/30',
                      sel.has(a.id) && 'bg-primary/5',
                    )}
                  >
                    <td className="p-2.5">
                      <Checkbox checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                    </td>
                    <td className="p-2.5 font-medium">{a.name}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{a.device || '—'}</td>
                    <td className="whitespace-nowrap p-2.5 text-xs text-muted-foreground">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td className="p-2.5">
                      <ProxyCell
                        proxy={a.proxy}
                        status={a.proxy_status}
                        checking={recheckMut.isPending && recheckMut.variables === a.proxy}
                        onRecheck={(proxy) => recheckMut.mutate(proxy)}
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      {a.platform ? (
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                            a.platform === 'Global'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {a.platform}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-2.5 text-center">
                      <AppealBadge status={a.appeal_status} />
                    </td>
                    <td className="p-2.5">
                      <PostingTopicsCell
                        accountId={a.id}
                        topics={topicsById.get(a.id) ?? []}
                        compact={2}
                        onChanged={() => qc.invalidateQueries({ queryKey: ['posting-accounts'] })}
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      <Switch
                        checked={a.active === 1}
                        onCheckedChange={(v) => activeMut.mutate({ id: a.id, active: v })}
                      />
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCloningFrom(a)}
                          aria-label="Clone account"
                          title="Clone account"
                        >
                          <CopyPlus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Xoá account "${a.name}"?`)) delMut.mutate(a.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={COLSPAN} className="p-0">
                    <EmptyState
                      icon={Users}
                      title={allAccounts.length === 0 ? 'Chưa có account' : 'Không có account khớp bộ lọc'}
                      description={
                        allAccounts.length === 0
                          ? 'Thêm account thủ công hoặc import từ file Excel.'
                          : 'Thử đổi từ khoá tìm kiếm hoặc bộ lọc.'
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-3 py-2 shadow-lg">
          <span className="px-2 text-sm font-medium">{sel.size} đã chọn</span>
          {selectedWithoutProxy.length > 0 && (
            <Button size="sm" variant="outline" onClick={autoAssignProxies}>
              <Wand2 className="h-4 w-4" /> Tự động gán proxy ({selectedWithoutProxy.length})
            </Button>
          )}
          <BulkStatusButton busy={bulkStatusBusy} onPick={bulkSetStatus} />
          <Button size="sm" variant="outline" onClick={() => setPostingTopicOpen(true)}>
            <Tag className="h-4 w-4" /> Gán chủ đề đăng
          </Button>
          <Button size="sm" variant="outline" onClick={() => setProxyDialogOpen(true)}>
            <ShieldCheck className="h-4 w-4" /> Kiểm tra proxy
          </Button>
          <Button size="sm" variant="outline" onClick={bulkDelete}>
            <Trash2 className="h-4 w-4 text-destructive" /> Xóa
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      <AssignPostingTopicsDialog
        open={postingTopicOpen}
        accountIds={[...sel]}
        onClose={() => setPostingTopicOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['posting-accounts'] })}
      />

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
    </div>
  )
}
