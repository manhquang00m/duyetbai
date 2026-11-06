import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createAccount, fetchAccounts, fetchProxies, type Account, type AccountInput } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { ProxyPicker } from '@/components/ProxyPicker'
import { proxyChoiceError, resolveTypedProxy, type ProxyChoice } from '@/components/proxyChoice'

interface Props {
  open: boolean
  sourceAccount: Account | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Clone 1 account co san: giu nguyen thiet bi/pass_threads/gmail/gmail_password/active/banned,
 * chi doi Profile (ten) va PHAI chon proxy KHAC (proxy cu da bi account goc chiem, rang buoc
 * 1 proxy - 1 account).
 *
 * Proxy o day khac AccountFormDialog: cho phep chon tu danh sach DA luu, HOAC dan truc tiep 1
 * proxy MOI vao o tim - truong hop do se tu kiem tra Live truoc, chi tao account khi proxy Live, va
 * luu proxy do vao trang Proxy luon (khong bat nguoi dung phai qua trang Proxy them thu cong).
 */
export function CloneAccountDialog({ open, sourceAccount, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [proxyChoice, setProxyChoice] = useState<ProxyChoice>({ mode: 'select', value: '' })
  const [proxyLiveError, setProxyLiveError] = useState<string | null>(null)
  const [checkingProxy, setCheckingProxy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const { data: proxies } = useQuery({ queryKey: ['proxies'], queryFn: fetchProxies, enabled: open })
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts, enabled: open })

  // Proxy con "ranh" - chua account nao dung (proxy cua chinh account goc dang bi no chiem, nen
  // KHONG duoc goi y lai cho ban clone).
  const availableProxies = useMemo(() => {
    const taken = new Set((accounts ?? []).map((a) => a.proxy).filter((p): p is string => !!p))
    return (proxies ?? []).filter((p) => !taken.has(p.proxy))
  }, [proxies, accounts])

  const defaultName = sourceAccount ? `${sourceAccount.name}_copy` : ''
  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setProxyChoice({ mode: 'select', value: '' })
    setProxyLiveError(null)
    setSubmitted(false)
  }, [open, defaultName])

  const trimmedName = name.trim()
  const nameTaken =
    !!trimmedName && (accounts ?? []).some((a) => a.name.trim().toLowerCase() === trimmedName.toLowerCase())
  const nameError = !trimmedName ? 'Cần nhập Profile' : nameTaken ? `Đã có account "${trimmedName}"` : null
  const proxyError = proxyChoiceError(proxyChoice) ?? proxyLiveError
  const dirty = open && (name !== defaultName || proxyChoice.value !== '')

  const submit = async () => {
    if (!sourceAccount) return
    setSubmitted(true)
    if (nameError || proxyChoiceError(proxyChoice)) return

    let finalProxy: string | null = proxyChoice.mode === 'select' ? proxyChoice.value.trim() || null : null
    setSaving(true)
    try {
      if (proxyChoice.mode === 'text' && proxyChoice.value.trim()) {
        setCheckingProxy(true)
        let r
        try {
          r = await resolveTypedProxy(proxyChoice.value.trim())
        } finally {
          setCheckingProxy(false)
        }
        if ('error' in r) {
          setProxyLiveError(`${r.error} — chưa tạo account`)
          return
        }
        finalProxy = r.proxy
      }

      const payload: AccountInput = {
        name: trimmedName,
        active: sourceAccount.active === 1,
        banned: sourceAccount.banned === 1,
        device: sourceAccount.device,
        pass_threads: sourceAccount.pass_threads,
        gmail: sourceAccount.gmail,
        gmail_password: sourceAccount.gmail_password,
        proxy: finalProxy,
        platform: sourceAccount.platform,
        // Loai proxy theo proxy moi chon; proxy go tay (chua co loai) thi giu loai cua account goc.
        proxy_type: availableProxies.find((p) => p.proxy === finalProxy)?.proxy_type ?? sourceAccount.proxy_type,
      }
      await createAccount(payload)
      toast.success(`Đã clone thành account "${trimmedName}"`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi clone account')
    } finally {
      setSaving(false)
    }
  }

  if (!sourceAccount) return null
  const busy = saving || checkingProxy

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg" dirty={dirty} busy={busy}>
      <h2 className="pr-8 text-lg font-semibold">Clone account "{sourceAccount.name}"</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Giữ nguyên thiết bị/Pass_Threads/Gmail/Password — chỉ cần đổi tên và chọn proxy khác.
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="mt-4 space-y-4">
          <Field label="Profile (tên account mới)" required error={submitted || nameTaken ? nameError : null}>
            {(fp) => (
              <Input
                {...fp}
                data-autofocus
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd: shopvn_02"
              />
            )}
          </Field>

          <Field
            label="Proxy"
            error={proxyError}
            hint={
              proxyChoice.mode === 'text'
                ? 'Proxy mới: tự kiểm tra Live trước khi tạo account — Die thì báo lỗi, không tạo. Live thì lưu vào trang Proxy luôn.'
                : availableProxies.length === 0
                  ? 'Không còn proxy nào rảnh — dán proxy mới vào ô tìm để dùng.'
                  : 'Chỉ liệt kê proxy chưa account nào dùng.'
            }
          >
            {(fp) => (
              <ProxyPicker
                id={fp.id}
                choice={proxyChoice}
                onChange={(c) => {
                  setProxyChoice(c)
                  setProxyLiveError(null)
                }}
                options={availableProxies}
                invalid={fp['aria-invalid']}
                describedBy={fp['aria-describedby']}
              />
            )}
          </Field>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {checkingProxy ? 'Đang kiểm tra proxy...' : 'Clone'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
