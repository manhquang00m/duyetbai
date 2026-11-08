import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CalendarDays,
  Hand,
  PenLine,
  Loader2,
  Download,
  Trash2,
  Tag,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
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
  createManualPlan,
  planEditedAfterExport,
  type PlanPreview,
  type PostingAccount,
} from '@/lib/api'
import { useTopics } from '@/lib/useTopics'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { AssignPostingTopicsDialog } from '@/components/AssignPostingTopicsDialog'
import { PostingTopicsCell } from '@/components/PostingTopicsCell'
import { StatusCheckboxFilter, STATUS_NONE } from '@/components/StatusCheckboxFilter'
import { SearchInput } from '@/components/filters/SearchInput'
import { DatePicker, DateRangePicker } from '@/components/ui/date-picker'
import { AccountAvatar } from '@/components/AccountAvatar'
import { POSTING_STATUSES } from '@/lib/accountAttention'
import { confirmDialog } from '@/lib/confirm'
import { addDaysIso, datePresets, fmtVN, todayIso } from '@/lib/dates'
import { cn } from '@/lib/utils'

// Thiet lap ke hoach lan truoc (so ngay, so bai/ngay, khoang thu thap) - khong nhay cam.
const PLAN_PREFS_KEY = 'distribution-plan-prefs'
interface PlanPrefs {
  days: number
  perDay: number
  scrapedFrom: string
  scrapedTo: string
}
function loadPlanPrefs(): PlanPrefs {
  const def: PlanPrefs = { days: 1, perDay: 6, scrapedFrom: '', scrapedTo: '' }
  try {
    const v = JSON.parse(localStorage.getItem(PLAN_PREFS_KEY) ?? 'null') as Partial<PlanPrefs> | null
    if (!v) return def
    return {
      days: clampInt(v.days, 1, 60, def.days),
      perDay: clampInt(v.perDay, 1, 20, def.perDay),
      scrapedFrom: typeof v.scrapedFrom === 'string' ? v.scrapedFrom : '',
      scrapedTo: typeof v.scrapedTo === 'string' ? v.scrapedTo : '',
    }
  } catch {
    return def
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * O so: giu chuoi khi dang go (xoa trang de go lai khong bi nhay ve 1), kep min/max khi roi o.
 */
function NumberField({
  value,
  onChange,
  min,
  max,
  id,
}: {
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  id?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = clampInt(text, min, max, value)
    setText(String(n))
    if (n !== value) onChange(n)
  }
  return (
    <Input
      id={id}
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const n = clampInt(clampInt(text, min, max, value) + (e.key === 'ArrowUp' ? 1 : -1), min, max, value)
          setText(String(n))
          onChange(n)
        }
      }}
      className="tabular-nums"
      aria-describedby={id ? `${id}-range` : undefined}
    />
  )
}

const tomorrow = () => addDaysIso(todayIso(), 1)

const SCRAPED_PRESETS = [
  datePresets.lastDays(3),
  datePresets.lastDays(7),
  datePresets.lastDays(30),
  datePresets.thisMonth(),
]

