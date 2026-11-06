import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/**
 * O tim kiem chung cho moi trang: icon, nut xoa, phim "/" de nhay vao o (chi 1 o/trang bat
 * `shortcut`), Escape xoa chu roi moi roi o.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Tìm…',
  shortcut = true,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  shortcut?: boolean
  className?: string
  'aria-label'?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcut])

  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          if (value) {
            e.stopPropagation()
            onChange('')
          } else ref.current?.blur()
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="peer flex h-10 w-full min-w-0 rounded-md border border-input bg-background pl-9 pr-9 text-sm transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 sm:h-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('')
            ref.current?.focus()
          }}
          aria-label="Xóa tìm kiếm"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        shortcut && (
          <kbd className="font-sans pointer-events-none absolute right-2 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border px-1 text-[11px] text-muted-foreground peer-focus:hidden sm:flex">
            /
          </kbd>
        )
      )}
    </div>
  )
}
