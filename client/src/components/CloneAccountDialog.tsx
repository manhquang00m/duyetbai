import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  createAccount,
  fetchAccounts,
  fetchProxies,
  checkProxies,
  saveProxies,
  type Account,
  type AccountInput,
} from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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
 * Proxy o day khac AccountFormDialog: cho phep chon tu danh sach DA luu, HOAC go truc tiep 1
 * proxy MOI - truong hop go tay se tu kiem tra Live truoc, chi tao account khi proxy Live, va
 * luu proxy do vao trang Proxy luon (khong bat nguoi dung phai qua trang Proxy them thu cong).
 */
export function CloneAccountDialog({ open, sourceAccount, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [proxyMode, setProxyMode] = useState<'select' | 'text'>('select')
  const [proxySelect, setProxySelect] = useState('')
  const [proxyText, setProxyText] = useState('')
  const [checkingProxy, setCheckingProxy] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: proxies } = useQuery({ queryKey: ['proxies'], queryFn: fetchProxies, enabled: open })
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts, enabled: open })

  // Proxy con "ranh" - chua account nao dung (proxy cua chinh account goc dang bi no chiem, nen
  // KHONG duoc goi y lai cho ban clone).
  const availableProxies = useMemo(() => {
    const taken = new Set((accounts ?? []).map((a) => a.proxy).filter((p): p is string => !!p))
    return (proxies ?? []).filter((p) => !taken.has(p.proxy))
  }, [proxies, accounts])

  useEffect(() => {
    if (!open) return
    setName(sourceAccount ? `${sourceAccount.name}_copy` : '')
    setProxyMode('select')
    setProxySelect('')
    setProxyText('')
  }, [open, sourceAccount])

  const submit = async () => {
    if (!sourceAccount) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Thiếu Profile (tên account)')
      return
    }

    let finalProxy: string | null = null;
    setSaving(true)
    try {
      if (proxyMode === 'select') {
        finalProxy = proxySelect.trim() || null
      } else {
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
            toast.error(`Proxy Die/không kết nối được (${result.error ?? 'không rõ lỗi'}) — chưa tạo account`)
            return
          }
          await saveProxies([{ proxy: result.proxy, status: result.status, ip: result.ip }])
          finalProxy = result.proxy
        }
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
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <h2 className="text-lg font-semibold">Clone account "{sourceAccount.name}"</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Giữ nguyên thiết bị/Pass_Threads/Gmail/Password — chỉ cần đổi tên và chọn proxy khác.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Profile (tên account mới)
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: shopvn_02" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Proxy</label>
          <div className="mb-1.5 flex gap-0.5 rounded-md border p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setProxyMode('select')}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
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
                'rounded px-2 py-1 text-xs font-medium transition-colors',
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
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={proxySelect}
                onChange={(e) => setProxySelect(e.target.value)}
              >
                <option value="">— Không dùng proxy —</option>
                {availableProxies.map((p) => (
                  <option key={p.proxy} value={p.proxy}>
                    {p.proxy}
                    {p.status === 'live' ? ' · Live' : p.status === 'die' ? ' · Die' : ' · Chưa kiểm tra'}
                  </option>
                ))}
              </select>
              {availableProxies.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Không còn proxy nào rảnh — nhập proxy mới ở tab bên cạnh.
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
                Sẽ tự kiểm tra Live trước khi tạo account — nếu Die sẽ báo lỗi và không tạo. Proxy
                Live sẽ được lưu vào trang Proxy luôn.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {checkingProxy ? 'Đang kiểm tra proxy...' : 'Clone'}
        </Button>
      </div>
    </Dialog>
  )
}
