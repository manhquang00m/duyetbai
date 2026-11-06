import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/lib/useOverlay'
import { confirmDialog } from '@/lib/confirm'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  /** Dang co thay doi chua luu: dong bang Esc / nen / nut X thi hoi truoc. */
  dirty?: boolean
  /** Dang luu: khong cho dong. */
  busy?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]), textarea:not([disabled]), select:not([disabled])'

// Mobile: bottom sheet (dinh man hinh, bo goc tren, cuon ben trong). >= sm: hop thoai giua man hinh.
// Mo ra: focus [data-autofocus] hoac o nhap dau tien (chi khi co chuot - phone khong bat ban phim len),
// Tab xoay vong trong hop thoai, dong lai tra focus ve cho cu.
export function Dialog({ open, onClose, children, className, dirty, busy }: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)

  const requestClose = React.useCallback(async () => {
    if (busy) return
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Bỏ thay đổi?',
        description: 'Những gì bạn vừa nhập trong hộp thoại này sẽ mất.',
        confirmLabel: 'Bỏ thay đổi',
        cancelLabel: 'Tiếp tục sửa',
        destructive: true,
      }))
    )
      return
    onClose()
  }, [busy, dirty, onClose])

  useOverlay(open, requestClose)

  React.useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const fine = window.matchMedia('(pointer: fine)').matches
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ?? (fine ? panel?.querySelector<HTMLElement>(FIELD) : null) ?? panel
    target?.focus({ preventScroll: true })
    return () => prev?.focus?.({ preventScroll: true })
  }, [open])

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cn(
          'relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:max-h-[90dvh] sm:rounded-2xl sm:p-6',
          'animate-in fade-in slide-in-from-bottom-8 duration-200 sm:zoom-in-95 sm:slide-in-from-bottom-0 sm:duration-150',
          className,
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/25 sm:hidden" />
        <button
          type="button"
          onClick={requestClose}
          disabled={busy}
          className="absolute right-3 top-3 z-10 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 sm:right-4 sm:top-4 sm:p-1"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  )
}
