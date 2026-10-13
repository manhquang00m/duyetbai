import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { checkShopeePostLinks, batchStreamUrl, type JobState } from '@/lib/api'
import { LinkStatusBadge, ShopeeItemIcon } from '@/components/LinkStatusBadge'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  postIds: string[]
  onClose: () => void
  onDone: () => void
}

/** Kiem tra tinh trang link Shopee cua cac bai da chon o trang Bai viet (job nen + SSE). */
export function ShopeeLinkCheckDialog({ open, postIds, onClose, onDone }: Props) {
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
        const { jobId } = await checkShopeePostLinks(postIds)
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
        toast.error(err instanceof Error ? err.message : 'Lỗi kiểm tra link Shopee')
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
  const badCount =
    job?.items.filter((it) => it.shopeeStatus === 'dead' || it.shopeeStatus === 'out_of_stock')
      .length ?? 0

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl">
      <h2 className="pr-8 text-lg font-semibold">Kiểm tra link Shopee</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {postIds.length} bài · link chết nhận ra ngay, còn hàng/hết hàng cần phiên đăng nhập Shopee
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium tabular-nums">
              {finished ? 'Hoàn tất' : 'Đang kiểm tra'} {job?.done ?? 0}/{job?.total ?? postIds.length}
            </span>
            <span className="text-muted-foreground">{badCount} link hỏng</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ul className="max-h-[45dvh] space-y-1.5 overflow-auto text-sm">
          {job?.items.map((it, i) => (
            <li key={i} className="flex flex-wrap items-start gap-2 rounded-lg border p-2.5 sm:flex-nowrap">
              <ShopeeItemIcon status={it.shopeeStatus} />
              <div className="min-w-0 flex-1">
                {it.shopeeTitle && <div className="truncate text-xs font-medium">{it.shopeeTitle}</div>}
                <div className="truncate font-mono text-xs text-muted-foreground">{it.url}</div>
                {it.error && <div className="text-xs text-muted-foreground">{it.error}</div>}
              </div>
              <span className="ml-6 shrink-0 sm:ml-0">
                <LinkStatusBadge status={it.shopeeStatus ?? null} message={it.error} />
              </span>
            </li>
          ))}
          {!job && (
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang khởi động...
            </li>
          )}
        </ul>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant={finished ? 'default' : 'ghost'} onClick={onClose}>
          {finished ? 'Xong' : 'Đóng'}
        </Button>
      </div>
    </Dialog>
  )
}
