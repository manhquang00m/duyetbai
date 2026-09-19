import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileDown, Loader2, RefreshCw, Save, Settings2, Upload, Wand2 } from 'lucide-react'
import {
  batchStreamUrl,
  fetchRewriteBatch,
  fetchRewritePrompt,
  rewriteExportUrl,
  rewriteRowAgain,
  saveRewritePrompt,
  saveRewriteRow,
  startRewriteJob,
  uploadRewriteFile,
  type JobState,
  type RewriteRow,
} from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog } from '@/components/ui/dialog'
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

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // cho phep chon lai dung file do
    if (f) uploadMut.mutate(f)
  }

  const run = async () => {
    if (!batchId) return
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

  const againMut = useMutation({
    mutationFn: (rowId: number) => rewriteRowAgain(rowId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rewrite', batchId] })
      toast.success('Đã viết lại dòng này')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rows = batch.data?.rows ?? []
  const doneCount = rows.filter((r) => r.rewritten).length
  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Viết lại caption bằng AI</h1>
          <p className="text-sm text-muted-foreground">
            Tải file Excel lên (caption ở cột B) → AI viết lại → sửa tay nếu cần → tải file mới về
            (cột B = bản viết lại, cột K = caption gốc)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPromptOpen(true)}>
          <Settings2 className="h-4 w-4" /> Giọng văn
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">1. Chọn file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              File .xlsx hoặc .csv, tối đa 10MB. Caption đọc ở cột B, các cột khác giữ nguyên.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
            <Button
              variant="outline"
              size="sm"
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
              <p className="text-xs text-muted-foreground">
                Đang mở: {batch.data.fileName} · {rows.length} dòng
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">2. Viết lại</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cần có LLM_API_KEY trong server/.env. Link và hashtag được giữ nguyên.
            </p>
            <Button size="sm" disabled={!batchId || running || rows.length === 0} onClick={run}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Viết lại {rows.length ? `${rows.length} dòng` : ''}
            </Button>
            {job && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>
                    {job.done}/{job.total}
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">3. Tải file mới</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dòng chưa viết lại sẽ giữ nguyên caption gốc ở cột B.
            </p>
            {batchId ? (
              <a
                href={rewriteExportUrl(batchId)}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <FileDown className="h-4 w-4" /> Tải file
              </a>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <FileDown className="h-4 w-4" /> Tải file
              </Button>
            )}
            {rows.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Đã viết lại {doneCount}/{rows.length} dòng
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {batch.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Đối chiếu &amp; sửa tay</CardTitle>
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
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Bản mới</span>
                      <div className="flex gap-1">
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
                      onChange={(e) => setEdited((p) => ({ ...p, [r.id]: e.target.value }))}
                    />
                    {r.error && <div className="mt-1 text-xs text-destructive">{r.error}</div>}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <PromptDialog open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  )
}

function PromptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const prompt = useQuery({ queryKey: ['rewrite-prompt'], queryFn: fetchRewritePrompt, enabled: open })

  useEffect(() => {
    if (prompt.data) setText(prompt.data.prompt)
  }, [prompt.data])

  const save = useMutation({
    mutationFn: () => saveRewritePrompt(text),
    onSuccess: () => {
      toast.success('Đã lưu giọng văn')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="text-lg font-semibold">Giọng văn AI</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hướng dẫn cho AI khi viết lại. Để trống rồi lưu sẽ quay về mặc định.
      </p>
      <Textarea
        className="mt-3"
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-4 flex justify-end gap-2">
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
