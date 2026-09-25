import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

  // Tinh vi tri panel tu trigger, kep trong viewport. Panel luon render position:fixed (xem
  // PopoverPanel) nen do duoc kich thuoc THAT (shrink-to-fit), khong phai ca chieu rong body.
  // Tinh lai khi cuon/resize de panel bam theo trigger thay vi dung yen giua man hinh.
  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({})
      return
    }
    const place = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return
      const rect = trigger.getBoundingClientRect()
      const panelWidth = panel.offsetWidth
      const panelHeight = panel.offsetHeight

      let left = placement === 'bottom-end' ? rect.right - panelWidth : rect.left
      left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8))

      let top = rect.bottom + offset
      if (top + panelHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - offset - panelHeight)
      }
      setPanelStyle({ top, left })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
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
  // Portal ra body: to tien co CSS transform (vd thanh thao tac -translate-x-1/2) bien
  // position:fixed thanh tuong doi voi chinh to tien do -> panel bi day ra ngoai man hinh.
  return createPortal(
    <div
      ref={popover.panelRef}
      // An (visibility) cho toi khi da tinh xong toa do - tranh 1 khung hinh panel hien o goc
      // man hinh roi moi nhay ve canh trigger.
      style={{
        position: 'fixed',
        zIndex: 50,
        top: 0,
        left: 0,
        visibility: popover.panelStyle.top === undefined ? 'hidden' : 'visible',
        ...popover.panelStyle,
      }}
      role="menu"
      className={cn(
        'min-w-[10rem] animate-in rounded-md border bg-popover p-1 text-popover-foreground shadow-md fade-in zoom-in-95 duration-100',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}
