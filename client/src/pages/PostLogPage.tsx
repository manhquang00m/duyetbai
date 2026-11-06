import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileCode2,
  ClipboardList,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import {
  fetchPostRunsDay,
  fetchPostRunsAccounts,
  fetchPostRunViolations,
  resolvePostRunViolation,
  type PostRunDayRow,
  type PostRunState,
  type PostRunViolation,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatusCheckboxFilter, STATUS_NONE } from '@/components/StatusCheckboxFilter'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { DatePicker } from '@/components/ui/date-picker'
import { SearchInput } from '@/components/filters/SearchInput'
import { AccountAvatar } from '@/components/AccountAvatar'
import { PostThumb } from '@/components/PostThumb'
import { POSTING_STATUSES } from '@/lib/accountAttention'
import { confirmDialog } from '@/lib/confirm'
import { datePresets, todayIso } from '@/lib/dates'
import { q, useUrlState } from '@/lib/useUrlState'
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
  commented: 'text-xs text-muted-foreground',
  posted: 'rounded-full bg-pill-warning px-2 py-0.5 text-[11px] font-medium text-pill-warning-ink',
  missing: 'text-xs text-muted-foreground',
}

const TAB_VALUES = ['all', 'posted', 'missing', 'commented', 'extra'] as const
type Tab = (typeof TAB_VALUES)[number]
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'posted', label: 'Thiếu CMT' },
  { value: 'missing', label: 'Chưa báo cáo' },
  { value: 'commented', label: 'Hoàn tất' },
  { value: 'extra', label: 'Ngoài kế hoạch' },
]

// Trang thai mac dinh giong Phan phoi bai: cac trang thai duoc nhan bai. Rong = khong loc.
const URL_SCHEMA = {
  date: q.str(todayIso()),
  q: q.str(),
  status: q.list(POSTING_STATUSES),
  tab: q.enum(TAB_VALUES, 'all'),
  sort: q.enum(['newest', 'oldest', 'account'] as const, 'newest'),
}

function StateBadge({ state }: { state: PostRunState }) {
  return (
    <span className={cn('inline-flex shrink-0 whitespace-nowrap', STATE_CLASS[state])}>
      {STATE_LABEL[state]}
    </span>
  )
}

function RunThumb({ thumb }: { thumb: string | null }) {
  return <PostThumb thumb={thumb} className="h-10 w-10 sm:h-9 sm:w-9" />
}

/** Nick: avatar mau rieng + ten, de nhan ra nick bang mat tren cac bang dai. */
function Nick({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AccountAvatar name={name} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  )
}

function RunCard({ r }: { r: PostRunDayRow }) {
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-medium">
          <Nick name={r.account_name} />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.posted_at?.slice(11, 16) ?? '—'}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <RunThumb thumb={r.thumb} />
        <div className="min-w-0">
          <div className="truncate text-xs">{r.caption || <em>(không có caption)</em>}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {r.post_id}
            {r.caption_variant ? ` · bản ${r.caption_variant}` : ''}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StateBadge state={r.state} />
        {r.reports > 1 && <span className="text-xs text-muted-foreground">báo {r.reports} lần</span>}
        <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">
          {r.in_plan ? r.plan_name : 'Ngoài kế hoạch'}
        </span>
        {r.posted_url && (
          <a
            href={r.posted_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 py-1 text-xs text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Mở
          </a>
        )}
      </div>
    </div>
  )
}

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—')

function ViolationPost({ v }: { v: PostRunViolation }) {
  if (!v.post_id) return <span className="text-xs text-muted-foreground">Không rõ bài</span>
  return (
    <div className="min-w-0">
      {v.caption && <div className="truncate text-xs">{v.caption}</div>}
      <div className="font-mono text-xs text-muted-foreground">{v.post_id}</div>
    </div>
  )
}

function ViolationLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground">
      <ExternalLink className="h-3 w-3" /> Mở
    </a>
  )
}

const ddmmHHmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`
/** Ngay de xem bai cua nick: ngay dang bai neu tool gui, khong thi ngay phat hien. */
const violationDay = (v: PostRunViolation) => v.posted_at ?? v.detected_at.slice(0, 10)

function ViewPostsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onClick}>
      <Eye className="h-3.5 w-3.5" /> Xem bài
    </Button>
  )
}

function ResolveButton({ v, onResolve, pending }: { v: PostRunViolation; onResolve: (v: PostRunViolation) => void; pending: boolean }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      disabled={pending}
      onClick={() => onResolve(v)}
    >
      <CheckCircle2 className="h-3.5 w-3.5" /> Đã gỡ
    </Button>
  )
}

function AccountDayDialog({ v, onClose }: { v: PostRunViolation | null; onClose: () => void }) {
  const [offset, setOffset] = useState(0)
  const baseDay = v ? violationDay(v) : ''
  const day = v ? shiftDate(baseDay, offset) : ''
  const { data, isLoading } = useQuery({
    queryKey: ['post-runs-day', day],
    queryFn: () => fetchPostRunsDay(day),
    enabled: !!v,
  })
  const [nameQ, setNameQ] = useState(v?.account_name ?? '')
  const q = nameQ.trim().toLowerCase()
  // Moi nhat len dau; dong chua co gio dang xuong cuoi.
  const runs = (data ?? [])
    .filter((r) => !q || r.account_name.toLowerCase().includes(q))
    .sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''))
  return (
    <Dialog open={!!v} onClose={onClose} className="max-w-2xl">
      {v && (
        <>
          <h2 className="pr-8 text-lg font-semibold">{v.account_name}</h2>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm tên tài khoản..."
              value={nameQ}
              onChange={(e) => setNameQ(e.target.value)}
              className="pl-8 sm:text-xs"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setOffset((o) => o - 1)} aria-label="Ngày trước">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[7.5rem] text-center text-sm font-medium tabular-nums">
              {dmy(day)}
              {offset === 0 && <div className="text-[11px] font-normal text-muted-foreground">ngày gốc</div>}
            </div>
            <Button variant="outline" size="icon" onClick={() => setOffset((o) => o + 1)} aria-label="Ngày sau">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {offset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>
                Về ngày gốc
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ngày gốc ={' '}
            {v.posted_at ? `ngày đăng bài bị gỡ (${dmy(baseDay)}).` : `ngày phát hiện vi phạm (${dmy(baseDay)}) — tool không gửi ngày đăng.`}
            {v.post_id && ' Bài bị gỡ được tô đỏ.'}
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : runs.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {q ? 'Ngày này không có bài nào của nick khớp từ khoá.' : 'Ngày này không có bài nào trong nhật ký.'}
              </p>
            ) : (
              <div className="divide-y">
                {runs.map((r) => (
                  <div
                    key={`${r.account_name}|${r.post_id}`}
                    className={cn(v.post_id && r.post_id === v.post_id && 'bg-pill-negative/60 ring-1 ring-inset ring-negative/40')}
                  >
                    <RunCard r={r} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:justify-end">
            <Button onClick={onClose}>Đóng</Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

function ViolationsCard({ rows, total, isLoading }: { rows: PostRunViolation[]; total: number; isLoading: boolean }) {
  const [viewing, setViewing] = useState<PostRunViolation | null>(null)
  const qc = useQueryClient()
  const resolve = useMutation({
    mutationFn: (id: number) => resolvePostRunViolation(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ['post-runs-violations'] }),
    onError: () => toast.error('Không đánh dấu được, thử lại sau.'),
  })
  const onResolve = async (v: PostRunViolation) => {
    const ok = await confirmDialog({
      title: `Đánh dấu đã gỡ vi phạm của ${v.account_name}?`,
      description: 'Dòng này sẽ ẩn khỏi danh sách Nick vi phạm.',
      confirmLabel: 'Đã gỡ',
    })
    if (ok) resolve.mutate(v.id)
  }
  const nicks = new Set(rows.map((v) => v.account_name)).size
  const clean = !isLoading && total === 0
  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 p-3 sm:px-4', !clean && 'border-b')}>
        {clean ? (
          <ShieldCheck className="h-4 w-4 shrink-0 text-positive" />
        ) : (
          <ShieldAlert className="h-4 w-4 shrink-0 text-negative" />
        )}
        <h2 className="text-sm font-medium">{clean ? 'Không có nick vi phạm' : 'Nick vi phạm'}</h2>
        {!clean && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-pill-negative px-2 py-0.5 text-[11px] font-medium tabular-nums text-pill-negative-ink">
            {nicks} nick
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Threads gỡ bài, tool báo về · mọi ngày</span>
      </div>

      {isLoading && (
        <div className="p-3">
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {!isLoading && total > 0 && rows.length === 0 && (
        <p className="p-4 text-center text-xs text-muted-foreground">Không có nick vi phạm khớp từ khoá.</p>
      )}

      <div className="divide-y md:hidden">
        {rows.map((v) => (
          <div key={v.id} className="space-y-1.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-sm font-medium">
                <Nick name={v.account_name} />
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{ddmmHHmm(v.detected_at)}</span>
            </div>
            <ViolationPost v={v} />
            {v.posted_at && <div className="text-xs text-muted-foreground">Đăng ngày {dmy(v.posted_at)}</div>}
            {v.message && <div className="text-xs text-muted-foreground">{v.message}</div>}
            <div className="flex items-center gap-2">
              {v.reports > 1 && <span className="text-xs text-muted-foreground">báo {v.reports} lần</span>}
              <span className="ml-auto flex items-center gap-3">
                <ViolationLink url={v.posted_url} />
                <ViewPostsButton onClick={() => setViewing(v)} />
                <ResolveButton v={v} onResolve={onResolve} pending={resolve.isPending} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className={cn('table-scroll hidden max-h-80 overflow-y-auto', rows.length > 0 && 'md:block')}>
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
            <tr>
              <th className="p-2.5 text-left">Nick</th>
              <th className="p-2.5 text-left">Phát hiện</th>
              <th className="p-2.5 text-left">Ngày đăng</th>
              <th className="p-2.5 text-left">Bài</th>
              <th className="p-2.5 text-left">Link</th>
              <th className="p-2.5 text-left">Ghi chú</th>
              <th className="p-2.5 text-right">Số lần báo</th>
              <th className="p-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-b border-rule last:border-0 hover:bg-accent">
                <td className="whitespace-nowrap p-2.5 font-medium">
                  <Nick name={v.account_name} />
                </td>
                <td className="whitespace-nowrap p-2.5 text-xs tabular-nums text-muted-foreground">
                  {ddmmHHmm(v.detected_at)}
                </td>
                <td className="whitespace-nowrap p-2.5 text-xs tabular-nums text-muted-foreground">
                  {dmy(v.posted_at)}
                </td>
                <td className="max-w-[20rem] p-2.5">
                  <ViolationPost v={v} />
                </td>
                <td className="p-2.5">
                  <ViolationLink url={v.posted_url} />
                </td>
                <td className="max-w-[14rem] truncate p-2.5 text-xs text-muted-foreground" title={v.message ?? undefined}>
                  {v.message || '—'}
                </td>
                <td className="p-2.5 text-right text-xs tabular-nums">{v.reports}</td>
                <td className="p-2.5">
                  <div className="flex justify-end gap-1.5">
                    <ViewPostsButton onClick={() => setViewing(v)} />
                    <ResolveButton v={v} onResolve={onResolve} pending={resolve.isPending} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* key theo vi pham -> mo dong khac thi offset ngay reset ve ngay goc */}
      <AccountDayDialog key={viewing?.id ?? 0} v={viewing} onClose={() => setViewing(null)} />
    </Card>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="truncate text-sm text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-normal tabular-nums', tone === 'warn' && value > 0 && 'text-warning')}>
        {value.toLocaleString('vi-VN')}
      </div>
    </div>
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
    required: false,
    example: '2026-09-25',
    note: 'YYYY-MM-DD hoặc DD/MM/YYYY, đúng như trong file. File xuất từ trang Bài viết không có cột này → bỏ trường, server lấy ngày của postedAt, không có thì lấy hôm nay.',
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

const VIOLATION_XPATH = `//span[@role='heading' and @aria-label='Chúng tôi đã gỡ bài viết của bạn']`

