import { useState } from 'react'
import { Film, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

const VIDEO = /\.(mp4|mov|webm|m4v)$/i

/**
 * Anh dai dien bai viet. Thumb la file video (bai chi co clip) hoac anh loi -> o xam co icon,
 * khong de lo icon "anh vo" cua trinh duyet.
 */
export function PostThumb({ thumb, className }: { thumb: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false)
  const base = cn('shrink-0 rounded-md', className)
  if (!thumb || broken || VIDEO.test(thumb)) {
    const Icon = thumb && VIDEO.test(thumb) ? Film : ImageOff
    return (
      <div className={cn(base, 'flex items-center justify-center bg-muted text-muted-foreground')} aria-hidden>
        {thumb && <Icon className="h-4 w-4" strokeWidth={1.75} />}
      </div>
    )
  }
  return (
    <img
      src={`/media/${thumb}`}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn(base, 'bg-muted object-cover')}
    />
  )
}
