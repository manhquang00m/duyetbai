import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  Upload,
  Wand2,
} from 'lucide-react'
import {
  batchStreamUrl,
  captionVariantExportUrl,
  importCaptionVariants,
  type CaptionVariantImportResult,
  fetchAiConfig,
  fetchCaptionVariantStatus,
  fetchCaptionVariants,
  fetchRewriteBatch,
  fetchRewritePrompt,
  fetchVariantRewritePrompt,
  rewriteExportUrl,
  rewriteRowAgain,
  runCaptionVariantForPost,
  runCaptionVariantJob,
  saveRewritePrompt,
  saveRewriteRow,
  saveVariantRewritePrompt,
  startRewriteJob,
  uploadRewriteFile,
  type CaptionVariantStatus,
  type JobState,
  type RewriteRow,
} from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { FileDropOverlay } from '@/components/FileDropOverlay'
import { ImportResultPanel } from '@/components/ImportResultPanel'
import { confirmDialog } from '@/lib/confirm'
import { cn } from '@/lib/utils'

const BATCH_KEY = 'rewrite_batch_id'

export function RewritePage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  // Giu batch dang lam trong localStorage de F5 hay restart server khong mat viec dang sua do.
  const [batchId, setBatchId] = useState<string | null>(() => localStorage.getItem(BATCH_KEY))
  const [job, setJob] = useState<JobState | null>(null)
  const [running, setRunning] = useState(false)
  const [edited, setEdited] = useState<Record<number, string>>({})
  const [promptOpen, setPromptOpen] = useState(false)

  const batch = useQuery({
    queryKey: ['rewrite', batchId],
    queryFn: () => fetchRewriteBatch(batchId!),
    enabled: !!batchId,
    retry: false,
  })

  // Batch cu da bi xoa khoi DB -> quen no di, dung de UI ket o trang thai loi.
  useEffect(() => {
    if (batch.isError) {
      localStorage.removeItem(BATCH_KEY)
      setBatchId(null)
    }
  }, [batch.isError])

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadRewriteFile(file),
    onSuccess: (d) => {
      localStorage.setItem(BATCH_KEY, d.batchId)
      setBatchId(d.batchId)
      setJob(null)
      setEdited({})
      toast.success(`Đã đọc ${d.total} caption từ cột B`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rows = batch.data?.rows ?? []
  const dirtyRows = rows.filter((r) => edited[r.id] !== undefined && edited[r.id] !== (r.rewritten ?? ''))

  // Con ban sua tay chua luu -> hoi truoc khi lam viec se xoa chung (chay lai, mo file khac)
  const confirmDropEdits = async (action: string) =>
    dirtyRows.length === 0 ||
    confirmDialog({
      title: `Bỏ ${dirtyRows.length} bản sửa chưa lưu?`,
      description: `${action} sẽ xóa các chỗ bạn vừa sửa tay mà chưa bấm Lưu.`,
      confirmLabel: 'Bỏ bản sửa',
      cancelLabel: 'Quay lại',
      destructive: true,
    })

  // Dong tab / F5 khi con ban sua chua luu -> trinh duyet hoi lai
  useEffect(() => {
    if (dirtyRows.length === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyRows.length])

  const uploadFile = async (f: File) => {
    if (!(await confirmDropEdits('Mở file mới'))) return
    uploadMut.mutate(f)
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // cho phep chon lai dung file do
    if (f) void uploadFile(f)
  }

  const run = async () => {
    if (!batchId) return
    if (!(await confirmDropEdits('Viết lại cả file'))) return
    try {
      setRunning(true)
      setJob(null)
      const { jobId } = await startRewriteJob(batchId)
      const es = new EventSource(batchStreamUrl(jobId))
      es.onmessage = (ev) => {
        const d = JSON.parse(ev.data) as { type: string; job: JobState }
        setJob(d.job)
        if (d.type === 'end') {
          es.close()
          setRunning(false)
          setEdited({})
          void qc.invalidateQueries({ queryKey: ['rewrite', batchId] })
          const failed = d.job.items.filter((i) => !i.ok).length
          if (failed) toast.warning(`Xong, ${failed} dòng lỗi`)
          else toast.success('Đã viết lại xong')
        }
      }
      es.onerror = () => {
        es.close()
        setRunning(false)
      }
    } catch (e) {
      setRunning(false)
      toast.error(e instanceof Error ? e.message : 'Không chạy được')
    }
  }

  const saveMut = useMutation({
    mutationFn: async (row: RewriteRow) => saveRewriteRow(row.id, edited[row.id] ?? ''),
    onSuccess: (_d, row) => {
      setEdited((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      void qc.invalidateQueries({ queryKey: ['rewrite', batchId] })
      toast.success('Đã lưu')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [savingAll, setSavingAll] = useState(false)
  const saveAll = async () => {
    const targets = dirtyRows.map((r) => ({ id: r.id, text: edited[r.id] ?? '' }))
    if (targets.length === 0) return
    setSavingAll(true)
    let ok = 0
    for (const t of targets) {
      try {
        await saveRewriteRow(t.id, t.text)
        ok++
        setEdited((prev) => {
          const next = { ...prev }
          if (next[t.id] === t.text) delete next[t.id]
          return next
        })
      } catch {
        // dong loi giu nguyen ban sua de nguoi dung thu lai
      }
    }
    setSavingAll(false)
    void qc.invalidateQueries({ queryKey: ['rewrite', batchId] })
    if (ok === targets.length) toast.success(`Đã lưu ${ok} dòng`)
    else toast.error(`Lưu được ${ok}/${targets.length} dòng, các dòng lỗi vẫn giữ bản sửa`)
  }

  const againMut = useMutation({
    mutationFn: (rowId: number) => rewriteRowAgain(rowId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rewrite', batchId] })
      toast.success('Đã viết lại dòng này')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const doneCount = rows.filter((r) => r.rewritten).length
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <div className="mx-auto max-w-8xl space-y-5 sm:space-y-6">
      <FileDropOverlay
        accept={['.xlsx', '.csv']}
        maxSizeMb={10}
        label="Thả file để AI viết lại caption (cột B)"
        onFiles={([f]) => void uploadFile(f)}
        disabled={uploadMut.isPending || running}
      />
      <PageHeader
        title="Viết lại caption bằng AI"
        description="Tải file Excel lên (caption ở cột B) → AI viết lại → sửa tay nếu cần → tải file mới về (cột B = bản viết lại, cột K = caption gốc)"
        secondary={[{ label: 'Giọng văn', icon: Settings2, onClick: () => setPromptOpen(true) }]}
      />

      <AiConfigBanner />

      <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Chọn file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              File .xlsx hoặc .csv, tối đa 10MB, hoặc kéo thả file vào trang. Caption đọc ở cột B, các cột khác
              giữ nguyên.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={uploadMut.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Chọn file...
            </Button>
            {batch.data && (
              <p className="truncate text-xs text-muted-foreground">
                Đang mở: {batch.data.fileName} · <span className="tabular-nums">{rows.length}</span> dòng
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Viết lại</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cần có LLM_API_KEY trong server/.env. Link và hashtag được giữ nguyên.
            </p>
            <Button className="w-full sm:w-auto" disabled={!batchId || running || rows.length === 0} onClick={run}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Viết lại {rows.length ? `${rows.length} dòng` : ''}
            </Button>
            {job && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs tabular-nums">
                  <span>
                    {job.done}/{job.total}
                  </span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width,transform,opacity,background-color] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tải file mới</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dòng chưa viết lại sẽ giữ nguyên caption gốc ở cột B.
            </p>
            {batchId ? (
              <a
                href={rewriteExportUrl(batchId)}
                className={cn(buttonVariants({ variant: 'outline' }), 'w-full sm:w-auto')}
              >
                <FileDown className="h-4 w-4" /> Tải file
              </a>
            ) : (
              <Button variant="outline" className="w-full sm:w-auto" disabled>
                <FileDown className="h-4 w-4" /> Tải file
              </Button>
            )}
            {rows.length > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">
                Đã viết lại {doneCount}/{rows.length} dòng
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {batch.isLoading && (
        <Card className="space-y-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </Card>
      )}

      {!batch.isLoading && rows.length === 0 && (
        <Card>
          <EmptyState
            icon={Upload}
            title="Chưa có file nào"
            description="Chọn file ở ô phía trên để bắt đầu đối chiếu và sửa caption."
          />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-sm text-muted-foreground">Đối chiếu &amp; sửa tay</CardTitle>
            {dirtyRows.length > 0 && (
              <Button size="sm" disabled={savingAll} onClick={() => void saveAll()}>
                {savingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Lưu
                tất cả ({dirtyRows.length})
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.map((r) => {
              const value = edited[r.id] ?? r.rewritten ?? ''
              const dirty = edited[r.id] !== undefined && edited[r.id] !== (r.rewritten ?? '')
              return (
                <div key={r.id} className="grid gap-3 border-b pb-4 last:border-b-0 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Dòng {r.row_index} · gốc
                    </div>
                    <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm">
                      {r.original}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Bản mới</span>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={againMut.isPending}
                          onClick={() => againMut.mutate(r.id)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Viết lại
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!dirty || saveMut.isPending}
                          onClick={() => saveMut.mutate(r)}
                        >
                          <Save className="h-3.5 w-3.5" /> Lưu
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={Math.min(12, Math.max(3, value.split('\n').length + 1))}
                      value={value}
                      placeholder="Chưa viết lại"
                      aria-label={`Bản mới dòng ${r.row_index}`}
                      title="Ctrl+S để lưu dòng này"
                      onChange={(e) => setEdited((p) => ({ ...p, [r.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                          e.preventDefault()
                          if (dirty && !saveMut.isPending) saveMut.mutate(r)
                        }
                      }}
                      className={cn(dirty && 'border-chart-1/60')}
                    />
                    {dirty && <div className="mt-1 text-[11px] text-muted-foreground">Chưa lưu · Ctrl+S</div>}
                    {r.error && <div className="mt-1 text-xs text-destructive">{r.error}</div>}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <div className="border-t pt-5 sm:pt-6">
        <CaptionVariantCard />
      </div>

      <PromptDialog open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  )
}

/**
 * Thong tin cau hinh AI hien co - KHONG phai usage that (Gemini khong co API tra ve quota con lai
 * nen khong bia so used/limit). Chi hien so luong API key + danh sach model dang dung (thu tu uu
 * tien: het quota ngay o 1 key thi tu chuyen key ke tiep CHO CUNG model do truoc, roi moi sang
 * model ke tiep - xem services/llm.ts).
 */
function AiConfigBanner() {
  const { data } = useQuery({ queryKey: ['ai-config'], queryFn: fetchAiConfig })
  if (!data) return null

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs',
          data.keyCount > 0
            ? 'text-muted-foreground before:h-1.5 before:w-1.5 before:rounded-full before:bg-positive'
            : 'rounded-full bg-pill-negative px-2.5 py-1 font-medium text-pill-negative-ink',
        )}
      >
        {data.keyCount > 0 ? `Đã cấu hình ${data.keyCount} API key` : 'Chưa cấu hình API key'}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Model đang dùng (theo thứ tự ưu tiên):</span>
        {data.models.map((m) => (
          <span
            key={m}
            className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-pill-neutral px-2.5 py-1 text-xs font-medium text-pill-neutral-ink"
          >
            {m}
          </span>
        ))}
      </div>
    </Card>
  )
}

function PromptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const prompt = useQuery({ queryKey: ['rewrite-prompt'], queryFn: fetchRewritePrompt, enabled: open })

  // Moi lan mo lai -> ve ban da luu (bo phan go do lan Huy truoc)
  useEffect(() => {
    if (open && prompt.data) setText(prompt.data.prompt)
  }, [open, prompt.data])

  const save = useMutation({
    mutationFn: () => saveRewritePrompt(text),
    onSuccess: () => {
      toast.success('Đã lưu giọng văn')
      void qc.invalidateQueries({ queryKey: ['rewrite-prompt'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const dirty = !!prompt.data && text !== prompt.data.prompt

  return (
    <Dialog open={open} onClose={onClose} dirty={dirty} busy={save.isPending} className="max-w-2xl">
      <h2 className="pr-8 text-lg font-semibold">Giọng văn AI</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hướng dẫn cho AI khi viết lại. Để trống rồi lưu sẽ quay về mặc định.
      </p>
      <Textarea
        className="mt-3 max-h-[50dvh]"
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
        </Button>
      </div>
    </Dialog>
  )
}

/**
 * "Viet lai caption kho bai": moi lan 1 bai duoc phan phoi lai o account khac, thuat toan phan
 * phoi tu xoay vong 1 trong 3 ban o day (xem services/distribution.ts) - bai chua co ban nao thi
 * dung tam caption goc. The nay chi lo phan CHUAN BI san 3 ban, khong lam gi den viec phan phoi.
 */
function CaptionVariantCard() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['caption-variant-status'],
    queryFn: fetchCaptionVariantStatus,
  })
  const [job, setJob] = useState<JobState | null>(null)
  const [running, setRunning] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<CaptionVariantImportResult | null>(null)

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const r = await importCaptionVariants(file)
      setImportResult(r)
      invalidate()
      if (r.errors.length) toast.warning(`Đã lưu ${r.saved} bài, ${r.errors.length} dòng lỗi`)
      else toast.success(`Đã lưu 3 bản cho ${r.saved} bài`)
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      toast.error(msg ?? 'Không nhập được file')
    } finally {
      setImporting(false)
    }
  }

  const rows = data ?? []
  const doneCount = rows.filter((r) => r.variant_count >= 3).length
  const missingCount = rows.length - doneCount

  const invalidate = () => qc.invalidateQueries({ queryKey: ['caption-variant-status'] })

  const runOneMut = useMutation({
    mutationFn: (postId: string) => runCaptionVariantForPost(postId),
    onSuccess: () => {
      invalidate()
      toast.success('Đã viết lại')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // postIds bo trong = server tu chon bai con thieu ban. Truyen DU postIds (ke ca bai da xong)
  // de force viet lai lai toan bo - server force=true cho moi id duoc truyen thang vao.
  const runJob = async (postIds?: string[]) => {
    try {
      setRunning(true)
      setJob(null)
      const { jobId } = await runCaptionVariantJob(postIds)
      const es = new EventSource(batchStreamUrl(jobId))
      es.onmessage = (ev) => {
        const d = JSON.parse(ev.data) as { type: string; job: JobState }
        setJob(d.job)
        if (d.type === 'end') {
          es.close()
          setRunning(false)
          invalidate()
          const failed = d.job.items.filter((i) => !i.ok).length
          if (failed) toast.warning(`Xong, ${failed} bài lỗi`)
          else toast.success('Đã viết lại xong')
        }
      }
      es.onerror = () => {
        es.close()
        setRunning(false)
      }
    } catch (e) {
      setRunning(false)
      toast.error(e instanceof Error ? e.message : 'Không chạy được')
    }
  }

  const runAllForce = async () => {
    const ok = await confirmDialog({
      title: `Viết lại toàn bộ ${rows.length} bài?`,
      description: `Gồm cả ${doneCount} bài đã đủ 3 bản — bản cũ bị ghi đè, tốn thêm quota AI cho những bài đã xong.`,
      confirmLabel: `Viết lại ${rows.length} bài`,
      destructive: true,
    })
    if (!ok) return
    void runJob(rows.map((r) => r.post_id))
  }

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 sm:max-w-2xl">
          <h2 className="text-sm font-semibold text-muted-foreground">Viết lại caption kho bài</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {doneCount}/{rows.length}
            </span>{' '}
            bài đã đủ 3 bản — mỗi lần 1 bài được phân phối lại cho tài
            khoản khác sẽ dùng luân phiên 1 bản khác nhau, tránh nhiều tài khoản đăng y hệt cùng
            caption.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setPromptOpen(true)}
          >
            <Settings2 className="h-4 w-4" /> Giọng văn
          </Button>
          <a
            href={captionVariantExportUrl('missing')}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1 sm:flex-none')}
            title="Xuất caption gốc của các bài chưa đủ 3 bản — viết lại bằng Claude rồi nhập lại, không tốn quota Gemini"
          >
            <FileDown className="h-4 w-4" /> Xuất file ({missingCount})
          </a>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={importing}
            onClick={() => importRef.current?.click()}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Nhập file
          </Button>
          <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={onImportFile} />
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={running || rows.length === 0}
            onClick={() => void runAllForce()}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Viết lại tất cả ({rows.length})
          </Button>
          <Button
            size="sm"
            className="w-full sm:w-auto"
            disabled={running || missingCount === 0}
            onClick={() => runJob()}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Viết lại còn thiếu ({missingCount})
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tiết kiệm Gemini: <b>Xuất file</b> → đưa file cho Claude (sheet "Hướng dẫn" có sẵn prompt) để điền cột Bản
        1/2/3 → <b>Nhập file</b>. Link trong caption đã thay bằng [[LINK1]]…, app tự gắn lại link thật khi nhập.{' '}
        <a href={captionVariantExportUrl('all')} className="text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground">
          Xuất tất cả {rows.length} bài
        </a>
      </p>

      {importResult && (importResult.errors.length > 0 || importResult.skipped > 0) && (
        <ImportResultPanel
          summary={
            <>
              Lần nhập gần nhất: lưu <b className="tabular-nums">{importResult.saved}</b> bài · bỏ qua{' '}
              <span className="tabular-nums">{importResult.skipped}</span> dòng trống
            </>
          }
          errors={importResult.errors.map((e) => ({ row: e.row, ref: e.postId, error: e.error }))}
          onDismiss={() => setImportResult(null)}
        />
      )}

      {job && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width,transform,opacity,background-color]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {job.done}/{job.total} bài
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="-my-1 py-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:py-1"
      >
        {expanded ? 'Ẩn danh sách bài' : 'Xem danh sách bài'}
      </button>

      {expanded && rows.length === 0 && (
        <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
          Chưa có bài nào đủ điều kiện (link Shopee đã kiểm tra còn hàng, có ảnh/video).
        </p>
      )}

      {expanded && rows.length > 0 && (
        <>
          <div className="max-h-[60dvh] divide-y overflow-y-auto rounded-lg border md:hidden">
            {rows.map((r) => (
              <CaptionVariantRow
                key={r.post_id}
                layout="card"
                row={r}
                onRewrite={() => runOneMut.mutate(r.post_id)}
                rewriting={runOneMut.isPending && runOneMut.variables === r.post_id}
              />
            ))}
          </div>
          <div className="table-scroll hidden max-h-96 overflow-y-auto rounded-lg border md:block">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr>
                  <th className="w-8 p-2"></th>
                  <th className="p-2 text-left">Post ID</th>
                  <th className="p-2 text-left">Caption gốc</th>
                  <th className="p-2 text-center">Bản</th>
                  <th className="w-20 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <CaptionVariantRow
                    key={r.post_id}
                    layout="table"
                    row={r}
                    onRewrite={() => runOneMut.mutate(r.post_id)}
                    rewriting={runOneMut.isPending && runOneMut.variables === r.post_id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <VariantPromptDialog open={promptOpen} onClose={() => setPromptOpen(false)} />
    </Card>
  )
}

/** 1 dong bai + (khi bung) noi dung 3 ban caption da viet, xem truoc khi tin dung. */
function CaptionVariantRow({
  row,
  onRewrite,
  rewriting,
  layout,
}: {
  row: CaptionVariantStatus
  onRewrite: () => void
  rewriting: boolean
  layout: 'table' | 'card'
}) {
  const [open, setOpen] = useState(false)
  const variants = useQuery({
    queryKey: ['caption-variants', row.post_id],
    queryFn: () => fetchCaptionVariants(row.post_id),
    enabled: open,
  })

  const details = (
    <>
      {variants.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải...
        </div>
      )}
      {!variants.isLoading &&
        (variants.data ?? []).map((v) => (
          <div key={v.variant_index} className="rounded-md border bg-background p-2">
            <span className="mr-1.5 font-medium text-muted-foreground">Bản {v.variant_index}:</span>
            {v.caption}
          </div>
        ))}
      {!variants.isLoading && (variants.data ?? []).length === 0 && (
        <p className="text-muted-foreground">Chưa có bản nào.</p>
      )}
    </>
  )

  if (layout === 'card') {
    return (
      <div className={cn('p-3 text-xs', open && 'bg-muted/30')}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={row.variant_count === 0}
            aria-expanded={open}
            aria-label="Xem các bản caption"
            className="-ml-1.5 -mt-1.5 shrink-0 rounded-md p-2.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{row.post_id}</span>
              <span
                className={cn(
                  'shrink-0 font-medium tabular-nums',
                  row.variant_count < 3 && 'text-warning',
                )}
              >
                {row.variant_count}/3
              </span>
            </div>
            <div className="line-clamp-2">
              {row.caption || <em className="text-muted-foreground">(trống)</em>}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" disabled={rewriting} onClick={onRewrite}>
            {rewriting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Viết lại
          </Button>
        </div>
        {open && <div className="mt-2 space-y-1.5">{details}</div>}
      </div>
    )
  }

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="p-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={row.variant_count === 0}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className="whitespace-nowrap p-2 font-mono text-[11px] text-muted-foreground">
          {row.post_id}
        </td>
        <td className="max-w-[28rem] truncate p-2">
          {row.caption || <em className="text-muted-foreground">(trống)</em>}
        </td>
        <td
          className={cn(
            'p-2 text-center tabular-nums',
            row.variant_count < 3 && 'text-warning',
          )}
        >
          {row.variant_count}/3
        </td>
        <td className="p-2">
          <Button variant="ghost" size="sm" disabled={rewriting} onClick={onRewrite}>
            {rewriting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Viết lại
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/30 last:border-0">
          <td colSpan={5} className="space-y-1.5 p-2.5">
            {details}
          </td>
        </tr>
      )}
    </>
  )
}

function VariantPromptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const prompt = useQuery({
    queryKey: ['variant-rewrite-prompt'],
    queryFn: fetchVariantRewritePrompt,
    enabled: open,
  })

  // Moi lan mo lai -> ve ban da luu (bo phan go do lan Huy truoc)
  useEffect(() => {
    if (open && prompt.data) setText(prompt.data.prompt)
  }, [open, prompt.data])

  const save = useMutation({
    mutationFn: () => saveVariantRewritePrompt(text),
    onSuccess: () => {
      toast.success('Đã lưu giọng văn')
      void qc.invalidateQueries({ queryKey: ['variant-rewrite-prompt'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const dirty = !!prompt.data && text !== prompt.data.prompt

  return (
    <Dialog open={open} onClose={onClose} dirty={dirty} busy={save.isPending} className="max-w-2xl">
      <h2 className="pr-8 text-lg font-semibold">Giọng văn viết lại caption kho bài</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hướng dẫn cho AI khi viết 3 bản caption khác nhau cho 1 bài. Để trống rồi lưu sẽ quay về
        mặc định.
      </p>
      <Textarea
        className="mt-3 max-h-[50dvh]"
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
        </Button>
      </div>
    </Dialog>
  )
}
