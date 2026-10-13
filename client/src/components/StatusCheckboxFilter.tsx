import { ChevronDown } from 'lucide-react'
import { APPEAL_STATUSES } from '@/lib/api'
import { buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** Gia tri dai dien cho account CHUA dat trang thai (appeal_status NULL/rong). */
export const STATUS_NONE = '__none__'

/** Loc nhieu trang thai tai khoan cung luc (checkbox). Rong = khong loc. */
export function StatusCheckboxFilter({
  selected,
  onChange,
  includeNone = false,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
  includeNone?: boolean
}) {
  const popover = usePopover()
  const options: { value: string; label: string }[] = [
    ...APPEAL_STATUSES.map((t) => ({ value: t as string, label: t as string })),
    ...(includeNone ? [{ value: STATUS_NONE, label: 'Chưa đặt' }] : []),
  ]

  const toggle = (status: string) => {
    const next = new Set(selected)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    onChange(next)
  }

  return (
    <div className="relative inline-block">
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          selected.size > 0 && 'border-primary text-foreground',
        )}
      >
        Trạng thái
        {selected.size > 0 && <span className="font-semibold">: {selected.size}</span>}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      <PopoverPanel popover={popover} className="w-56 p-2">
        <div className="space-y-0.5">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-2 text-sm hover:bg-accent sm:gap-2 sm:py-1"
            >
              <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
        {selected.size > 0 && (
          <>
            <div className="my-2 border-t" />
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="w-full rounded-sm px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:py-1"
            >
              Bỏ lọc trạng thái
            </button>
          </>
        )}
      </PopoverPanel>
    </div>
  )
}
