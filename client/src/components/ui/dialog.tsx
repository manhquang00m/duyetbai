import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/lib/useOverlay'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

// Mobile: bottom sheet (dinh man hinh, bo goc tren, cuon ben trong). >= sm: hop thoai giua man hinh.
export function Dialog({ open, onClose, children, className }: DialogProps) {
  useOverlay(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[90dvh] sm:rounded-xl sm:p-6',
          'animate-in fade-in slide-in-from-bottom-8 duration-200 sm:zoom-in-95 sm:slide-in-from-bottom-0',
          className,
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/25 sm:hidden" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground sm:right-4 sm:top-4 sm:p-1"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  )
}
