import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Play, Save, Trash2, RefreshCw, Search, Copy, Pencil, ServerOff } from 'lucide-react'
import {
  checkProxies,
  fetchProxies,
  saveProxies,
  deleteProxy,
  recheckProxy,
  PROXY_TYPES,
  type SaveProxyItem,
  type ProxyCheckResult,
  type ProxyType,
  type SavedProxy,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { ProxyEditDialog } from '@/components/ProxyEditDialog'
import { PageHeader } from '@/components/PageHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9'

const tabClass = (active: boolean) =>
  cn(
    'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:py-1.5',
    active ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent',
  )

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'live')
    return (
      <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        Live
      </span>
    )
  if (status === 'die')
    return (
      <span className="inline-flex shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
        Die
      </span>
    )
  return <span className="text-xs text-muted-foreground">—</span>
}

function AccountAssign({ p }: { p: SavedProxy }) {
  if (p.account_count === 0) return <span className="text-muted-foreground">Chưa gán</span>
  return (
    <div className="min-w-0 space-y-0.5">
      <span
        className={cn(
          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
          p.account_count > 1
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {p.account_count} account
      </span>
      <div className="truncate text-xs text-muted-foreground" title={p.account_names ?? undefined}>
        {p.account_names}
      </div>
    </div>
  )
}

interface ProxyActionsProps {
  isChecking: boolean
  onEdit: () => void
  onCopy: () => void
  onRecheck: () => void
  onDelete: () => void
}

function ProxyActions({ isChecking, onEdit, onCopy, onRecheck, onDelete }: ProxyActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit} title="Sửa proxy" aria-label="Sửa proxy">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onCopy} aria-label="Copy proxy">
        <Copy className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" disabled={isChecking} onClick={onRecheck} aria-label="Kiểm tra lại">
        <RefreshCw className={cn('h-4 w-4', isChecking && 'animate-spin')} />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Xoá">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  )
}

