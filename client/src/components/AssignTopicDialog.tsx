import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import { fetchAccountTopics, fetchPosts, setAuthorTopic, ACCOUNT_TOPICS } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Ap 1 chu de cho TOAN BO bai HIEN CO cua 1 tac gia (username trich xuat tu URL bai) - tien cho
 * bai cu/cao truoc khi co tinh nang chu de theo nhom URL. Bai moi cao qua "Thu thap theo nhom" da
 * duoc gan THANG chu de vao dung bai roi (services/jobs.ts), khong can qua day. Vi 1 tac gia co the
 * co bai o nhieu chu de khac nhau, cot "Chu de" chi hien danh sach chu de HIEN CO trong bai cua ho
 * de tham khao - chon 1 gia tri o select se GHI DE chu de len TOAN BO bai hien co cua tac gia do.
 */
export function AssignTopicDialog({ open, onClose, onSaved }: Props) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['account-topics'],
    queryFn: fetchAccountTopics,
    enabled: open,
  })
  const [expanded, setExpanded] = useState<string | null>(null) // tac gia dang xem danh sach bai
  const [topicFilter, setTopicFilter] = useState('all') // 'all' | 'unassigned' | 1 gia tri ACCOUNT_TOPICS

  useEffect(() => {
    if (open) {
      setExpanded(null)
      setTopicFilter('all')
    }
  }, [open])

  const rows = data ?? []

  // Uu tien tac gia CHUA gan len dau (theo so bai giam dan) de xu ly het cho chua co truoc.
  const sortedRows = useMemo(
    () =>
      [...(data ?? [])].sort((a, b) => {
        const aAssigned = a.topics.length > 0 ? 1 : 0
        const bAssigned = b.topics.length > 0 ? 1 : 0
        if (aAssigned !== bAssigned) return aAssigned - bAssigned
        return b.post_count - a.post_count
      }),
    [data],
  )

  const visibleRows = sortedRows.filter((r) => {
    if (topicFilter === 'all') return true
    if (topicFilter === 'unassigned') return r.topics.length === 0
    return r.topics.includes(topicFilter)
  })

  const totalPosts = rows.reduce((sum, r) => sum + r.post_count, 0)
  const assignedPosts = rows.reduce(
    (sum, r) => (r.topics.length > 0 ? sum + r.post_count : sum),
    0,
  )

  return (
    <Dialog open={open} onClose={onClose} className="max-w-3xl">
      <h2 className="pr-8 text-lg font-semibold">Gán chủ đề theo tác giả</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Chọn 1 chủ đề sẽ ghi đè lên TOÀN BỘ bài hiện có của tác giả đó — dùng cho bài cũ/cào trước
        khi có "Thu thập theo nhóm". Bài mới cào theo nhóm URL đã tự gán đúng chủ đề riêng, không
        cần chỉnh ở đây nữa.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Đã gán chủ đề:{' '}
          <span className="font-medium text-foreground">
            {assignedPosts}/{totalPosts}
          </span>{' '}
          bài
        </p>
        <select
          className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-9 sm:w-auto sm:text-xs"
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
        >
          <option value="all">Tất cả chủ đề</option>
          <option value="unassigned">— Chưa gán —</option>
          {ACCOUNT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="table-scroll mt-2 max-h-[55dvh] overflow-y-auto rounded-lg border sm:max-h-[65dvh]">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
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
              visibleRows.map((r) => (
                <AuthorRow
                  key={r.username}
                  username={r.username}
                  postCount={r.post_count}
                  expanded={expanded === r.username}
                  onToggle={() =>
                    setExpanded((cur) => (cur === r.username ? null : r.username))
                  }
                >
                  <AuthorTopicSelect
                    topics={r.topics}
                    onChange={async (topic) => {
                      await setAuthorTopic(r.username, topic)
                      await refetch()
                      onSaved()
                    }}
                  />
                </AuthorRow>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  Chưa có bài viết nào để gán chủ đề.
                </td>
              </tr>
            )}
            {!isLoading && rows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  Không có tác giả nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Dialog>
  )
}

/**
 * Select ghi de chu de cho TOAN BO bai hien co cua 1 tac gia. `topics` la danh sach chu de KHAC
 * NHAU dang co trong bai cua ho (co the >1 vi tung bai duoc gan rieng) - chi hien 1 gia tri chon
 * san khi CA tac gia chi co dung 1 chu de, con lai de trong + hien chu thich cac chu de dang co.
 */
function AuthorTopicSelect({
  topics,
  onChange,
}: {
  topics: string[]
  onChange: (topic: string | null) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const selected = topics.length === 1 ? topics[0] : ''

  const handleChange = async (value: string) => {
    setSaving(true)
    try {
      await onChange(value || null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="flex h-10 w-40 rounded-md border border-input bg-background px-2 text-sm shadow-xs transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 sm:h-9 sm:text-xs"
        value={selected}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">— Chưa gán —</option>
        {ACCOUNT_TOPICS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      {topics.length > 1 && (
        <span className="text-[11px] text-muted-foreground">Đang có: {topics.join(', ')}</span>
      )}
    </div>
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
        <td className="min-w-[13rem] p-2.5">{children}</td>
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
      <div className="max-h-[40dvh] space-y-1.5 overflow-auto pr-1 sm:max-h-72">
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
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
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
