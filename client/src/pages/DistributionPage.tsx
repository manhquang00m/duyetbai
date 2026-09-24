import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CalendarDays,
  Loader2,
  Download,
  Trash2,
  Tag,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Settings2,
  Wand2,
  Info,
  Search,
} from 'lucide-react'
import {
  fetchPostingAccounts,
  fetchDistributionPool,
  previewDistribution,
  createDistributionPlan,
  fetchDistributionPlans,
  fetchDistributionPlan,
  deleteDistributionPlan,
  distributionExportUrl,
  fetchCaptionVariantStatus,
  fetchCaptionVariants,
  runCaptionVariantJob,
  runCaptionVariantForPost,
  fetchVariantRewritePrompt,
  saveVariantRewritePrompt,
  batchStreamUrl,
  ACCOUNT_TOPICS,
  APPEAL_STATUSES,
  type PlanPreview,
  type PostingAccount,
  type JobState,
  type CaptionVariantStatus,
} from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { EmptyState } from '@/components/EmptyState'
import { AssignPostingTopicsDialog } from '@/components/AssignPostingTopicsDialog'
import { PostingTopicsCell } from '@/components/PostingTopicsCell'
import { cn } from '@/lib/utils'

/** Hom nay theo gio MAY, khong dung toISOString (buoi toi VN se ra ngay hom truoc). */
function todayLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function DistributionPage() {
  const qc = useQueryClient()
  const { data: accounts } = useQuery({
    queryKey: ['posting-accounts'],
    queryFn: fetchPostingAccounts,
  })
  const { data: pool } = useQuery({ queryKey: ['dist-pool'], queryFn: fetchDistributionPool })
  const { data: plans } = useQuery({ queryKey: ['dist-plans'], queryFn: fetchDistributionPlans })

  const [sel, setSel] = useState<Set<number>>(new Set())
  const [topicDialog, setTopicDialog] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  // Rong = khong loc (hien tat ca). Mac dinh tich san 4 trang thai "dung de dang duoc / sap dung
  // duoc" - "Dang ngam" van hien de tien gan chu de truoc, du Lap ke hoach co the chua nhan.
  const [accountStatusFilter, setAccountStatusFilter] = useState<Set<string>>(
    () => new Set(['Kháng thành công', 'Live', 'Chưa kháng', 'Đang ngâm']),
  )

  const [days, setDays] = useState(7)
  const [perDay, setPerDay] = useState(1)
  const [startDate, setStartDate] = useState(todayLocal())
  const [scrapedFrom, setScrapedFrom] = useState('')
  const [scrapedTo, setScrapedTo] = useState('')
  const [planName, setPlanName] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [previewKey, setPreviewKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmShortage, setConfirmShortage] = useState(false)
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  // Tai khoan hop le (tra ve tu Xem truoc) nhung bi LOAI KHOI lan tao nay - vd chua muon len lich
  // ngay cho vai tai khoan cu the du chung van du dieu kien.
  const [excluded, setExcluded] = useState<Set<number>>(new Set())

  const all = accounts ?? []
  const withTopic = all.filter((a) => a.topics.length > 0)
  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase()
    return (accounts ?? []).filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false
      if (accountStatusFilter.size > 0 && !accountStatusFilter.has(a.appeal_status ?? ''))
        return false
      return true
    })
  }, [accounts, accountSearch, accountStatusFilter])
  // Khoa cua cau hinh hien tai: doi bat ky o nao thi ban xem truoc cu khong con dung nua.
  // sel chi tinh vao khoa khi onlySelected bat - khop dung voi cach planOptions() dung sel, tranh
  // tick chon tai khoan o bang "Chu de tai khoan dang" (khong lien quan gi toi ke hoach luc nay)
  // lam ban xem truoc bi coi la cu oan.
  const currentKey = JSON.stringify({
    days,
    perDay,
    startDate,
    scrapedFrom,
    scrapedTo,
    onlySelected,
    sel: onlySelected ? [...sel].sort() : [],
    excluded: [...excluded].sort(),
  })
  const previewStale = previewKey !== currentKey

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['posting-accounts'] })
    qc.invalidateQueries({ queryKey: ['dist-plans'] })
  }

  const toggle = (id: number) =>
    setSel((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const planOptions = () => {
    // "Chi dung N tai khoan dang chon o tren" luon uu tien (phan anh dung lua chon MOI NHAT cua
    // sel/onlySelected). Khong dung no thi fallback ve danh sach tu lan Xem truoc gan nhat (dung
    // de "excluded" o duoi con co gi ma tru, ke ca khi khong bat onlySelected).
    const base = onlySelected && sel.size > 0 ? [...sel] : preview ? preview.accounts.map((c) => c.id) : null
    const accountIds = base ? base.filter((id) => !excluded.has(id)) : undefined
    return {
      days,
      perDay,
      startDate,
      accountIds,
      scrapedFrom: scrapedFrom || undefined,
      scrapedTo: scrapedTo || undefined,
      name: planName.trim() || undefined,
    }
  }

  const doPreview = async () => {
    setBusy(true)
    try {
      const p = await previewDistribution(planOptions())
      setPreview(p)
      // Preview MOI da phan anh dung loai tru cua lan nay roi (server tra ve dung danh sach da
      // tru) - reset de tranh giu id cu khong con trong preview.accounts, gay lech so dem hien thi.
      // Dung KEY UNG VOI trang thai SAU KHI reset (excluded: []), khong dung currentKey (con mang
      // gia tri excluded CU) - neu khong previewStale se bat sai thanh true ngay sau khi vua xong.
      setExcluded(new Set())
      setPreviewKey(
        JSON.stringify({
          days,
          perDay,
          startDate,
          scrapedFrom,
          scrapedTo,
          onlySelected,
          sel: onlySelected ? [...sel].sort() : [],
          excluded: [],
        }),
      )
    } catch (err) {
      setPreview(null)
      toast.error(err instanceof Error ? err.message : 'Lỗi xem trước')
    } finally {
      setBusy(false)
    }
  }

  const doCreate = async () => {
    setBusy(true)
    try {
      const r = await createDistributionPlan(planOptions())
      toast.success(
        `Đã tạo kế hoạch: gán ${r.assigned} bài` + (r.shortage ? `, thiếu ${r.shortage} slot` : ''),
      )
      setPreview(null)
      setPreviewKey('')
      setExcluded(new Set())
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tạo kế hoạch')
    } finally {
      setBusy(false)
      setConfirmShortage(false)
    }
  }

  const onCreateClick = () => {
    if (preview && preview.assignableSlots < preview.totalSlots) setConfirmShortage(true)
    else void doCreate()
  }

  const removePlan = async (id: string) => {
    if (
      !confirm(
        'Xoá kế hoạch này?\n\nLƯU Ý: xoá kế hoạch cũng xoá lịch sử chống trùng của nó — ' +
          'các bài trong kế hoạch này sẽ được phát lại cho chính những tài khoản đó ở lần sau.',
      )
    )
      return
    await deleteDistributionPlan(id)
    invalidate()
    toast.success('Đã xoá kế hoạch')
  }

  return (
    <div className="mx-auto max-w-8xl space-y-6 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Phân phối bài</h1>
          <p className="text-sm text-muted-foreground">
            Chọn tài khoản theo chủ đề → bốc bài ngẫu nhiên không trùng → xuất file cho tool auto đăng
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
          <Info className="h-4 w-4" /> Quy tắc chia bài
        </Button>
      </div>

      {/* 1. Kho bài sạch */}
      <Card className="space-y-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Kho bài sạch</h2>
          <span className="text-2xl font-semibold tabular-nums">{pool?.total ?? '—'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_TOPICS.map((t) => {
            const n = pool?.byTopic[t] ?? 0
            return (
              <span
                key={t}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                  n === 0
                    ? 'bg-muted text-muted-foreground/60'
                    : 'bg-primary/10 text-foreground',
                )}
              >
                {t} <span className="tabular-nums">{n}</span>
              </span>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Bài sạch = có link Shopee, mọi link đều đã kiểm tra <strong>còn hàng</strong> và{' '}
          <strong>đã có link mới</strong>, có media tải được, và tác giả đã được gán chủ đề. Thiếu
          link mới thì file xuất ra sẽ dùng link gốc không có affiliate.
        </p>
      </Card>

      {/* 2. Viết lại caption kho bài */}
      <CaptionVariantCard />

      {/* 3. Chủ đề tài khoản đăng */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Chủ đề tài khoản đăng</h2>
            <p className="text-xs text-muted-foreground">
              {withTopic.length}/{all.length} tài khoản đã gán chủ đề — bấm trực tiếp vào ô chủ đề của từng dòng để sửa, lưu ngay không cần chọn trước
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={sel.size === 0} onClick={() => setTopicDialog(true)}>
            <Tag className="h-4 w-4" /> Gán hàng loạt ({sel.size})
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm tên tài khoản..."
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <StatusCheckboxFilter selected={accountStatusFilter} onChange={setAccountStatusFilter} />
          {(accountSearch || accountStatusFilter.size > 0) && (
            <span className="text-xs text-muted-foreground">
              Hiển thị {filteredAccounts.length}/{all.length} tài khoản
            </span>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left font-medium">
                  <Checkbox
                    checked={filteredAccounts.length > 0 && filteredAccounts.every((a) => sel.has(a.id))}
                    onCheckedChange={() =>
                      setSel((p) =>
                        filteredAccounts.every((a) => p.has(a.id))
                          ? new Set()
                          : new Set(filteredAccounts.map((a) => a.id)),
                      )
                    }
                  />
                </th>
                <th className="p-2.5 text-left font-medium">Tài khoản</th>
                <th className="p-2.5 text-center font-medium">Platform</th>
                <th className="p-2.5 text-left font-medium">Chủ đề (bấm để sửa)</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((a: PostingAccount) => (
                <tr key={a.id} className={cn('border-b last:border-0', sel.has(a.id) && 'bg-primary/5')}>
                  <td className="p-2.5">
                    <Checkbox checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                  </td>
                  <td className="p-2.5 font-medium">{a.name}</td>
                  <td className="p-2.5 text-center text-xs text-muted-foreground">
                    {a.platform ?? '—'}
                  </td>
                  <td className="p-2.5">
                    <PostingTopicsCell
                      accountId={a.id}
                      topics={a.topics}
                      onChanged={() => qc.invalidateQueries({ queryKey: ['posting-accounts'] })}
                    />
                  </td>
                </tr>
              ))}
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Không có tài khoản nào khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Lập kế hoạch */}
      <Card className="space-y-4 p-4">
        <h2 className="font-semibold">Lập kế hoạch</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ngày bắt đầu</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Số ngày</label>
            <Input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Bài / tài khoản / ngày
            </label>
            <Input
              type="number"
              min={1}
              max={20}
              value={perDay}
              onChange={(e) => setPerDay(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tên kế hoạch</label>
            <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="tuỳ chọn" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Chỉ lấy bài thu thập từ
            </label>
            <Input
              type="date"
              value={scrapedFrom}
              onChange={(e) => setScrapedFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">đến</label>
            <Input type="date" value={scrapedTo} onChange={(e) => setScrapedTo(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={onlySelected} onCheckedChange={setOnlySelected} />
          Chỉ dùng {sel.size} tài khoản đang chọn ở trên
        </label>

        <div className="flex items-center gap-2">
          <Button onClick={doPreview} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xem trước
          </Button>
          <Button variant="outline" onClick={onCreateClick} disabled={busy || !preview || previewStale}>
            Tạo kế hoạch
          </Button>
          {preview && previewStale && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Cấu hình đã đổi — xem trước lại trước khi tạo
            </span>
          )}
        </div>

        {preview && (
          <div className="space-y-3 rounded-lg border p-3">
            {!previewStale ? (
              <>
                <div className="text-sm">
                  Sẽ gán được{' '}
                  <strong
                    className={cn(preview.assignableSlots < preview.totalSlots && 'text-destructive')}
                  >
                    {preview.assignableSlots}
                  </strong>
                  /{preview.totalSlots} slot
                  {preview.assignableSlots < preview.totalSlots &&
                    ` — thiếu ${preview.totalSlots - preview.assignableSlots}`}
                </div>

                {preview.warnings.length > 0 && (
                  <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
                    {preview.warnings.slice(0, 8).map((w, i) => (
                      <li key={i} className="flex gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                    {preview.warnings.length > 8 && (
                      <li className="pl-5">…và {preview.warnings.length - 8} cảnh báo khác</li>
                    )}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Danh sách tài khoản đã đổi — bấm "Xem trước" lại để cập nhật số slot/cảnh báo bên
                dưới cho đúng.
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Tài khoản sẽ nhận bài:{' '}
                <strong className="text-foreground">
                  {preview.accounts.length - excluded.size}/{preview.accounts.length}
                </strong>{' '}
                đã chọn — bỏ tích những tài khoản chưa muốn lên lịch ngay, rồi bấm "Xem trước" lại
              </span>
              <button
                type="button"
                className="shrink-0 text-primary hover:underline"
                onClick={() =>
                  setExcluded((prev) =>
                    prev.size > 0 ? new Set() : new Set(preview.accounts.map((c) => c.id)),
                  )
                }
              >
                {excluded.size > 0 ? 'Chọn lại tất cả' : 'Bỏ chọn tất cả'}
              </button>
            </div>

            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/40 uppercase text-muted-foreground">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="p-2 text-left font-medium">Tài khoản</th>
                    <th className="p-2 text-left font-medium">Chủ đề</th>
                    <th className="p-2 text-right font-medium">Kho</th>
                    <th className="p-2 text-right font-medium">Cần</th>
                    <th className="p-2 text-right font-medium">Có thể thiếu</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.accounts.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        'border-b last:border-0',
                        c.deficit > 0 && 'bg-destructive/5',
                        excluded.has(c.id) && 'opacity-40',
                      )}
                    >
                      <td className="p-2">
                        <Checkbox
                          checked={!excluded.has(c.id)}
                          onCheckedChange={() =>
                            setExcluded((prev) => {
                              const next = new Set(prev)
                              if (next.has(c.id)) next.delete(c.id)
                              else next.add(c.id)
                              return next
                            })
                          }
                        />
                      </td>
                      <td className="p-2 font-medium">{c.name}</td>
                      <td className="max-w-[14rem] truncate p-2 text-muted-foreground">
                        {c.topics.join(', ')}
                      </td>
                      <td className="p-2 text-right tabular-nums">{c.poolSize}</td>
                      <td className="p-2 text-right tabular-nums">{c.demand}</td>
                      <td
                        className={cn(
                          'p-2 text-right tabular-nums',
                          c.deficit > 0 && 'font-semibold text-destructive',
                        )}
                      >
                        {c.deficit || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* 5. Kế hoạch đã tạo */}
      <Card className="overflow-hidden p-0">
        <div className="border-b p-4">
          <h2 className="font-semibold">Kế hoạch đã tạo</h2>
        </div>
        {(plans ?? []).length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Chưa có kế hoạch nào"
            description="Gán chủ đề cho tài khoản rồi lập kế hoạch ở trên."
          />
        ) : (
          <div className="divide-y">
            {(plans ?? []).map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setOpenPlan(openPlan === p.id ? null : p.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                  >
                    {openPlan === p.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {p.name || `Kế hoạch ${p.start_date}`}
                      {p.status === 'exported' && (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
                          Đã xuất
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.start_date} · {p.days} ngày × {p.per_day} bài · {p.account_count} tài khoản ·{' '}
                      <strong className={cn(p.shortage > 0 && 'text-destructive')}>
                        {p.assigned}/{p.planned}
                      </strong>{' '}
                      slot
                    </div>
                  </div>
                  <a
                    href={distributionExportUrl(p.id)}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    <Download className="h-4 w-4" /> Tải file
                  </a>
                  <Button variant="ghost" size="icon" onClick={() => removePlan(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {openPlan === p.id && <PlanDetail id={p.id} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      <AssignPostingTopicsDialog
        open={topicDialog}
        accountIds={[...sel]}
        onClose={() => setTopicDialog(false)}
        onSaved={invalidate}
      />

      <Dialog open={confirmShortage} onClose={() => setConfirmShortage(false)} className="max-w-md">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold">Kế hoạch sẽ thiếu bài</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {preview && (
                <>
                  Chỉ gán được <strong className="text-foreground">{preview.assignableSlots}</strong>/
                  {preview.totalSlots} slot —{' '}
                  <strong className="text-foreground">
                    {preview.totalSlots - preview.assignableSlots}
                  </strong>{' '}
                  slot sẽ để trống. Kế hoạch vẫn được tạo, các slot trống nằm ở sheet "thiếu" trong
                  file xuất.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmShortage(false)}>
            Huỷ
          </Button>
          <Button onClick={doCreate} disabled={busy}>
            Vẫn tạo
          </Button>
        </div>
      </Dialog>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  )
}

/** Loc nhieu trang thai tai khoan cung luc (checkbox), dung cho bang "Chu de tai khoan dang". */
function StatusCheckboxFilter({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const popover = usePopover()

  const toggle = (status: string) => {
    const next = new Set(selected)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    onChange(next)
  }

  return (
    <div className="relative inline-block">
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          selected.size > 0 && 'border-primary text-foreground',
        )}
      >
        Trạng thái
        {selected.size > 0 && <span className="font-semibold">: {selected.size}</span>}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      <PopoverPanel popover={popover} className="w-56 p-2">
        <div className="space-y-0.5">
          {APPEAL_STATUSES.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-accent"
            >
              <Checkbox checked={selected.has(t)} onCheckedChange={() => toggle(t)} />
              {t}
            </label>
          ))}
        </div>
        {selected.size > 0 && (
          <>
            <div className="my-2 border-t" />
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="w-full rounded-sm px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Bỏ lọc trạng thái
            </button>
          </>
        )}
      </PopoverPanel>
    </div>
  )
}

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="text-lg font-semibold">Quy tắc chia bài</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Thuật toán bốc bài cho từng tài khoản/ngày tuân theo đúng các quy tắc dưới đây — xem trước
        (Xem trước) và tạo thật (Tạo kế hoạch) luôn cho ra cùng kết quả với cùng cấu hình.
      </p>

      <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1 text-sm">
        <div>
          <h3 className="font-medium">1. Tài khoản đủ điều kiện</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>Đang bật (Active), không banned</li>
            <li>
              Trạng thái là <strong className="text-foreground">Live</strong>,{' '}
              <strong className="text-foreground">Kháng thành công</strong>,{' '}
              <strong className="text-foreground">Chưa kháng</strong>, hoặc{' '}
              <strong className="text-foreground">Đang ngâm</strong> — các trạng thái khác (Chưa
              tạo nick, Đang kháng, Die, chưa đặt) đều bị loại
            </li>
            <li>Đã gán ít nhất 1 chủ đề đăng (trạng thái proxy không ảnh hưởng)</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium">2. Bài đủ điều kiện ("bài sạch")</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>Có ít nhất 1 link Shopee, mọi link đều đã kiểm tra còn hàng</li>
            <li>Đã có link mới (link affiliate) — thiếu link mới thì không được tính vào kho</li>
            <li>Có ít nhất 1 ảnh hoặc video tải được</li>
            <li>Tác giả bài đã được gán chủ đề</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium">3. Giãn ngày — không phân biệt cùng tài khoản hay khác tài khoản</h3>
          <p className="mt-1 text-muted-foreground">
            Cùng 1 bài không được dùng lại trong 2 ngày liền kề (hôm qua/hôm nay/hôm sau) — áp
            dụng như nhau dù là <strong className="text-foreground">chính tài khoản đó</strong>{' '}
            đăng lại hay <strong className="text-foreground">tài khoản khác</strong> đăng, trừ
            khi dùng <strong className="text-foreground">bản caption viết lại khác nhau</strong>.
            Bài đã có 3 bản caption AI được coi là 3 "nội dung" riêng biệt nên có thể dùng tối đa
            3 lần trong cùng khung ngày đó (mỗi lần 1 bản khác); bài chưa viết lại chỉ dùng được 1
            lần trong khung ngày. Cách đủ ngày thì 1 tài khoản{' '}
            <strong className="text-foreground">được phép</strong> nhận lại đúng bài đã từng đăng
            — không có giới hạn "trọn đời". Riêng trong cùng 1 ngày, 1 tài khoản không bao giờ
            nhận trùng đúng 1 bài (dù còn bản caption khác trống).
          </p>
        </div>

        <div>
          <h3 className="font-medium">4. Chọn bản caption</h3>
          <p className="mt-1 text-muted-foreground">
            Trong các bản caption còn trống của bài được chọn, ưu tiên bản{' '}
            <strong className="text-foreground">ít bị dùng nhất</strong> (mới nhất) — tránh lặp
            đi lặp lại cùng 1 bản. Bài chưa có bản viết lại nào thì dùng tạm caption gốc.
          </p>
        </div>

        <div>
          <h3 className="font-medium">5. Phân bổ công bằng</h3>
          <p className="mt-1 text-muted-foreground">
            Mỗi ngày, mọi tài khoản nhận đủ bài thứ nhất trước khi ai đó nhận bài thứ hai. Tài
            khoản có ít lựa chọn hơn (chủ đề hẹp) được ưu tiên bốc trước, tránh bị tài khoản chủ
            đề rộng "vét" hết bài. Trong nhóm bài cùng đủ điều kiện, ưu tiên bốc bài{' '}
            <strong className="text-foreground">ít được dùng nhất</strong> trong toàn kho.
          </p>
        </div>

        <div>
          <h3 className="font-medium">6. Thiếu bài</h3>
          <p className="mt-1 text-muted-foreground">
            Nếu không còn bài nào đủ điều kiện cho 1 vị trí, kế hoạch vẫn được tạo — vị trí đó để
            trống (không tự động giảm số ngày/số bài mỗi ngày), liệt kê rõ trong sheet "thiếu" của
            file xuất.
          </p>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Đã hiểu</Button>
      </div>
    </Dialog>
  )
}

function PlanDetail({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dist-plan', id],
    queryFn: () => fetchDistributionPlan(id),
  })

  const byDate = useMemo(() => {
    const m = new Map<
      string,
      { account: string; post: string | null; topic: string | null; variant: number | null }[]
    >()
    for (const it of data?.items ?? []) {
      if (!m.has(it.post_date)) m.set(it.post_date, [])
      m.get(it.post_date)!.push({
        account: it.account_name,
        post: it.post_id,
        topic: it.topic,
        variant: it.caption_variant,
      })
    }
    return [...m.entries()]
  }, [data])

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>

  return (
    <div className="space-y-3 border-t bg-muted/20 p-4">
      {byDate.map(([date, items]) => {
        const gaps = items.filter((i) => !i.post).length
        return (
          <div key={date}>
            <div className="mb-1 text-xs font-medium">
              {date}{' '}
              <span className="text-muted-foreground">
                — {items.length - gaps} bài{gaps > 0 && `, ${gaps} slot trống`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {items.map((i, idx) => (
                <span
                  key={idx}
                  title={
                    i.post
                      ? `${i.account} → ${i.post} (${i.topic ?? ''}) — ${i.variant ? `bản ${i.variant}/3` : 'caption gốc'}`
                      : `${i.account} — thiếu bài`
                  }
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[10px]',
                    i.post ? 'bg-background text-muted-foreground' : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {i.account}
                  {i.variant && <span className="ml-0.5 text-primary">v{i.variant}</span>}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
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

  const runAllForce = () => {
    if (
      !confirm(
        `Viết lại lại TOÀN BỘ ${rows.length} bài, kể cả ${doneCount} bài đã có đủ 3 bản?\n\n` +
          'Bản cũ sẽ bị ghi đè, tốn thêm quota AI cho những bài đã xong.',
      )
    )
      return
    void runJob(rows.map((r) => r.post_id))
  }

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Viết lại caption kho bài</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {doneCount}/{rows.length} bài đã đủ 3 bản — mỗi lần 1 bài được phân phối lại cho tài
            khoản khác sẽ dùng luân phiên 1 bản khác nhau, tránh nhiều tài khoản đăng y hệt cùng
            caption.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setPromptOpen(true)}>
            <Settings2 className="h-4 w-4" /> Giọng văn
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={running || rows.length === 0}
            onClick={runAllForce}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Viết lại tất cả ({rows.length})
          </Button>
          <Button size="sm" disabled={running || missingCount === 0} onClick={() => runJob()}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Viết lại còn thiếu ({missingCount})
          </Button>
        </div>
      </div>

      {job && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
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
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? 'Ẩn danh sách bài' : 'Xem danh sách bài'}
      </button>

      {expanded && (
        <div className="max-h-96 overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/40 uppercase text-muted-foreground">
              <tr>
                <th className="w-8 p-2"></th>
                <th className="p-2 text-left font-medium">Post ID</th>
                <th className="p-2 text-left font-medium">Caption gốc</th>
                <th className="p-2 text-center font-medium">Bản</th>
                <th className="w-20 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <CaptionVariantRow
                  key={r.post_id}
                  row={r}
                  onRewrite={() => runOneMut.mutate(r.post_id)}
                  rewriting={runOneMut.isPending && runOneMut.variables === r.post_id}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    Chưa có bài nào trong kho sạch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
}: {
  row: CaptionVariantStatus
  onRewrite: () => void
  rewriting: boolean
}) {
  const [open, setOpen] = useState(false)
  const variants = useQuery({
    queryKey: ['caption-variants', row.post_id],
    queryFn: () => fetchCaptionVariants(row.post_id),
    enabled: open,
  })

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
            row.variant_count < 3 && 'text-amber-600 dark:text-amber-400',
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
            {variants.isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải...
              </div>
            )}
            {!variants.isLoading &&
              (variants.data ?? []).map((v) => (
                <div key={v.variant_index} className="rounded-md border bg-background p-2">
                  <span className="mr-1.5 font-medium text-muted-foreground">
                    Bản {v.variant_index}:
                  </span>
                  {v.caption}
                </div>
              ))}
            {!variants.isLoading && (variants.data ?? []).length === 0 && (
              <p className="text-muted-foreground">Chưa có bản nào.</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function VariantPromptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const prompt = useQuery({
    queryKey: ['variant-rewrite-prompt'],
    queryFn: fetchVariantRewritePrompt,
    enabled: open,
  })

  useEffect(() => {
    if (prompt.data) setText(prompt.data.prompt)
  }, [prompt.data])

  const save = useMutation({
    mutationFn: () => saveVariantRewritePrompt(text),
    onSuccess: () => {
      toast.success('Đã lưu giọng văn')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="text-lg font-semibold">Giọng văn viết lại caption kho bài</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hướng dẫn cho AI khi viết 3 bản caption khác nhau cho 1 bài. Để trống rồi lưu sẽ quay về
        mặc định.
      </p>
      <Textarea className="mt-3" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
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
