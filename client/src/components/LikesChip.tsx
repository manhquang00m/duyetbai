import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

/** So tim cua bai (chuoi goc tu Threads: '261', '3.2K'...). Rong -> khong hien gi. */
export function LikesChip({ likes, className }: { likes: string | null | undefined; className?: string }) {
  const v = likes?.trim()
  if (!v) return null
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground', className)}
      title={`${v} tim`}
    >
      <Heart className="h-3 w-3" />
      {v}
    </span>
  )
}
