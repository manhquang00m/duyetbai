import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  indeterminate?: boolean
  onCheckedChange: (v: boolean) => void
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
        onCheckedChange(!checked)
      }}
      className={cn(
        'relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors before:absolute before:-inset-3 before:content-[""] sm:before:-inset-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked || indeterminate ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
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
