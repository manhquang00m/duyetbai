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
  Plus,
} from 'lucide-react'
import {
  startBatch,
  batchStreamUrl,
  fetchCollectHistory,
  deleteCollectHistory,
  fetchMediaSourceDefault,
  setMediaSourceDefault,
  ACCOUNT_TOPICS,
  type JobState,
  type BatchItemResult,
  type CollectHistoryRow,
  type MediaSourceName,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox } from '@/components/ui/checkbox'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

function isFailed(it: BatchItemResult): boolean {
  return !it.ok || (it.mediaFail ?? 0) > 0
}

const tabClass = (active: boolean) =>
  cn(
    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:py-1.5',
    active ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent',
  )

function HistoryStatus({ r }: { r: CollectHistoryRow }) {
  if (r.skipped)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <SkipForward className="h-3.5 w-3.5" /> Đã tải rồi
      </span>
    )
  if (r.ok)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Thành công
      </span>
    )
  return (
    <div className="min-w-0">
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <XCircle className="h-3.5 w-3.5" /> Lỗi
      </span>
      {r.error && (
        <div className="mt-0.5 max-w-xs truncate text-xs text-destructive/80" title={r.error}>
          {r.error}
        </div>
      )}
    </div>
  )
}

function HistoryActions({
  r,
  onRetry,
  onRemove,
}: {
  r: CollectHistoryRow
  onRetry: (urls: string[]) => void
  onRemove: (id: number) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {!r.ok && (
        <Button variant="ghost" size="icon" onClick={() => onRetry([r.url])} aria-label="Retry">
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={() => onRemove(r.id)} aria-label="Xoá">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  )
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

  const label = (r: CollectHistoryRow) => (r.post_id ? `@…/post/${r.post_id}` : r.url)

  return (
    <div className={cn('space-y-3', sel.size > 0 && 'pb-24')}>
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
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={History} title="Chưa có lịch sử thu thập." />
        ) : (
          <>
            <div className="max-h-[70dvh] overflow-auto md:hidden">
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
                Chọn tất cả
              </div>
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.id} className={cn('flex gap-3 p-3', sel.has(r.id) && 'bg-primary/5')}>
                    <Checkbox className="mt-1" checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="break-all font-mono text-xs">{label(r)}</div>
                      <HistoryStatus r={r} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {new Date(r.attempted_at).toLocaleString('vi-VN')}
                        </span>
                        <HistoryActions r={r} onRetry={onRetry} onRemove={removeOne} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="table-scroll hidden max-h-[calc(100dvh-20rem)] min-h-[16rem] overflow-y-auto md:block">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
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
                  {rows.map((r: CollectHistoryRow) => (
                    <tr key={r.id} className={cn('border-b last:border-0', sel.has(r.id) && 'bg-primary/5')}>
                      <td className="p-2.5">
                        <Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      </td>
                      <td className="max-w-xs truncate p-2.5 font-mono text-xs" title={r.url}>
                        {label(r)}
                      </td>
                      <td className="p-2.5">
                        <HistoryStatus r={r} />
                      </td>
                      <td className="whitespace-nowrap p-2.5 text-xs tabular-nums text-muted-foreground">
                        {new Date(r.attempted_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="p-2.5">
                        <HistoryActions r={r} onRetry={onRetry} onRemove={removeOne} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {sel.size > 0 && (
        <FloatingBar>
          <span className="px-2 text-sm font-medium tabular-nums">{sel.size} đã chọn</span>
          <Button size="sm" variant="outline" onClick={retrySelected}>
            <RotateCcw className="h-4 w-4" /> Retry đã chọn
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Bỏ chọn
          </Button>
        </FloatingBar>
      )}
    </div>
  )
}

function JobProgressCard({
  job,
  urlTopics,
}: {
  job: JobState
  urlTopics?: Record<string, string>
}) {
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Card className="space-y-4 p-3 sm:p-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium tabular-nums">
            Tiến trình {job.done}/{job.total}
          </span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="max-h-[60dvh] space-y-2 overflow-auto">
        {job.items.map((it, i) => {
          const logs = job.logs.filter((l) => l.url === it.url)
          return (
            <li key={i} className="rounded-lg border p-2.5 sm:p-3">
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
                        {urlTopics?.[it.url] && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {urlTopics[it.url]}
                          </span>
                        )}
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

interface UrlGroup {
  id: number
  topic: string | null
  text: string
}

export function BatchPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'collect' | 'history'>('collect')
  const groupIdRef = useRef(0)
  const [groups, setGroups] = useState<UrlGroup[]>(() => [
    { id: groupIdRef.current++, topic: null, text: '' },
  ])
  const [running, setRunning] = useState(false)
  const [job, setJob] = useState<JobState | null>(null)
  // Chu de theo url cua lan chay GAN NHAT - dung de hien chip chu de trong JobProgressCard va de
  // "Retry" giu duoc dung chu de da gan cho tung url thay vi mat het khi chay lai.
  const [lastUrlTopics, setLastUrlTopics] = useState<Record<string, string>>({})
  const esRef = useRef<EventSource | null>(null)

  const addGroup = () =>
    setGroups((gs) => [...gs, { id: groupIdRef.current++, topic: null, text: '' }])
  const removeGroup = (id: number) =>
    setGroups((gs) => (gs.length > 1 ? gs.filter((g) => g.id !== id) : gs))
  const updateGroup = (id: number, patch: Partial<Pick<UrlGroup, 'topic' | 'text'>>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))

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

  const runUrls = async (urls: string[], force: boolean, urlTopics?: Record<string, string>) => {
    if (urls.length === 0) {
      toast.error('Không có URL')
      return
    }
    setRunning(true)
    setJob(null)
    try {
      const { jobId } = await startBatch(urls, force, urlTopics)
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
          // Bai moi cao co the lam doi kho "bai sach" (Phan phoi bai) va so bai chua viet lai
          // caption - cac trang do dung query rieng, khong tu dong biet co bai moi ma lam moi.
          qc.invalidateQueries({ queryKey: ['dist-pool'] })
          qc.invalidateQueries({ queryKey: ['caption-variant-status'] })
          qc.invalidateQueries({ queryKey: ['account-topics'] })
          const failed = data.job.items.filter(isFailed).length
          if (failed > 0) toast.warning(`Xong, ${failed} bài lỗi — có thể Retry`)
          else toast.success('Batch hoàn tất')
          if (data.job.topicConflicts && data.job.topicConflicts.length > 0) {
            const detail = data.job.topicConflicts
              .map((c) => `${c.postId}: ${c.topics.join(', ')}`)
              .join(' · ')
            toast.warning(
              `${data.job.topicConflicts.length} bài bị 2 URL khác nhau gán 2 chủ đề khác nhau trong lần chạy này — ${detail}. Kiểm tra lại trang Bài viết.`,
            )
          }
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
    const urls: string[] = []
    const urlTopics: Record<string, string> = {}
    for (const g of groups) {
      const lines = g.text
        .split('\n')
        .map((s) => s.trim())
        .filter((l) => l && !l.startsWith('#'))
      for (const l of lines) {
        urls.push(l)
        if (g.topic) urlTopics[l] = g.topic
      }
    }
    setLastUrlTopics(urlTopics)
    runUrls(urls, false, urlTopics)
  }

  const retryFailed = () => {
    const urls = (job?.items ?? []).filter(isFailed).map((it) => it.url)
    runUrls(urls, true, lastUrlTopics) // force = cào lại dù đã có trong DB, giữ nguyên chủ đề cũ
  }

  const retryFromHistory = (urls: string[]) => {
    runUrls(urls, true)
  }

  const failedCount = (job?.items ?? []).filter(isFailed).length

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <PageHeader
        title="Thu thập"
        description="Dán URL bài Threads theo từng nhóm (mỗi dòng 1 URL) — mỗi nhóm chọn sẵn 1 chủ đề, cào xong tự gán chủ đề đó cho tác giả của các bài trong nhóm. Bài đã tải sẽ tự bỏ qua."
      />

      <div className="flex w-full gap-0.5 rounded-lg border bg-muted/40 p-0.5 sm:w-fit">
        <button type="button" onClick={() => setTab('collect')} className={tabClass(tab === 'collect')}>
          <Play className="h-3.5 w-3.5" /> Thu thập mới
        </button>
        <button type="button" onClick={() => setTab('history')} className={tabClass(tab === 'history')}>
          <History className="h-3.5 w-3.5" /> Lịch sử thu thập
        </button>
      </div>

      {tab === 'history' && (
        <>
          <HistoryPanel onRetry={retryFromHistory} />
          {job && <JobProgressCard job={job} urlTopics={lastUrlTopics} />}
        </>
      )}

      {tab === 'collect' && (
        <>
          <div className="space-y-3">
            {groups.map((g, i) => (
              <div key={g.id} className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">Nhóm {i + 1}</span>
                    <select
                      className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9 sm:max-w-xs sm:flex-none sm:text-xs"
                      value={g.topic ?? ''}
                      onChange={(e) => updateGroup(g.id, { topic: e.target.value || null })}
                      disabled={running}
                    >
                      <option value="">— Không gán chủ đề —</option>
                      {ACCOUNT_TOPICS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {groups.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGroup(g.id)}
                      disabled={running}
                      aria-label="Xoá nhóm"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="https://www.threads.com/@user/post/XXXX&#10;https://www.threads.com/@user/post/YYYY"
                  value={g.text}
                  onChange={(e) => updateGroup(g.id, { text: e.target.value })}
                  rows={4}
                  disabled={running}
                  className="font-mono text-xs"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addGroup} disabled={running}>
              <Plus className="h-4 w-4" /> Thêm nhóm
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
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

          {job && <JobProgressCard job={job} urlTopics={lastUrlTopics} />}
        </>
      )}
    </div>
  )
}
