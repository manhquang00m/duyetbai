import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { updateProxy, PROXY_TYPES, type ProxyType, type SavedProxy } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  proxy: SavedProxy | null // null = dong
  onClose: () => void
  onSaved: () => void
}

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

  const submit = async () => {
    if (!proxy) return
    const next = value.trim()
    if (!next) {
      toast.error('Proxy không được để trống')
      return
    }
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
    <Dialog open={!!proxy} onClose={onClose} className="max-w-md">
      <h2 className="pr-8 text-lg font-semibold">Sửa proxy</h2>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Proxy</label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ip:port hoặc ip:port:user:pass"
            className="font-mono text-xs"
          />
          {renaming && (proxy?.account_count ?? 0) > 0 && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              {proxy?.account_count} account đang dùng proxy này sẽ được chuyển sang chuỗi mới.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Loại proxy</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9"
            value={type}
            onChange={(e) => setType(e.target.value as ProxyType | '')}
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
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Ghi chú</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <p className="text-[11px] text-muted-foreground">
          Trạng thái Live/Die không sửa tay được — chạy "Kiểm tra lại" để cập nhật.
        </p>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
