import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ShoppingBag,
  SkipForward,
} from 'lucide-react'
import { startBatch, batchStreamUrl, type JobState, type BatchItemResult } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'

function isFailed(it: BatchItemResult): boolean {
  return !it.ok || (it.mediaFail ?? 0) > 0
}

export function BatchPage() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [job, setJob] = useState<JobState | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const runUrls = async (urls: string[], force: boolean) => {
    if (urls.length === 0) {
      toast.error('Không có URL')
      return
    }
    setRunning(true)
    setJob(null)
    try {
      const { jobId } = await startBatch(urls, force)
      const es = new EventSource(batchStreamUrl(jobId))
      esRef.current = es
      es.onmessage = (e) => {
        const data = JSON.parse(e.data) as { type: string; job: JobState }
        setJob(data.job)
        if (data.type === 'end') {
          es.close()
          esRef.current = null
          setRunning(false)
          qc.invalidateQueries({ queryKey: ['posts'] })
          qc.invalidateQueries({ queryKey: ['stats'] })
          const failed = data.job.items.filter(isFailed).length
          if (failed > 0) toast.warning(`Xong, ${failed} bài lỗi — có thể Retry`)
          else toast.success('Batch hoàn tất')
        }
      }
      es.onerror = () => {
        if (esRef.current) {
          es.close()
          esRef.current = null
          setRunning(false)
          toast.error('Mất kết nối stream')
        }
      }
    } catch (err) {
      setRunning(false)
      toast.error(err instanceof Error ? err.message : 'Lỗi khởi động batch')
    }
  }

  const run = () => {
    const urls = text
      .split('\n')
      .map((s) => s.trim())
      .filter((l) => l && !l.startsWith('#'))
    runUrls(urls, false)
  }

  const retryFailed = () => {
    const urls = (job?.items ?? []).filter(isFailed).map((it) => it.url)
    runUrls(urls, true) // force = cào lại dù đã có trong DB
  }

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0
  const failedCount = (job?.items ?? []).filter(isFailed).length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Thu thập</h1>
        <p className="text-sm text-muted-foreground">
          Dán URL bài Threads (mỗi dòng 1 URL) rồi chạy — bài đã tải sẽ tự bỏ qua
        </p>
      </div>

      <Textarea
        placeholder="https://www.threads.com/@user/post/XXXX&#10;https://www.threads.com/@user/post/YYYY"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        disabled={running}
      />

      <div className="flex gap-2">
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Đang chạy...' : 'Chạy'}
        </Button>
        {!running && failedCount > 0 && (
          <Button variant="outline" onClick={retryFailed}>
            <RotateCcw className="h-4 w-4" /> Retry {failedCount} bài lỗi
          </Button>
        )}
      </div>

      {job && (
        <Card className="space-y-4 p-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">
                Tiến trình {job.done}/{job.total}
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

          <ul className="max-h-[32rem] space-y-2 overflow-auto">
            {job.items.map((it, i) => {
              const logs = job.logs.filter((l) => l.url === it.url)
              return (
                <li key={i} className="rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    {it.skipped ? (
                      <SkipForward className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : it.ok ? (
                      it.scrapeError || (it.mediaFail ?? 0) > 0 ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      )
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}

                    <div className="min-w-0 flex-1">
                      {it.ok ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">@{it.username || '—'}</span>
                            {it.skipped && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                đã tải rồi
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <ShoppingBag className="h-3 w-3" />
                              {it.entries ?? 0} link
                            </span>
                            {(it.mediaFail ?? 0) > 0 && (
                              <span className="text-xs text-amber-600">{it.mediaFail} media lỗi</span>
                            )}
                            {it.scrapeError && (
                              <span className="text-xs text-amber-600">scrape lỗi</span>
                            )}
                          </div>
                          <div className="truncate text-sm text-muted-foreground">
                            {it.caption || '(không có caption)'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="truncate font-medium">{it.url}</div>
                          <div className="text-xs text-destructive">{it.error}</div>
                        </>
                      )}
                    </div>
                  </div>

                  {logs.length > 0 && (
                    <div className="mt-2 space-y-0.5 rounded-md bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
                      {logs.map((l, j) => (
                        <div key={j} className="truncate">
                          {l.message}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}

            {/* Log cua cac url dang chay nhung chua co item */}
            {job.status === 'running' &&
              job.logs
                .filter((l) => !job.items.some((it) => it.url === l.url))
                .slice(-8)
                .map((l, i) => (
                  <li key={`log-${i}`} className="rounded-lg border border-dashed p-2">
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{l.url.split('/post/')[1] ?? l.url}</span> ·{' '}
                      {l.message}
                    </div>
                  </li>
                ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
