import type { ReactNode } from 'react'

export interface ImportRowError {
  row: number | string
  /** Phu de cua dong (vd post id, ten profile). */
  ref?: string
  error: string
}

/**
 * Ket qua lan nhap file gan nhat, o lai tren trang cho toi khi bam An (khong bien mat nhu toast).
 * Liet ke DU moi dong loi, cuon duoc.
 */
export function ImportResultPanel({
  summary,
  errors,
  onDismiss,
}: {
  summary: ReactNode
  errors: ImportRowError[]
  onDismiss: () => void
}) {
  return (
    <div className="rounded-lg border p-3 text-sm" role="status">
      <div className="flex items-start justify-between gap-3">
        <div>
          {summary}
          {errors.length > 0 && <span className="text-destructive"> · {errors.length} dòng lỗi</span>}
        </div>
        <button type="button" className="shrink-0 text-xs text-muted-foreground hover:text-foreground" onClick={onDismiss}>
          Ẩn
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs">
          {errors.map((e, i) => (
            <li key={`${e.row}-${i}`} className="flex gap-2">
              <span className="w-14 shrink-0 tabular-nums text-muted-foreground">Dòng {e.row}</span>
              {e.ref && <span className="shrink-0">{e.ref}</span>}
              <span className="text-muted-foreground">{e.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