export function DistributionPage() {
  const topicOptions = useTopics()
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
  const [accountStatusFilter, setAccountStatusFilter] = useState<Set<string>>(() => new Set(POSTING_STATUSES))

  const [prefs] = useState(loadPlanPrefs)
  const [days, setDays] = useState(prefs.days)
  const [perDay, setPerDay] = useState(prefs.perDay)
  const [startDate, setStartDate] = useState(todayIso())
  const [scrapedFrom, setScrapedFrom] = useState(prefs.scrapedFrom)
  const [scrapedTo, setScrapedTo] = useState(prefs.scrapedTo)
  useEffect(() => {
    localStorage.setItem(PLAN_PREFS_KEY, JSON.stringify({ days, perDay, scrapedFrom, scrapedTo } satisfies PlanPrefs))
  }, [days, perDay, scrapedFrom, scrapedTo])
  const [planName, setPlanName] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [previewKey, setPreviewKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmShortage, setConfirmShortage] = useState(false)
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  // Tai khoan hop le (tra ve tu Xem truoc) nhung bi LOAI KHOI lan tao nay - vd chua muon len lich
  // ngay cho vai tai khoan cu the du chung van du dieu kien.
  const [excluded, setExcluded] = useState<Set<number>>(new Set())

  const all = accounts ?? []
  const withTopic = all.filter((a) => a.topics.length > 0)
  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase()
    return (accounts ?? []).filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false
      if (accountStatusFilter.size > 0 && !accountStatusFilter.has(a.appeal_status || STATUS_NONE))
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

  const allFilteredSelected = filteredAccounts.length > 0 && filteredAccounts.every((a) => sel.has(a.id))
  const toggleAllFiltered = () =>
    setSel((p) => {
      const n = new Set(p)
      if (allFilteredSelected) filteredAccounts.forEach((a) => n.delete(a.id))
      else filteredAccounts.forEach((a) => n.add(a.id))
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
    const ok = await confirmDialog({
      title: 'Xoá kế hoạch này?',
      description:
        'Xoá kế hoạch cũng xoá lịch sử chống trùng của nó: các bài trong kế hoạch này sẽ được phát lại cho chính những tài khoản đó ở lần sau.',
      confirmLabel: 'Xoá kế hoạch',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteDistributionPlan(id)
      toast.success('Đã xoá kế hoạch')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không xoá được kế hoạch')
    } finally {
      invalidate()
    }
  }

  return (
    <div className="mx-auto max-w-8xl space-y-6">
      <PageHeader
        title="Phân phối bài"
        description="Chọn tài khoản theo chủ đề → bốc bài ngẫu nhiên không trùng → xuất file cho tool auto đăng"
        secondary={[{ label: 'Quy tắc chia bài', icon: Info, onClick: () => setRulesOpen(true) }]}
      />

      {/* 1. Kho bài sạch */}
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-medium">Kho bài sạch</h2>
          <span className="text-2xl font-normal tabular-nums">{pool?.total ?? '—'}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 rounded-lg bg-muted px-3 py-1 sm:grid-cols-3 lg:grid-cols-5">
          {topicOptions.map((t) => {
            const n = pool?.byTopic[t] ?? 0
            return (
              <div key={t} className="flex h-8 min-w-0 items-center justify-between gap-2 text-sm">
                <span className={cn('truncate', n === 0 && 'text-muted-foreground')}>{t}</span>
                <span className={cn('shrink-0 tabular-nums', n === 0 && 'text-muted-foreground')}>{n}</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Bài sạch = có link Shopee, mọi link đều đã kiểm tra <strong>còn hàng</strong> và{' '}
          <strong>đã có link mới</strong>, có media tải được, và tác giả đã được gán chủ đề. Thiếu
          link mới thì file xuất ra sẽ dùng link gốc không có affiliate.
        </p>
      </Card>

      {/* 2. Chủ đề tài khoản đăng */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h2 className="text-base font-medium">Chủ đề tài khoản đăng</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {withTopic.length}/{all.length} tài khoản đã gán chủ đề — bấm trực tiếp vào ô chủ đề của từng dòng để sửa, lưu ngay không cần chọn trước
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={sel.size === 0}
            onClick={() => setTopicDialog(true)}
          >
            <Tag className="h-4 w-4" /> Gán hàng loạt ({sel.size})
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchInput value={accountSearch} onChange={setAccountSearch} placeholder="Tìm tên tài khoản…" />
          <StatusCheckboxFilter selected={accountStatusFilter} onChange={setAccountStatusFilter} includeNone />
          {(accountSearch || accountStatusFilter.size > 0) && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Hiển thị {filteredAccounts.length}/{all.length} tài khoản
            </span>
          )}
        </div>

        <div className="md:hidden">
          <label className="flex items-center gap-3 border-b bg-card px-4 py-2.5 text-xs text-muted-foreground">
            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
            Chọn tất cả ({filteredAccounts.length})
          </label>
          <div className="max-h-[60dvh] divide-y overflow-y-auto">
            {filteredAccounts.map((a: PostingAccount) => (
              <div key={a.id} className={cn('flex items-start gap-3 px-4 py-3', sel.has(a.id) && 'bg-chart-1/[0.06]')}>
                <Checkbox className="mt-0.5" checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <AccountAvatar name={a.name} size="sm" />
                      <span className="truncate">{a.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{a.platform ?? '—'}</span>
                  </div>
                  <PostingTopicsCell
                    accountId={a.id}
                    topics={a.topics}
                    onChanged={() => qc.invalidateQueries({ queryKey: ['posting-accounts'] })}
                  />
                </div>
              </div>
            ))}
            {filteredAccounts.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">Không có tài khoản nào khớp bộ lọc.</p>
            )}
          </div>
        </div>

        <div className="table-scroll hidden max-h-[calc(100dvh-20rem)] min-h-[16rem] overflow-y-auto md:block">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="w-10 p-2.5 text-left">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
                </th>
                <th className="w-[32%] p-2.5 text-left">Tài khoản</th>
                <th className="w-28 p-2.5 text-left">Platform</th>
                <th className="p-2.5 text-left">Chủ đề (bấm để sửa)</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((a: PostingAccount) => (
                <tr key={a.id} className={cn('border-b last:border-0', sel.has(a.id) && 'bg-chart-1/[0.06]')}>
                  <td className="p-2.5">
                    <Checkbox checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                  </td>
                  <td className="p-2.5 font-medium">
                    <span className="flex min-w-0 items-center gap-2">
                      <AccountAvatar name={a.name} size="sm" />
                      <span className="truncate">{a.name}</span>
                    </span>
                  </td>
                  <td className="p-2.5 text-xs text-muted-foreground">
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

      {/* 3. Lập kế hoạch */}
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-medium">Lập kế hoạch</h2>
            <p className="text-xs text-muted-foreground">
              Tự động chia bài theo chủ đề — hoặc tự chọn bài cho từng nick bằng “Gán thủ công”.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setManualOpen(true)} className="shrink-0">
            <Hand className="h-4 w-4" /> Gán thủ công
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Ngày bắt đầu</span>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              presets={[datePresets.today(), { label: 'Ngày mai', range: () => [tomorrow(), tomorrow()] }]}
            />
          </div>
          <div>
            <label htmlFor="plan-days" className="mb-1 block text-xs font-medium text-muted-foreground">
              Số ngày
            </label>
            <NumberField id="plan-days" value={days} onChange={setDays} min={1} max={60} />
            <span id="plan-days-range" className="mt-1 block text-[11px] text-muted-foreground">
              1–60 ngày
            </span>
          </div>
          <div>
            <label htmlFor="plan-per-day" className="mb-1 block text-xs font-medium text-muted-foreground">
              Bài / tài khoản / ngày
            </label>
            <NumberField id="plan-per-day" value={perDay} onChange={setPerDay} min={1} max={20} />
            <span id="plan-per-day-range" className="mt-1 block text-[11px] text-muted-foreground">
              1–20 bài
            </span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tên kế hoạch</label>
            <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="tuỳ chọn" />
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Chỉ lấy bài thu thập trong khoảng</span>
          <DateRangePicker
            from={scrapedFrom}
            to={scrapedTo}
            onChange={(f, t) => {
              setScrapedFrom(f)
              setScrapedTo(t)
            }}
            presets={SCRAPED_PRESETS}
            placeholder="Mọi ngày thu thập"
            clearable
          />
        </div>

        <label className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <Checkbox checked={onlySelected} onCheckedChange={setOnlySelected} />
          Chỉ dùng <span className="tabular-nums">{sel.size}</span> tài khoản đang chọn ở trên
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="flex-1 sm:flex-none" onClick={doPreview} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xem trước
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={onCreateClick}
            disabled={busy || !preview || previewStale}
          >
            Tạo kế hoạch
          </Button>
          {preview && previewStale && (
            <span className="w-full text-xs text-warning sm:w-auto">
              Cấu hình đã đổi — xem trước lại trước khi tạo
            </span>
          )}
        </div>

        {preview && (
          <div className="space-y-3 rounded-lg bg-muted p-3">            {!previewStale ? (
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
                  <ul className="space-y-1 text-xs text-warning">
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
              <p className="text-xs text-warning">
                Danh sách tài khoản đã đổi — bấm "Xem trước" lại để cập nhật số slot/cảnh báo bên
                dưới cho đúng.
              </p>
            )}

            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span>
                Tài khoản sẽ nhận bài:{' '}
                <strong className="text-foreground">
                  {preview.accounts.length - excluded.size}/{preview.accounts.length}
                </strong>{' '}
                đã chọn — bỏ tích những tài khoản chưa muốn lên lịch ngay, rồi bấm "Xem trước" lại
              </span>
              <button
                type="button"
                className="shrink-0 self-start py-1 text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground sm:self-auto"
                onClick={() =>
                  setExcluded((prev) =>
                    prev.size > 0 ? new Set() : new Set(preview.accounts.map((c) => c.id)),
                  )
                }
              >
                {excluded.size > 0 ? 'Chọn lại tất cả' : 'Bỏ chọn tất cả'}
              </button>
            </div>

            <div className="table-scroll max-h-[50dvh] overflow-y-auto rounded-lg border bg-background sm:max-h-64">
              <table className="w-full min-w-[30rem] text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="p-2 text-left">Tài khoản</th>
                    <th className="p-2 text-left">Chủ đề</th>
                    <th className="p-2 text-right">Kho</th>
                    <th className="p-2 text-right">Cần</th>
                    <th className="p-2 text-right">Có thể thiếu</th>
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

      {/* 4. Kế hoạch đã tạo */}
      <Card className="overflow-hidden p-0">
        <div className="border-b p-4">
          <h2 className="text-base font-medium">Kế hoạch đã tạo</h2>
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
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenPlan(openPlan === p.id ? null : p.id)}
                      aria-expanded={openPlan === p.id}
                      aria-label="Xem chi tiết kế hoạch"
                      className="-my-1 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent"
                    >
                      {openPlan === p.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        <span className="min-w-0 truncate">{p.name || `Kế hoạch ${p.start_date}`}</span>
                        {p.kind === 'manual' && (
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-pill-neutral px-2 py-0.5 text-[11px] font-medium text-pill-neutral-ink">
                            Thủ công
                          </span>
                        )}
                        {p.status === 'exported' &&
                          (planEditedAfterExport(p) ? (
                            <span
                              className="shrink-0 whitespace-nowrap rounded-full bg-pill-warning px-2 py-0.5 text-[11px] font-medium text-pill-warning-ink"
                              title="Kế hoạch đã sửa sau lần xuất file gần nhất — tải lại file"
                            >
                              Đã sửa sau khi xuất
                            </span>
                          ) : (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-pill-positive px-2 py-0.5 text-[11px] font-medium text-pill-positive-ink">
                              Đã xuất
                            </span>
                          ))}
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {p.kind === 'manual' ? (
                          <>
                            {p.start_date} · {p.days} ngày · {p.account_count} nick ·{' '}
                            <strong className="text-foreground">{p.assigned}</strong> bài gán tay
                          </>
                        ) : (
                          <>
                            {p.start_date} · {p.days} ngày × {p.per_day} bài · {p.account_count} tài khoản ·{' '}
                            <strong className={cn(p.shortage > 0 && 'text-destructive')}>
                              {p.assigned}/{p.planned}
                            </strong>{' '}
                            slot
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-11 sm:pl-0">
                    {p.kind === 'manual' && (
                      <Link
                        to={`/distribution/plans/${p.id}/edit`}
                        className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'flex-1 sm:flex-none')}
                      >
                        <PenLine className="h-4 w-4" /> Sửa
                      </Link>
                    )}
                    <a
                      href={distributionExportUrl(p.id)}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1 sm:flex-none')}
                    >
                      <Download className="h-4 w-4" /> Tải file
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Xoá kế hoạch"
                      onClick={() => removePlan(p.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
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
        <div className="flex items-start gap-3 pr-8">
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
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setConfirmShortage(false)}>
            Huỷ
          </Button>
          <Button onClick={doCreate} disabled={busy}>
            Vẫn tạo
          </Button>
        </div>
      </Dialog>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <NewManualPlanDialog open={manualOpen} onClose={() => setManualOpen(false)} defaultDays={days} />
    </div>
  )
}

/** Tao ke hoach thu cong rong roi chuyen thang sang man hinh gan bai. */
function NewManualPlanDialog({
  open,
  onClose,
  defaultDays,
}: {
  open: boolean
  onClose: () => void
  defaultDays: number
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [days, setDays] = useState(defaultDays)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setStartDate(todayIso())
    setDays(defaultDays)
  }, [open, defaultDays])

  const create = async () => {
    setBusy(true)
    try {
      const { planId } = await createManualPlan({ name: name.trim() || undefined, startDate, days })
      qc.invalidateQueries({ queryKey: ['dist-plans'] })
      onClose()
      navigate(`/distribution/plans/${planId}/edit`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không tạo được kế hoạch')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} busy={busy} className="max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <h2 className="pr-8 text-lg font-semibold">Kế hoạch gán thủ công</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tự chọn bài cho từng nick: chọn nick → danh sách bài theo chủ đề của nick, nhiều tim nhất lên đầu → bấm
          Gán.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="manual-name" className="mb-1 block text-xs font-medium text-muted-foreground">
              Tên kế hoạch
            </label>
            <Input
              id="manual-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="tuỳ chọn, vd “Tuần 46 — chọn tay”"
              maxLength={120}
              data-autofocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Ngày bắt đầu</span>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                presets={[datePresets.today(), { label: 'Ngày mai', range: () => [tomorrow(), tomorrow()] }]}
              />
            </div>
            <div>
              <label htmlFor="manual-days" className="mb-1 block text-xs font-medium text-muted-foreground">
                Số ngày
              </label>
              <NumberField id="manual-days" value={days} onChange={setDays} min={1} max={60} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {fmtVN(startDate)} → {fmtVN(addDaysIso(startDate, days - 1))} · mọi thay đổi tự lưu.
          </p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" disabled={busy || !startDate}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Tạo và bắt đầu gán
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="pr-8 text-lg font-semibold">Quy tắc chia bài</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Thuật toán bốc bài cho từng tài khoản/ngày tuân theo đúng các quy tắc dưới đây — xem trước
        (Xem trước) và tạo thật (Tạo kế hoạch) luôn cho ra cùng kết quả với cùng cấu hình.
      </p>

      <div className="mt-4 max-h-[60dvh] space-y-4 overflow-y-auto pr-1 text-sm">
        <div>
          <h3 className="font-medium">1. Tài khoản đủ điều kiện</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>Đang bật (Active), không banned</li>
            <li>
              Trạng thái là <strong className="text-foreground">Live</strong> hoặc{' '}
              <strong className="text-foreground">Đang ngâm</strong> — các trạng thái khác (Chưa
              tạo nick, Die, chưa đặt) đều bị loại
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

      <div className="mt-5 flex flex-col sm:flex-row sm:justify-end">
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

  if (isLoading)
    return (
      <div className="space-y-2 border-t bg-muted/20 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    )

  return (
    <div className="space-y-3 border-t bg-muted/20 p-3 sm:p-4">
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
                    'max-w-full truncate rounded px-1.5 py-0.5 text-xs',
                    i.post ? 'bg-background text-muted-foreground' : 'bg-pill-negative text-pill-negative-ink',
                  )}
                >
                  {i.account}
                  {i.variant && <span className="ml-0.5 text-foreground">v{i.variant}</span>}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
