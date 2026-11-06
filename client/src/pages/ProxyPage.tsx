import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Play, Save, Trash2, RefreshCw, Copy, Pencil, ServerOff } from 'lucide-react'
import {
  checkProxies,
  fetchProxies,
  saveProxies,
  deleteProxy,
  recheckProxy,
  startProxyCheckJob,
  batchStreamUrl,
  PROXY_TYPES,
  type JobState,
  type SaveProxyItem,
  type ProxyType,
  type SavedProxy,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { Field } from '@/components/ui/field'
import { ProxyEditDialog } from '@/components/ProxyEditDialog'
import { PageHeader } from '@/components/PageHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { EmptyState } from '@/components/EmptyState'
import { BulkPasteField } from '@/components/BulkPasteField'
import { SearchInput } from '@/components/filters/SearchInput'
import { FilterChips, type FilterChip } from '@/components/filters/FilterChips'
import { SavedViews } from '@/components/filters/SavedViews'
import { cn } from '@/lib/utils'
import { q, useUrlState } from '@/lib/useUrlState'
import { maskProxy, parseProxies, proxyKey } from '@/lib/parsers'
import { confirmDialog, undoable } from '@/lib/confirm'

/*
 * Bo loc tren URL. tab=die mo thang tab Proxy Die (link tu Ctrl+K). Tab "Proxy da luu" mac dinh chi
 * hien proxy Live (Die co tab rieng) - mac dinh do khong tinh la "dang loc".
 */
const FILTERS = {
  tab: q.enum(['all', 'die'] as const, 'all'),
  q: q.str(),
  status: q.enum(['live', 'all', 'die', 'unchecked'] as const, 'live'),
  assigned: q.enum(['all', 'assigned', 'unassigned'] as const, 'all'),
}
const STATUS_OPTS = [
  { value: 'live' as const, label: 'Live' },
  { value: 'all' as const, label: 'Tất cả' },
  { value: 'die' as const, label: 'Die' },
  { value: 'unchecked' as const, label: 'Chưa kiểm tra' },
]
const ASSIGN_OPTS = [
  { value: 'all' as const, label: 'Tất cả' },
  { value: 'assigned' as const, label: 'Đã gán' },
  { value: 'unassigned' as const, label: 'Chưa gán' },
]

interface CheckRow {
  proxy: string
  status: 'live' | 'die'
  ip?: string
  ms?: number
  error?: string
}

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9'

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'live') return <span className="whitespace-nowrap text-xs text-muted-foreground">Live</span>
  if (status === 'die')
    return (
      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-pill-negative px-2 py-0.5 text-[11px] font-medium text-pill-negative-ink">
        Die
      </span>
    )
  return <span className="text-xs text-muted-foreground">—</span>
}

