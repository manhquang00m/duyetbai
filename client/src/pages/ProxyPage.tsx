import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Play, Save, Trash2, RefreshCw } from 'lucide-react'
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
import { Card } from '@/components/ui/card'

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
    <div className="mx-auto max-w-4xl space-y-6">
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

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Proxy đã lưu ({saved?.length ?? 0})</h2>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">Proxy</th>
                <th className="p-3 text-left font-medium">Trạng thái</th>
                <th className="p-3 text-left font-medium">Exit IP</th>
                <th className="p-3 text-center font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(saved ?? []).map((p: SavedProxy) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="max-w-xs truncate p-3 font-mono text-xs">{p.proxy}</td>
                  <td className="p-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="p-3 text-muted-foreground">{p.ip ?? '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={recheckMut.isPending}
                        onClick={() => recheckMut.mutate(p.id)}
                        aria-label="Kiểm tra lại"
                      >
                        <RefreshCw className="h-4 w-4" />
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
              ))}
              {(saved ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    Chưa lưu proxy nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
