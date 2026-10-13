import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink, FileCode2, ClipboardList, Search } from 'lucide-react'
import { fetchPostRunsDay, fetchPostRunsAccounts, type PostRunDayRow, type PostRunState } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatusCheckboxFilter, STATUS_NONE } from '@/components/StatusCheckboxFilter'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Cong/tru ngay tren chuoi 'YYYY-MM-DD' theo gio may (khong qua UTC). */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return fmt(new Date(y, m - 1, d + days))
}

const STATE_LABEL: Record<PostRunState, string> = {
  commented: 'Đăng + CMT thành công',
  posted: 'Đăng OK, thiếu CMT',
  missing: 'Chưa báo cáo',
}
const STATE_CLASS: Record<PostRunState, string> = {
  commented: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  posted: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  missing: 'bg-muted text-muted-foreground',
}

type Tab = 'all' | 'posted' | 'missing' | 'commented' | 'extra'
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'posted', label: 'Thiếu CMT' },
  { value: 'missing', label: 'Chưa báo cáo' },
  { value: 'commented', label: 'Hoàn tất' },
  { value: 'extra', label: 'Ngoài kế hoạch' },
]

function StateBadge({ state }: { state: PostRunState }) {
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', STATE_CLASS[state])}>
      {STATE_LABEL[state]}
    </span>
  )
}

function RunThumb({ thumb }: { thumb: string | null }) {
  return thumb ? (
    <img src={`/media/${thumb}`} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md object-cover sm:h-9 sm:w-9" />
  ) : (
    <div className="h-10 w-10 shrink-0 rounded-md bg-muted sm:h-9 sm:w-9" />
  )
}

function RunCard({ r }: { r: PostRunDayRow }) {
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{r.account_name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.posted_at?.slice(11, 16) ?? '—'}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <RunThumb thumb={r.thumb} />
        <div className="min-w-0">
          <div className="truncate text-xs">{r.caption || <em>(không có caption)</em>}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {r.post_id}
            {r.caption_variant ? ` · bản ${r.caption_variant}` : ''}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StateBadge state={r.state} />
        {r.reports > 1 && <span className="text-[10px] text-muted-foreground">báo {r.reports} lần</span>}
        <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">
          {r.in_plan ? r.plan_name : 'Ngoài kế hoạch'}
        </span>
        {r.posted_url && (
          <a
            href={r.posted_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 py-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Mở
          </a>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'good' }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums sm:mt-1.5',
          tone === 'warn' && value > 0 && 'text-amber-600 dark:text-amber-400',
          tone === 'good' && 'text-green-700 dark:text-green-400',
        )}
      >
        {value.toLocaleString('vi-VN')}
      </div>
    </Card>
  )
}

// Cot cua file xuat cho tool (services/distributionExporter.ts): A AccountName, B Caption,
// C VideoPath, D ImagePath, E Comment, F Topic, G URL, H POST_ID, I TrangThai, J Ngay dang.
const FIELD_MAP: { field: string; source: string; required: boolean; example: string; note?: string }[] = [
  {
    field: 'accountName',
    source: 'Cột A — AccountName',
    required: true,
    example: 'phuongnhabeby',
    note: 'Copy nguyên văn, không đổi hoa/thường.',
  },
  {
    field: 'postId',
    source: 'Cột H — POST_ID',
    required: true,
    example: 'DdnYsSQE8Ax-v2',
    note: 'Giữ nguyên cả đuôi -v1/-v2 nếu có.',
  },
  {
    field: 'postDate',
    source: 'Cột J — Ngày đăng',
    required: true,
    example: '2026-09-25',
    note: 'Dạng YYYY-MM-DD, đúng như trong file (không phải ngày tool chạy).',
  },
  {
    field: 'status',
    source: 'Tool tự điền',
    required: true,
    example: 'posted',
    note: 'posted = đăng bài xong · commented = đăng bài + comment xong.',
  },
  {
    field: 'postedUrl',
    source: 'Tool lấy sau khi đăng',
    required: false,
    example: 'https://www.threads.com/@phuongnhabeby/post/...',
    note: 'Link bài VỪA ĐĂNG. Không dùng cột G (URL) — đó là link bài gốc đã cào.',
  },
  {
    field: 'postedAt',
    source: 'Tool lấy giờ lúc đăng xong',
    required: false,
    example: '2026-09-25 09:12:03',
    note: 'Dạng YYYY-MM-DD HH:MM:SS. Chưa có giá trị thì bỏ hẳn trường này.',
  },
]

