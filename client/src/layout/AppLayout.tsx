import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  LayoutGrid,
  Download,
  Users,
  ShoppingBag,
  Network,
  Sparkles,
  Wand2,
  CalendarDays,
  TrendingUp,
  ClipboardList,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOverlay } from '@/lib/useOverlay'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ServerHealthButton } from '@/components/ServerHealthButton'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Nội dung',
    items: [
      { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
      { to: '/posts', label: 'Bài viết', icon: LayoutGrid },
      { to: '/batch', label: 'Thu thập', icon: Download },
      { to: '/rewrite', label: 'Viết lại caption', icon: Wand2 },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { to: '/accounts', label: 'Accounts', icon: Users },
      { to: '/proxy', label: 'Proxy', icon: Network },
      { to: '/distribution', label: 'Phân phối bài', icon: CalendarDays },
      { to: '/post-log', label: 'Nhật ký đăng', icon: ClipboardList },
    ],
  },
  {
    title: 'Kinh doanh',
    items: [
      { to: '/shopee', label: 'Shopee & Export', icon: ShoppingBag },
      { to: '/affiliate', label: 'Hiệu quả Affiliate', icon: TrendingUp },
    ],
  },
]

const allItems = groups.flatMap((g) => g.items)
const COLLAPSE_KEY = 'sidebar-collapsed'

function currentTitle(pathname: string): string {
  const hit = allItems.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
  return hit?.label ?? 'Threads Affiliate'
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-md">
        <Sparkles className="h-4 w-4" />
      </div>
      {!compact && <span className="truncate font-semibold tracking-tight">Threads Affiliate</span>}
    </div>
  )
}

function NavList({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
      {groups.map((g) => (
        <div key={g.title} className="space-y-0.5">
          {compact ? (
            <div className="mx-2 mb-1 h-px bg-border first:hidden" />
          ) : (
            <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {g.title}
            </div>
          )}
          {g.items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={compact ? n.label : undefined}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors md:py-2',
                  compact && 'justify-center px-0',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <n.icon className="h-4 w-4 shrink-0" />
                  {!compact && <span className="truncate">{n.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')

  useOverlay(drawerOpen, () => setDrawerOpen(false))

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    document.title = `${currentTitle(pathname)} · Threads Affiliate`
  }, [pathname])

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1')
      return !v
    })
  }

  return (
    <div className="flex min-h-dvh bg-muted/30">
      {/* Sidebar desktop (>= md), thu gon duoc */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card transition-[width] duration-200 md:flex',
          collapsed ? 'w-[4.25rem]' : 'w-60',
        )}
      >
        <div className={cn('flex h-14 items-center px-4', collapsed && 'justify-center px-0')}>
          <Brand compact={collapsed} />
        </div>
        <NavList compact={collapsed} />
        <div className={cn('flex items-center border-t p-3', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && <span className="pl-2 text-xs text-muted-foreground">Phase 2 · v0.1</span>}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* Drawer mobile (< md) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-card pt-[env(safe-area-inset-top)] shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex h-14 items-center justify-between px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Đóng menu"
                className="rounded-md p-2 text-muted-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
            <div className="border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
              Phase 2 · v0.1
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-6 md:justify-end">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Mở menu"
            className="-ml-1 rounded-md p-2.5 text-foreground hover:bg-accent md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold md:hidden">{currentTitle(pathname)}</div>
          <ServerHealthButton />
          <ThemeToggle />
        </header>
        <main className="min-w-0 flex-1 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 lg:p-8">
          <div key={pathname} className="animate-in fade-in duration-300">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
