import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { startShadowbanCheckJob, batchStreamUrl, type JobState } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShadowbanBadge } from '@/components/ShadowbanBadge'

interface Props {
  open: boolean
  accounts: string[]
  onClose: () => void
}

export function ShadowbanCheckDialog({ open, accounts, onClose }: Props) {
  const qc = useQueryClient()
  const [job, setJob] = useState<JobState | null>(null)
  const [checking, setChecking] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const startedKeyRef = useRef<string | null>(null)

  // Phu thuoc theo NOI DUNG danh sach (xem AccountProxyCheckDialog): job xong -> nap lai accounts ->
  // trang cha tao mang moi -> neu de [accounts] thi chay lai job vo han.
  const accountKey = accounts.join('|')

  useEffect(() => {
    if (!open) {
      startedKeyRef.current = null
      return
    }
    if (startedKeyRef.current === accountKey) return
    startedKeyRef.current = accountKey

    setJob(null)
    esRef.current?.close()
    esRef.current = null
    if (accounts.length === 0) return

    setChecking(true)
    startShadowbanCheckJob(accounts)
      .then(({ jobId }) => {
        const es = new EventSource(batchStreamUrl(jobId))
        esRef.current = es
        es.onmessage = (e) => {
          const d = JSON.parse(e.data) as { type: string; job: JobState }
          setJob(d.job)
          // Moi nick xong la da luu DB -> nap lai de cot Shadowban cap nhat dan.
          if (d.type === 'progress') qc.invalidateQueries({ queryKey: ['accounts'] })
          if (d.type === 'end') {
            es.close()
            esRef.current = null
            setChecking(false)
            qc.invalidateQueries({ queryKey: ['accounts'] })
          }
        }
        es.onerror = () => {
          es.close()
          esRef.current = null
          setChecking(false)
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Lỗi check shadowban')
        setChecking(false)
      })

    return () => {
      esRef.current?.close()
      esRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountKey])

  const items = job?.items ?? []
  const lastLog = job?.logs[job.logs.length - 1]
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Dialog open={open} onClose={onClose} className="max-w-3xl">
      <h2 className="pr-8 text-lg font-semibold">Check shadowban</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {accounts.length} nick · chạy lần lượt từng nick, mỗi nick mất khoảng 1 phút
      </p>

      {job && (
        <div className="mt-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 text-sm">
            <span className="font-medium">
              {checking ? 'Đang check' : 'Hoàn tất'} {job.done}/{job.total}
            </span>
            <span className="text-muted-foreground">
              {items.filter((i) => i.shadowban?.verdict === 'shadowban').length} nghi shadowban /{' '}
              {items.filter((i) => i.shadowban?.verdict === 'suspect').length} nghi ngờ
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width,transform,opacity,background-color] duration-300" style={{ width: `${pct}%` }} />
          </div>
          {checking && lastLog && (
            <div className="mt-1.5 truncate text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              {lastLog.url}: {lastLog.message}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Kết quả chỉ là gợi ý dựa trên view, bài bị ẩn và search — Threads không có API báo shadowban.
        Kết quả được lưu, bấm vào nhãn ở cột Shadowban để xem chi tiết.
      </p>

      <div className="table-scroll mt-2 max-h-[50dvh] overflow-y-auto rounded-lg border sm:max-h-96">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
            <tr>
              <th className="p-2.5 text-left">Nick</th>
              <th className="p-2.5 text-left">Kết luận</th>
              <th className="p-2.5 text-right">View gần đây</th>
              <th className="p-2.5 text-left">Lý do</th>
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
            {items.map((it) => (
              <tr key={it.url} className="border-b last:border-0 align-top">
                <td className="p-2.5 font-medium">{it.url}</td>
                <td className="p-2.5">
                  {it.shadowban ? (
                    <ShadowbanBadge verdict={it.shadowban.verdict} />
                  ) : (
                    <span className="text-xs text-destructive">Lỗi</span>
                  )}
                </td>
                <td className="p-2.5 text-right text-xs tabular-nums text-muted-foreground">
                  {it.shadowban?.recentMedian ?? '—'}
                </td>
                <td className="p-2.5 text-xs text-muted-foreground">
                  {it.error ?? (it.shadowban?.reasons.length ? it.shadowban.reasons.join(' · ') : '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </Dialog>
  )
}
