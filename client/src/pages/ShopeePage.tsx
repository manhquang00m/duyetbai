import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  FileDown,
  Download,
  Upload,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import {
  importShopee,
  fetchShopeeLinks,
  startShopeeLinkCheckJob,
  checkShopeeLinkOnce,
  batchStreamUrl,
  exportShopeeUrl,
  exportPostsUrl,
  SHOPEE_LINK_STATUS_LABEL,
  type ShopeeLinkRow,
  type JobState,
  type ShopeeLinkCheckResult,
  type ShopeeLinkStatus,
} from '@/lib/api'
import { LinkStatusBadge, ShopeeItemIcon } from '@/components/LinkStatusBadge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

/** Panel tien trinh kiem tra link Shopee: progress bar + tung link kem log chi tiet tung buoc. */
function ShopeeCheckProgress({ job, checking }: { job: JobState; checking: boolean }) {
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0
  const badCount = job.items.filter(
    (it) => it.shopeeStatus === 'dead' || it.shopeeStatus === 'out_of_stock',
  ).length
  const reviewCount = job.items.filter((it) => it.shopeeStatus === 'unknown').length
  const pendingUrls = [...new Set(job.logs.map((l) => l.url))].filter(
    (url) => !job.items.some((it) => it.url === url),
  )

  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">
            {checking ? 'Đang kiểm tra' : 'Hoàn tất'} {job.done}/{job.total}
          </span>
          <span className="text-muted-foreground">
            {badCount} link hỏng / {reviewCount} cần xem lại
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="max-h-80 space-y-1.5 overflow-auto text-sm">
        {job.items.map((it, i) => {
          const logs = job.logs.filter((l) => l.url === it.url)
          return (
            <li key={i} className="rounded-lg border p-2.5">
              <div className="flex items-start gap-2">
                <ShopeeItemIcon status={it.shopeeStatus} />
                {it.shopeeImage && (
                  <img src={it.shopeeImage} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  {it.shopeeTitle && (
                    <div className="truncate text-xs font-medium">{it.shopeeTitle}</div>
                  )}
                  <div className="truncate font-mono text-xs text-muted-foreground">{it.url}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.shopeeStatus === 'available' ? 'Còn hàng' : it.error}
                  </div>
                </div>
              </div>
              {logs.length > 0 && (
                <div className="mt-1.5 space-y-0.5 rounded bg-muted/50 p-1.5 pl-8 font-mono text-[11px] text-muted-foreground">
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

        {pendingUrls.map((url) => {
          const logs = job.logs.filter((l) => l.url === url)
          return (
            <li key={url} className="rounded-lg border border-dashed p-2.5">
              <div className="flex items-start gap-2">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{url}</div>
                  <div className="text-xs text-muted-foreground">
                    {logs[logs.length - 1]?.message ?? 'Đang xử lý...'}
                  </div>
                </div>
              </div>
              {logs.length > 1 && (
                <div className="mt-1.5 space-y-0.5 rounded bg-muted/50 p-1.5 pl-7 font-mono text-[11px] text-muted-foreground">
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
      </ul>
    </Card>
  )
}

export function ShopeePage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: links } = useQuery({ queryKey: ['shopee-links'], queryFn: fetchShopeeLinks })
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [checkJob, setCheckJob] = useState<JobState | null>(null)
  const [checking, setChecking] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  // 'unchecked' = chua kiem tra bao gio (link_status con trong)
  const [statusFilter, setStatusFilter] = useState<ShopeeLinkStatus | 'all' | 'unchecked'>('all')
  const esRef = useRef<EventSource | null>(null)

  const [adhocLink, setAdhocLink] = useState('')
  const [adhocChecking, setAdhocChecking] = useState(false)
  const [adhocResult, setAdhocResult] = useState<ShopeeLinkCheckResult | null>(null)

  useEffect(() => {
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [])

  const runLinkCheck = (entryIds?: number[]) => {
    setCheckJob(null)
    setChecking(true)
    startShopeeLinkCheckJob(entryIds)
      .then(({ jobId }) => {
        const es = new EventSource(batchStreamUrl(jobId))
        esRef.current = es
        es.onmessage = (e) => {
          const d = JSON.parse(e.data) as { type: string; job: JobState }
          setCheckJob(d.job)
          qc.invalidateQueries({ queryKey: ['shopee-links'] })
          if (d.type === 'end') {
            es.close()
            esRef.current = null
            setChecking(false)
            const bad = d.job.items.filter(
              (it) => it.shopeeStatus === 'dead' || it.shopeeStatus === 'out_of_stock',
            ).length
            if (bad > 0) toast.warning(`Kiểm tra xong: ${bad} link chết/hết hàng`)
            else toast.success('Kiểm tra xong, không thấy link hỏng')
          }
        }
        es.onerror = () => {
          es.close()
          esRef.current = null
          setChecking(false)
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Lỗi kiểm tra link')
        setChecking(false)
      })
  }

  const importMut = useMutation({
    mutationFn: (file: File) => importShopee(file),
    onSuccess: (res) => {
      toast.success(`Đã cập nhật ${res.updated} link mới`, {
        description: `Cột file: ${res.headers.join(' | ')}`,
      })
      qc.invalidateQueries({ queryKey: ['shopee-links'] })
      qc.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Lỗi import'),
  })

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) importMut.mutate(f)
    e.target.value = ''
  }

  const allRows = links ?? []
  const updated = allRows.filter((r) => r.new_link).length
  const uncheckedCount = allRows.filter((r) => !r.link_status).length

  const rows =
    statusFilter === 'all'
      ? allRows
      : allRows.filter((r) =>
          statusFilter === 'unchecked' ? !r.link_status : r.link_status === statusFilter,
        )

  const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const someChecked = rows.some((r) => sel.has(r.id)) && !allChecked
  const toggleRow = (id: number) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAllRows = () => {
    setSel((prev) => {
      const next = new Set(prev)
      if (allChecked) rows.forEach((r) => next.delete(r.id))
      else rows.forEach((r) => next.add(r.id))
      return next
    })
  }
  const selectedIds = rows.filter((r) => sel.has(r.id)).map((r) => r.id)

  const runSelectedCheck = () => {
    if (selectedIds.length === 0) return
    runLinkCheck(selectedIds)
  }

  const runAdhocCheck = async () => {
    const link = adhocLink.trim()
    if (!link) return
    setAdhocChecking(true)
    setAdhocResult(null)
    try {
      const result = await checkShopeeLinkOnce(link)
      setAdhocResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi kiểm tra link')
    } finally {
      setAdhocChecking(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shopee & Export</h1>
        <p className="text-sm text-muted-foreground">
          Xuất link gốc cho Shopee → gen link mới → import lại → xuất file đăng bài
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">1. Xuất link gốc</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              File [Liên kết gốc | Sub_id1..Sub_id5] (sheet "Sheet 1") để đưa lên Shopee gen link.
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={onlyMissing} onCheckedChange={setOnlyMissing} />
              Chỉ lấy link chưa có link mới
            </label>
            <a
              href={onlyMissing ? `${exportShopeeUrl}?onlyMissing=1` : exportShopeeUrl}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <FileDown className="h-4 w-4" /> shopee_input.xlsx
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">2. Import link mới</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tải file Shopee trả về (.xlsx hoặc .csv, link mới ở cột G) lên đây.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
            <Button
              variant="outline"
              size="sm"
              disabled={importMut.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {importMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Chọn file...
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">3. Xuất file đăng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              File posts.xlsx cho tool auto đăng (Comment dùng link mới).
            </p>
            <a href={exportPostsUrl} className={cn(buttonVariants({ size: 'sm' }))}>
              <Download className="h-4 w-4" /> posts.xlsx
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Link Shopee</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {updated}/{allRows.length} đã có link mới
              {uncheckedCount > 0 && ` · ${uncheckedCount} chưa kiểm tra`}
            </span>
            <SingleFilterDropdown
              label="Tình trạng"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as ShopeeLinkStatus | 'all' | 'unchecked')
                setSel(new Set()) // bo chon cu de khong lo kiem tra nham dong da bi loc di
              }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'unchecked', label: 'Chưa kiểm tra' },
                { value: 'available', label: SHOPEE_LINK_STATUS_LABEL.available },
                { value: 'dead', label: SHOPEE_LINK_STATUS_LABEL.dead },
                { value: 'out_of_stock', label: SHOPEE_LINK_STATUS_LABEL.out_of_stock },
                { value: 'unknown', label: SHOPEE_LINK_STATUS_LABEL.unknown },
              ]}
            />
            {selectedIds.length > 0 && (
              <Button size="sm" variant="outline" onClick={runSelectedCheck} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Kiểm tra đã chọn ({selectedIds.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => runLinkCheck(statusFilter === 'all' ? undefined : rows.map((r) => r.id))}
              disabled={checking || rows.length === 0}
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {statusFilter === 'all'
                ? 'Kiểm tra tất cả'
                : `Kiểm tra ${rows.length} link đang lọc`}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2.5">
          <span className="text-xs text-muted-foreground shrink-0">Kiểm tra nhanh link ngoài:</span>
          <Input
            placeholder="Dán link Shopee bất kỳ..."
            value={adhocLink}
            onChange={(e) => {
              setAdhocLink(e.target.value)
              setAdhocResult(null)
            }}
            className="h-8 max-w-sm text-xs"
          />
          <Button size="sm" variant="outline" onClick={runAdhocCheck} disabled={adhocChecking || !adhocLink.trim()}>
            {adhocChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Kiểm tra
          </Button>
          {adhocResult && (
            <span className="flex items-center gap-2 text-xs" title={adhocResult.message}>
              {adhocResult.image && (
                <img src={adhocResult.image} alt="" className="h-6 w-6 rounded object-cover" />
              )}
              {adhocResult.title && <span className="max-w-xs truncate">{adhocResult.title}</span>}
              <LinkStatusBadge status={adhocResult.status} message={adhocResult.message} />
            </span>
          )}
        </div>

        {checkJob && <ShopeeCheckProgress job={checkJob} checking={checking} />}

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-medium">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onCheckedChange={toggleAllRows} />
                  </th>
                  <th className="p-3 text-left font-medium">Post</th>
                  <th className="p-3 text-left font-medium">Sản phẩm</th>
                  <th className="p-3 text-left font-medium">Link gốc</th>
                  <th className="p-3 text-left font-medium">Link mới</th>
                  <th className="p-3 text-left font-medium">Tình trạng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: ShopeeLinkRow) => (
                  <tr key={r.id} className={cn('border-b last:border-0', sel.has(r.id) && 'bg-primary/5')}>
                    <td className="p-3">
                      <Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggleRow(r.id)} />
                    </td>
                    <td className="whitespace-nowrap p-3 font-mono text-xs">{r.post_id}</td>
                    <td className="max-w-[14rem] p-3">
                      {r.product_title ? (
                        <div className="flex items-center gap-2">
                          {r.product_image && (
                            <img
                              src={r.product_image}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded object-cover"
                            />
                          )}
                          <span className="truncate text-xs" title={r.product_title}>
                            {r.product_title}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate p-3">
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        title={r.link}
                      >
                        {r.link}
                      </a>
                    </td>
                    <td className="max-w-xs truncate p-3">
                      {r.new_link ? (
                        <a
                          href={r.new_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 underline-offset-2 hover:underline dark:text-green-400"
                          title={r.new_link}
                        >
                          {r.new_link}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <LinkStatusBadge status={r.link_status} message={r.link_message} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {allRows.length === 0
                        ? 'Chưa có link shopee nào.'
                        : 'Không có link nào khớp bộ lọc.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
