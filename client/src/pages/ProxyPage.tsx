import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Play, Save, Trash2, RefreshCw, Search, Copy } from 'lucide-react'
import {
  checkProxies,
  fetchProxies,
  saveProxies,
  deleteProxy,
  recheckProxy,
  type ProxyCheckResult,
  type SavedProxy,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'live')
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        Live
      </span>
    )
  if (status === 'die')
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
        Die
      </span>
    )
  return <span className="text-xs text-muted-foreground">—</span>
}

export function ProxyPage() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [results, setResults] = useState<ProxyCheckResult[]>([])

  const { data: saved } = useQuery({ queryKey: ['proxies'], queryFn: fetchProxies })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['proxies'] })

  const [savedSearch, setSavedSearch] = useState('')
  const [savedStatusFilter, setSavedStatusFilter] = useState<'all' | 'live' | 'die' | 'unchecked'>(
    'live',
  )

  const filteredSaved = useMemo(() => {
    const q = savedSearch.trim().toLowerCase()
    return (saved ?? []).filter((p) => {
      if (savedStatusFilter === 'live' && p.status !== 'live') return false
      if (savedStatusFilter === 'die' && p.status !== 'die') return false
      if (savedStatusFilter === 'unchecked' && p.status) return false
      if (q) {
        const hay = `${p.proxy} ${p.account_names ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [saved, savedSearch, savedStatusFilter])

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
    mutationFn: (items: { proxy: string; status?: string; ip?: string }[]) => saveProxies(items),
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

  const copyText = (value: string, successMsg: string) => {
    navigator.clipboard.writeText(value).then(
      () => toast.success(successMsg),
      () => toast.error('Không copy được'),
    )
  }

  const copyAllSaved = () => {
    if (filteredSaved.length === 0) {
      toast.error('Không có proxy nào để copy')
      return
    }
    copyText(
      filteredSaved.map((p) => p.proxy).join('\n'),
      `Đã copy ${filteredSaved.length} proxy`,
    )
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

  const saveLive = () => {
    const items = results
      .filter((r) => r.status === 'live')
      .map((r) => ({ proxy: r.proxy, status: r.status, ip: r.ip }))
    if (items.length === 0) {
      toast.error('Không có proxy Live để lưu')
      return
    }
    saveMut.mutate(items)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proxy</h1>
        <p className="text-sm text-muted-foreground">
          Nhập <code className="rounded bg-muted px-1">ip:port:username:password</code> (mỗi dòng 1
          proxy), kiểm tra Live/Die rồi lưu.
        </p>
      </div>

      <Textarea
        placeholder="1.2.3.4:8080:user:pass&#10;5.6.7.8:9090:user:pass"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={checkMut.isPending}
      />

      <div className="flex gap-2">
        <Button onClick={runCheck} disabled={checkMut.isPending}>
          {checkMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Kiểm tra
        </Button>
        {results.length > 0 && (
          <Button variant="outline" onClick={saveLive} disabled={saveMut.isPending}>
            <Save className="h-4 w-4" /> Lưu proxy Live
          </Button>
        )}
      </div>

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
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
                  <td className="max-w-xs truncate p-3 font-mono text-xs">{r.proxy}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3 text-muted-foreground">{r.ip ?? r.error ?? '—'}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">
                    {r.ms ?? '—'}
                  </td>
                  <td className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
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
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <h2 className="mr-auto shrink-0 text-sm font-semibold">
              Proxy đã lưu{' '}
              <span className="font-normal text-muted-foreground">
                ({filteredSaved.length}/{saved?.length ?? 0})
              </span>
            </h2>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm proxy / account"
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                className="h-7 w-40 pl-6 text-xs"
              />
            </div>
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
            <Button size="sm" variant="outline" onClick={copyAllSaved}>
              <Copy className="h-4 w-4" /> Copy tất cả
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Proxy</th>
                <th className="p-3 text-left font-medium">Trạng thái</th>
                <th className="p-3 text-left font-medium">Exit IP</th>
                <th className="p-3 text-left font-medium">Account đang dùng</th>
                <th className="p-3 text-center font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredSaved.map((p: SavedProxy) => {
                const isChecking = recheckMut.isPending && recheckMut.variables === p.id
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="max-w-xs truncate p-3 font-mono text-xs">{p.proxy}</td>
                    <td className="p-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="p-3 text-muted-foreground">{p.ip ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{p.account_names || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyText(p.proxy, 'Đã copy proxy')}
                          aria-label="Copy proxy"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isChecking}
                          onClick={() => recheckMut.mutate(p.id)}
                          aria-label="Kiểm tra lại"
                        >
                          <RefreshCw className={cn('h-4 w-4', isChecking && 'animate-spin')} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => delMut.mutate(p.id)}
                          aria-label="Xoá"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredSaved.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {(saved ?? []).length === 0
                      ? 'Chưa lưu proxy nào.'
                      : 'Không có proxy khớp bộ lọc.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </div>
  )
}
