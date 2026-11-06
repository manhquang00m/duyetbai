import type { ReactNode } from 'react'
import { useCountUp } from '@/lib/useCountUp'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number
  /** Dong phu 12px xam duoi gia tri (vd don vi, phan tach). */
  hint?: ReactNode
  /** compact: so 18px, nhan 12px - cho hang so lieu kho phu (khong tra loi cau hoi chinh cua man). */
  size?: 'default' | 'compact'
  className?: string
}

/** 1 o KPI: nhan xam tren, so lon tabular. Dat trong StatStrip de chia bang vach 1px. */
export function StatCard({ label, value, hint, size = 'default', className }: StatCardProps) {
  const v = useCountUp(value)
  const compact = size === 'compact'
  return (
    <div className={cn('min-w-0 bg-card', compact ? 'px-4 py-2.5' : 'px-5 py-4', className)}>
      <div className={cn('truncate text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{label}</div>
      <div
        className={cn(
          'font-normal tabular-nums',
          compact ? 'mt-0.5 text-lg leading-7' : 'mt-1 text-[28px] leading-9',
        )}
      >
        {v.toLocaleString('vi-VN')}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** 1 khung vien chia cac o KPI bang vach 1px (gap-px tren nen --border). */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-lg border bg-border', className)}>{children}</div>
  )
}
