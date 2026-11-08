import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, MinusCircle, XCircle } from 'lucide-react'
import { refetchMediaPosts, batchStreamUrl, type BatchItemResult, type JobState } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  postIds: string[]
  onClose: () => void
  onDone: () => void
}

const counts = (c?: { video: number; image: number }) => (c ? `${c.video} video · ${c.image} ảnh` : '—')

/** Popup tien trinh "Crawl lai media" - chi thay media khi lan nay tai duoc nhieu file hon. */
export function RefetchMediaDialog({ open, postIds, onClose, onDone }: Props) {
  const [job, setJob] = useState<JobState | null>(null)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let es: EventSource | null = null
    setJob(null)
    setFinished(false)

    void (async () => {
      try {
        const { jobId } = await refetchMediaPosts(postIds)
        if (cancelled) return
        es = new EventSource(batchStreamUrl(jobId))
        es.onmessage = (e) => {
          const d = JSON.parse(e.data) as { type: string; job: JobState }
          setJob(d.job)
          if (d.type === 'end') {
            es?.close()
            setFinished(true)
            onDone()
          }
        }
        es.onerror = () => es?.close()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Không chạy được crawl lại media')
        onClose()
      }
    })()

    return () => {
      cancelled = true
      es?.close()
    }
    // chi chay khi mo popup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const items = job?.items ?? []
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0
  const replaced = items.filter((i) => i.ok).length
  const same = items.filter((i) => i.skipped).length
  const failed = items.filter((i) => !i.ok && !i.skipped).length

  // Bai dang chay = co log nhung chua co ket qua; hien buoc moi nhat (log.url = postId o job nay)
  const running = useMemo(() => {
    const doneIds = new Set(items.map((i) => i.postId))
    const latest = new Map<string, string>()
    for (const l of job?.logs ?? []) if (!doneIds.has(l.url)) latest.set(l.url, l.message)
    return [...latest.entries()]
  }, [job, items])

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <h2 className="pr-8 text-lg font-semibold">Crawl lại media</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {postIds.length} bài · thử cả savethreads lẫn snapsave, chỉ thay khi tải được nhiều ảnh/video hơn bản cũ
      </p>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium tabular-nums">
            {finished ? 'Hoàn tất' : 'Đang chạy'} {job?.done ?? 0}/{job?.total ?? postIds.length}
          </span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width,transform,opacity,background-color] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {items.length > 0 && (
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            Đã bổ sung <b className="text-foreground">{replaced}</b> · không có gì mới {same} · lỗi {failed}
          </p>
        )}
      </div>

      {running.length > 0 && (
        <div className="mt-4 space-y-1.5" aria-live="polite">
          <h3 className="text-xs font-medium text-muted-foreground">Đang xử lý</h3>
          <ul className="space-y-1.5 text-sm">
            {running.map(([postId, message]) => (
              <li key={postId} className="flex items-center gap-2 rounded-md border border-dashed p-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                <span className="shrink-0 font-mono text-xs">{postId}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={message}>
                  {message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-4 max-h-[40dvh] space-y-1.5 overflow-auto text-sm">
        {[...items].reverse().map((it, i) => (
          <RefetchRow key={it.postId ?? `${it.url}-${i}`} it={it} />
        ))}
        {!job && (
          <li className="flex items-center gap-2 p-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang khởi động...
          </li>
        )}
      </ul>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant={finished ? 'default' : 'outline'} onClick={onClose}>
          {finished ? 'Đóng' : 'Chạy nền / Đóng'}
        </Button>
      </div>
    </Dialog>
  )
}

function RefetchRow({ it }: { it: BatchItemResult }) {
  return (
    <li className="rounded-md border p-2">
      <div className="flex items-center gap-2">
        {it.ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        ) : it.skipped ? (
          <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <span className="min-w-0 flex-1 truncate">@{it.username || it.url}</span>
        {(it.ok || it.skipped) && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {counts(it.mediaBefore)} → {counts(it.mediaAfter)}
          </span>
        )}
      </div>
      {it.skipped && <div className="mt-1 pl-6 text-xs text-muted-foreground">Không tải được thêm — giữ nguyên media cũ</div>}
      {!it.ok && !it.skipped && it.error && <div className="mt-1 pl-6 text-xs text-destructive">{it.error}</div>}
    </li>
  )
}
