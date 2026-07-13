import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const POPOVER_OPEN_EVENT = 'popover:open'
let popoverCounter = 0

export interface PopoverState {
  open: boolean
  setOpen: (v: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  panelRef: React.RefObject<HTMLDivElement | null>
  panelStyle: CSSProperties
}

interface UsePopoverOpts {
  placement?: 'bottom-start' | 'bottom-end'
  offset?: number
}

/**
 * Primitive dropdown/popover nho tu viet (khong co lib headless nao trong project).
 * Xu ly: click ra ngoai dong, Escape dong, mo 1 cai thi tu dong cai khac dang mo,
 * tu kep vi tri trong viewport (khong tran man hinh hep).
 */
export function usePopover(opts: UsePopoverOpts = {}): PopoverState {
  const { placement = 'bottom-start', offset = 4 } = opts
  const idRef = useRef(++popoverCounter)
  const [open, setOpenState] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const setOpen = (v: boolean) => {
    if (v) window.dispatchEvent(new CustomEvent(POPOVER_OPEN_EVENT, { detail: idRef.current }))
    setOpenState(v)
  }

  // Dropdown khac vua mo -> tu dong cai nay
  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail
      if (detail !== idRef.current) setOpenState(false)
    }
    window.addEventListener(POPOVER_OPEN_EVENT, onOtherOpen)
    return () => window.removeEventListener(POPOVER_OPEN_EVENT, onOtherOpen)
  }, [])

  // Click ra ngoai / nhan Escape -> dong
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpenState(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenState(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Tinh vi tri panel tu trigger, kep trong viewport
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const panelWidth = panelRef.current?.offsetWidth ?? 220
    const panelHeight = panelRef.current?.offsetHeight ?? 0

    let left = placement === 'bottom-end' ? rect.right - panelWidth : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8))

    let top = rect.bottom + offset
    if (panelHeight && top + panelHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - offset - panelHeight)
    }

    setPanelStyle({ position: 'fixed', top, left, zIndex: 50 })
  }, [open, placement, offset])

  return { open, setOpen, triggerRef, panelRef, panelStyle }
}

export function PopoverPanel({
  popover,
  className,
  children,
}: {
  popover: PopoverState
  className?: string
  children: ReactNode
}) {
  if (!popover.open) return null
  return (
    <div
      ref={popover.panelRef}
      style={popover.panelStyle}
      role="menu"
      className={cn(
        'min-w-[10rem] animate-in rounded-md border bg-popover p-1 text-popover-foreground shadow-md fade-in zoom-in-95 duration-100',
        className,
      )}
    >
      {children}
    </div>
  )
}
