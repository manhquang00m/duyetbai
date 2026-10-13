import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import {
  createAccount,
  updateAccount,
  fetchAccounts,
  fetchProxies,
  checkProxies,
  saveProxies,
  PROXY_TYPES,
  APPEAL_STATUSES,
  type Account,
  type AccountInput,
  type SavedProxy,
} from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  account: Account | null // null = tao moi, co gia tri = sua
  onClose: () => void
  onSaved: () => void
}

function emptyForm(): AccountInput {
  return {
    name: '',
    active: true,
    banned: false,
    device: '',
    pass_threads: '',
    gmail: '',
    gmail_password: '',
    proxy: '',
    platform: null,
    proxy_type: null,
    appeal_status: null,
    note: '',
  }
}

export function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground sm:right-1.5 sm:p-1.5"
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export function AccountFormDialog({ open, account, onClose, onSaved }: Props) {
  const [form, setForm] = useState<AccountInput>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [checkingProxy, setCheckingProxy] = useState(false)
  const [proxyMode, setProxyMode] = useState<'select' | 'text'>('select')
  const [proxyText, setProxyText] = useState('')

  const { data: proxies } = useQuery({ queryKey: ['proxies'], queryFn: fetchProxies, enabled: open })
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts, enabled: open })

  // Proxy dropdown: CHI proxy Live. 1 proxy DUOC PHEP dung chung cho nhieu account nen khong
  // loai proxy da co nguoi dung nua - thay vao do hien so account dang dung de nguoi chon biet.
  // Neu proxy hien tai cua chinh account nay khong Live (vd import Excel cu, chua tung kiem tra,
  // hoac da chuyen Die) thi van them vao dau danh sach de khong bi mat gia tri dang co.
  const usageByProxy = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of accounts ?? []) {
      const p = a.proxy?.trim()
      if (p) m.set(p, (m.get(p) ?? 0) + 1)
    }
    return m
  }, [accounts])

  const proxyOptions = useMemo(() => {
    const pool = (proxies ?? []).filter((p) => p.status === 'live')
    const current = form.proxy?.trim()
    if (current && !pool.some((p) => p.proxy === current)) {
      const existing = (proxies ?? []).find((p) => p.proxy === current)
      const synthesized: SavedProxy = existing ?? {
        id: -1,
        proxy: current,
        status: null,
        ip: null,
        checked_at: null,
        created_at: '',
        proxy_type: null,
        note: null,
        account_names: null,
        account_count: 0,
      }
      return [synthesized, ...pool]
    }
    return pool
  }, [proxies, form.proxy])

  useEffect(() => {
    if (!open) return
    setForm(
      account
        ? {
            name: account.name,
            active: account.active === 1,
            banned: account.banned === 1,
            device: account.device ?? '',
            pass_threads: account.pass_threads ?? '',
            gmail: account.gmail ?? '',
            gmail_password: account.gmail_password ?? '',
            proxy: account.proxy ?? '',
            platform: account.platform ?? null,
            proxy_type: account.proxy_type ?? null,
            appeal_status: account.appeal_status ?? null,
            note: account.note ?? '',
          }
        : emptyForm(),
    )
    setProxyMode('select')
    setProxyText('')
  }, [open, account])

  const submit = async () => {
    const name = form.name.trim()
    if (!name) {
      toast.error('Thiếu Profile (tên account)')
      return
    }

    let finalProxy = form.proxy?.trim() || null
    setSaving(true)
    try {
      if (proxyMode === 'text') {
        const typed = proxyText.trim()
        if (typed) {
          setCheckingProxy(true)
          let result
          try {
            ;[result] = await checkProxies([typed])
          } finally {
            setCheckingProxy(false)
          }
          if (result.status !== 'live') {
            toast.error(`Proxy Die/không kết nối được (${result.error ?? 'không rõ lỗi'}) — chưa lưu account`)
            return
          }
          await saveProxies([{ proxy: result.proxy, status: result.status, ip: result.ip }])
          finalProxy = result.proxy
        } else {
          finalProxy = null
        }
      }

      const payload: AccountInput = {
        ...form,
        name,
        device: form.device?.trim() || null,
        pass_threads: form.pass_threads?.trim() || null,
        gmail: form.gmail?.trim() || null,
        gmail_password: form.gmail_password?.trim() || null,
        proxy: finalProxy,
        platform: form.platform || null,
        proxy_type: form.proxy_type || null,
        appeal_status: form.appeal_status || null,
        note: form.note?.trim() || null,
      }
      if (account) await updateAccount(account.id, payload)
      else await createAccount(payload)
      toast.success(account ? 'Đã cập nhật account' : 'Đã thêm account')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi lưu account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <h2 className="pr-8 text-lg font-semibold">{account ? 'Sửa account' : 'Thêm account'}</h2>

      <div className="mt-4 space-y-3.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Profile (tên account)
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="vd: shopvn_01"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Thiết bị</label>
          <Input
            value={form.device ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Proxy</label>
          <div className="mb-1.5 flex w-full gap-0.5 rounded-md border p-0.5 sm:w-fit">
            <button
              type="button"
              onClick={() => setProxyMode('select')}
              className={cn(
                'flex-1 rounded px-2 py-2 text-xs font-medium transition-colors sm:flex-none sm:py-1',
                proxyMode === 'select'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              Chọn từ danh sách
            </button>
            <button
              type="button"
              onClick={() => setProxyMode('text')}
              className={cn(
                'flex-1 rounded px-2 py-2 text-xs font-medium transition-colors sm:flex-none sm:py-1',
                proxyMode === 'text'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              Nhập proxy mới
            </button>
          </div>

          {proxyMode === 'select' ? (
            <>
              <select
                className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9"
                value={form.proxy ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, proxy: e.target.value || null }))}
              >
                <option value="">— Không dùng proxy —</option>
                {proxyOptions.map((p) => (
                  <option key={p.proxy} value={p.proxy}>
                    {p.proxy}
                    {p.status === 'live' ? ' · Live' : p.status === 'die' ? ' · Die' : ' · Chưa kiểm tra'}
                    {usageByProxy.get(p.proxy)
                      ? ` · ${usageByProxy.get(p.proxy)} account đang dùng`
                      : ''}
                  </option>
                ))}
              </select>
              {proxyOptions.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Chưa có proxy Live nào — nhập proxy mới ở tab bên cạnh.
                </p>
              )}
            </>
          ) : (
            <>
              <Input
                value={proxyText}
                onChange={(e) => setProxyText(e.target.value)}
                placeholder="ip:port hoặc ip:port:user:pass"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sẽ tự kiểm tra Live trước khi lưu — nếu Die sẽ báo lỗi và không lưu. Proxy Live sẽ
                được lưu vào trang Proxy luôn.
              </p>
            </>
          )}
        </div>

        <PasswordField
          label="Pass_Threads"
          value={form.pass_threads ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, pass_threads: v }))}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Gmail</label>
            <Input
              value={form.gmail ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, gmail: e.target.value }))}
            />
          </div>
          <PasswordField
            label="Password (Gmail)"
            value={form.gmail_password ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, gmail_password: v }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Platform</label>
          <select
            className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9"
            value={form.platform ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                platform: e.target.value ? (e.target.value as 'Stable' | 'Global') : null,
              }))
            }
          >
            <option value="">— Chưa đặt —</option>
            <option value="Stable">Stable</option>
            <option value="Global">Global</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Loại proxy
            </label>
            <select
              className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9"
              value={form.proxy_type ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  proxy_type: e.target.value ? (e.target.value as (typeof PROXY_TYPES)[number]) : null,
                }))
              }
            >
              <option value="">— Chưa đặt —</option>
              {PROXY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Trạng thái
            </label>
            <select
              className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9"
              value={form.appeal_status ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  appeal_status: e.target.value
                    ? (e.target.value as (typeof APPEAL_STATUSES)[number])
                    : null,
                }))
              }
            >
              <option value="">— Chưa đặt —</option>
              {APPEAL_STATUSES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Ghi chú</label>
          <Input
            value={form.note ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Ghi chú tự do"
          />
        </div>

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
            <span className="text-sm">Active (dùng round-robin)</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.banned}
              onCheckedChange={(v) => setForm((f) => ({ ...f, banned: v }))}
            />
            <span className="text-sm">Banned</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {checkingProxy ? 'Đang kiểm tra proxy...' : 'Lưu'}
        </Button>
      </div>
    </Dialog>
  )
}
