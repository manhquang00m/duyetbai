import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** So trang can hien: dau, cuoi, +-1 quanh trang hien tai; khoang trong = '…'. page 0-based. */
function pageList(page: number, maxPage: number): (number | '…')[] {
  const keep = new Set([0, maxPage, page - 1, page, page + 1].filter((p) => p >= 0 && p <= maxPage))
  // Lap khoang 1 trang (vd 0 … 2) bang chinh trang do thay vi '…'
  if (keep.has(2) && !keep.has(1)) keep.add(1)
  if (keep.has(maxPage - 2) && !keep.has(maxPage - 1)) keep.add(maxPage - 1)
  const out: (number | '…')[] = []
  let prev = -1
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

/**
 * Phan trang: "21–40 / 737 bài" + so trang (sm+) + Truoc/Sau. Phone chi con "Trang 2/37" va 2 nut
 * lon. page 0-based.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  sizeOptions,
  onSize,
  unit = 'bài',
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  sizeOptions?: readonly string[]
  onSize?: (size: string) => void
  unit?: string
}) {
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  const first = total === 0 ? 0 : page * pageSize + 1
  const last = Math.min(total, (page + 1) * pageSize)
  const num = (n: number) => n.toLocaleString('vi-VN')

  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <div className="flex min-w-0 items-center gap-3">
        <span className="tabular-nums">
          <span className="sm:hidden">
            Trang {page + 1}/{maxPage + 1}
          </span>
          <span className="hidden sm:inline">
            {num(first)}–{num(last)} / {num(total)} {unit}
          </span>
        </span>
        {sizeOptions && onSize && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="hidden sm:inline">Mỗi trang</span>
            <select
              value={String(pageSize)}
              onChange={(e) => onSize(e.target.value)}
              aria-label="Số dòng mỗi trang"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 sm:h-8"
            >
              {sizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Phân trang">
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-8 sm:w-8 sm:px-0"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sm:hidden">Trước</span>
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {pageList(page, maxPage).map((p, i) =>
            p === '…' ? (
              <span key={`gap${i}`} className="w-6 text-center" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  'h-8 min-w-8 rounded-md px-2 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  p === page ? 'bg-active font-medium text-foreground' : 'hover:bg-accent hover:text-foreground',
                )}
              >
                {p + 1}
              </button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-8 sm:w-8 sm:px-0"
          disabled={page >= maxPage}
          onClick={() => onPage(page + 1)}
          aria-label="Trang sau"
        >
          <span className="sm:hidden">Sau</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  )
}
