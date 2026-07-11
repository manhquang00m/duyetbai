import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Save, ShieldOff } from 'lucide-react'
import {
  checkProxies,
  saveProxies,
  fetchProxies,
  type ProxyCheckResult,
} from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  proxies: string[]
  description?: string
  onClose: () => void
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'live')
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        Live
      </span>
    )
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
      Die
    </span>
  )
}

export function AccountProxyCheckDialog({ open, proxies, description, onClose }: Props) {
  const qc = useQueryClient()
  const [results, setResults] = useState<ProxyCheckResult[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [savedProxies, setSavedProxies] = useState<Set<string>>(new Set())

  const { data: existing } = useQuery({
    queryKey: ['proxies'],
    queryFn: fetchProxies,
    enabled: open,
  })
  const existingSet = new Set((existing ?? []).map((p) => p.proxy))

  useEffect(() => {
    if (!open) return
    setResults(null)
    setSavedProxies(new Set())
    if (proxies.length === 0) return
    setChecking(true)
    checkProxies(proxies)
      .then(setResults)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Lỗi kiểm tra proxy'))
      .finally(() => setChecking(false))
  }, [open, proxies])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proxies'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
  }

  const saveOne = async (r: ProxyCheckResult) => {
    await saveProxies([{ proxy: r.proxy, status: r.status, ip: r.ip }])
    setSavedProxies((s) => new Set(s).add(r.proxy))
    invalidate()
  }

  const saveAll = async () => {
    if (!results || results.length === 0) return
    setSavingAll(true)
    try {
      await saveProxies(results.map((r) => ({ proxy: r.proxy, status: r.status, ip: r.ip })))
      setSavedProxies(new Set(results.map((r) => r.proxy)))
      invalidate()
      toast.success('Đã lưu toàn bộ + cập nhật thời gian kiểm tra')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi lưu proxy')
    } finally {
      setSavingAll(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="text-lg font-semibold">Kiểm tra proxy</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {description ?? `${proxies.length} proxy (đã bỏ trùng) từ các account đã chọn`}
      </p>

      {proxies.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <ShieldOff className="h-6 w-6" />
          <span className="text-sm">Các account đã chọn chưa có proxy nào để kiểm tra</span>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {checking
                ? 'Đang kiểm tra...'
                : results
                  ? `${results.filter((r) => r.status === 'live').length} Live / ${results.filter((r) => r.status === 'die').length} Die`
                  : ''}
            </span>
            {results && results.length > 0 && (
              <Button size="sm" variant="outline" onClick={saveAll} disabled={savingAll}>
                {savingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Lưu tất cả
              </Button>
            )}
          </div>

          <div className="mt-2 max-h-96 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left font-medium">Proxy</th>
                  <th className="p-2.5 text-left font-medium">Trạng thái</th>
                  <th className="p-2.5 text-left font-medium">Exit IP</th>
                  <th className="p-2.5 text-right font-medium">ms</th>
                  <th className="p-2.5 text-center font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {checking && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {!checking &&
                  (results ?? []).map((r) => {
                    const isSaved = savedProxies.has(r.proxy) || existingSet.has(r.proxy)
                    return (
                      <tr key={r.proxy} className="border-b last:border-0">
                        <td className="max-w-[14rem] truncate p-2.5 font-mono text-xs">
                          {r.proxy}
                        </td>
                        <td className="p-2.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="p-2.5 text-xs text-muted-foreground">
                          {r.ip ?? r.error ?? '—'}
                        </td>
                        <td className="p-2.5 text-right text-xs tabular-nums text-muted-foreground">
                          {r.ms ?? '—'}
                        </td>
                        <td className="p-2.5 text-center">
                          {isSaved ? (
                            <span className="text-xs text-muted-foreground">Đã lưu</span>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => saveOne(r)}>
                              <Save className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </Dialog>
  )
}
