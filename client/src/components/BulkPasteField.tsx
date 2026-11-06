import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { keepValidLines, type ParseResult } from '@/lib/parsers'

/**
 * O dan hang loat moi dong 1 muc: cot so dong ben trai to mau dong loi / trung, thanh tom tat
 * "12 hop le · 3 loi · 2 trung · 1 da co" va nut bo dong hong. Ctrl+Enter = onSubmit.
 * Khong xuong dong mem (wrap off) de cot so dong luon khop dong that.
 */
export function BulkPasteField({
  id,
  value,
  onChange,
  result,
  onSubmit,
  noun,
  placeholder,
  rows = 8,
  disabled,
  formatRaw = (r) => r,
  existingLabel = 'đã có',
  existingHint = 'Đã có trong hệ thống',
  'aria-describedby': describedBy,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  result: ParseResult
  onSubmit?: () => void
  /** Danh tu dem, vd "link", "proxy". */
  noun: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  /** Hien dong goc trong danh sach loi - proxy truyen maskProxy de khong lo mat khau. */
  formatRaw?: (raw: string) => string
  /** Nhan cho dong `existing` (vd "trung nhom tren" o Batch). */
  existingLabel?: string
  existingHint?: string
  'aria-describedby'?: string
}) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const [showIssues, setShowIssues] = useState(false)

  const byLine = useMemo(() => new Map(result.lines.map((l) => [l.line, l])), [result])
  const lineCount = Math.max(rows, value.split('\n').length)
  const issues = result.lines.filter((l) => l.error || l.dup || l.existing)
  const { valid, invalid, dup, existing } = result.counts
  const summaryId = id ? `${id}-summary` : undefined

  return (
    <div className="space-y-1.5">
      <div className="flex overflow-hidden rounded-md border border-input bg-background transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
        <div
          ref={gutterRef}
          aria-hidden
          className="w-10 shrink-0 select-none overflow-hidden border-r border-rule bg-frame py-2 text-right text-xs leading-5 tabular-nums text-muted-foreground"
          style={{ height: `${rows * 20 + 16}px` }}
        >
          {Array.from({ length: lineCount }, (_, i) => {
            const l = byLine.get(i + 1)
            return (
              <div
                key={i}
                title={l?.error ?? (l?.dup ? 'Trùng dòng phía trên' : l?.existing ? existingHint : undefined)}
                className={cn(
                  'pr-2',
                  l?.error && 'bg-pill-negative font-medium text-pill-negative-ink',
                  (l?.dup || l?.existing) && 'bg-pill-warning text-pill-warning-ink',
                )}
              >
                {i + 1}
              </div>
            )
          })}
        </div>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
              e.preventDefault()
              onSubmit()
            }
          }}
          wrap="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          aria-describedby={[describedBy, summaryId].filter(Boolean).join(' ') || undefined}
          className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          style={{ height: `${rows * 20 + 16}px` }}
        />
      </div>

      <div id={summaryId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
        {result.lines.length === 0 ? (
          <span>Mỗi dòng 1 {noun}. Dòng bắt đầu bằng # được bỏ qua.</span>
        ) : (
          <>
            <span>
              <span className="font-medium tabular-nums text-foreground">{valid}</span> {noun} hợp lệ
              {invalid > 0 && (
                <>
                  {' · '}
                  <span className="tabular-nums text-destructive">{invalid} lỗi</span>
                </>
              )}
              {dup > 0 && <span className="tabular-nums"> · {dup} trùng</span>}
              {existing > 0 && <span className="tabular-nums"> · {existing} {existingLabel}</span>}
            </span>
            {issues.length > 0 && (
              <>
                <button type="button" onClick={() => setShowIssues((v) => !v)} className="underline-offset-4 hover:text-foreground hover:underline">
                  {showIssues ? 'Ẩn chi tiết' : 'Xem dòng lỗi'}
                </button>
                <button
                  type="button"
                  onClick={() => onChange(keepValidLines(result))}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  Bỏ dòng lỗi & trùng
                </button>
              </>
            )}
            {onSubmit && <span className="ml-auto hidden sm:inline">Ctrl+Enter để chạy</span>}
          </>
        )}
      </div>

      {showIssues && issues.length > 0 && (
        <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-md bg-frame px-3 py-2 text-xs">
          {issues.map((l) => (
            <li key={l.line} className="flex min-w-0 gap-2">
              <span className="w-12 shrink-0 tabular-nums text-muted-foreground">Dòng {l.line}</span>
              <span className={cn('shrink-0', l.error ? 'text-destructive' : 'text-warning')}>
                {l.error ?? (l.dup ? 'Trùng' : existingHint)}
              </span>
              <span className="truncate text-muted-foreground">{formatRaw(l.raw)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
