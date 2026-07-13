import { ChevronDown, Check, Filter } from 'lucide-react'
import { usePopover, PopoverPanel } from './popover'
import { Checkbox } from './checkbox'
import { buttonVariants } from './button'
import { cn } from '@/lib/utils'

interface FilterOption<V extends string> {
  value: V
  label: string
}

interface SingleFilterDropdownProps<V extends string> {
  label: string
  value: V
  options: FilterOption<V>[]
  onChange: (v: V) => void
  /** Gia tri coi la "mac dinh/tat ca" -> khong to dam trigger. Mac dinh 'all'. */
  activeWhen?: V
}

/** Dropdown chon 1 gia tri (thay the <select> / nhom pill) - hien luon gia tri dang chon tren trigger. */
export function SingleFilterDropdown<V extends string>({
  label,
  value,
  options,
  onChange,
  activeWhen = 'all' as V,
}: SingleFilterDropdownProps<V>) {
  const popover = usePopover()
  const isActive = value !== activeWhen
  const activeLabel = options.find((o) => o.value === value)?.label ?? value

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
          isActive && 'border-primary text-foreground',
        )}
      >
        {label}
        {isActive && <span className="font-semibold">: {activeLabel}</span>}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      <PopoverPanel popover={popover}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="menuitemradio"
            aria-checked={opt.value === value}
            onClick={() => {
              onChange(opt.value)
              popover.setOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
              opt.value === value && 'font-medium',
            )}
          >
            {opt.label}
            {opt.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        ))}
      </PopoverPanel>
    </div>
  )
}

export type FilterGroup =
  | { type: 'checkbox'; key: string; label: string; checked: boolean; onToggle: () => void }
  | {
      type: 'radio'
      key: string
      label: string
      value: string
      options: { value: string; label: string }[]
      onChange: (v: string) => void
    }

interface MultiFilterDropdownProps {
  groups: FilterGroup[]
  activeCount: number
  onClearAll: () => void
}

/** Gop nhieu filter (checkbox doc lap + toi da 1 nhom radio con) vao 1 nut "Bo loc (N)". */
export function MultiFilterDropdown({ groups, activeCount, onClearAll }: MultiFilterDropdownProps) {
  const popover = usePopover({ placement: 'bottom-end' })

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
          activeCount > 0 && 'border-primary text-foreground',
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        Bộ lọc{activeCount > 0 ? ` (${activeCount})` : ''}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      <PopoverPanel popover={popover} className="min-w-[16rem] p-2">
        <div className="space-y-3">
          {groups.map((g) =>
            g.type === 'checkbox' ? (
              <label
                key={g.key}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-accent"
              >
                <Checkbox checked={g.checked} onCheckedChange={g.onToggle} />
                {g.label}
              </label>
            ) : (
              <div key={g.key}>
                <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">{g.label}</div>
                <div className="space-y-0.5">
                  {g.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={opt.value === g.value}
                      onClick={() => g.onChange(opt.value)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent',
                        opt.value === g.value && 'font-medium',
                      )}
                    >
                      {opt.label}
                      {opt.value === g.value && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
        {activeCount > 0 && (
          <>
            <div className="my-2 border-t" />
            <button
              type="button"
              onClick={() => {
                onClearAll()
                popover.setOpen(false)
              }}
              className="w-full rounded-sm px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Xóa lọc
            </button>
          </>
        )}
      </PopoverPanel>
    </div>
  )
}