const SAMPLE_BODY = `{
  "results": [
    {
      "accountName": "phuongnhabeby",
      "postId": "DdnYsSQE8Ax-v2",
      "postDate": "2026-09-25",
      "status": "posted",
      "postedUrl": "https://www.threads.com/@phuongnhabeby/post/...",
      "postedAt": "2026-09-25 09:12:03"
    }
  ]
}`

function ApiDocDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-3xl">
      <h2 className="pr-8 text-lg font-semibold">API cho tool auto đăng</h2>
      <div className="mt-3 max-h-[65dvh] space-y-4 overflow-auto pr-1 text-sm">
        <div className="space-y-1">
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
            POST http://localhost:3000/api/automation/post-results
          </code>
          <p className="text-xs text-muted-foreground">
            Header <code>X-Api-Key</code> = giá trị <code>AUTOMATION_API_KEY</code> trong <code>server/.env</code> ·{' '}
            <code>Content-Type: application/json</code>
          </p>
        </div>

        <div>
          <h3 className="mb-1.5 text-sm font-medium">Các trường — lấy từ đâu trong file Excel</h3>
          <div className="space-y-2 sm:hidden">
            {FIELD_MAP.map((f) => (
              <div key={f.field} className="rounded-lg border p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">{f.field}</span>
                  <span className={cn('shrink-0', f.required ? 'font-medium' : 'text-muted-foreground')}>
                    {f.required ? 'Bắt buộc' : 'Tuỳ chọn'}
                  </span>
                </div>
                <div className="mt-0.5 text-muted-foreground">{f.source}</div>
                <code className="mt-1 block break-all">{f.example}</code>
                {f.note && <div className="mt-0.5 text-muted-foreground">{f.note}</div>}
              </div>
            ))}
          </div>
          <div className="table-scroll hidden rounded-md border sm:block">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2 text-left font-medium">Trường</th>
                  <th className="p-2 text-left font-medium">Lấy từ</th>
                  <th className="p-2 text-left font-medium">Bắt buộc</th>
                  <th className="p-2 text-left font-medium">Ví dụ / ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_MAP.map((f) => (
                  <tr key={f.field} className="border-t align-top">
                    <td className="p-2 font-mono">{f.field}</td>
                    <td className="whitespace-nowrap p-2">{f.source}</td>
                    <td className="p-2">{f.required ? 'Có' : 'Không'}</td>
                    <td className="p-2">
                      <code className="break-all">{f.example}</code>
                      {f.note && <div className="mt-0.5 text-muted-foreground">{f.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Các cột B–G, I của file (Caption, VideoPath, ImagePath, Comment, Topic, URL, TrangThai) KHÔNG cần gửi lên.
          </p>
        </div>

        <div>
          <h3 className="mb-1.5 text-sm font-medium">Ví dụ body</h3>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{SAMPLE_BODY}</pre>
          <p className="mt-1 text-xs text-muted-foreground">
            Server cũng nhận 1 object không bọc <code>results</code>, hoặc 1 mảng. JSON chỉ dùng nháy kép{' '}
            <code>"..."</code>; biến phải được thay giá trị trước khi gửi.
          </p>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            Gọi ngay sau MỖI bài: đăng xong gửi <code>posted</code>, comment xong gửi tiếp <code>commented</code> cho cùng
            bài. Gửi lại không sao — ghi đè, không bao giờ hạ từ commented xuống posted.
          </li>
          <li>Lỗi mạng / 5xx: thử lại 3–5 lần, cách nhau 2–5 giây. Timeout nên để ~10 giây.</li>
          <li>
            Mã lỗi: <code>401</code> sai/thiếu key · <code>400</code> dữ liệu sai (phản hồi ghi rõ trường nào) ·{' '}
            <code>503</code> server chưa cấu hình key. Chi tiết xem <code>logs/server-&lt;ngày&gt;.log</code>.
          </li>
          <li>
            Phản hồi 200 trả từng dòng: <code>matchedPlan</code> = khớp lịch Phân phối bài; <code>unknownAccount</code> /{' '}
            <code>unknownPost</code> = tên nick / mã bài không có trong hệ thống (thường do gửi sai cột).
          </li>
        </ul>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </Dialog>
  )
}

export function PostLogPage() {
  const [date, setDate] = useState(fmt(new Date()))
  const [tab, setTab] = useState<Tab>('all')
  const [accountSearch, setAccountSearch] = useState('')
  // Giong mac dinh o Phan phoi bai: cac trang thai duoc phep nhan bai. Rong = khong loc.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(['Kháng thành công', 'Live', 'Chưa kháng', 'Đang ngâm']),
  )
  const [docOpen, setDocOpen] = useState(false)
  const [sort, setSort] = useState<'newest' | 'oldest' | 'account'>('newest')

  const { data: rows, isLoading } = useQuery({
    queryKey: ['post-runs-day', date],
    queryFn: () => fetchPostRunsDay(date),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
  })
  const rangeFrom = shiftDate(date, -6)
  const { data: accounts } = useQuery({
    queryKey: ['post-runs-accounts', rangeFrom, date],
    queryFn: () => fetchPostRunsAccounts(rangeFrom, date),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
  })

  const matchAccount = (name: string, status: string | null) => {
    const q = accountSearch.trim().toLowerCase()
    if (q && !name.toLowerCase().includes(q)) return false
    if (statusFilter.size > 0 && !statusFilter.has(status || STATUS_NONE)) return false
    return true
  }

  const all = useMemo(() => rows ?? [], [rows])
  // So lieu KPI + bang deu tinh tren tap nick DA LOC (tim ten + trang thai tai khoan).
  const base = all.filter((r) => matchAccount(r.account_name, r.appeal_status))
  const planned = base.filter((r) => r.in_plan)
  const kpi = {
    planned: planned.length,
    commented: planned.filter((r) => r.state === 'commented').length,
    posted: planned.filter((r) => r.state === 'posted').length,
    missing: planned.filter((r) => r.state === 'missing').length,
    extra: base.filter((r) => !r.in_plan).length,
  }
  const nickCount = new Set(base.map((r) => r.account_name)).size
  const totalNicks = new Set(all.map((r) => r.account_name)).size
  const visibleAccounts = (accounts ?? []).filter((a) => matchAccount(a.account_name, a.appeal_status))

  const filtered = base.filter((r: PostRunDayRow) => {
    if (tab === 'extra') return !r.in_plan
    if (tab !== 'all') return r.in_plan && r.state === tab
    return true
  })
  // Dong chua co gio (chua bao cao) luon xuong cuoi, ca khi sap cu nhat.
  const visible = useMemo(() => {
    if (sort === 'account') return filtered
    const dir = sort === 'newest' ? -1 : 1
    const timeOf = (r: PostRunDayRow) => r.posted_at ?? r.last_reported_at ?? ''
    return [...filtered].sort((a, b) => {
      const ta = timeOf(a)
      const tb = timeOf(b)
      if (!ta && !tb) return 0
      if (!ta) return 1
      if (!tb) return -1
      return ta < tb ? dir : ta > tb ? -dir : 0
    })
  }, [filtered, sort])

  return (
    <div className="mx-auto max-w-8xl space-y-4 sm:space-y-5">
      <PageHeader
        title="Nhật ký đăng"
        description="Nick nào đăng bài gì trong ngày, đã comment chưa — do tool auto báo về qua API"
        actions={
          <Button variant="outline" size="sm" onClick={() => setDocOpen(true)}>
            <FileCode2 className="h-4 w-4" /> API cho tool auto
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button variant="outline" size="icon" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Ngày trước">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
          <Button variant="outline" size="icon" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="Ngày sau">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setDate(fmt(new Date()))}>
            Hôm nay
          </Button>
        </div>
        <div className="relative w-full sm:ml-2 sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm tên tài khoản..."
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            className="pl-8 sm:text-xs"
          />
        </div>
        <StatusCheckboxFilter selected={statusFilter} onChange={setStatusFilter} includeNone />
        {(accountSearch || statusFilter.size > 0) && totalNicks > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {nickCount}/{totalNicks} nick
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Kpi label="Theo lịch" value={kpi.planned} />
            <Kpi label="Đăng + CMT thành công" value={kpi.commented} tone="good" />
            <Kpi label="Đăng OK, thiếu CMT" value={kpi.posted} tone="warn" />
            <Kpi label="Chưa báo cáo" value={kpi.missing} tone="warn" />
            <Kpi label="Ngoài kế hoạch" value={kpi.extra} />
          </>
        )}
      </div>
      {kpi.posted > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Bài thiếu comment là bài KHÔNG có link affiliate — nên comment bù để không mất đơn.
        </p>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="table-scroll flex min-w-0 flex-1 items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors sm:py-1.5',
                  tab === t.value ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <SingleFilterDropdown
            label="Sắp xếp"
            activeWhen="newest"
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            options={[
              { value: 'newest', label: 'Mới nhất' },
              { value: 'oldest', label: 'Cũ nhất' },
              { value: 'account', label: 'Theo nick' },
            ]}
          />
          <span className="shrink-0 whitespace-nowrap pr-1 text-xs tabular-nums text-muted-foreground">
            {visible.length} dòng
          </span>
        </div>

        {isLoading && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!isLoading && visible.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title={all.length === 0 ? 'Ngày này chưa có lịch đăng' : 'Không có dòng nào khớp'}
            description={
              all.length === 0
                ? 'Tạo kế hoạch ở trang Phân phối bài, tool auto sẽ báo kết quả về đây.'
                : 'Thử đổi bộ lọc hoặc từ khoá.'
            }
          />
        )}

        {!isLoading && visible.length > 0 && (
          <div className="divide-y md:hidden">
            {visible.map((r) => (
              <RunCard key={`${r.account_name}|${r.post_id}`} r={r} />
            ))}
          </div>
        )}

        <div
          className={cn(
            'table-scroll hidden max-h-[calc(100dvh-24rem)] min-h-[16rem] overflow-y-auto',
            !isLoading && visible.length > 0 && 'md:block',
          )}
        >
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left font-medium">Nick</th>
                <th className="p-2.5 text-left font-medium">Bài</th>
                <th className="p-2.5 text-left font-medium">Trạng thái</th>
                <th className="p-2.5 text-left font-medium">Giờ đăng</th>
                <th className="p-2.5 text-left font-medium">Link</th>
                <th className="p-2.5 text-left font-medium">Kế hoạch</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                  <tr key={`${r.account_name}|${r.post_id}`} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap p-2.5 font-medium">{r.account_name}</td>
                    <td className="max-w-[22rem] p-2.5">
                      <div className="flex items-center gap-2.5">
                        <RunThumb thumb={r.thumb} />
                        <div className="min-w-0">
                          <div className="truncate text-xs">{r.caption || <em>(không có caption)</em>}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {r.post_id}
                            {r.caption_variant ? ` · bản ${r.caption_variant}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <StateBadge state={r.state} />
                      {r.reports > 1 && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">báo {r.reports} lần</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-2.5 text-xs text-muted-foreground">
                      {r.posted_at?.slice(11, 16) ?? '—'}
                    </td>
                    <td className="p-2.5">
                      {r.posted_url ? (
                        <a
                          href={r.posted_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Mở
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-[10rem] truncate p-2.5 text-xs text-muted-foreground">
                      {r.in_plan ? r.plan_name : 'Ngoài kế hoạch'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {visibleAccounts.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Tổng hợp theo nick · {rangeFrom.slice(8, 10)}/{rangeFrom.slice(5, 7)} → {date.slice(8, 10)}/
              {date.slice(5, 7)} (7 ngày)
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Mỗi dòng = 1 nick, đếm số bài theo lịch Phân phối bài trong 7 ngày trên. Nick có nhiều bài{' '}
              <b>thiếu CMT</b> + <b>chưa báo cáo</b> xếp lên đầu — nên kiểm tra proxy / checkpoint của nick đó. Slot của
              hôm nay chưa tới giờ chạy cũng tính là chưa báo cáo.
            </p>
          </div>
          <div className="table-scroll max-h-[60dvh] overflow-y-auto sm:max-h-80">
            <table className="w-full min-w-[28rem] text-xs">
              <thead className="sticky top-0 z-20 bg-muted text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-muted p-2 text-left font-medium">Nick</th>
                  <th className="p-2 text-right font-medium" title="Tổng số bài kế hoạch giao cho nick trong 7 ngày">Theo lịch</th>
                  <th className="p-2 text-right font-medium" title="Đăng bài + comment thành công">Hoàn tất</th>
                  <th className="p-2 text-right font-medium" title="Đăng bài xong nhưng chưa comment = bài không có link affiliate">Thiếu CMT</th>
                  <th className="p-2 text-right font-medium" title="Có trong lịch nhưng tool chưa gửi kết quả (chưa chạy / crash / nick lỗi)">Chưa báo cáo</th>
                  <th className="p-2 text-right font-medium" title="Tool báo đã đăng nhưng bài không nằm trong lịch">Ngoài KH</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((a) => (
                  <tr key={a.account_name} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-card p-2 font-medium">{a.account_name}</td>
                    <td className="p-2 text-right tabular-nums">{a.planned}</td>
                    <td className="p-2 text-right tabular-nums">{a.commented}</td>
                    <td
                      className={cn(
                        'p-2 text-right tabular-nums',
                        a.posted_only > 0 && 'font-medium text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {a.posted_only}
                    </td>
                    <td className={cn('p-2 text-right tabular-nums', a.missing > 0 && 'font-medium')}>{a.missing}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{a.extra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ApiDocDialog open={docOpen} onClose={() => setDocOpen(false)} />
    </div>
  )
}
