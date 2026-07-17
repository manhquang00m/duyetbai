import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Users,
  Upload,
  Pencil,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  ShieldCheck,
  RefreshCw,
  Search,
  Wand2,
  Copy,
} from 'lucide-react'
import {
  fetchAccounts,
  updateAccountActive,
  updateAccount,
  deleteAccount,
  deleteAccounts,
  importAccounts,
  checkProxies,
  saveProxies,
  fetchProxies,
  type Account,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { AccountFormDialog } from '@/components/AccountFormDialog'
import { AccountProxyCheckDialog } from '@/components/AccountProxyCheckDialog'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

const COLSPAN = 11

function MaskedCell({ value }: { value: string | null }) {
  const [show, setShow] = useState(false)
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="inline-flex items-center gap-1 text-xs hover:text-foreground"
      title={show ? 'Ẩn' : 'Hiện'}
    >
      <span className={cn('max-w-[8rem] truncate', !show && 'font-mono tracking-wider')}>
        {show ? value : '•'.repeat(Math.min(value.length, 10))}
      </span>
      {show ? <EyeOff className="h-3 w-3 shrink-0" /> : <Eye className="h-3 w-3 shrink-0" />}
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

/** banned=TRUE -> LIVE (xanh), banned=FALSE -> DIE (do). */
function BannedBadge({ banned }: { banned: number }) {
  if (!banned)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        <Wifi className="h-3 w-3" /> LIVE
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
      <WifiOff className="h-3 w-3" /> DIE
    </span>
  )
}

export function AccountsPage() {
  const qc = useQueryClient()
  const { data: accounts, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const { data: proxiesData } = useQuery({ queryKey: ['proxies'], queryFn: fetchProxies })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [proxyDialogOpen, setProxyDialogOpen] = useState(false)
  const [recheckAllOpen, setRecheckAllOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())

  const [search, setSearch] = useState('')
  const [bannedFilter, setBannedFilter] = useState<'all' | 'live' | 'die'>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'on' | 'off'>('all')
  const [proxyFilter, setProxyFilter] = useState<'all' | 'none' | 'live' | 'die' | 'unchecked'>(
    'all',
  )

  const allAccounts = accounts ?? []

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
      return true
    })
  }, [allAccounts, search, bannedFilter, activeFilter, proxyFilter])

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

  const allProxies = [
    ...new Set(allAccounts.map((a) => a.proxy?.trim()).filter((p): p is string => !!p)),
  ]

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
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

  const selectedProxies = [
    ...new Set(
      items
        .filter((a) => sel.has(a.id))
        .map((a) => a.proxy?.trim())
        .filter((p): p is string => !!p),
    ),
  ]

  const selectedWithoutProxy = items.filter((a) => sel.has(a.id) && !a.proxy)

  const autoAssignProxies = async () => {
    const targets = selectedWithoutProxy
    if (targets.length === 0) return

    // Proxy Live va chua bi account nao dung (tinh tren TOAN BO account, khong chi trang dang loc)
    const taken = new Set(allAccounts.map((a) => a.proxy).filter((p): p is string => !!p))
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
          (r.proxyConflicts
            ? `, ${r.proxyConflicts} dòng bỏ qua proxy (đã gán cho account khác)`
            : ''),
      )
      if (r.proxyConflicts) {
        for (const c of r.proxyConflictDetails.slice(0, 5)) {
          toast.warning(`"${c.name}": proxy ${c.proxy} đang thuộc "${c.heldBy}" — chưa gán`)
        }
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRecheckAllOpen(true)}
            disabled={allProxies.length === 0}
          >
            <RefreshCw className="h-4 w-4" /> Kiểm tra lại tất cả proxy
          </Button>
          <Button variant="outline" size="sm" onClick={pickImportFile} disabled={importing}>
            <Upload className="h-4 w-4" /> {importing ? 'Đang import...' : 'Import Excel'}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Thêm account
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        File import: cột A→H lần lượt là Profile, Thiết bị, Banned, Ngày tạo, Pass_Threads, Gmail,
        Password, Proxy (dòng 1 là header). Profile trùng sẽ được cập nhật đè.
      </p>

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
        <span className="text-xs text-muted-foreground">{items.length}/{allAccounts.length} account</span>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2.5 text-left font-medium">
                  <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
                </th>
                <th className="p-2.5 text-left font-medium">Profile</th>
                <th className="p-2.5 text-left font-medium">Thiết bị</th>
                <th className="p-2.5 text-center font-medium">Banned</th>
                <th className="p-2.5 text-left font-medium">Ngày tạo</th>
                <th className="p-2.5 text-left font-medium">Pass_Threads</th>
                <th className="p-2.5 text-left font-medium">Gmail</th>
                <th className="p-2.5 text-left font-medium">Password</th>
                <th className="p-2.5 text-left font-medium">Proxy</th>
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
                    <td className="p-2.5 text-center">
                      <BannedBadge banned={a.banned} />
                    </td>
                    <td className="whitespace-nowrap p-2.5 text-xs text-muted-foreground">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td className="p-2.5">
                      <MaskedCell value={a.pass_threads} />
                    </td>
                    <td className="p-2.5 text-xs text-muted-foreground">{a.gmail || '—'}</td>
                    <td className="p-2.5">
                      <MaskedCell value={a.gmail_password} />
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

      <AccountFormDialog
        open={formOpen}
        account={editing}
        onClose={() => setFormOpen(false)}
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
        description={`${allProxies.length} proxy (đã bỏ trùng) trên toàn bộ account`}
        onClose={() => setRecheckAllOpen(false)}
      />
    </div>
  )
}
