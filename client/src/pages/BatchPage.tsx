import { useRef, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
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
  History,
  Trash2,
} from 'lucide-react'
import {
  startBatch,
  batchStreamUrl,
  fetchCollectHistory,
  deleteCollectHistory,
  fetchMediaSourceDefault,
  setMediaSourceDefault,
  type JobState,
  type BatchItemResult,
  type CollectHistoryRow,
  type MediaSourceName,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

function isFailed(it: BatchItemResult): boolean {
  return !it.ok || (it.mediaFail ?? 0) > 0
}

function HistoryPanel({ onRetry }: { onRetry: (urls: string[]) => void }) {
  const qc = useQueryClient()
  const [onlyFailed, setOnlyFailed] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const { data, isLoading } = useQuery({
    queryKey: ['collect-history', onlyFailed],
    queryFn: () => fetchCollectHistory(onlyFailed),
  })

  const rows = data ?? []
  const failedUrls = rows.filter((r) => !r.ok).map((r) => r.url)

  const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const someChecked = rows.some((r) => sel.has(r.id)) && !allChecked

  const toggle = (id: number) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSel((prev) => {
      const next = new Set(prev)
      if (allChecked) rows.forEach((r) => next.delete(r.id))
      else rows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const selectedUrls = rows.filter((r) => sel.has(r.id)).map((r) => r.url)

  const retrySelected = () => {
    onRetry(selectedUrls)
    setSel(new Set())
  }

  const removeOne = async (id: number) => {
    await deleteCollectHistory(id)
    qc.invalidateQueries({ queryKey: ['collect-history'] })
  }

  return (
    <div className="space-y-3 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SingleFilterDropdown
          label="Trạng thái"
          value={onlyFailed ? 'onlyFailed' : 'all'}
          onChange={(v) => setOnlyFailed(v === 'onlyFailed')}
          options={[
            { value: 'all', label: `Tất cả${!onlyFailed ? ` (${rows.length})` : ''}` },
            { value: 'onlyFailed', label: `Chỉ lỗi${onlyFailed ? ` (${rows.length})` : ''}` },
          ]}
        />
        {failedUrls.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => onRetry(failedUrls)}>
            <RotateCcw className="h-4 w-4" /> Retry {failedUrls.length} URL lỗi
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left font-medium">
                  <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
                </th>
                <th className="p-2.5 text-left font-medium">URL</th>
                <th className="p-2.5 text-left font-medium">Trạng thái</th>
                <th className="p-2.5 text-left font-medium">Thời gian</th>
                <th className="p-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!isLoading &&
                rows.map((r: CollectHistoryRow) => (
                  <tr
                    key={r.id}
                    className={cn('border-b last:border-0', sel.has(r.id) && 'bg-primary/5')}
                  >
                    <td className="p-2.5">
                      <Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    </td>
                    <td className="max-w-xs truncate p-2.5 font-mono text-xs">
                      {r.post_id ? `@…/post/${r.post_id}` : r.url}
                    </td>
                    <td className="p-2.5">
                      {r.skipped ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <SkipForward className="h-3.5 w-3.5" /> Đã tải rồi
                        </span>
                      ) : r.ok ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Thành công
                        </span>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <XCircle className="h-3.5 w-3.5" /> Lỗi
                          </span>
                          {r.error && (
                            <div className="mt-0.5 max-w-xs truncate text-xs text-destructive/80" title={r.error}>
                              {r.error}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-2.5 text-xs text-muted-foreground">
                      {new Date(r.attempted_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {!r.ok && (
                          <Button variant="ghost" size="icon" onClick={() => onRetry([r.url])} aria-label="Retry">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => removeOne(r.id)} aria-label="Xoá">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Chưa có lịch sử thu thập.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {sel.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-3 py-2 shadow-lg">
          <span className="px-2 text-sm font-medium">{sel.size} đã chọn</span>
          <Button size="sm" variant="outline" onClick={retrySelected}>
            <RotateCcw className="h-4 w-4" /> Retry đã chọn
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}
    </div>
  )
}

function JobProgressCard({ job }: { job: JobState }) {
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Card className="space-y-4 p-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">
            Tiến trình {job.done}/{job.total}
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
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
                        {it.scrapeError && <span className="text-xs text-amber-600">scrape lỗi</span>}
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
                  <span className="font-mono">{l.url.split('/post/')[1] ?? l.url}</span> · {l.message}
                </div>
              </li>
            ))}
      </ul>
    </Card>
  )
}

export function BatchPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'collect' | 'history'>('collect')
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [job, setJob] = useState<JobState | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const { data: mediaSource } = useQuery({
    queryKey: ['media-source-default'],
    queryFn: fetchMediaSourceDefault,
  })
  const mediaSourceMut = useMutation({
    mutationFn: (value: MediaSourceName) => setMediaSourceDefault(value),
    onSuccess: (value) => {
      qc.setQueryData(['media-source-default'], value)
      toast.success('Đã đổi nền tảng mặc định')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi đổi nền tảng'),
  })

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
          qc.invalidateQueries({ queryKey: ['collect-history'] })
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

  const retryFromHistory = (urls: string[]) => {
    runUrls(urls, true)
  }

  const failedCount = (job?.items ?? []).filter(isFailed).length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Thu thập</h1>
        <p className="text-sm text-muted-foreground">
          Dán URL bài Threads (mỗi dòng 1 URL) rồi chạy — bài đã tải sẽ tự bỏ qua
        </p>
      </div>

      <div className="flex gap-0.5 rounded-md border p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setTab('collect')}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'collect' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Play className="h-3.5 w-3.5" /> Thu thập mới
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'history' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <History className="h-3.5 w-3.5" /> Lịch sử thu thập
        </button>
      </div>

      {tab === 'history' && (
        <>
          <HistoryPanel onRetry={retryFromHistory} />
          {job && <JobProgressCard job={job} />}
        </>
      )}

      {tab === 'collect' && (
        <>
          <Textarea
            placeholder="https://www.threads.com/@user/post/XXXX&#10;https://www.threads.com/@user/post/YYYY"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            disabled={running}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <SingleFilterDropdown
              label="Nền tảng mặc định"
              value={mediaSource ?? 'savethreads'}
              onChange={(v) => mediaSourceMut.mutate(v as MediaSourceName)}
              options={[
                { value: 'savethreads', label: 'savethreads.io' },
                { value: 'snapsave', label: 'snapsave.vn' },
              ]}
            />
          </div>

          {job && <JobProgressCard job={job} />}
        </>
      )}
    </div>
  )
}
