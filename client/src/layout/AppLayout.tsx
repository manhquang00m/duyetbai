import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  LayoutGrid,
  Download,
  Users,
  ShoppingBag,
  Network,
  Wand2,
  CalendarDays,
  TrendingUp,
  ClipboardList,
  Lightbulb,
  Tags,
  AtSign,
  ChevronRight,
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
      { to: '/topics', label: 'Chủ đề', icon: Tags },
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
      { to: '/insights', label: 'Phân tích & chiến lược', icon: Lightbulb },
    ],
  },
]

const COLLAPSE_KEY = 'sidebar-collapsed'

function currentRoute(pathname: string): { group?: string; label: string } {
  for (const g of groups) {
    const hit = g.items.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
    if (hit) return { group: g.title, label: hit.label }
  }
  return { label: 'Threads Affiliate' }
}

/** Mark: @ (handle Threads) to mau cam Shopee - noi 2 the gioi cua san pham. */
function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <AtSign className="h-5 w-5 shrink-0 text-chart-1" strokeWidth={2.5} aria-hidden />
      {compact ? (
        <span className="sr-only">Threads Affiliate</span>
      ) : (
        <span className="truncate text-[15px] font-semibold">Threads Affiliate</span>
      )}
    </div>
  )
}

function NavList({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-2" aria-label="Điều hướng chính">
      {groups.map((g) => (
        <div key={g.title} className="space-y-0.5">
          {compact ? (
            <div className="mx-3 mb-2 h-px bg-border first:hidden" />
          ) : (
            <div className="px-3 pb-1.5 text-xs text-muted-foreground">{g.title}</div>
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
                  'flex h-11 items-center gap-2.5 rounded-md px-3 text-sm transition-colors lg:h-8',
                  compact && 'justify-center px-0',
                  isActive ? 'bg-active text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <n.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {compact ? <span className="sr-only">{n.label}</span> : <span className="truncate">{n.label}</span>}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()
  const route = currentRoute(pathname)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')

  useOverlay(drawerOpen, () => setDrawerOpen(false))

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    document.title = `${route.label} · Threads Affiliate`
  }, [route.label])

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1')
      return !v
    })
  }

  return (
    // Framed sheet: sidebar + top bar chung nen --frame (khung chu L, khong vach ngan); noi dung nam
    // tren to trang vien 1px, bo 16px, cach mep phai/duoi 8px. Mobile: bo khung, to trang = man hinh.
    <div className="flex min-h-dvh bg-frame">
      {/* Sidebar desktop (>= lg), thu gon duoc */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col transition-[width] duration-200 lg:flex',
          collapsed ? 'w-14' : 'w-[228px]',
        )}
      >
        <div className={cn('flex h-12 items-center px-5', collapsed && 'justify-center px-0')}>
          <Brand compact={collapsed} />
        </div>
        <NavList compact={collapsed} />
        <div className={cn('flex items-center p-2', collapsed ? 'justify-center' : 'justify-between pl-5')}>
          {!collapsed && <span className="text-xs text-muted-foreground">Phase 2 · v0.1</span>}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* Drawer mobile + tablet (< lg) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-frame pt-[env(safe-area-inset-top)] shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex h-12 items-center justify-between pl-5 pr-2">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Đóng menu"
                className="rounded-md p-2.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
            <div className="px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
              Phase 2 · v0.1
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pb-2 lg:pr-2">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 bg-frame px-2 pt-[env(safe-area-inset-top)] sm:px-3 lg:px-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Mở menu"
            className="rounded-md p-2.5 text-foreground hover:bg-accent lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium lg:hidden">{route.label}</div>
          <nav aria-label="Vị trí" className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm lg:flex">
            {route.group && (
              <>
                <span className="text-muted-foreground">{route.group}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </>
            )}
            <span className="truncate">{route.label}</span>
          </nav>
          <ServerHealthButton />
          <ThemeToggle />
        </header>
        <main className="min-w-0 flex-1 bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:rounded-2xl lg:border xl:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
