import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface HeaderAction {
  label: string
  /** Nhan ngan cho nut chinh tren phone, vd "Thêm". */
  shortLabel?: string
  icon: LucideIcon
  onClick?: () => void
  /** Link tai file (<a href>). */
  href?: string
  /** Link trong app (react-router). */
  to?: string
  disabled?: boolean
  busy?: boolean
  title?: string
}

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Viec chinh cua trang: luon hien, cung hang voi tieu de o moi do rong. */
  primary?: HeaderAction
  /** Viec phu: hien thanh nut khi du cho, con lai gom vao menu "⋯". */
  secondary?: HeaderAction[]
  /** Phan tu phu dat truoc cac nut (input file an, icon huong dan…). */
  extra?: ReactNode
  className?: string
}

function ActionInner({ a, short }: { a: HeaderAction; short?: boolean }) {
  const Icon = a.busy ? Loader2 : a.icon
  return (
    <>
      <Icon className={cn('h-4 w-4', a.busy && 'animate-spin')} aria-hidden />
      {short && a.shortLabel ? (
        <>
          <span className="sm:hidden">{a.shortLabel}</span>
          <span className="hidden sm:inline">{a.label}</span>
        </>
      ) : (
        a.label
      )}
    </>
  )
}

function ActionButton({ a, primary, className }: { a: HeaderAction; primary?: boolean; className?: string }) {
  const cls = cn(buttonVariants({ variant: primary ? 'default' : 'outline', size: 'sm' }), className)
  const inner = <ActionInner a={a} short={primary} />
  if (a.to) return <Link to={a.to} className={cls} title={a.title}>{inner}</Link>
  if (a.href) return <a href={a.href} className={cls} title={a.title}>{inner}</a>
  return (
    <button type="button" onClick={a.onClick} disabled={a.disabled || a.busy} className={cls} title={a.title}>
      {inner}
    </button>
  )
}

/** Menu "⋯" cho cac viec phu khi khong du cho hien thanh nut. */
function OverflowMenu({ items, className }: { items: HeaderAction[]; className?: string }) {
  const popover = usePopover({ placement: 'bottom-end' })
  const itemCls =
    'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50 sm:py-2'
  return (
    <div className={className}>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        aria-label="Thao tác khác"
        title="Thao tác khác"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-9 px-0 sm:w-8')}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <PopoverPanel popover={popover} className="min-w-[13rem]">
        {items.map((a) => {
          const Icon = a.busy ? Loader2 : a.icon
          const inner = (
            <>
              <Icon className={cn('h-4 w-4 shrink-0 text-muted-foreground', a.busy && 'animate-spin')} aria-hidden />
              {a.label}
            </>
          )
          const close = () => popover.setOpen(false)
          if (a.to)
            return (
              <Link key={a.label} to={a.to} role="menuitem" onClick={close} className={itemCls}>
                {inner}
              </Link>
            )
          if (a.href)
            return (
              <a key={a.label} href={a.href} role="menuitem" onClick={close} className={itemCls}>
                {inner}
              </a>
            )
          return (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              disabled={a.disabled || a.busy}
              onClick={() => {
                close()
                a.onClick?.()
              }}
              className={itemCls}
            >
              {inner}
            </button>
          )
        })}
      </PopoverPanel>
    </div>
  )
}

/**
 * Tieu de trang + hanh dong. Nut chinh luon nam cung hang tieu de (ca tren phone). Viec phu: <= 2
 * thi hien thanh nut tu sm (phone: 1 viec thi van hien, nhieu hon thi vao "⋯"); > 2 thi chi hien
 * thanh nut tu xl, nho hon gom vao "⋯" - khong bao gio xuong 2-3 hang nut.
 */
export function PageHeader({ title, description, primary, secondary = [], extra, className }: PageHeaderProps) {
  const many = secondary.length > 2
  const inlineFrom = secondary.length === 1 ? '' : many ? 'hidden xl:inline-flex' : 'hidden sm:inline-flex'
  const menuUntil = many ? 'xl:hidden' : 'sm:hidden'
  const hasActions = !!primary || secondary.length > 0 || !!extra

  return (
    // Luoi 2 cot: [tieu de | nut] tren 1 hang; mo ta o hang 2. Phone: mo ta trai het be ngang (khong bi
    // cot nut ep hep); tu sm: mo ta nam duoi tieu de, cot nut cao 2 hang. Mo ta ghim row 2 / col 1:
    // de auto-placement thi trang khong co nut se nhet mo ta vao o trong canh tieu de.
    <div
      className={cn(
        'grid items-start gap-x-3',
        hasActions ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1',
        className,
      )}
    >
      <h1 className="min-w-0 text-xl font-semibold leading-8 sm:text-[22px]">{title}</h1>
      {hasActions && (
        <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2 sm:row-span-2 sm:pt-0.5">
          {extra}
          {secondary.map((a) => (
            <ActionButton key={a.label} a={a} className={inlineFrom} />
          ))}
          {secondary.length > 1 && <OverflowMenu items={secondary} className={menuUntil} />}
          {primary && <ActionButton a={primary} primary />}
        </div>
      )}
      {description && (
        <div
          className={cn(
            'col-start-1 row-start-2 mt-0.5 text-sm text-muted-foreground',
            hasActions && 'col-span-2 sm:col-span-1',
          )}
        >
          {description}
        </div>
      )}
    </div>
  )
}
