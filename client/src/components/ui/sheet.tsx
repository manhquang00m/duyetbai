import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/lib/useOverlay'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

export function Sheet({ open, onClose, children, className }: SheetProps) {
  useOverlay(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto overscroll-contain border-l bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:p-6',
          'animate-in slide-in-from-right duration-300',
          className,
        )}
      >
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
