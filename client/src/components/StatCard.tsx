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
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums">{v.toLocaleString('vi-VN')}</div>
    </Card>
  )
}
