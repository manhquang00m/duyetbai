import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { updateProxy, PROXY_TYPES, type ProxyType, type SavedProxy } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { parseProxy } from '@/lib/parsers'

interface Props {
  proxy: SavedProxy | null // null = dong
  onClose: () => void
  onSaved: () => void
}

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 sm:h-9'

export function ProxyEditDialog({ proxy, onClose, onSaved }: Props) {
  const [value, setValue] = useState('')
  const [type, setType] = useState<ProxyType | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!proxy) return
    setValue(proxy.proxy)
    setType(proxy.proxy_type ?? '')
    setNote(proxy.note ?? '')
  }, [proxy])

  const renaming = !!proxy && value.trim() !== proxy.proxy
  const dirty =
    !!proxy && (renaming || type !== (proxy.proxy_type ?? '') || note.trim() !== (proxy.note ?? '').trim())
  // Chi kiem dinh dang khi doi chuoi proxy - chuoi cu (vd import tu file) giu nguyen duoc
  const parsed = renaming && value.trim() ? parseProxy(value) : null
  const valueError = !value.trim() ? 'Proxy không được để trống' : parsed && 'error' in parsed ? parsed.error : null

  const submit = async () => {
    if (!proxy || valueError) return
    // Doi chuoi -> luu dang da chuan hoa (vd user:pass@ip:port -> ip:port:user:pass)
    const next = parsed && 'value' in parsed ? parsed.value : value.trim()
    setSaving(true)
    try {
      await updateProxy(proxy.id, {
        proxy: next,
        proxy_type: type || null,
        note: note.trim() || null,
      })
      toast.success('Đã cập nhật proxy')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật proxy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!proxy} onClose={onClose} className="max-w-md" dirty={dirty} busy={saving}>
      <h2 className="pr-8 text-lg font-semibold">Sửa proxy</h2>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="mt-4 space-y-4">
          <Field
            label="Proxy"
            error={valueError}
            hint={
              renaming && (proxy?.account_count ?? 0) > 0 ? (
                <span className="text-warning">
                  {proxy?.account_count} account đang dùng proxy này sẽ được chuyển sang chuỗi mới.
                </span>
              ) : (
                'ip:port, ip:port:user:pass, user:pass@ip:port hoặc http(s)/socks5://…'
              )
            }
          >
            {(fp) => (
              <Input
                {...fp}
                data-autofocus
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="ip:port hoặc ip:port:user:pass"
                className="text-xs tabular-nums"
              />
            )}
          </Field>

          <Field label="Loại proxy">
            {(fp) => (
              <select {...fp} className={SELECT_CLS} value={type} onChange={(e) => setType(e.target.value as ProxyType | '')}>
                <option value="">— Chưa đặt —</option>
                {PROXY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Ghi chú">
            {(fp) => <Input {...fp} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>

          <p className="text-xs text-muted-foreground">
            Trạng thái Live/Die không sửa tay được — chạy "Kiểm tra lại" để cập nhật.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button type="submit" disabled={saving || !!valueError}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Lưu
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
