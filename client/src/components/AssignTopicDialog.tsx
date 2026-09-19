import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Save } from 'lucide-react'
import { fetchAccountTopics, fetchPosts, saveAccountTopics, ACCOUNT_TOPICS } from '@/lib/api'
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
  const [expanded, setExpanded] = useState<string | null>(null) // tac gia dang xem danh sach bai

  useEffect(() => {
    if (open) {
      setEdited({})
      setExpanded(null)
    }
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
    <Dialog open={open} onClose={onClose} className="max-w-3xl">
      <h2 className="text-lg font-semibold">Gán chủ đề theo tác giả</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Chủ đề gán theo tên tác giả (trích xuất từ URL bài) — áp dụng cho toàn bộ bài của tác giả
        đó, kể cả bài thu thập sau này.
      </p>

      <div className="mt-3 max-h-[65vh] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2.5 text-left font-medium">Tác giả</th>
              <th className="p-2.5 text-right font-medium">Số bài</th>
              <th className="w-24 p-2.5 text-left font-medium">Xem bài</th>
              <th className="p-2.5 text-left font-medium">Chủ đề</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading &&
              rows.map((r) => (
                <AuthorRow
                  key={r.username}
                  username={r.username}
                  postCount={r.post_count}
                  expanded={expanded === r.username}
                  onToggle={() =>
                    setExpanded((cur) => (cur === r.username ? null : r.username))
                  }
                >
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
                </AuthorRow>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
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

/** 1 dong tac gia + (khi bung) danh sach bai cua ho ngay ben duoi de xem truoc khi gan chu de. */
function AuthorRow({
  username,
  postCount,
  expanded,
  onToggle,
  children,
}: {
  username: string
  postCount: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <tr className="border-b last:border-0">
        <td className="max-w-[12rem] truncate p-2.5 font-mono text-xs">@{username}</td>
        <td className="p-2.5 text-right tabular-nums text-muted-foreground">{postCount}</td>
        <td className="p-2.5">
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {expanded ? 'Ẩn' : 'Xem'}
          </Button>
        </td>
        <td className="p-2.5">{children}</td>
      </tr>
      {expanded && (
        <tr className="border-b bg-muted/30 last:border-0">
          <td colSpan={4} className="p-2.5">
            <AuthorPosts username={username} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Danh sach bai cua 1 tac gia - chi goi API khi dong do duoc bung ra. */
function AuthorPosts({ username }: { username: string }) {
  // Loc theo DUNG username (khong dung search vi search la LIKE, de dinh bai cua tac gia khac).
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['posts', 'by-author', username],
    queryFn: () => fetchPosts({ username, limit: 50 }),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bài viết...
      </div>
    )
  }
  if (isError) {
    return (
      <div className="p-3 text-xs text-destructive">
        {error instanceof Error ? error.message : 'Lỗi tải bài viết'}
      </div>
    )
  }

  const items = data?.items ?? []
  if (items.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">Không có bài nào.</div>
  }

  return (
    <div className="space-y-1.5">
      {data && data.total > items.length && (
        <p className="text-xs text-muted-foreground">
          Hiển thị {items.length} bài mới nhất trong tổng số {data.total}.
        </p>
      )}
      <div className="max-h-72 space-y-1.5 overflow-auto pr-1">
        {items.map((p) => (
          <div key={p.post_id} className="flex gap-2.5 rounded-md border bg-background p-2">
            {p.thumb ? (
              <img
                src={`/media/${p.thumb}`}
                alt=""
                className="h-12 w-12 shrink-0 rounded object-cover ring-1 ring-border"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs">{p.caption || <em>(không có caption)</em>}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{p.post_date || p.scraped_at?.slice(0, 10)}</span>
                <span>· {p.shopee_count} link</span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" /> Mở
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
