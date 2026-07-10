import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  LayoutGrid,
  Download,
  Users,
  ShoppingBag,
  Network,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ThemeToggle'

const nav = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/posts', label: 'Bài viết', icon: LayoutGrid, end: false },
  { to: '/batch', label: 'Thu thập', icon: Download, end: false },
  { to: '/accounts', label: 'Accounts', icon: Users, end: false },
  { to: '/proxy', label: 'Proxy', icon: Network, end: false },
  { to: '/shopee', label: 'Shopee & Export', icon: ShoppingBag, end: false },
]

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Threads Affiliate</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-muted-foreground">Phase 2 · v0.1</div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-2 border-b bg-background/70 px-6 backdrop-blur">
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
