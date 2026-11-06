import { useState } from 'react'
import { Check, Heart, Moon, Sun } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { getTheme, applyTheme, THEMES, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const ICON = { light: Sun, pink: Heart, dark: Moon }

export function ThemeToggle() {
  const popover = usePopover({ placement: 'bottom-end' })
  const [theme, setTheme] = useState<Theme>(getTheme())
  const Icon = ICON[theme]

  const pick = (next: Theme) => {
    applyTheme(next)
    setTheme(next)
    popover.setOpen(false)
  }

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        aria-label="Đổi giao diện"
        title="Đổi giao diện"
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <Icon className="h-4 w-4" />
      </button>
      <PopoverPanel popover={popover} className="min-w-[9rem]">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="menuitemradio"
            aria-checked={t.id === theme}
            onClick={() => pick(t.id)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent sm:py-1.5',
              t.id === theme && 'font-medium',
            )}
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ background: t.swatch }} aria-hidden />
            <span className="flex-1">{t.label}</span>
            {t.id === theme && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        ))}
      </PopoverPanel>
    </>
  )
}