const VIOLATION_SAMPLE = `{
  "accountName": "phuongnhabeby",
  "detectedAt": "2026-09-25 09:15:40",
  "postedAt": "10 tháng 10, 2026",
  "postId": "DdnYsSQE8Ax-v2"
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
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Trường</th>
                  <th className="p-2 text-left">Lấy từ</th>
                  <th className="p-2 text-left">Bắt buộc</th>
                  <th className="p-2 text-left">Ví dụ / ghi chú</th>
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

        <div className="space-y-1.5 border-t pt-4">
          <h3 className="text-sm font-medium">Báo nick bị gỡ bài do vi phạm</h3>
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
            POST http://localhost:3000/api/automation/violations
          </code>
          <p className="text-xs text-muted-foreground">
            Cùng header <code>X-Api-Key</code>. Sau khi đăng, tool check element bên dưới; có thì gọi API này:
          </p>
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{VIOLATION_XPATH}</code>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{VIOLATION_SAMPLE}</pre>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Chỉ <code>accountName</code> là bắt buộc. <code>postId</code> (cột H), <code>postedUrl</code>,{' '}
              <code>message</code> (≤300 ký tự) có thì gửi, không thì bỏ hẳn trường.
            </li>
            <li>
              <code>detectedAt</code> dạng <code>YYYY-MM-DD HH:MM:SS</code>; bỏ trống thì lấy giờ server. Khối "Nick vi
              phạm" hiện mọi ngày, mới nhất trước.
            </li>
            <li>
              <code>postedAt</code> = ngày đăng bài, copy nguyên chuỗi Threads hiện, vd <code>10 tháng 10, 2026</code>{' '}
              (cũng nhận <code>YYYY-MM-DD</code>). Không có thì bỏ trường.
            </li>
            <li>Gửi lại cùng ngày + nick + bài chỉ tăng số lần báo, không sinh dòng mới.</li>
          </ul>
        </div>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </Dialog>
  )
}

export function PostLogPage() {
  const url = useUrlState(URL_SCHEMA)
  const { date, tab, q: accountSearch, sort } = url.values
  const statusFilter = useMemo(() => new Set(url.values.status), [url.values.status])
  const setDate = (d: string) => url.set({ date: d })
  const setTab = (t: Tab) => url.set({ tab: t })
  const [docOpen, setDocOpen] = useState(false)

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
  const { data: violations, isLoading: violationsLoading } = useQuery({
    queryKey: ['post-runs-violations'],
    queryFn: fetchPostRunViolations,
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
  // Chi loc theo ten - khong ap filter trang thai de nick vi pham khong bi giau.
  const searchQ = accountSearch.trim().toLowerCase()
  const visibleViolations = (violations ?? []).filter((v) => !searchQ || v.account_name.toLowerCase().includes(searchQ))

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
      return ta < tb ? -dir : ta > tb ? dir : 0
    })
  }, [filtered, sort])

  return (
    <div className="mx-auto max-w-8xl space-y-5">
      <PageHeader
        title="Nhật ký đăng"
        description="Nick nào đăng bài gì trong ngày, đã comment chưa — do tool auto báo về qua API"
        secondary={[{ label: 'API cho tool auto', icon: FileCode2, onClick: () => setDocOpen(true) }]}
      />

      {/* Bo loc nick (ten + trang thai) ap cho ca KPI, nick vi pham va bang -> dat o dau trang */}
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          value={date}
          onChange={setDate}
          presets={[datePresets.today(), datePresets.yesterday()]}
          max={todayIso()}
        />
        <SearchInput
          value={accountSearch}
          onChange={(v) => url.set({ q: v }, { replace: true })}
          placeholder="Tìm nick…"
          className="sm:w-56"
        />
        <StatusCheckboxFilter
          selected={statusFilter}
          onChange={(next) => url.set({ status: [...next] })}
          includeNone
        />
        {(accountSearch || statusFilter.size > 0) && totalNicks > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
            {nickCount}/{totalNicks} nick
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-[86px] rounded-lg" />
      ) : (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
            <Kpi label="Theo lịch" value={kpi.planned} />
            <Kpi label="Đăng + CMT thành công" value={kpi.commented} />
            <Kpi label="Đăng OK, thiếu CMT" value={kpi.posted} tone="warn" />
            <Kpi label="Chưa báo cáo" value={kpi.missing} tone="warn" />
            <Kpi label="Ngoài kế hoạch" value={kpi.extra} />
        </div>
      )}
      {kpi.posted > 0 && (
        <p className="text-xs text-warning">
          Bài thiếu comment là bài KHÔNG có link affiliate — nên comment bù để không mất đơn.
        </p>
      )}

      <ViolationsCard rows={visibleViolations} total={violations?.length ?? 0} isLoading={violationsLoading} />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
          <div className="table-scroll flex min-w-0 flex-1 items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors sm:py-1.5',
                  tab === t.value ? 'bg-active text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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
            onChange={(v) => url.set({ sort: v as typeof sort })}
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
            <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left">Nick</th>
                <th className="p-2.5 text-left">Bài</th>
                <th className="p-2.5 text-left">Trạng thái</th>
                <th className="p-2.5 text-left">Giờ đăng</th>
                <th className="p-2.5 text-left">Link</th>
                <th className="p-2.5 text-left">Kế hoạch</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                  <tr key={`${r.account_name}|${r.post_id}`} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap p-2.5 font-medium">
                      <Nick name={r.account_name} />
                    </td>
                    <td className="max-w-[22rem] p-2.5">
                      <div className="flex items-center gap-2.5">
                        <RunThumb thumb={r.thumb} />
                        <div className="min-w-0">
                          <div className="truncate text-xs">{r.caption || <em>(không có caption)</em>}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {r.post_id}
                            {r.caption_variant ? ` · bản ${r.caption_variant}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <StateBadge state={r.state} />
                      {r.reports > 1 && (
                        <div className="mt-0.5 text-xs text-muted-foreground">báo {r.reports} lần</div>
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
                          className="inline-flex items-center gap-1 text-xs text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground"
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
            <h2 className="text-sm font-medium">
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
            <table className="w-full min-w-[28rem] text-[13px]">
              <thead className="sticky top-0 z-20 bg-card text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-card p-2 text-left">Nick</th>
                  <th className="p-2 text-right" title="Tổng số bài kế hoạch giao cho nick trong 7 ngày">Theo lịch</th>
                  <th className="p-2 text-right" title="Đăng bài + comment thành công">Hoàn tất</th>
                  <th className="p-2 text-right" title="Đăng bài xong nhưng chưa comment = bài không có link affiliate">Thiếu CMT</th>
                  <th className="p-2 text-right" title="Có trong lịch nhưng tool chưa gửi kết quả (chưa chạy / crash / nick lỗi)">Chưa báo cáo</th>
                  <th className="p-2 text-right" title="Tool báo đã đăng nhưng bài không nằm trong lịch">Ngoài KH</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((a) => (
                  <tr key={a.account_name} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 max-w-[12rem] bg-card p-2 font-medium">
                      <Nick name={a.account_name} />
                    </td>
                    <td className="p-2 text-right tabular-nums">{a.planned}</td>
                    <td className="p-2 text-right tabular-nums">{a.commented}</td>
                    <td
                      className={cn(
                        'p-2 text-right tabular-nums',
                        a.posted_only > 0 && 'font-medium text-warning',
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
