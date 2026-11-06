import { cn } from '@/lib/utils'

export interface SavedView {
  id: string
  label: string
  /** So muc trong view; chi hien khi > 0 hoac view dang chon. */
  count?: number
  active: boolean
  onSelect: () => void
}

/**
 * View hay dung cua 1 danh sach (Tat ca · Can xu ly 9 · Proxy die 2…), dang tab gach chan tren
 * vach 1px. Moi view chi la 1 bo tham so URL nen link thang duoc tu Tong quan va Ctrl+K.
 * Phone: cuon ngang.
 */
export function SavedViews({ views, className }: { views: SavedView[]; className?: string }) {
  return (
    <div className={cn('overflow-x-auto border-b', className)} role="tablist" aria-label="View">
      <div className="flex w-max gap-1">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.active}
            onClick={v.onSelect}
            className={cn(
              '-mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-sm transition-colors sm:h-9',
              v.active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {v.label}
            {v.count !== undefined && (v.count > 0 || v.active) && (
              <span className="text-xs tabular-nums text-muted-foreground">{v.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
