import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FieldControlProps {
  id: string
  'aria-invalid': boolean | undefined
  'aria-describedby': string | undefined
}

/**
 * Nhan tren, o nhap, roi goi y hoac loi ngay duoi o (khong dung toast cho loi tung o).
 * children la render-prop nhan san id + aria de noi nhan/loi voi o nhap.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: (props: FieldControlProps) => ReactNode
}) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error || hint
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-muted-foreground"> *</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': note ? noteId : undefined })}
      {note && (
        <p id={noteId} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {note}
        </p>
      )}
    </div>
  )
}