function AccountAssign({ p }: { p: SavedProxy }) {
  if (p.account_count === 0) return <span className="text-xs text-muted-foreground">Chưa gán</span>
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="truncate text-sm" title={p.account_names ?? undefined}>
        {p.account_names}
      </div>
      {p.account_count > 1 && (
        <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-pill-warning px-2 py-0.5 text-[11px] font-medium tabular-nums text-pill-warning-ink">
          {p.account_count} account dùng chung
        </span>
      )}
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
  // Chuoi proxy co user/pass -> KHONG luu nhap vao localStorage.
  const [text, setText] = useState('')
  const [job, setJob] = useState<JobState | null>(null)
  const [checking, setChecking] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  // Loai proxy + ghi chu ap cho CA LO vua dan (nhap 1 lan thay vi go lai tung dong).
  const [importType, setImportType] = useState<ProxyType | ''>('')
  const [importNote, setImportNote] = useState('')
  const [editing, setEditing] = useState<SavedProxy | null>(null)

  const { data: saved, isLoading: savedLoading } = useQuery({
    queryKey: ['proxies'],
    queryFn: fetchProxies,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['proxies'] })

  // "Proxy da luu": xem/quan ly binh thuong (mac dinh Live). "Proxy Die": tab rieng de theo doi +
  // kiem tra lai dinh ky cac proxy Die - khong xoa di vi sau nay check lai co the da Live tro lai.
  const { values: f, set: setF } = useUrlState(FILTERS)
  const savedTab = f.tab
  const savedSearch = f.q
  const savedStatusFilter = f.status
  const assignFilter = f.assigned
  const [sel, setSel] = useState<Set<number>>(new Set())

  const existingKeys = useMemo(() => new Set((saved ?? []).map((p) => proxyKey(p.proxy))), [saved])
  const parsed = useMemo(() => parseProxies(text, existingKeys), [text, existingKeys])

  useEffect(() => () => esRef.current?.close(), [])

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

  const results: CheckRow[] = (job?.items ?? []).map((it) => ({
    proxy: it.url,
    status: it.ok ? 'live' : 'die',
    ip: it.ip,
    ms: it.ms,
    error: it.error,
  }))
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  // Ap loai proxy + ghi chu cua lo cho cac proxy vua kiem tra (job da luu status/ip).
  const batchMeta = () => ({ proxy_type: importType || null, note: importNote.trim() || null })
  const saveMut = useMutation({
    mutationFn: (items: SaveProxyItem[]) => saveProxies(items),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lưu proxy không thành công'),
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteProxy(id),
    onSettled: invalidate,
  })

  const recheckMut = useMutation({
    mutationFn: (id: number) => recheckProxy(id),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi kiểm tra lại'),
  })

  /** Xoa 1 proxy: an ngay, 5 giay de Hoan tac roi moi goi server. */
  const deleteOne = (p: SavedProxy) => {
    const snapshot = qc.getQueryData<SavedProxy[]>(['proxies'])
    qc.cancelQueries({ queryKey: ['proxies'] })
    qc.setQueryData<SavedProxy[]>(['proxies'], (old) => (old ?? []).filter((x) => x.id !== p.id))
    setSel((prev) => {
      if (!prev.has(p.id)) return prev
      const next = new Set(prev)
      next.delete(p.id)
      return next
    })
    undoable({
      message: `Đã xoá proxy ${maskProxy(p.proxy)}` + (p.account_count ? ` (${p.account_count} account đang dùng)` : ''),
      run: () => delMut.mutateAsync(p.id),
      onUndo: () => qc.setQueryData(['proxies'], snapshot),
    })
  }

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

  const visibleSel = filteredSaved.filter((p) => sel.has(p.id))
  const hiddenSelCount = sel.size - visibleSel.length

  const copyAllSaved = () => {
    const list = sel.size > 0 ? visibleSel : filteredSaved
    if (list.length === 0) {
      toast.error('Không có proxy nào để copy')
      return
    }
    copyText(list.map((p) => p.proxy).join('\n'), `Đã copy ${list.length} proxy`)
  }

  /**
   * Kiem tra + luu 1 buoc qua job nen (SSE, co tien do). Server luu thang ket qua (ca Live lan Die)
   * vao kho - proxy Die khong bi bo vi sau nay kiem tra lai co the Live tro lai (tab "Proxy Die").
   * Xong thi ap loai proxy + ghi chu cua lo, xoa o dan.
   */
  const runCheck = () => {
    if (checking) return
    const proxies = parsed.values
    if (proxies.length === 0) {
      toast.error(
        parsed.lines.length === 0
          ? 'Nhập ít nhất 1 proxy'
          : 'Không có proxy mới hợp lệ để kiểm tra (xem dòng lỗi / đã có)',
      )
      return
    }
    esRef.current?.close()
    setJob(null)
    setChecking(true)
    const meta = batchMeta()
    startProxyCheckJob(proxies)
      .then(({ jobId }) => {
        const es = new EventSource(batchStreamUrl(jobId))
        esRef.current = es
        es.onmessage = async (e) => {
          const d = JSON.parse(e.data) as { type: string; job: JobState }
          setJob(d.job)
          if (d.type !== 'end') return
          es.close()
          esRef.current = null
          const items = d.job.items
          try {
            if (items.length > 0 && (meta.proxy_type || meta.note))
              await saveProxies(items.map((it) => ({ proxy: it.url, ...meta })))
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Không áp được loại proxy / ghi chú')
          }
          setChecking(false)
          invalidate()
          qc.invalidateQueries({ queryKey: ['accounts'] })
          if (d.job.status === 'error') {
            toast.error(d.job.error ?? 'Lỗi kiểm tra proxy')
            return
          }
          const live = items.filter((it) => it.ok).length
          toast.success(`Đã kiểm tra & lưu ${items.length} proxy: ${live} Live / ${items.length - live} Die`)
          setText('')
        }
        es.onerror = () => {
          es.close()
          esRef.current = null
          setChecking(false)
          toast.error('Mất kết nối tới tiến trình kiểm tra')
        }
      })
      .catch((err) => {
        setChecking(false)
        toast.error(err instanceof Error ? err.message : 'Lỗi kiểm tra proxy')
      })
  }

  // Doi loai / ghi chu sau khi da kiem tra -> ap lai cho ca lo vua kiem tra.
  const reapplyMeta = () => {
    if (results.length === 0) return
    const meta = batchMeta()
    saveMut.mutate(
      results.map((r) => ({ proxy: r.proxy, ...meta })),
      { onSuccess: () => toast.success(`Đã cập nhật loại & ghi chú cho ${results.length} proxy`) },
    )
  }

  const statusLabel = STATUS_OPTS.find((o) => o.value === savedStatusFilter)?.label
  const chipList: (FilterChip | false)[] = [
    !!savedSearch && { key: 'q', label: 'Tìm', value: `“${savedSearch}”`, onRemove: () => setF({ q: '' }) },
    savedTab === 'all' &&
      savedStatusFilter !== 'live' && {
        key: 'status',
        label: 'Trạng thái',
        value: statusLabel,
        onRemove: () => setF({ status: 'live' }),
      },
    assignFilter !== 'all' && {
      key: 'assigned',
      label: 'Gán account',
      value: ASSIGN_OPTS.find((o) => o.value === assignFilter)?.label,
      onRemove: () => setF({ assigned: 'all' }),
    },
  ]
  const chips = chipList.filter((c): c is FilterChip => !!c)
  const clearAll = () => setF({ q: '', status: 'live', assigned: 'all' })

  const allSelected = filteredSaved.length > 0 && filteredSaved.every((p) => sel.has(p.id))
  const someSelected = filteredSaved.some((p) => sel.has(p.id)) && !allSelected
  const emptyText =
    (saved ?? []).length === 0
      ? 'Chưa lưu proxy nào.'
      : savedTab === 'die' && dieProxies.length === 0
        ? 'Không có proxy Die nào.'
        : 'Không có proxy khớp bộ lọc.'

  return (
    <div className={cn('mx-auto max-w-6xl space-y-5 sm:space-y-6', sel.size > 0 && 'pb-24')}>
      <PageHeader
        title="Proxy"
        description="Dán proxy mỗi dòng 1 cái — nhận ip:port, ip:port:user:pass, user:pass@ip:port hoặc http(s)/socks5://… — kiểm tra Live/Die và lưu vào kho."
      />

      <BulkPasteField
        id="proxy-paste"
        value={text}
        onChange={setText}
        result={parsed}
        onSubmit={runCheck}
        noun="proxy"
        formatRaw={maskProxy}
        rows={5}
        disabled={checking}
        placeholder={'1.2.3.4:8080:user:pass\n5.6.7.8:9090'}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Loại proxy" hint="Áp cho cả lô vừa dán">
          {(fp) => (
            <select
              {...fp}
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
          )}
        </Field>
        <Field label="Ghi chú" hint="Áp cho cả lô">
          {(fp) => (
            <Input
              {...fp}
              value={importNote}
              onChange={(e) => setImportNote(e.target.value)}
              placeholder="vd: mua ngày 20/09, hạn 1 tháng"
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={runCheck} disabled={checking || parsed.values.length === 0} className="flex-1 sm:flex-none">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {parsed.values.length > 0 ? `Kiểm tra & lưu ${parsed.values.length} proxy` : 'Kiểm tra & lưu'}
        </Button>
        {results.length > 0 && !checking && (
          <Button
            variant="outline"
            onClick={reapplyMeta}
            disabled={saveMut.isPending}
            className="flex-1 sm:flex-none"
            title="Đổi loại proxy / ghi chú ở trên rồi bấm để áp lại cho lô vừa kiểm tra"
          >
            <Save className="h-4 w-4" /> Áp loại & ghi chú cho {results.length} proxy vừa kiểm tra
          </Button>
        )}
      </div>

      {job && (checking || job.total > 0) && (
        <div className="space-y-1" aria-live="polite">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-chart-1 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {job.done}/{job.total} proxy · {results.filter((r) => r.status === 'live').length} Live
            {checking ? ' · đang kiểm tra…' : ' · đã lưu vào kho'}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="table-scroll max-h-[50dvh] overflow-y-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Proxy</th>
                  <th className="whitespace-nowrap p-3 text-left">Trạng thái</th>
                  <th className="p-3 text-left">Exit IP</th>
                  <th className="p-3 text-right">ms</th>
                  <th className="p-3 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-rule last:border-0">
                    <td className="max-w-xs truncate p-3 text-xs tabular-nums" title={maskProxy(r.proxy)}>
                      {maskProxy(r.proxy)}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="max-w-[14rem] truncate p-3 tabular-nums text-muted-foreground">
                      {r.ip ?? r.error ?? '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {r.ms ?? '—'}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Lưu lại kèm loại & ghi chú của lô"
                        title="Lưu lại kèm loại & ghi chú của lô"
                        onClick={() =>
                          saveMut.mutate([{ proxy: r.proxy, status: r.status, ip: r.ip, ...batchMeta() }], {
                            onSuccess: () => toast.success('Đã lưu'),
                          })
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

      <SavedViews
        views={[
          { id: 'all', label: 'Proxy đã lưu', count: saved?.length, active: savedTab === 'all', onSelect: () => setF({ tab: 'all' }) },
          { id: 'die', label: 'Proxy Die', count: dieProxies.length, active: savedTab === 'die', onSelect: () => setF({ tab: 'die' }) },
        ]}
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="space-y-2 border-b px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-base font-medium">
              {savedTab === 'die' ? 'Proxy Die' : savedStatusFilter === 'live' ? 'Proxy Live' : 'Proxy đã lưu'}{' '}
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
              <Copy className="h-4 w-4" /> {sel.size > 0 ? `Copy đã chọn (${visibleSel.length})` : 'Copy tất cả'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={savedSearch}
              onChange={(v) => setF({ q: v }, { replace: true })}
              placeholder="Tìm proxy / account / ghi chú…"
            />
            {savedTab === 'all' && (
              <SingleFilterDropdown
                label="Trạng thái"
                value={savedStatusFilter}
                onChange={(v) => setF({ status: v })}
                options={STATUS_OPTS}
                activeWhen="live"
              />
            )}
            <SingleFilterDropdown
              label="Gán account"
              value={assignFilter}
              onChange={(v) => setF({ assigned: v })}
              options={ASSIGN_OPTS}
            />
          </div>
          <FilterChips chips={chips} onClearAll={clearAll} />
        </div>

        {savedLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredSaved.length === 0 ? (
          <EmptyState
            icon={ServerOff}
            title={emptyText}
            action={
              chips.length > 0 ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Xóa bộ lọc
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="md:hidden">
              <div className="flex items-center gap-3 border-b px-3 py-2 text-xs text-muted-foreground">
                <Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleSelAll} />
                Chọn tất cả
              </div>
              <ul className="divide-y">
                {filteredSaved.map((p) => {
                  const isChecking = recheckMut.isPending && recheckMut.variables === p.id
                  return (
                    <li key={p.id} className={cn('flex gap-3 p-3', sel.has(p.id) && 'bg-chart-1/[0.06]')}>
                      <Checkbox
                        className="mt-1"
                        checked={sel.has(p.id)}
                        onCheckedChange={() => toggleSel(p.id)}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-all text-xs tabular-nums">{maskProxy(p.proxy)}</span>
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
                            onDelete={() => deleteOne(p)}
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
                <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">
                      <Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleSelAll} />
                    </th>
                    <th className="p-3 text-left">Proxy</th>
                    <th className="whitespace-nowrap p-3 text-left">Trạng thái</th>
                    <th className="p-3 text-left">Exit IP</th>
                    <th className="whitespace-nowrap p-3 text-left">Loại proxy</th>
                    <th className="p-3 text-left">Ghi chú</th>
                    <th className="whitespace-nowrap p-3 text-left">Account đang dùng</th>
                    <th className="p-3 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSaved.map((p: SavedProxy) => {
                    const isChecking = recheckMut.isPending && recheckMut.variables === p.id
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          'border-b border-rule last:border-0 hover:bg-accent/60',
                          sel.has(p.id) && 'bg-chart-1/[0.06] hover:bg-chart-1/[0.09]',
                        )}
                      >
                        <td className="p-3">
                          <Checkbox checked={sel.has(p.id)} onCheckedChange={() => toggleSel(p.id)} />
                        </td>
                        <td className="max-w-xs truncate p-3 text-xs tabular-nums" title={maskProxy(p.proxy)}>
                          {maskProxy(p.proxy)}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">{p.ip ?? '—'}</td>
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
                              onDelete={() => deleteOne(p)}
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
          <span className="px-2 text-sm tabular-nums">
            <span className="font-medium text-chart-1-ink">{visibleSel.length}</span> đã chọn
            {hiddenSelCount > 0 && <span className="text-muted-foreground"> ({hiddenSelCount} không hiển thị)</span>}
          </span>
          <Button size="sm" variant="outline" onClick={copyAllSaved} disabled={visibleSel.length === 0}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkRecheckMut.mutate(visibleSel)}
            disabled={bulkRecheckMut.isPending || visibleSel.length === 0}
          >
            <RefreshCw className={cn('h-4 w-4', bulkRecheckMut.isPending && 'animate-spin')} />
            Re-check
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const targets = visibleSel
              const used = targets.filter((p) => p.account_count > 0).length
              const ok = await confirmDialog({
                title: `Xoá ${targets.length} proxy?`,
                description:
                  used > 0
                    ? `${used} proxy trong số này đang được account dùng — account sẽ mất proxy.`
                    : 'Không hoàn tác được.',
                confirmLabel: `Xoá ${targets.length} proxy`,
                destructive: true,
              })
              if (ok) bulkDeleteMut.mutate(targets.map((p) => p.id))
            }}
            disabled={bulkDeleteMut.isPending || visibleSel.length === 0}
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
