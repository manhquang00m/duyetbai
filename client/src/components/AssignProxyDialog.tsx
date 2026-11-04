import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Loader2 } from 'lucide-react'
import { assignAccountProxies, type Account, type ProxyAssignResult, type SavedProxy } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

interface Props {
  accounts: Account[]
  proxies: SavedProxy[]
  onClose: () => void
  onDone: () => void
}

/** Chi hien host:port - chuoi proxy co the chua user/pass. */
export function proxyHost(p: string | null): string {
  if (!p) return '—'
  const noScheme = p.replace(/^[a-z0-9]+:\/\//i, '')
  const afterAuth = noScheme.includes('@') ? noScheme.slice(noScheme.lastIndexOf('@') + 1) : noScheme
  return afterAuth.split(':').slice(0, 2).join(':')
}

const ALL_TYPES = '__all__'

// Mount lai moi lan mo (cha render co dieu kien) -> danh sach + lua chon tinh lai theo du lieu moi nhat.
export function AssignProxyDialog({ accounts, proxies, onClose, onDone }: Props) {
  const need = accounts.length
  // Chi proxy Live; chua gan truoc, roi it nick dung nhat (account Die khong tinh - xem account_count).
  const pool = useMemo(
    () =>
      proxies
        .filter((p) => p.status === 'live')
        .sort((a, b) => a.account_count - b.account_count || a.id - b.id),
    [proxies],
  )
  const types = useMemo(() => [...new Set(pool.map((p) => p.proxy_type ?? ''))].sort(), [pool])
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES)
  const shown = pool.filter((p) => typeFilter === ALL_TYPES || (p.proxy_type ?? '') === typeFilter)

  // Thu tu tick = thu tu phan cho nick (nick 1 nhan proxy tick dau tien...). Mac dinh tick san N proxy it dung nhat.
  const [picked, setPicked] = useState<number[]>(() => pool.slice(0, need).map((p) => p.id))
  const byId = new Map(pool.map((p) => [p.id, p]))
  const full = picked.length >= need

  const toggle = (id: number) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= need ? cur : [...cur, id]))

  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<ProxyAssignResult[]>([])

  const submit = async () => {
    if (picked.length !== need) {
      toast.error(`Cần tick đúng ${need} proxy (đang ${picked.length})`)
      return
    }
    const items = accounts.map((a, i) => ({ accountId: a.id, proxy: byId.get(picked[i])!.proxy }))
    setSaving(true)
    try {
      const results = await assignAccountProxies(items)
      const ok = results.filter((r) => r.ok).length
      const bad = results.filter((r) => !r.ok)
      onDone()
      if (bad.length === 0) {
        toast.success(`Đã gán proxy mới cho ${ok} tài khoản (GPM + app)`)
        onClose()
      } else {
        if (ok > 0) toast.warning(`Gán được ${ok}/${results.length} tài khoản`)
        setFailed(bad)
      }
    } catch {
      toast.error('Không gán được proxy, thử lại sau')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} className="max-w-3xl">
      <h2 className="pr-8 text-lg font-semibold">Gán proxy · {need} tài khoản</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Tick đúng <b>{need}</b> proxy <b>Live</b> — xếp từ proxy chưa gán đến proxy ít nick dùng nhất. Thứ tự tick =
        thứ tự gán cho nick (xem phân bổ bên dưới). Lưu sẽ đổi proxy của profile GPM trùng tên, GPM xác nhận mới lưu
        vào app.
      </p>

      {pool.length === 0 ? (
        <p className="mt-4 rounded-md border p-4 text-center text-sm text-muted-foreground">
          Kho không có proxy Live nào. Thêm/kiểm tra proxy ở trang Proxy trước.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Lọc loại proxy"
            >
              <option value={ALL_TYPES}>Tất cả loại ({pool.length})</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t || '(chưa đặt loại)'} ({pool.filter((p) => (p.proxy_type ?? '') === t).length})
                </option>
              ))}
            </select>
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                picked.length === need ? 'text-green-700 dark:text-green-400' : 'text-warning',
              )}
            >
              Đã chọn {picked.length}/{need}
            </span>
            {picked.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPicked([])}>
                Bỏ chọn hết
              </Button>
            )}
            {pool.length < need && (
              <span className="text-xs text-red-600 dark:text-red-400">
                Chỉ có {pool.length} proxy Live — không đủ cho {need} tài khoản
              </span>
            )}
          </div>

          <div className="mt-2 max-h-[40dvh] overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-2" />
                  <th className="p-2 text-left">Proxy</th>
                  <th className="p-2 text-left">Loại</th>
                  <th className="p-2 text-right">Đang gán</th>
                  <th className="w-12 p-2 text-right">Thứ tự</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const order = picked.indexOf(p.id)
                  const on = order >= 0
                  return (
                    <tr
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      className={cn(
                        'cursor-pointer border-t',
                        on ? 'bg-active/60' : full ? 'opacity-50' : 'hover:bg-accent/60',
                      )}
                    >
                      <td className="p-2">
                        <Checkbox checked={on} onCheckedChange={() => toggle(p.id)} />
                      </td>
                      <td className="p-2 font-mono text-xs">{proxyHost(p.proxy)}</td>
                      <td className="p-2 text-xs">{p.proxy_type || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 text-right text-xs tabular-nums" title={p.account_names ?? undefined}>
                        {p.account_count === 0 ? (
                          <span className="text-green-700 dark:text-green-400">chưa gán</span>
                        ) : (
                          `${p.account_count} nick`
                        )}
                      </td>
                      <td className="p-2 text-right text-xs tabular-nums text-muted-foreground">
                        {on ? order + 1 : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Phân bổ</div>
            <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs">
              {accounts.map((a, i) => {
                const p = byId.get(picked[i] ?? -1)
                return (
                  <div key={a.id} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 truncate font-medium">{a.name}</span>
                    <span className="shrink-0 text-muted-foreground">({proxyHost(a.proxy)})</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {p ? (
                      <span className="truncate font-mono">
                        {proxyHost(p.proxy)}
                        {p.proxy_type && <span className="font-sans text-muted-foreground"> · {p.proxy_type}</span>}
                      </span>
                    ) : (
                      <span className="text-warning">chưa chọn</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {failed.length > 0 && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs dark:border-red-500/30 dark:bg-red-500/10">
          <div className="mb-1 font-medium text-red-700 dark:text-red-400">Không gán được:</div>
          <ul className="space-y-0.5">
            {failed.map((f) => (
              <li key={f.accountId}>
                <b>{f.account ?? `#${f.accountId}`}</b>: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Đóng
        </Button>
        <Button onClick={submit} disabled={saving || picked.length !== need}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Gán {picked.length}/{need} proxy
        </Button>
      </div>
    </Dialog>
  )
}
