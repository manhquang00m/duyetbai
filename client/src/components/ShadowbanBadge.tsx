import { SHADOWBAN_VERDICT_LABEL, type ShadowbanVerdict } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Chi to mau ket luan can xu ly; binh thuong / chua ro la chu xam. */
const VERDICT_PILL: Partial<Record<ShadowbanVerdict, string>> = {
  suspect: 'bg-pill-warning text-pill-warning-ink',
  shadowban: 'bg-pill-negative text-pill-negative-ink',
}

export function ShadowbanBadge({ verdict }: { verdict: ShadowbanVerdict | null | undefined }) {
  if (!verdict) return <span className="whitespace-nowrap text-xs text-muted-foreground">Chưa check</span>
  const pill = VERDICT_PILL[verdict]
  const label = SHADOWBAN_VERDICT_LABEL[verdict] ?? verdict
  if (!pill) return <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
  return (
    <span
      className={cn(
        'inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
        pill,
      )}
    >
      {label}
    </span>
  )
}
