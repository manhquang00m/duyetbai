import type { MouseEvent } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  indeterminate?: boolean
  /** `e` de nguoi goi doc shiftKey (chon theo khoang). */
  onCheckedChange: (v: boolean, e: MouseEvent) => void
  className?: string
}

// Vung cham 40px tren mobile (pseudo-element), o hien thi van 16px.
export function Checkbox({ checked, indeterminate, onCheckedChange, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={(e) => {
        e.stopPropagation()
        onCheckedChange(!checked, e)
      }}
      className={cn(
        'relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors before:absolute before:-inset-3 before:content-[""] sm:before:-inset-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked || indeterminate ? 'border-chart-1 bg-chart-1 text-white' : 'border-input bg-background',
        className,
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" />
      ) : checked ? (
        <Check className="h-3 w-3" />
      ) : null}
    </button>
  )
}
