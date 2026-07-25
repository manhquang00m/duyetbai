import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { fetchAccountTopics, saveAccountTopics, ACCOUNT_TOPICS } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Gan chu de theo TAC GIA (username trich xuat tu URL bai), khong phai tung bai rieng le -
 * 1 tac gia thuong dang nhat quan 1 chu de nen gan 1 lan la ap dung cho toan bo bai cua ho
 * (ca bai da co lan bai moi thu thap sau nay).
 */
export function AssignTopicDialog({ open, onClose, onSaved }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['account-topics'],
    queryFn: fetchAccountTopics,
    enabled: open,
  })
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setEdited({})
  }, [open])

  const rows = data ?? []
  const dirtyCount = Object.keys(edited).length

  const submit = async () => {
    const items = Object.entries(edited).map(([username, topic]) => ({ username, topic }))
    if (items.length === 0) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await saveAccountTopics(items)
      toast.success(`Đã lưu chủ đề cho ${items.length} tác giả`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi lưu chủ đề')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <h2 className="text-lg font-semibold">Gán chủ đề theo tác giả</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Chủ đề gán theo tên tác giả (trích xuất từ URL bài) — áp dụng cho toàn bộ bài của tác giả
        đó, kể cả bài thu thập sau này.
      </p>

      <div className="mt-3 max-h-96 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2.5 text-left font-medium">Tác giả</th>
              <th className="p-2.5 text-right font-medium">Số bài</th>
              <th className="p-2.5 text-left font-medium">Chủ đề</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading &&
              rows.map((r) => (
                <tr key={r.username} className="border-b last:border-0">
                  <td className="max-w-[10rem] truncate p-2.5 font-mono text-xs">@{r.username}</td>
                  <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                    {r.post_count}
                  </td>
                  <td className="p-2.5">
                    <select
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={edited[r.username] ?? r.topic ?? ''}
                      onChange={(e) =>
                        setEdited((prev) => ({ ...prev, [r.username]: e.target.value }))
                      }
                    >
                      <option value="">— Chưa gán —</option>
                      {ACCOUNT_TOPICS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-muted-foreground">
                  Chưa có bài viết nào để gán chủ đề.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Huỷ
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
        </Button>
      </div>
    </Dialog>
  )
}
