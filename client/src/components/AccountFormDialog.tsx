import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import {
  createAccount,
  updateAccount,
  fetchAccounts,
  fetchProxies,
  type Account,
  type AccountInput,
  type SavedProxy,
} from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

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
  }
}

function PasswordField({
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
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

  const { data: proxies } = useQuery({ queryKey: ['proxies'], queryFn: fetchProxies, enabled: open })
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts, enabled: open })

  // Proxy dropdown: tat ca proxy da luu, tru cai dang bi account KHAC (khong phai chinh minh) chiem.
  // Neu proxy hien tai cua chinh account nay khong nam trong bang proxies (vd import Excel cu,
  // chua tung kiem tra) thi van them vao dau danh sach de khong bi mat gia tri dang co.
  const proxyOptions = useMemo(() => {
    const takenByOthers = new Set(
      (accounts ?? [])
        .filter((a) => !account || a.id !== account.id)
        .map((a) => a.proxy)
        .filter((p): p is string => !!p),
    )
    const pool = (proxies ?? []).filter((p) => !takenByOthers.has(p.proxy))
    const current = form.proxy?.trim()
    if (current && !pool.some((p) => p.proxy === current)) {
      const synthesized: SavedProxy = {
        id: -1,
        proxy: current,
        status: null,
        ip: null,
        checked_at: null,
        created_at: '',
        account_names: null,
      }
      return [synthesized, ...pool]
    }
    return pool
  }, [proxies, accounts, account, form.proxy])

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
          }
        : emptyForm(),
    )
  }, [open, account])

  const submit = async () => {
    const name = form.name.trim()
    if (!name) {
      toast.error('Thiếu Profile (tên account)')
      return
    }
    setSaving(true)
    try {
      const payload: AccountInput = {
        ...form,
        name,
        device: form.device?.trim() || null,
        pass_threads: form.pass_threads?.trim() || null,
        gmail: form.gmail?.trim() || null,
        gmail_password: form.gmail_password?.trim() || null,
        proxy: form.proxy?.trim() || null,
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
      <h2 className="text-lg font-semibold">{account ? 'Sửa account' : 'Thêm account'}</h2>

      <div className="mt-4 space-y-3">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Thiết bị</label>
            <Input
              value={form.device ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Proxy</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.proxy ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, proxy: e.target.value || null }))}
            >
              <option value="">— Không dùng proxy —</option>
              {proxyOptions.map((p) => (
                <option key={p.proxy} value={p.proxy}>
                  {p.proxy}
                  {p.status === 'live' ? ' · Live' : p.status === 'die' ? ' · Die' : ' · Chưa kiểm tra'}
                </option>
              ))}
            </select>
            {proxyOptions.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Chưa có proxy nào — thêm và kiểm tra ở trang Proxy trước.
              </p>
            )}
          </div>
        </div>

        <PasswordField
          label="Pass_Threads"
          value={form.pass_threads ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, pass_threads: v }))}
        />

        <div className="grid grid-cols-2 gap-3">
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

        <div className="flex items-center gap-6 pt-1">
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

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Lưu
        </Button>
      </div>
    </Dialog>
  )
}
