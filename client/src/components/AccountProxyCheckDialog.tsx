import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, ShieldOff } from 'lucide-react'
import { startProxyCheckJob, batchStreamUrl, type JobState } from '@/lib/api'
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
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proxies'] })
    qc.invalidateQueries({ queryKey: ['accounts'] })
  }
  const [job, setJob] = useState<JobState | null>(null)
  const [checking, setChecking] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const startedKeyRef = useRef<string | null>(null)

  // Phu thuoc theo NOI DUNG danh sach, khong theo tham chieu mang: khi job xong ta goi
  // invalidate() -> react-query nap lai accounts -> trang cha tao mang proxy MOI (noi dung y het)
  // -> neu de [proxies] thi effect chay lai -> chay job moi -> lai invalidate -> lap vo han.
  const proxyKey = proxies.join('|')

  useEffect(() => {
    if (!open) {
      startedKeyRef.current = null
      return
    }
    // Chan not truong hop effect bi goi lai voi cung danh sach (StrictMode, re-render bat ngo...).
    if (startedKeyRef.current === proxyKey) return
    startedKeyRef.current = proxyKey

    setJob(null)
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
            invalidate() // server da luu ket qua vao kho proxy -> nap lai cho UI khop
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
    // proxies co doc trong effect nhung deps dung proxyKey (chuoi) de khong lap vo han - xem
    // chu thich o tren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proxyKey])

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

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="pr-8 text-lg font-semibold">Kiểm tra proxy</h2>
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
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-sm">
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
                <div className="mt-1.5 truncate text-xs text-muted-foreground" title={inFlight.join(", ")}>
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  Đang kiểm tra: {inFlight.join(', ')}
                </div>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Kết quả được lưu thẳng vào kho proxy, không cần bấm lưu.
          </p>

          <div className="table-scroll mt-2 max-h-[50dvh] overflow-y-auto rounded-lg border sm:max-h-96">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2.5 text-left font-medium">Proxy</th>
                  <th className="p-2.5 text-left font-medium">Trạng thái</th>
                  <th className="p-2.5 text-left font-medium">Exit IP</th>
                  <th className="p-2.5 text-right font-medium">ms</th>
                </tr>
              </thead>
              <tbody>
                {!job && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {results.map((r) => (
                    <tr key={r.proxy} className="border-b last:border-0">
                      <td className="max-w-[14rem] truncate p-2.5 font-mono text-xs" title={r.proxy}>{r.proxy}</td>
                      <td className="p-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="max-w-[12rem] truncate p-2.5 text-xs text-muted-foreground">
                        {r.ip ?? r.error ?? '—'}
                      </td>
                      <td className="p-2.5 text-right text-xs tabular-nums text-muted-foreground">
                        {r.ms ?? '—'}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </Dialog>
  )
}
