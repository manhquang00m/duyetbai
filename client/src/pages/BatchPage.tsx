import { useEffect, useMemo, useRef, useState } from 'react'
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
  fetchJob,
  fetchCollectHistory,
  deleteCollectHistory,
  fetchMediaSourceDefault,
  setMediaSourceDefault,
  fetchPipelineConfig,
  savePipelineConfig,
  type JobState,
  type PipelineOptions,
  type BatchItemResult,
  type CollectHistoryRow,
  type MediaSourceName,
} from '@/lib/api'
import { useTopics } from '@/lib/useTopics'
import { parseThreadsUrl, parseThreadsUrls, type ParseResult } from '@/lib/parsers'
import { Button } from '@/components/ui/button'
import { BulkPasteField } from '@/components/BulkPasteField'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { FloatingBar } from '@/components/FloatingBar'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox } from '@/components/ui/checkbox'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { PipelineProgress } from '@/components/PipelineProgress'
import { cn } from '@/lib/utils'

function isFailed(it: BatchItemResult): boolean {
  return !it.ok || (it.mediaFail ?? 0) > 0
}

/** Nhap cac nhom URL dang go do (URL bai Threads khong nhay cam) - roi trang quay lai van con. */
const DRAFT_KEY = 'batch-draft'
/** Chu de da gan theo shortcode bai (lan chay truoc) - de Retry tu Lich su van giu dung chu de. */
const TOPIC_MEMO_KEY = 'batch-url-topics'
const TOPIC_MEMO_MAX = 1000
/** Lan chay gan nhat (job nam o server) - F5 / dong tab / chuyen trang roi vao lai van noi tiep duoc. */
const ACTIVE_KEY = 'batch-active-job'
const JOB_ID_RE = /^[0-9a-f-]{36}$/
interface ActiveRun {
  jobId: string
  pipeline: PipelineOptions | null
  urlTopics: Record<string, string>
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function rememberTopics(urlTopics: Record<string, string>) {
  const memo = readJson<Record<string, string>>(TOPIC_MEMO_KEY, {})
  for (const [url, topic] of Object.entries(urlTopics)) {
    const r = parseThreadsUrl(url)
    if ('key' in r) {
      delete memo[r.key]
      memo[r.key] = topic // xoa roi gan lai -> dua len cuoi (moi nhat)
    }
  }
  const keys = Object.keys(memo)
  for (const k of keys.slice(0, Math.max(0, keys.length - TOPIC_MEMO_MAX))) delete memo[k]
  localStorage.setItem(TOPIC_MEMO_KEY, JSON.stringify(memo))
}

function recallTopics(urls: string[]): Record<string, string> {
  const memo = readJson<Record<string, string>>(TOPIC_MEMO_KEY, {})
  const out: Record<string, string> = {}
  for (const url of urls) {
    const r = parseThreadsUrl(url)
    if ('key' in r && memo[r.key]) out[url] = memo[r.key]
  }
  return out
}

const tabClass = (active: boolean) =>
  cn(
    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:py-1.5',
    active ? 'bg-active text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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
      <span className="inline-flex items-center gap-1 text-xs text-positive">
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
          <EmptyState icon={History} title={onlyFailed ? 'Không có lần thu thập lỗi' : 'Chưa có lịch sử thu thập.'} />
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
                <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2.5 text-left">
                      <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAll} />
                    </th>
                    <th className="p-2.5 text-left">URL</th>
                    <th className="p-2.5 text-left">Trạng thái</th>
                    <th className="p-2.5 text-left">Thời gian</th>
                    <th className="p-2.5 text-right"></th>
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
          <div className="h-full bg-primary transition-[width,transform,opacity,background-color] duration-300" style={{ width: `${pct}%` }} />
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
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
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
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-pill-neutral px-2 py-0.5 text-xs font-medium text-pill-neutral-ink">
                            {urlTopics[it.url]}
                          </span>
                        )}
                        {it.skipped && (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">đã tải rồi</span>
                        )}
                        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          <ShoppingBag className="h-3 w-3" />
                          {it.entries ?? 0} link
                        </span>
                        {(it.mediaFail ?? 0) > 0 && (
                          <span className="text-xs text-warning">{it.mediaFail} media lỗi</span>
                        )}
                        {it.scrapeError && <span className="text-xs text-warning">scrape lỗi</span>}
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
  const topicOptions = useTopics()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'collect' | 'history'>('collect')
  const groupIdRef = useRef(0)
  const [groups, setGroups] = useState<UrlGroup[]>(() => {
    const draft = readJson<{ topic: string | null; text: string }[]>(DRAFT_KEY, [])
    return draft.length > 0
      ? draft.map((d) => ({ id: groupIdRef.current++, topic: d.topic ?? null, text: d.text ?? '' }))
      : [{ id: groupIdRef.current++, topic: null, text: '' }]
  })
  const [running, setRunning] = useState(false)
  const [job, setJob] = useState<JobState | null>(null)
  // Chu de theo url cua lan chay GAN NHAT - dung de hien chip chu de trong JobProgressCard va de
  // "Retry" giu duoc dung chu de da gan cho tung url thay vi mat het khi chay lai.
  const [lastUrlTopics, setLastUrlTopics] = useState<Record<string, string>>({})
  const esRef = useRef<EventSource | null>(null)
  // Luong tu dong sau khi cao: lua chon luu o server (app_settings), chup lai luc bam Chay
  const { data: pipelineCfg } = useQuery({ queryKey: ['pipeline-config'], queryFn: fetchPipelineConfig })
  const pipelineMut = useMutation({
    mutationFn: savePipelineConfig,
    onMutate: (cfg) => qc.setQueryData(['pipeline-config'], cfg),
    onError: (e: unknown) => {
      qc.invalidateQueries({ queryKey: ['pipeline-config'] })
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu lựa chọn')
    },
  })
  const pipeline: PipelineOptions = pipelineCfg ?? { checkLinks: true, rewrite: true }
  const [runPipeline, setRunPipeline] = useState<PipelineOptions | null>(null)
  const [pipeJobId, setPipeJobId] = useState<string | null>(null)

  const addGroup = () =>
    setGroups((gs) => [...gs, { id: groupIdRef.current++, topic: null, text: '' }])
  const removeGroup = (id: number) =>
    setGroups((gs) => (gs.length > 1 ? gs.filter((g) => g.id !== id) : gs))
  const updateGroup = (id: number, patch: Partial<Pick<UrlGroup, 'topic' | 'text'>>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  useEffect(() => {
    if (groups.every((g) => !g.text.trim())) localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(groups.map(({ topic, text }) => ({ topic, text }))))
  }, [groups])

  // Moi nhom parse rieng; link da co o nhom phia tren tinh la "da co" (khong gui 2 lan)
  const parsed = useMemo<ParseResult[]>(() => {
    const seen = new Set<string>()
    return groups.map((g) => {
      const r = parseThreadsUrls(g.text, new Set(seen))
      for (const l of r.lines) if (l.key) seen.add(l.key)
      return r
    })
  }, [groups])
  const validTotal = parsed.reduce((n, r) => n + r.values.length, 0)
  const invalidTotal = parsed.reduce((n, r) => n + r.counts.invalid, 0)

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

  // Theo doi job cao qua SSE. Stream luon day trang thai hien tai truoc nen dung chung cho ca luc
  // vua bam Chay lan luc noi lai sau F5 (job van chay tiep o server khi trang bi dong).
  const follow = (jobId: string) => {
    esRef.current?.close()
    let sawRunning = false
    const es = new EventSource(batchStreamUrl(jobId))
    esRef.current = es
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as { type: string; job: JobState }
      setJob(data.job)
      if (data.job.status === 'running') sawRunning = true
      if (data.type === 'end') {
        es.close()
        esRef.current = null
        // Co chang tu dong chay tiep -> van "dang chay" cho toi khi PipelineProgress bao xong
        if (data.job.nextJobId) setPipeJobId(data.job.nextJobId)
        else setRunning(false)
        qc.invalidateQueries({ queryKey: ['posts'] })
        qc.invalidateQueries({ queryKey: ['stats'] })
        qc.invalidateQueries({ queryKey: ['collect-history'] })
        // Bai moi cao co the lam doi kho "bai sach" (Phan phoi bai) va so bai chua viet lai
        // caption - cac trang do dung query rieng, khong tu dong biet co bai moi ma lam moi.
        qc.invalidateQueries({ queryKey: ['dist-pool'] })
        qc.invalidateQueries({ queryKey: ['caption-variant-status'] })
        qc.invalidateQueries({ queryKey: ['account-topics'] })
        // Noi lai vao job da xong tu truoc (F5 sau khi chay xong) -> khong bao lai ket qua cu
        if (!sawRunning) return
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
  }

  // Vao lai trang: server con giu job lan chay gan nhat -> hien lai tien trinh/ket qua va theo doi tiep
  useEffect(() => {
    const saved = readJson<ActiveRun | null>(ACTIVE_KEY, null)
    if (!saved || typeof saved.jobId !== 'string' || !JOB_ID_RE.test(saved.jobId)) return
    let cancelled = false
    fetchJob(saved.jobId)
      .then((j) => {
        if (cancelled) return
        if (!j) {
          localStorage.removeItem(ACTIVE_KEY)
          toast.info('Không nối lại được lần thu thập trước — server đã khởi động lại')
          return
        }
        setLastUrlTopics(saved.urlTopics ?? {})
        setRunPipeline(saved.pipeline ?? null)
        setJob(j)
        setRunning(true) // 'end' cua job cao / PipelineProgress se tat lai
        follow(saved.jobId)
      })
      .catch(() => {}) // server tat -> giu lai, lan sau vao lai thu tiep
    return () => {
      cancelled = true
      esRef.current?.close()
      esRef.current = null
    }
    // Chi chay 1 lan khi mo trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runUrls = async (
    urls: string[],
    force: boolean,
    urlTopics?: Record<string, string>,
    onStarted?: () => void,
  ) => {
    if (urls.length === 0) {
      toast.error('Không có URL')
      return
    }
    setRunning(true)
    setJob(null)
    setPipeJobId(null)
    const usePipeline = pipeline.checkLinks || pipeline.rewrite ? pipeline : undefined
    setRunPipeline(usePipeline ?? null)
    try {
      const { jobId } = await startBatch(urls, force, urlTopics, usePipeline)
      if (urlTopics) rememberTopics(urlTopics)
      const active: ActiveRun = { jobId, pipeline: usePipeline ?? null, urlTopics: urlTopics ?? {} }
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(active))
      onStarted?.()
      follow(jobId)
    } catch (err) {
      setRunning(false)
      toast.error(err instanceof Error ? err.message : 'Lỗi khởi động batch')
    }
  }

  const run = () => {
    if (running) return
    const urls: string[] = []
    const urlTopics: Record<string, string> = {}
    groups.forEach((g, i) => {
      for (const url of parsed[i].values) {
        urls.push(url)
        if (g.topic) urlTopics[url] = g.topic
      }
    })
    if (urls.length > 0 && invalidTotal > 0) toast.info(`Bỏ qua ${invalidTotal} dòng không phải link bài`)
    setLastUrlTopics(urlTopics)
    // Chay duoc roi moi xoa nhap: giu chu de tung nhom, xoa link
    runUrls(urls, false, urlTopics, () => setGroups((gs) => gs.map((g) => ({ ...g, text: '' }))))
  }

  const retryFailed = () => {
    const urls = (job?.items ?? []).filter(isFailed).map((it) => it.url)
    runUrls(urls, true, lastUrlTopics) // force = cào lại dù đã có trong DB, giữ nguyên chủ đề cũ
  }

  const retryFromHistory = (urls: string[]) => {
    // Lich su khong luu chu de -> lay lai chu de da gan o lan chay truoc (theo shortcode bai)
    const urlTopics = recallTopics(urls)
    setLastUrlTopics(urlTopics)
    runUrls(urls, true, urlTopics)
  }

  const failedCount = (job?.items ?? []).filter(isFailed).length

  const progress = job && (
    <>
      {runPipeline && (
        <PipelineProgress
          collect={job}
          jobId={pipeJobId}
          planned={runPipeline}
          onEnd={(j) => {
            setRunning(false)
            if (j.status === 'error') toast.error(`Luồng tự động lỗi: ${j.error ?? ''}`)
          }}
        />
      )}
      <JobProgressCard job={job} urlTopics={lastUrlTopics} />
    </>
  )

  return (
    <div className="max-w-5xl space-y-5 sm:space-y-6">
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
          {progress}
        </>
      )}

      {tab === 'collect' && (
        <>
          <div className="space-y-3">
            {groups.map((g, i) => (
              <div key={g.id} className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">Nhóm {i + 1}</span>
                    <select
                      className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9 sm:max-w-xs sm:flex-none sm:text-xs"
                      value={g.topic ?? ''}
                      onChange={(e) => updateGroup(g.id, { topic: e.target.value || null })}
                      disabled={running}
                    >
                      <option value="">— Không gán chủ đề —</option>
                      {topicOptions.map((t) => (
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
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <BulkPasteField
                  id={`batch-group-${g.id}`}
                  noun="link"
                  placeholder={'https://www.threads.com/@user/post/XXXX\nhttps://www.threads.com/@user/post/YYYY'}
                  value={g.text}
                  onChange={(text) => updateGroup(g.id, { text })}
                  result={parsed[i]}
                  onSubmit={run}
                  existingLabel="trùng nhóm trên"
                  existingHint="Trùng link ở nhóm phía trên"
                  rows={5}
                  disabled={running}
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addGroup} disabled={running}>
              <Plus className="h-4 w-4" /> Thêm nhóm
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={run} disabled={running || validTotal === 0}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'Đang chạy...' : validTotal > 0 ? `Chạy ${validTotal} link` : 'Chạy'}
              </Button>
              {!running && failedCount > 0 && (
                <Button variant="outline" onClick={retryFailed}>
                  <RotateCcw className="h-4 w-4" /> Retry {failedCount} bài lỗi
                </Button>
              )}
            </div>
            {/* Cao xong tu chay tiep (chi bai MOI): kiem tra link -> phan loai -> viet lai bai dat */}
            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:order-last">
              <span className="text-muted-foreground">Cào xong tự:</span>
              {(
                [
                  ['checkLinks', 'Kiểm tra link Shopee'],
                  ['rewrite', 'Viết lại caption bằng AI'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={pipeline[key]}
                    onCheckedChange={(v) => pipelineMut.mutate({ ...pipeline, [key]: v })}
                  />
                  {label}
                </label>
              ))}
              <span className="text-xs text-muted-foreground">
                Bài không có link / link hỏng được gom lại để xoá 1 lần, bài đạt mới được viết lại.
              </span>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Nền tảng tải media
              <select
                value={mediaSource ?? 'savethreads'}
                onChange={(e) => mediaSourceMut.mutate(e.target.value as MediaSourceName)}
                disabled={mediaSourceMut.isPending}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 sm:h-8"
              >
                <option value="savethreads">savethreads.io</option>
                <option value="snapsave">snapsave.vn</option>
              </select>
            </label>
          </div>

          {progress}
        </>
      )}
    </div>
  )
}
