import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useCountUp } from '@/lib/useCountUp'

interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
}

export function StatCard({ label, value, icon: Icon }: StatCardProps) {
  const v = useCountUp(value)
  return (
    <Card className="relative overflow-hidden p-4 transition-shadow hover:shadow-md sm:p-5">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="truncate text-sm text-muted-foreground">{label}</span>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="relative mt-2 text-2xl font-semibold tabular-nums sm:mt-3 sm:text-3xl">
        {v.toLocaleString('vi-VN')}
      </div>
    </Card>
  )
}
