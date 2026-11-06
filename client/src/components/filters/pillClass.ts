import { cn } from '@/lib/utils'

/**
 * Nut pill cua thanh loc. Chua loc: vien net dut, chu xam (moi bam them). Dang loc: vien lien, nen
 * active, chu muc. Dung chung cho FilterPill va DateRangePicker variant="pill".
 */
export function filterPillClass(active: boolean, className?: string) {
  return cn(
    'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'border-foreground/25 bg-active text-foreground'
      : 'border-dashed border-input text-muted-foreground hover:border-foreground/30 hover:text-foreground',
    className,
  )
}
