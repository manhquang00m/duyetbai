import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Thanh thao tac noi (chon nhieu dong). Mobile: full-width, xuong dong; desktop: vien thuoc giua day man hinh. */
export function FloatingBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-4',
        'sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:flex-nowrap sm:rounded-full',
        className,
      )}
    >
      {children}
    </div>
  )
}
