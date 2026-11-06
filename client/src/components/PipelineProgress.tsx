import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Circle, Download, Loader2, Minus, RefreshCw, Trash2, XCircle } from 'lucide-react'
import {
  batchStreamUrl,
  deleteRejectedPosts,
  exportShopeeUrl,
  REJECT_REASON_LABEL,
  type JobState,
  type PipelineOptions,
  type RejectReason,
} from '@/lib/api'
import { confirmDialog } from '@/lib/confirm'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RescrapeDialog } from '@/components/RescrapeDialog'
import { cn } from '@/lib/utils'

type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'
interface Step {
  label: string
  done: number
  total: number
  status: StepStatus
}

/** Query bi anh huong khi pipeline doi link_status / viet lai / xoa bai. */
function invalidatePostData(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['posts', 'stats', 'post', 'dist-pool', 'caption-variant-status', 'shopee-links', 'account-topics'])
    qc.invalidateQueries({ queryKey: [key] })
}

/** Theo doi 1 job pipeline qua SSE (cung kenh /api/batch/:id/stream voi moi job nen). */
function usePipelineJob(jobId: string | null, onEnd?: (job: JobState) => void) {
  const [job, setJob] = useState<JobState | null>(null)
  const [lost, setLost] = useState(false)
  useEffect(() => {
    setJob(null)
    setLost(false)
    if (!jobId) return
    const es = new EventSource(batchStreamUrl(jobId))
    let ended = false
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as { type: string; job: JobState }
      setJob(data.job)
      if (data.type === 'end' && !ended) {
        ended = true
        es.close()
        onEnd?.(data.job)
      }
    }
    es.onerror = () => {
      if (!ended) setLost(true)
      es.close()
    }
    return () => es.close()
    // onEnd chi doc luc job ket thuc - khong mo lai stream khi ham doi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])
  return { job, lost }
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-positive" aria-hidden />
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-chart-1" aria-hidden />
  if (status === 'error') return <XCircle className="h-4 w-4 text-destructive" aria-hidden />
  if (status === 'skipped') return <Minus className="h-4 w-4 text-muted-foreground" aria-hidden />
  return <Circle className="h-4 w-4 text-muted-foreground/50" aria-hidden />
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2 sm:flex-1">
          <StepIcon status={s.status} />
          <span className={cn('text-sm', s.status === 'pending' || s.status === 'skipped' ? 'text-muted-foreground' : 'font-medium')}>
            {s.label}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {s.status === 'skipped' ? 'tắt' : s.total > 0 || s.status === 'done' ? `${s.done}/${s.total}` : ''}
          </span>
          {i < steps.length - 1 && <span className="mx-3 hidden h-px flex-1 bg-border sm:block" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

/**
 * Luong tu dong: Cao → Kiem tra link → Viet lai → ket qua + 1 nut xoa bai bi loai.
 * - collect: job cao (bo qua khi chay "Xu ly kho" tren bai co san).
 * - jobId: job pipeline (null khi chua toi - hien cac chang dang cho theo `planned`).
 */
export function PipelineProgress({
  collect,
  jobId,
  planned,
  onEnd,
  className,
}: {
  collect?: JobState | null
  jobId: string | null
  planned: PipelineOptions
  onEnd?: (job: JobState) => void
  className?: string
}) {
  const qc = useQueryClient()
  const { job, lost } = usePipelineJob(jobId, (j) => {
    invalidatePostData(qc)
    onEnd?.(j)
  })
  const [deleted, setDeleted] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [rescrapeOpen, setRescrapeOpen] = useState(false)
  useEffect(() => setDeleted(null), [jobId])

  const phase = (key: 'check' | 'rewrite', label: string, on: boolean): Step => {
    const p = job?.phases?.find((x) => x.key === key)
    if (p) return { label, done: p.done, total: p.total, status: job?.status === 'error' && p.status === 'running' ? 'error' : p.status }
    return { label, done: 0, total: 0, status: on ? 'pending' : 'skipped' }
  }
  const steps: Step[] = [
    ...(collect
      ? [
          {
            label: 'Cào bài',
            done: collect.done,
            total: collect.total,
            status: (collect.status === 'running' ? 'running' : collect.status === 'error' ? 'error' : 'done') as StepStatus,
          },
        ]
      : []),
    phase('check', 'Kiểm tra link', planned.checkLinks),
    phase('rewrite', 'Viết lại caption', planned.rewrite),
  ]

  const s = job?.status === 'done' ? job.summary : undefined
  const rejectTotal = s ? s.rejectIds.length : 0
  const reasons = s
    ? (Object.entries(s.reject) as [RejectReason, number][]).filter(([, n]) => n > 0)
    : []

  const doDelete = async () => {
    if (!s || rejectTotal === 0) return
    const ok = await confirmDialog({
      title: `Xoá ${rejectTotal} bài bị loại?`,
      description: `${reasons.map(([r, n]) => `${n} ${REJECT_REASON_LABEL[r]}`).join(' · ')}. Xoá luôn media đã tải, không hoàn tác được.`,
      confirmLabel: `Xoá ${rejectTotal} bài`,
      destructive: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      const r = await deleteRejectedPosts(s.rejectIds)
      setDeleted(r.deleted)
      toast.success(`Đã xoá ${r.deleted} bài bị loại`)
      invalidatePostData(qc)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi xoá bài')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className={cn('space-y-4 p-3 sm:p-4', className)}>
      <Steps steps={steps} />
      {lost && <p className="text-sm text-destructive">Mất kết nối tiến trình — job vẫn chạy ở server, tải lại trang Bài viết sau ít phút.</p>}
      {job?.status === 'error' && <p className="text-sm text-destructive">Lỗi: {job.error}</p>}

      {s && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm">
            <span className="font-medium tabular-nums">{s.total}</span> bài:{' '}
            <span className="font-medium tabular-nums text-positive">{s.pass} đạt</span>
            {planned.rewrite && s.pass > 0 && (
              <span className="text-muted-foreground">
                {' '}
                {s.rewritten + s.rewriteFailed === 0 ? (
                  '(đã đủ bản viết lại)'
                ) : (
                  <>
                    (viết lại {s.rewritten}
                    {s.rewriteFailed > 0 && <span className="text-destructive">, {s.rewriteFailed} lỗi</span>})
                  </>
                )}
              </span>
            )}
            {' · '}
            <span className={cn('font-medium tabular-nums', rejectTotal > 0 && 'text-destructive')}>{rejectTotal} bị loại</span>
            {reasons.length > 0 && (
              <span className="text-muted-foreground"> ({reasons.map(([r, n]) => `${n} ${REJECT_REASON_LABEL[r]}`).join(', ')})</span>
            )}
            {s.scrapeErrorIds.length > 0 && <> · <span className="tabular-nums">{s.scrapeErrorIds.length} lỗi lấy comment</span></>}
            {s.unchecked > 0 && <span className="text-muted-foreground"> · {s.unchecked} chưa kiểm tra link</span>}
            {s.posted > 0 && <span className="text-muted-foreground"> · {s.posted} đã đăng (giữ nguyên)</span>}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {rejectTotal > 0 &&
              (deleted === null ? (
                <>
                  <Button size="sm" variant="destructive" onClick={doDelete} disabled={deleting}>
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Xoá {rejectTotal} bài bị loại
                  </Button>
                  <Link to="/posts?reject=1" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Xem trước
                  </Link>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Đã xoá {deleted} bài bị loại.</span>
              ))}
            {s.scrapeErrorIds.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setRescrapeOpen(true)}>
                <RefreshCw className="h-4 w-4" /> Lấy lại comment ({s.scrapeErrorIds.length})
              </Button>
            )}
            {s.needNewLink > 0 && (
              <a
                href={`${exportShopeeUrl}?onlyMissing=1`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'sm:ml-auto')}
                title="Bước tiếp theo: lấy link affiliate mới trên Shopee rồi import lại"
              >
                <Download className="h-4 w-4" /> Bước tiếp: xuất Shopee input ({s.needNewLink} bài)
              </a>
            )}
          </div>
        </div>
      )}

      {s && (
        <RescrapeDialog
          open={rescrapeOpen}
          postIds={s.scrapeErrorIds}
          onClose={() => setRescrapeOpen(false)}
          onDone={() => invalidatePostData(qc)}
        />
      )}
    </Card>
  )
}
