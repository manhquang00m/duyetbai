import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { bulkPostingTopics, ACCOUNT_TOPICS } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  accountIds: number[]
  onClose: () => void
  onSaved: () => void
}

const MODES = [
  { value: 'add', label: 'Thêm', hint: 'giữ chủ đề cũ, thêm các chủ đề đã chọn' },
  { value: 'remove', label: 'Bỏ', hint: 'gỡ các chủ đề đã chọn khỏi tài khoản' },
  { value: 'replace', label: 'Ghi đè', hint: 'xoá hết chủ đề cũ, chỉ giữ các chủ đề đã chọn' },
] as const

export function AssignPostingTopicsDialog({ open, accountIds, onClose, onSaved }: Props) {
  const [picked, setPicked] = useState<string[]>([])
  const [mode, setMode] = useState<'add' | 'remove' | 'replace'>('add')
  const [saving, setSaving] = useState(false)

  const toggle = (t: string) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))

  const submit = async () => {
    if (picked.length === 0) {
      toast.error('Chọn ít nhất 1 chủ đề')
      return
    }
    setSaving(true)
    try {
      await bulkPostingTopics(accountIds, picked, mode)
      toast.success(`Đã cập nhật chủ đề cho ${accountIds.length} tài khoản`)
      setPicked([])
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi gán chủ đề')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <h2 className="pr-8 text-lg font-semibold">Gán chủ đề cho {accountIds.length} tài khoản</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Chủ đề của tài khoản đăng quyết định nó được nhận bài thuộc chủ đề nào. Gán 2-3 chủ đề
        cho mỗi tài khoản để kho bài rộng hơn, tránh bị thiếu bài.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Chủ đề</label>
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNT_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={cn(
                  'rounded-full border px-3 py-2 text-xs font-medium transition-colors sm:py-1',
                  picked.includes(t)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Cách áp</label>
          <div className="flex w-full gap-0.5 rounded-md border p-0.5 sm:w-fit">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  'flex-1 rounded px-3 py-2 text-xs font-medium transition-colors sm:flex-none sm:py-1',
                  mode === m.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {MODES.find((m) => m.value === mode)?.hint}
          </p>
        </div>
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
