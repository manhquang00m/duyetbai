import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CornerDownLeft, Download, Filter, Plus, Search, type LucideIcon } from 'lucide-react'
import { fetchAccounts } from '@/lib/api'
import { attentionReason, REASON_LABEL } from '@/lib/accountAttention'
import { AccountAvatar } from '@/components/AccountAvatar'
import { cn } from '@/lib/utils'
import { OPEN_EVENT, VIEWS } from '@/lib/commandPalette'

const ACTIONS: { label: string; to: string; icon: LucideIcon; keywords?: string }[] = [
  { label: 'Thêm account', to: '/accounts?new=1', icon: Plus, keywords: 'tao moi nick' },
  { label: 'Thu thập bài từ link', to: '/batch', icon: Download, keywords: 'url scrape cao' },
  { label: 'Thêm proxy', to: '/proxy', icon: Plus, keywords: 'dan proxy' },
]

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  icon?: LucideIcon
  account?: string
  haystack: string
  to: string
}

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

export function CommandPalette({
  pages,
}: {
  pages: { to: string; label: string; icon: LucideIcon; group: string }[]
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Cung cache ['accounts'] voi sidebar - chi doc ten, thiet bi, trang thai; khong hien truong nhay cam.
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts, enabled: open, staleTime: 60_000 })

  const all = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const p of pages)
      out.push({ id: `p:${p.to}`, group: 'Trang', label: p.label, hint: p.group, icon: p.icon, haystack: fold(`${p.label} ${p.group}`), to: p.to })
    for (const v of VIEWS)
      out.push({ id: `v:${v.to}`, group: 'View', label: v.label, icon: Filter, haystack: fold(`${v.label} ${v.keywords ?? ''}`), to: v.to })
    for (const a of ACTIONS)
      out.push({ id: `a:${a.to}${a.label}`, group: 'Hành động', label: a.label, icon: a.icon, haystack: fold(`${a.label} ${a.keywords ?? ''}`), to: a.to })
    for (const a of accounts ?? []) {
      const r = attentionReason(a)
      out.push({
        id: `acc:${a.id}`,
        group: 'Account',
        label: a.name,
        hint: [a.device, r ? REASON_LABEL[r] : a.banned ? 'Banned' : null].filter(Boolean).join(' · '),
        account: a.name,
        haystack: fold(`${a.name} ${a.device ?? ''}`),
        to: `/accounts?q=${encodeURIComponent(a.name)}`,
      })
    }
    return out
  }, [pages, accounts])

  const shown = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return all.filter((i) => i.group !== 'Account')
    // Account chi hien khi go - danh sach dai, va nhay toi nick la viec co chu dich
    return all.filter((i) => tokens.every((t) => i.haystack.includes(t))).slice(0, 50)
  }, [all, query])

  useEffect(() => setCursor(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const go = (it: Item | undefined) => {
    if (!it) return
    setOpen(false)
    navigate(it.to)
  }

  if (!open) return null

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-2 pt-[10vh] sm:p-4 sm:pt-[14vh]">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tìm hoặc nhảy tới"
        className="relative flex max-h-[70dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(shown.length - 1, c + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                go(shown[cursor])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
              }
            }}
            placeholder="Tìm trang, view, account…"
            aria-label="Tìm trang, view, account"
            role="combobox"
            aria-expanded
            aria-controls="cmdk-list"
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          <kbd className="font-sans hidden rounded border px-1.5 text-[11px] text-muted-foreground sm:block">Esc</kbd>
        </div>
        <div ref={listRef} id="cmdk-list" role="listbox" className="flex-1 overflow-y-auto p-1.5">
          {shown.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Không thấy “{query}”</div>
          )}
          {shown.map((it, idx) => {
            const head = it.group !== lastGroup
            lastGroup = it.group
            const Icon = it.icon
            return (
              <div key={it.id}>
                {head && <div className="px-2.5 pb-1 pt-2.5 text-xs text-muted-foreground">{it.group}</div>}
                <div
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === cursor}
                  onMouseMove={() => setCursor(idx)}
                  onClick={() => go(it)}
                  className={cn(
                    'flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm',
                    idx === cursor && 'bg-accent',
                  )}
                >
                  {it.account ? (
                    <AccountAvatar name={it.account} size="sm" />
                  ) : (
                    Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="shrink-0 truncate text-xs text-muted-foreground">{it.hint}</span>}
                  {idx === cursor && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                </div>
              </div>
            )
          })}
        </div>
        <div className="hidden items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground sm:flex">
          <span>↑↓ chọn</span>
          <span>Enter mở</span>
          <span className="ml-auto inline-flex items-center gap-1">
            Ctrl K <ArrowRight className="h-3 w-3" /> mở lại bất cứ lúc nào
          </span>
        </div>
      </div>
    </div>
  )
}
