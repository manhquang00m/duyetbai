import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { createTopic, deleteTopic, fetchTopics, renameTopic, reorderTopics, type Topic } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'

export function TopicsPage() {
  const qc = useQueryClient()
  const { data: topics, isLoading } = useQuery({ queryKey: ['topics'], queryFn: fetchTopics })
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Moi API tra lai danh sach moi -> ghi thang vao cache, va lam moi cac du lieu dang hien ten chu de.
  const onSaved = (list: Topic[]) => {
    qc.setQueryData(['topics'], list)
    qc.invalidateQueries({ queryKey: ['posts'] })
    qc.invalidateQueries({ queryKey: ['posting-accounts'] })
    qc.invalidateQueries({ queryKey: ['account-topics'] })
  }
  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : 'Lỗi lưu chủ đề')

  const createMut = useMutation({
    mutationFn: createTopic,
    onSuccess: (list) => {
      onSaved(list)
      setNewName('')
      toast.success('Đã thêm chủ đề')
    },
    onError,
  })
  const renameMut = useMutation({
    mutationFn: (v: { oldName: string; name: string }) => renameTopic(v.oldName, v.name),
    onSuccess: (list) => {
      onSaved(list)
      setEditing(null)
      toast.success('Đã đổi tên')
    },
    onError,
  })
  const deleteMut = useMutation({
    mutationFn: deleteTopic,
    onSuccess: (list) => {
      onSaved(list)
      toast.success('Đã xoá chủ đề')
    },
    onError,
  })
  const orderMut = useMutation({ mutationFn: reorderTopics, onSuccess: onSaved, onError })

  const list = topics ?? []

  const submitNew = (e: FormEvent) => {
    e.preventDefault()
    if (newName.trim()) createMut.mutate(newName.trim())
  }

  const startEdit = (t: Topic) => {
    setEditing(t.name)
    setEditName(t.name)
  }

  const submitEdit = (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    if (editName.trim() === editing) {
      setEditing(null)
      return
    }
    renameMut.mutate({ oldName: editing, name: editName.trim() })
  }

  const confirmDelete = (t: Topic) => {
    const usage =
      t.post_count || t.account_count
        ? `\n\nĐang dùng ở ${t.post_count} bài và ${t.account_count} account - các chỗ này sẽ bị bỏ gán chủ đề.`
        : ''
    if (confirm(`Xoá chủ đề "${t.name}"?${usage}`)) deleteMut.mutate(t.name)
  }

  const move = (i: number, dir: -1 | 1) => {
    const names = list.map((t) => t.name)
    const j = i + dir
    if (j < 0 || j >= names.length) return
    ;[names[i], names[j]] = [names[j], names[i]]
    orderMut.mutate(names)
  }

  return (
    <div className="max-w-3xl space-y-4 pb-6 sm:space-y-6">
      <PageHeader
        title="Chủ đề"
        description="Danh mục chủ đề dùng chung cho bài viết và account đăng. Thứ tự ở đây là thứ tự hiện trong các ô chọn."
      />

      <form onSubmit={submitNew} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tên chủ đề mới..."
          maxLength={50}
          className="text-sm"
        />
        <Button type="submit" size="sm" disabled={!newName.trim() || createMut.isPending}>
          <Plus className="h-4 w-4" /> Thêm
        </Button>
      </form>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="p-2.5 text-left">Tên</th>
              <th className="p-2.5 text-right">Bài</th>
              <th className="p-2.5 text-right">Account</th>
              <th className="p-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2.5" colSpan={4}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))}

            {list.map((t, i) => (
              <tr key={t.name} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-2.5">
                  {editing === t.name ? (
                    <form onSubmit={submitEdit} className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                        maxLength={50}
                        className="h-8 text-sm"
                      />
                      <Button type="submit" variant="ghost" size="icon" aria-label="Lưu" disabled={renameMut.isPending}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Huỷ" onClick={() => setEditing(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <span className="font-medium">{t.name}</span>
                  )}
                </td>
                <td className="p-2.5 text-right tabular-nums text-muted-foreground">{t.post_count}</td>
                <td className="p-2.5 text-right tabular-nums text-muted-foreground">{t.account_count}</td>
                <td className="p-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || orderMut.isPending}
                      aria-label="Lên"
                      title="Lên"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => move(i, 1)}
                      disabled={i === list.length - 1 || orderMut.isPending}
                      aria-label="Xuống"
                      title="Xuống"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(t)} aria-label="Đổi tên" title="Đổi tên">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirmDelete(t)} aria-label="Xoá" title="Xoá">
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {!isLoading && list.length === 0 && (
              <tr>
                <td colSpan={4} className="p-0">
                  <EmptyState icon={Tags} title="Chưa có chủ đề" description="Thêm chủ đề đầu tiên ở ô phía trên." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Đổi tên sẽ cập nhật luôn các bài, account và lịch sử phân phối đang dùng tên cũ. Xoá sẽ bỏ gán chủ đề đó
        khỏi bài và account (lịch sử phân phối giữ nguyên).
      </p>
    </div>
  )
}
