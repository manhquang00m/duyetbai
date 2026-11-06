import { useMemo } from 'react'
import type { SavedProxy } from '@/lib/api'
import { Combobox, type ComboboxItem } from '@/components/ui/combobox'
import { maskProxy, parseProxy, proxyHost } from '@/lib/parsers'
import type { ProxyChoice } from '@/components/proxyChoice'
import { cn } from '@/lib/utils'

const NEW_PROXY = '__new__'
const NO_TYPE = 'Chưa đặt loại'

/** User cua proxy (khong kem mat khau), '' neu proxy khong co auth. */
function proxyUser(p: string): string {
  const r = parseProxy(p)
  return 'error' in r ? '' : r.key.split(':')[2] ?? ''
}

const PILL = 'rounded-full px-2 py-0.5 text-xs'

/** Danh sach chi gom proxy Live -> chi bao khi KHAC Live (proxy cu cua account da Die / chua kiem tra). */
function StatusPill({ status }: { status: string | null }) {
  if (status === 'live') return null
  return status === 'die' ? (
    <span className={cn(PILL, 'bg-pill-negative text-pill-negative-ink')}>Die</span>
  ) : (
    <span className={cn(PILL, 'bg-pill-warning text-pill-warning-ink')}>Chưa kiểm tra</span>
  )
}

/**
 * O chon proxy co tim kiem: go de loc theo host / loai / ghi chu, hoac dan proxy moi roi chon
 * "Dung proxy moi" (se kiem tra Live khi luu). Nhom theo loai proxy; moi dong la host:port + user
 * (an mat khau) + so account dang dung.
 */
export function ProxyPicker({
  id,
  choice,
  onChange,
  options,
  usage,
  invalid,
  describedBy,
}: {
  id?: string
  choice: ProxyChoice
  onChange: (c: ProxyChoice) => void
  options: SavedProxy[]
  /** So account dang dung moi proxy (khong co -> khong hien). */
  usage?: Map<string, number>
  invalid?: boolean
  describedBy?: string
}) {
  const items = useMemo<ComboboxItem[]>(() => {
    // Nhom theo loai (ten A-Z, "Chua dat loai" cuoi); giu thu tu goc trong tung nhom
    const sorted = [...options].sort((a, b) => {
      if (!a.proxy_type !== !b.proxy_type) return a.proxy_type ? -1 : 1
      return (a.proxy_type ?? '').localeCompare(b.proxy_type ?? '', 'vi')
    })
    return [
      { value: '', label: 'Không dùng proxy' },
      ...sorted.map((p) => {
        const n = usage?.get(p.proxy) ?? 0
        return {
          value: p.proxy,
          label: proxyHost(p.proxy),
          sub: proxyUser(p.proxy) || undefined,
          group: p.proxy_type || NO_TYPE,
          meta: (
            <>
              <StatusPill status={p.status} />
              <span className={cn('text-xs tabular-nums', n > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                {n > 0 ? `${n} account` : 'chưa dùng'}
              </span>
            </>
          ),
          keywords: [maskProxy(p.proxy), p.proxy_type, p.note, p.account_names].filter(Boolean).join(' '),
        }
      }),
    ]
  }, [options, usage])
  const byValue = useMemo(() => new Map(options.map((p) => [p.proxy, p])), [options])

  const renderSelected = (value: string) => {
    const p = byValue.get(value)
    const user = proxyUser(value)
    return (
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="truncate tabular-nums">{proxyHost(value)}</span>
        {user && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{user}</span>}
        {p?.proxy_type && (
          <span className={cn(PILL, 'ml-auto max-w-[55%] shrink-0 truncate bg-pill-neutral text-pill-neutral-ink')}>{p.proxy_type}</span>
        )}
      </span>
    )
  }

  return (
    <Combobox
      id={id}
      value={choice.mode === 'text' ? NEW_PROXY : choice.value}
      onChange={(v) => onChange({ mode: 'select', value: v })}
      items={items}
      placeholder="Không dùng proxy"
      searchPlaceholder="Tìm host, loại, ghi chú… hoặc dán proxy mới"
      emptyText="Không có proxy khớp — dán proxy mới để dùng"
      onCreate={(q) => {
        const r = parseProxy(q)
        onChange({ mode: 'text', value: 'value' in r ? r.value : q })
      }}
      createLabel={(q) => {
        const r = parseProxy(q)
        return 'value' in r ? `Dùng proxy mới ${maskProxy(r.value)} (kiểm tra khi lưu)` : `Dùng “${q}” — ${r.error}`
      }}
      renderValue={(_, v) =>
        v === NEW_PROXY ? (
          <span className="flex w-full min-w-0 items-center gap-2">
            <span className="truncate tabular-nums">{maskProxy(choice.value)}</span>
            <span className={cn(PILL, 'ml-auto shrink-0 bg-pill-warning text-pill-warning-ink')}>Proxy mới</span>
          </span>
        ) : v ? (
          renderSelected(v)
        ) : (
          <span className="text-muted-foreground">Không dùng proxy</span>
        )
      }
      panelClassName="w-[min(36rem,calc(100vw-1rem))]"
      aria-invalid={invalid}
      aria-describedby={describedBy}
    />
  )
}
