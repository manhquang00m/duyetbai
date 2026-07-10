import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  indeterminate?: boolean
  onCheckedChange: (v: boolean) => void
  className?: string
}

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
        'flex h-4 w-4 items-center justify-center rounded border transition-colors',
        checked || indeterminate ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
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