export function ProxyPage() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [results, setResults] = useState<ProxyCheckResult[]>([])
  // Loai proxy + ghi chu ap cho CA LO vua dan (nhap 1 lan thay vi go lai tung dong).
  const [importType, setImportType] = useState<ProxyType | ''>('')
  const [importNote, setImportNote] = useState('')
  const [editing, setEditing] = useState<SavedProxy | null>(null)

  const { data: saved, isLoading: savedLoading } = useQuery({
    queryKey: ['proxies'],
    queryFn: fetchProxies,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['proxies'] })

  // "Tất cả": xem/quan ly binh thuong (mac dinh Live). "Proxy Die": tab rieng de theo doi + kiem
  // tra lai dinh ky cac proxy Die - khong xoa di vi sau nay check lai co the da Live tro lai.
  const [savedTab, setSavedTab] = useState<'all' | 'die'>('all')
  const [savedSearch, setSavedSearch] = useState('')
  const [savedStatusFilter, setSavedStatusFilter] = useState<'all' | 'live' | 'die' | 'unchecked'>(
    'live',
  )
  const [assignFilter, setAssignFilter] = useState<'all' | 'assigned' | 'unassigned'>('all')
  const [sel, setSel] = useState<Set<number>>(new Set())

  const dieProxies = useMemo(() => (saved ?? []).filter((p) => p.status === 'die'), [saved])

  const filteredSaved = useMemo(() => {
    const q = savedSearch.trim().toLowerCase()
    const pool = savedTab === 'die' ? dieProxies : (saved ?? [])
    return pool.filter((p) => {
      if (savedTab === 'all') {
        if (savedStatusFilter === 'live' && p.status !== 'live') return false
        if (savedStatusFilter === 'die' && p.status !== 'die') return false
        if (savedStatusFilter === 'unchecked' && p.status) return false
      }
      if (assignFilter === 'assigned' && p.account_count === 0) return false
      if (assignFilter === 'unassigned' && p.account_count > 0) return false
      if (q) {
        const hay = `${p.proxy} ${p.account_names ?? ''} ${p.proxy_type ?? ''} ${p.note ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [saved, dieProxies, savedTab, savedSearch, savedStatusFilter, assignFilter])

  const checkMut = useMutation({
    mutationFn: (proxies: string[]) => checkProxies(proxies),
    onSuccess: (res) => {
      setResults(res)
      const live = res.filter((r) => r.status === 'live').length
      toast.success(`Xong: ${live} Live / ${res.length - live} Die`)
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi check'),
  })

  const saveMut = useMutation({
    mutationFn: (items: SaveProxyItem[]) => saveProxies(items),
    onSuccess: () => {
      invalidate()
      toast.success('Đã lưu')
    },
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteProxy(id),
    onSuccess: () => {
      invalidate()
      toast.success('Đã xoá')
    },
  })

  const recheckMut = useMutation({
    mutationFn: (id: number) => recheckProxy(id),
    onSuccess: invalidate,
  })

  // Kiem tra lai HANG LOAT toan bo proxy Die da luu - proxy thue thuong xoay IP nen Die hom nay
  // co the da Live tro lai, khong nen phai bam kiem tra lai tung dong 1.
  const recheckAllDieMut = useMutation({
    mutationFn: async () => {
      const targets = dieProxies.map((p) => p.proxy)
      const res = await checkProxies(targets)
      await saveProxies(res.map((r) => ({ proxy: r.proxy, status: r.status, ip: r.ip })))
      return res
    },
    onSuccess: (res) => {
      invalidate()
      const backToLive = res.filter((r) => r.status === 'live').length
      toast.success(
        backToLive > 0
          ? `Đã kiểm tra lại ${res.length} proxy Die — ${backToLive} proxy đã Live trở lại`
          : `Đã kiểm tra lại ${res.length} proxy Die — vẫn chưa proxy nào Live`,
      )
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi kiểm tra lại'),
  })

  // Xoa hang loat cac proxy da tich chon.
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => deleteProxy(id)))
    },
    onSuccess: (_data, ids) => {
      invalidate()
      setSel(new Set())
      toast.success(`Đã xoá ${ids.length} proxy`)
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi xoá proxy'),
  })

  // Kiem tra lai hang loat cac proxy da tich chon (khong phan biet Live/Die).
  const bulkRecheckMut = useMutation({
    mutationFn: async (targets: SavedProxy[]) => {
      const res = await checkProxies(targets.map((p) => p.proxy))
      await saveProxies(res.map((r) => ({ proxy: r.proxy, status: r.status, ip: r.ip })))
      return res
    },
    onSuccess: (res) => {
      invalidate()
      setSel(new Set())
      const live = res.filter((r) => r.status === 'live').length
      toast.success(`Đã kiểm tra lại ${res.length} proxy: ${live} Live / ${res.length - live} Die`)
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi kiểm tra lại'),
  })

  const toggleSel = (id: number) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelAll = () => {
    setSel((prev) => {
      const next = new Set(prev)
      if (filteredSaved.length > 0 && filteredSaved.every((p) => next.has(p.id))) {
        filteredSaved.forEach((p) => next.delete(p.id))
      } else {
        filteredSaved.forEach((p) => next.add(p.id))
      }
      return next
    })
  }

  const copyText = (value: string, successMsg: string) => {
    navigator.clipboard.writeText(value).then(
      () => toast.success(successMsg),
      () => toast.error('Không copy được'),
    )
  }

  const copyAllSaved = () => {
    const list = sel.size > 0 ? (saved ?? []).filter((p) => sel.has(p.id)) : filteredSaved
    if (list.length === 0) {
      toast.error('Không có proxy nào để copy')
      return
    }
    copyText(list.map((p) => p.proxy).join('\n'), `Đã copy ${list.length} proxy`)
  }

  const runCheck = () => {
    const proxies = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (proxies.length === 0) {
      toast.error('Nhập ít nhất 1 proxy')
      return
    }
    checkMut.mutate(proxies)
  }

  // Luu TOAN BO ket qua da kiem tra (ca Live lan Die) - proxy Die khong bi bo/xoa vi sau nay kiem
  // tra lai co the da Live tro lai (xem tab "Proxy Die" ben duoi).
  const saveAllChecked = () => {
    const items = results.map((r) => ({
      proxy: r.proxy,
      status: r.status,
      ip: r.ip,
      proxy_type: importType || null,
      note: importNote.trim() || null,
    }))
    if (items.length === 0) {
      toast.error('Không có proxy để lưu')
      return
    }
    saveMut.mutate(items)
  }

  const allSelected = filteredSaved.length > 0 && filteredSaved.every((p) => sel.has(p.id))
  const someSelected = filteredSaved.some((p) => sel.has(p.id)) && !allSelected
  const emptyText = (saved ?? []).length === 0 ? 'Chưa lưu proxy nào.' : 'Không có proxy khớp bộ lọc.'

  return (
    <div className={cn('mx-auto max-w-6xl space-y-5 sm:space-y-6', sel.size > 0 && 'pb-24')}>
      <PageHeader
        title="Proxy"
        description={
          <>
            Nhập <code className="rounded bg-muted px-1">ip:port:username:password</code> (mỗi dòng 1
            proxy), kiểm tra Live/Die rồi lưu.
          </>
        }
      />

      <Textarea
        placeholder="1.2.3.4:8080:user:pass&#10;5.6.7.8:9090:user:pass"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={checkMut.isPending}
        className="font-mono"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Loại proxy (áp cho cả lô vừa dán)
          </label>
          <select
            className={SELECT_CLS}
            value={importType}
            onChange={(e) => setImportType(e.target.value as ProxyType | '')}
          >
            <option value="">— Không đặt —</option>
            {PROXY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Ghi chú (áp cho cả lô)
          </label>
          <Input
            value={importNote}
            onChange={(e) => setImportNote(e.target.value)}
            placeholder="vd: mua ngày 20/09, hạn 1 tháng"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={runCheck} disabled={checkMut.isPending} className="flex-1 sm:flex-none">
          {checkMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Kiểm tra
        </Button>
        {results.length > 0 && (
          <Button
            variant="outline"
            onClick={saveAllChecked}
            disabled={saveMut.isPending}
            className="flex-1 sm:flex-none"
          >
            <Save className="h-4 w-4" /> Lưu tất cả kết quả
          </Button>
        )}
      </div>

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="table-scroll max-h-[50dvh] overflow-y-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-medium">Proxy</th>
                  <th className="p-3 text-left font-medium">Trạng thái</th>
                  <th className="p-3 text-left font-medium">Exit IP</th>
                  <th className="p-3 text-right font-medium">ms</th>
                  <th className="p-3 text-center font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="max-w-xs truncate p-3 font-mono text-xs" title={r.proxy}>
                      {r.proxy}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="max-w-[14rem] truncate p-3 text-muted-foreground">
                      {r.ip ?? r.error ?? '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {r.ms ?? '—'}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Lưu proxy"
                        onClick={() =>
                          saveMut.mutate([{ proxy: r.proxy, status: r.status, ip: r.ip }])
                        }
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex w-full gap-0.5 rounded-lg border bg-muted/40 p-0.5 sm:w-fit">
        <button type="button" onClick={() => setSavedTab('all')} className={tabClass(savedTab === 'all')}>
          Proxy đã lưu
        </button>
        <button type="button" onClick={() => setSavedTab('die')} className={tabClass(savedTab === 'die')}>
          Proxy Die{dieProxies.length > 0 ? ` (${dieProxies.length})` : ''}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="space-y-2 border-b px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold">
              {savedTab === 'die' ? 'Proxy Die' : 'Proxy đã lưu'}{' '}
              <span className="font-normal tabular-nums text-muted-foreground">
                ({filteredSaved.length}/{savedTab === 'die' ? dieProxies.length : (saved?.length ?? 0)})
              </span>
            </h2>
            {savedTab === 'die' && dieProxies.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => recheckAllDieMut.mutate()}
                disabled={recheckAllDieMut.isPending}
              >
                <RefreshCw className={cn('h-4 w-4', recheckAllDieMut.isPending && 'animate-spin')} />
                Kiểm tra lại tất cả
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={copyAllSaved}>
              <Copy className="h-4 w-4" /> {sel.size > 0 ? `Copy đã chọn (${sel.size})` : 'Copy tất cả'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm proxy / account"
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            {savedTab === 'all' && (
              <SingleFilterDropdown
                label="Trạng thái"
                value={savedStatusFilter}
                onChange={setSavedStatusFilter}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'live', label: 'Live' },
                  { value: 'die', label: 'Die' },
                  { value: 'unchecked', label: 'Chưa kiểm tra' },
                ]}
              />
            )}
            <SingleFilterDropdown
              label="Gán account"
              value={assignFilter}
              onChange={setAssignFilter}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'assigned', label: 'Đã gán' },
                { value: 'unassigned', label: 'Chưa gán' },
              ]}
            />
          </div>
        </div>

        {savedLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredSaved.length === 0 ? (
          <EmptyState icon={ServerOff} title={emptyText} />
        ) : (
          <>
            <div className="md:hidden">
              <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleSelAll} />
                Chọn tất cả
              </div>
              <ul className="divide-y">
                {filteredSaved.map((p) => {
                  const isChecking = recheckMut.isPending && recheckMut.variables === p.id
                  return (
                    <li key={p.id} className={cn('flex gap-3 p-3', sel.has(p.id) && 'bg-primary/5')}>
                      <Checkbox
                        className="mt-1"
                        checked={sel.has(p.id)}
                        onCheckedChange={() => toggleSel(p.id)}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-all font-mono text-xs">{p.proxy}</span>
                          <StatusBadge status={p.status} />
                        </div>
                        {(p.ip || p.proxy_type) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {p.ip && <span>IP: {p.ip}</span>}
                            {p.proxy_type && <span>{p.proxy_type}</span>}
                          </div>
                        )}
                        {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                        <div className="text-sm">
                          <AccountAssign p={p} />
                        </div>
                        <div className="-ml-2.5">
                          <ProxyActions
                            isChecking={isChecking}
                            onEdit={() => setEditing(p)}
                            onCopy={() => copyText(p.proxy, 'Đã copy proxy')}
                            onRecheck={() => recheckMut.mutate(p.id)}
                            onDelete={() => delMut.mutate(p.id)}
                          />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="table-scroll hidden max-h-[calc(100dvh-20rem)] min-h-[16rem] overflow-y-auto md:block">
              <table className="w-full min-w-[60rem] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">
                      <Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleSelAll} />
                    </th>
                    <th className="p-3 text-left font-medium">Proxy</th>
                    <th className="p-3 text-left font-medium">Trạng thái</th>
                    <th className="p-3 text-left font-medium">Exit IP</th>
                    <th className="p-3 text-left font-medium">Loại proxy</th>
                    <th className="p-3 text-left font-medium">Ghi chú</th>
                    <th className="p-3 text-left font-medium">Account đang dùng</th>
                    <th className="p-3 text-center font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSaved.map((p: SavedProxy) => {
                    const isChecking = recheckMut.isPending && recheckMut.variables === p.id
                    return (
                      <tr key={p.id} className={cn('border-b last:border-0', sel.has(p.id) && 'bg-primary/5')}>
                        <td className="p-3">
                          <Checkbox checked={sel.has(p.id)} onCheckedChange={() => toggleSel(p.id)} />
                        </td>
                        <td className="max-w-xs truncate p-3 font-mono text-xs" title={p.proxy}>
                          {p.proxy}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="p-3 text-muted-foreground">{p.ip ?? '—'}</td>
                        <td className="max-w-[11rem] p-3 text-xs text-muted-foreground">
                          <span className="block truncate" title={p.proxy_type ?? undefined}>
                            {p.proxy_type || '—'}
                          </span>
                        </td>
                        <td className="max-w-[12rem] p-3 text-xs text-muted-foreground">
                          <span className="block truncate" title={p.note ?? undefined}>
                            {p.note || '—'}
                          </span>
                        </td>
                        <td className="max-w-[18rem] p-3">
                          <AccountAssign p={p} />
                        </td>
                        <td className="p-3">
                          <div className="flex justify-center">
                            <ProxyActions
                              isChecking={isChecking}
                              onEdit={() => setEditing(p)}
                              onCopy={() => copyText(p.proxy, 'Đã copy proxy')}
                              onRecheck={() => recheckMut.mutate(p.id)}
                              onDelete={() => delMut.mutate(p.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {sel.size > 0 && (
        <FloatingBar>
          <span className="px-2 text-sm font-medium tabular-nums">{sel.size} đã chọn</span>
          <Button size="sm" variant="outline" onClick={copyAllSaved}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkRecheckMut.mutate((saved ?? []).filter((p) => sel.has(p.id)))}
            disabled={bulkRecheckMut.isPending}
          >
            <RefreshCw className={cn('h-4 w-4', bulkRecheckMut.isPending && 'animate-spin')} />
            Re-check
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm(`Xoá ${sel.size} proxy đã chọn?`)) bulkDeleteMut.mutate([...sel])
            }}
            disabled={bulkDeleteMut.isPending}
          >
            <Trash2 className="h-4 w-4 text-destructive" /> Xóa
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </FloatingBar>
      )}
      <ProxyEditDialog proxy={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
    </div>
  )
}
