import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Save, ShieldOff } from 'lucide-react'
import {
  startProxyCheckJob,
  batchStreamUrl,
  saveProxies,
  fetchProxies,
  type JobState,
} from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  proxies: string[]
  description?: string
  onClose: () => void
}

interface ProxyResult {
  proxy: string
  status: 'live' | 'die'
  ip?: string
  ms?: number
  error?: string
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
  const [job, setJob] = useState<JobState | null>(null)
  const [checking, setChecking] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [savedProxies, setSavedProxies] = useState<Set<string>>(new Set())
  const esRef = useRef<EventSource | null>(null)

  const { data: existing } = useQuery({
    queryKey: ['proxies'],
    queryFn: fetchProxies,
    enabled: open,
  })
  const existingSet = new Set((existing ?? []).map((p) => p.proxy))

  useEffect(() => {
    if (!open) return
    setJob(null)
    setSavedProxies(new Set())
    esRef.current?.close()
    esRef.current = null
    if (proxies.length === 0) return

    setChecking(true)
    startProxyCheckJob(proxies)
      .then(({ jobId }) => {
        const es = new EventSource(batchStreamUrl(jobId))
        esRef.current = es
        es.onmessage = (e) => {
          const d = JSON.parse(e.data) as { type: string; job: JobState }
          setJob(d.job)
          if (d.type === 'end') {
            es.close()
            esRef.current = null
            setChecking(false)
          }
        }
        es.onerror = () => {
          es.close()
          esRef.current = null
          setChecking(false)
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Lỗi kiểm tra proxy')
        setChecking(false)
      })

    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [open, proxies])

  const results: ProxyResult[] = (job?.items ?? []).map((it) => ({
    proxy: it.url,
    status: it.ok ? 'live' : 'die',
    ip: it.ip,
    ms: it.ms,
    error: it.error,
  }))

  // Proxy da bat dau kiem tra (co log) nhung chua co ket qua -> dang chay
  const inFlight = (job?.logs ?? [])
    .map((l) => l.url)
    .filter((url) => !results.some((r) => r.proxy === url))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proxies'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
  }

  const saveOne = async (r: ProxyResult) => {
    await saveProxies([{ proxy: r.proxy, status: r.status, ip: r.ip }])
    setSavedProxies((s) => new Set(s).add(r.proxy))
    invalidate()
  }

  const saveAll = async () => {
    if (results.length === 0) return
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

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

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
          {job && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">
                  {checking ? 'Đang kiểm tra' : 'Hoàn tất'} {job.done}/{job.total}
                </span>
                <span className="text-muted-foreground">
                  {results.filter((r) => r.status === 'live').length} Live /{' '}
                  {results.filter((r) => r.status === 'die').length} Die
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {inFlight.length > 0 && (
                <div className="mt-1.5 truncate text-xs text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  Đang kiểm tra: {inFlight.join(', ')}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end">
            {results.length > 0 && (
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
                {!job && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {results.map((r) => {
                  const isSaved = savedProxies.has(r.proxy) || existingSet.has(r.proxy)
                  return (
                    <tr key={r.proxy} className="border-b last:border-0">
                      <td className="max-w-[14rem] truncate p-2.5 font-mono text-xs">{r.proxy}</td>
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
