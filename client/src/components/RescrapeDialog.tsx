import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ShoppingBag } from 'lucide-react'
import { rescrapePosts, batchStreamUrl, type JobState } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  postIds: string[]
  onClose: () => void
  onDone: () => void
}

export function RescrapeDialog({ open, postIds, onClose, onDone }: Props) {
  const [job, setJob] = useState<JobState | null>(null)
  const [finished, setFinished] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let es: EventSource | null = null
    setJob(null)
    setFinished(false)

    void (async () => {
      try {
        const { jobId } = await rescrapePosts(postIds)
        if (cancelled) return
        es = new EventSource(batchStreamUrl(jobId))
        esRef.current = es
        es.onmessage = (e) => {
          const d = JSON.parse(e.data) as { type: string; job: JobState }
          setJob(d.job)
          if (d.type === 'end') {
            es?.close()
            esRef.current = null
            setFinished(true)
            onDone()
          }
        }
        es.onerror = () => {
          es?.close()
          esRef.current = null
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Lỗi rescrape')
        onClose()
      }
    })()

    return () => {
      cancelled = true
      es?.close()
      esRef.current = null
    }
    // chi chay khi mo popup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <h2 className="text-lg font-semibold">Lấy lại comment</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {postIds.length} bài · cần mạng vào được threads.com
      </p>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">
            {finished ? 'Hoàn tất' : 'Đang chạy'} {job?.done ?? 0}/{job?.total ?? postIds.length}
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="mt-4 max-h-64 space-y-1.5 overflow-auto text-sm">
        {(job?.items ?? []).map((it, i) => (
          <li key={i} className="rounded-md border p-2">
            <div className="flex items-center gap-2">
              {it.ok ? (
                (it.entries ?? 0) > 0 ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                )
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <span className="min-w-0 flex-1 truncate">@{it.username || it.url}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <ShoppingBag className="h-3 w-3" />
                {it.entries ?? 0}
              </span>
            </div>
            {!it.ok && (it.scrapeError || it.error) && (
              <div className="mt-1 pl-6 text-xs text-destructive">{it.scrapeError || it.error}</div>
            )}
            {it.ok && (it.entries ?? 0) === 0 && (
              <div className="mt-1 pl-6 text-xs text-amber-600">
                {it.scrapeError
                  ? `Lỗi scrape: ${it.scrapeError}`
                  : 'Không tìm thấy link shopee trong comment'}
              </div>
            )}
          </li>
        ))}
        {!job && (
          <li className="flex items-center gap-2 p-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang khởi động...
          </li>
        )}
      </ul>

      <div className="mt-4 flex justify-end">
        <Button variant={finished ? 'default' : 'outline'} onClick={onClose}>
          {finished ? 'Đóng' : 'Chạy nền / Đóng'}
        </Button>
      </div>
    </Dialog>
  )
}
