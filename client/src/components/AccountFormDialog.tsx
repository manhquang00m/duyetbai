import { useEffect, useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import {
  createAccount,
  updateAccount,
  fetchAccounts,
  fetchProxies,
  APPEAL_STATUSES,
  type Account,
  type AccountInput,
  type SavedProxy,
} from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/ui/field'
import { ProxyPicker } from '@/components/ProxyPicker'
import { proxyChoiceError, resolveTypedProxy, type ProxyChoice } from '@/components/proxyChoice'
import { EMAIL } from '@/lib/parsers'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  account: Account | null // null = tao moi, co gia tri = sua
  onClose: () => void
  onSaved: () => void
}

const SELECT_CLS =
  'flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 sm:h-9'

function emptyForm(): AccountInput {
  return {
    name: '',
    active: true,
    banned: false,
    device: 'GPM GLOBAL', // nick moi mac dinh chay tren GPM Login (khop gia tri da dung cho phan lon nick)
    pass_threads: '',
    gmail: '',
    gmail_password: '',
    proxy: '',
    // Nick moi thuong la Global va dang ngam truoc khi dang bai
    platform: 'Global',
    proxy_type: null,
    appeal_status: 'Đang ngâm',
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
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          // Khong de trinh duyet goi y / luu mat khau cua nick vao so mat khau cua nguoi dung
          autoComplete="new-password"
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
  const [initial, setInitial] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkingProxy, setCheckingProxy] = useState(false)
  const [proxyChoice, setProxyChoice] = useState<ProxyChoice>({ mode: 'select', value: '' })
  const [proxyLiveError, setProxyLiveError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

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

  const currentProxy = account?.proxy?.trim() ?? ''
  const proxyOptions = useMemo(() => {
    const pool = (proxies ?? []).filter((p) => p.status === 'live')
    if (currentProxy && !pool.some((p) => p.proxy === currentProxy)) {
      const existing = (proxies ?? []).find((p) => p.proxy === currentProxy)
      const synthesized: SavedProxy = existing ?? {
        id: -1,
        proxy: currentProxy,
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
  }, [proxies, currentProxy])

  useEffect(() => {
    if (!open) return
    const next = account
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
      : emptyForm()
    const choice: ProxyChoice = { mode: 'select', value: next.proxy ?? '' }
    setForm(next)
    setProxyChoice(choice)
    setInitial(JSON.stringify([next, choice]))
    setProxyLiveError(null)
    setSubmitted(false)
    setTouched({})
  }, [open, account])

  const dirty = open && initial !== '' && JSON.stringify([form, proxyChoice]) !== initial

  // --- Loi tung o (hien sau khi roi o hoac bam Luu; trung ten thi bao ngay)
  const trimmedName = form.name.trim()
  const nameTaken =
    !!trimmedName &&
    (accounts ?? []).some((a) => a.id !== account?.id && a.name.trim().toLowerCase() === trimmedName.toLowerCase())
  const errors = {
    name: !trimmedName ? 'Cần nhập Profile' : nameTaken ? `Đã có account "${trimmedName}"` : null,
    gmail: form.gmail?.trim() && !EMAIL.test(form.gmail.trim()) ? 'Gmail không đúng định dạng' : null,
    proxy: proxyChoiceError(proxyChoice) ?? proxyLiveError,
  }
  const show = (k: keyof typeof errors) =>
    errors[k] && (submitted || touched[k] || (k === 'name' && nameTaken) || k === 'proxy') ? errors[k] : null
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }))

  const submit = async () => {
    setSubmitted(true)
    if (errors.name || errors.gmail || proxyChoiceError(proxyChoice)) return

    let finalProxy = proxyChoice.mode === 'select' ? proxyChoice.value.trim() || null : null
    setSaving(true)
    try {
      if (proxyChoice.mode === 'text') {
        const typed = proxyChoice.value.trim()
        if (typed) {
          setCheckingProxy(true)
          let r
          try {
            r = await resolveTypedProxy(typed)
          } finally {
            setCheckingProxy(false)
          }
          if ('error' in r) {
            setProxyLiveError(`${r.error} — chưa lưu account`)
            return
          }
          finalProxy = r.proxy
        }
      }

      const payload: AccountInput = {
        ...form,
        name: trimmedName,
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
    <Dialog open={open} onClose={onClose} className="max-w-2xl" dirty={dirty} busy={saving}>
      <h2 className="pr-8 text-lg font-semibold">{account ? 'Sửa account' : 'Thêm account'}</h2>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Profile (tên account)" required error={show('name')}>
              {(fp) => (
                <Input
                  {...fp}
                  data-autofocus
                  autoComplete="off"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={blur('name')}
                  placeholder="vd: shopvn_01"
                />
              )}
            </Field>
            <Field label="Thiết bị">
              {(fp) => (
                <Input
                  {...fp}
                  autoComplete="off"
                  value={form.device ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))}
                />
              )}
            </Field>
          </div>

          <Field
            label="Proxy"
            error={show('proxy')}
            hint={
              proxyChoice.mode === 'text'
                ? 'Proxy mới: tự kiểm tra Live trước khi lưu — Die thì báo lỗi, không lưu. Live thì lưu vào trang Proxy luôn.'
                : proxyOptions.length === 0
                  ? 'Chưa có proxy Live nào — dán proxy mới vào ô tìm để dùng.'
                  : 'Chỉ liệt kê proxy Live. Dán proxy mới vào ô tìm nếu chưa có trong danh sách.'
            }
          >
            {(fp) => (
              <ProxyPicker
                id={fp.id}
                choice={proxyChoice}
                onChange={(c) => {
                  setProxyChoice(c)
                  setProxyLiveError(null)
                  // Loai proxy cua account luon theo proxy dang chon (hien ngay trong dropdown).
                  // Proxy moi go tay chua co loai -> de trong, dat loai o trang Proxy.
                  const type = c.mode === 'select' ? (proxyOptions.find((p) => p.proxy === c.value)?.proxy_type ?? null) : null
                  setForm((f) => ({ ...f, proxy: c.mode === 'select' ? c.value || null : f.proxy, proxy_type: type }))
                }}
                options={proxyOptions}
                usage={usageByProxy}
                invalid={fp['aria-invalid']}
                describedBy={fp['aria-describedby']}
              />
            )}
          </Field>

          <PasswordField
            label="Pass_Threads"
            value={form.pass_threads ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, pass_threads: v }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Gmail" error={show('gmail')}>
              {(fp) => (
                <Input
                  {...fp}
                  type="email"
                  autoComplete="off"
                  value={form.gmail ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, gmail: e.target.value }))}
                  onBlur={blur('gmail')}
                />
              )}
            </Field>
            <PasswordField
              label="Password (Gmail)"
              value={form.gmail_password ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, gmail_password: v }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Platform">
              {(fp) => (
                <select
                  {...fp}
                  className={SELECT_CLS}
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
              )}
            </Field>
            <Field label="Trạng thái">
              {(fp) => (
                <select
                  {...fp}
                  className={SELECT_CLS}
                  value={form.appeal_status ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      appeal_status: e.target.value ? (e.target.value as (typeof APPEAL_STATUSES)[number]) : null,
                      // Cung luat voi dropdown o bang + import: "Die" <=> banned. Khong dong bo thi nick
                      // doi Die -> Live van banned, bi loai khoi Phan phoi bai ma khong ai thay.
                      banned: e.target.value === 'Die',
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
              )}
            </Field>
          </div>

          <Field label="Ghi chú">
            {(fp) => (
              <Input
                {...fp}
                autoComplete="off"
                value={form.note ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Ghi chú tự do"
              />
            )}
          </Field>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:gap-6">
            <label className="flex items-center gap-2">
              <Switch checked={!!form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <span className="text-sm">Active (dùng round-robin)</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={!!form.banned} onCheckedChange={(v) => setForm((f) => ({ ...f, banned: v }))} />
              <span className="text-sm">Banned</span>
            </label>
          </div>
        </div>

        <div className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end')}>
          <span className="hidden text-xs text-muted-foreground sm:mr-auto sm:inline">Enter để lưu</span>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {checkingProxy ? 'Đang kiểm tra proxy...' : 'Lưu'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
