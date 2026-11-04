import type { ReactNode } from 'react'
import { useCountUp } from '@/lib/useCountUp'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number
  /** Dong phu 12px xam duoi gia tri (vd don vi, phan tach). */
  hint?: ReactNode
  className?: string
}

/** 1 o KPI: nhan xam tren, so lon tabular. Dat trong StatStrip de chia bang vach 1px. */
export function StatCard({ label, value, hint, className }: StatCardProps) {
  const v = useCountUp(value)
  return (
    <div className={cn('min-w-0 bg-card px-5 py-4', className)}>
      <div className="truncate text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-[28px] font-normal leading-9 tabular-nums">{v.toLocaleString('vi-VN')}</div>
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
