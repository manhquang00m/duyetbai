import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isAxiosError } from 'axios'
import { Download, Search, Shuffle } from 'lucide-react'
import {
  downloadSeedingXlsx,
  fetchSeedingCandidates,
  fetchSeedingPreview,
  type SeedingCandidate,
} from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SingleFilterDropdown } from '@/components/ui/filter-dropdown'
import { cn } from '@/lib/utils'

const MAX_PER_ROW = 50
const MAX_COMMENTS = 100
const PLATFORM_OPTS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Global', label: 'Global' },
  { value: 'Stable', label: 'Stable' },
]

const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))

/** O so co nhan ben trai + don vi ben phai, kep trong [min,max] khi roi o. */
function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const v = clamp(Math.round(Number(draft)), min, max)
    setDraft(String(v))
    if (v !== value) onChange(v)
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-20 tabular-nums"
      />
      <span className="text-muted-foreground">{unit}</span>
    </label>
  )
}

function AccountList({
  candidates,
  platform,
  excluded,
  setExcluded,
}: {
  candidates: SeedingCandidate[]
  platform: string
  excluded: Set<number>
  setExcluded: (s: Set<number>) => void
}) {
  const [q, setQ] = useState('')
  const inPlatform = candidates.filter((c) => !c.invalid && (platform === 'all' || c.platform === platform))
  const needle = q.trim().toLowerCase()
  const shown = needle ? inPlatform.filter((c) => c.name.toLowerCase().includes(needle)) : inPlatform
  const invalid = candidates.filter((c) => c.invalid)
  const picked = shown.filter((c) => !excluded.has(c.id)).length

  const toggle = (id: number, on: boolean) => {
    const next = new Set(excluded)
    if (on) next.delete(id)
    else next.add(id)
    setExcluded(next)
  }
  const toggleAll = (on: boolean) => {
    const next = new Set(excluded)
    for (const c of shown) {
      if (on) next.delete(c.id)
      else next.add(c.id)
    }
    setExcluded(next)
  }

  return (
    <Card className="flex flex-col lg:sticky lg:top-14 lg:max-h-[calc(100dvh-4.5rem)]">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm account…" className="pl-8" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={shown.length > 0 && picked === shown.length}
            indeterminate={picked > 0 && picked < shown.length}
            onCheckedChange={(v) => toggleAll(v)}
          />
          <span className="flex-1">Chọn tất cả</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {picked}/{shown.length}
          </span>
        </label>
      </div>
      <ul className="max-h-80 overflow-y-auto p-1.5 lg:max-h-none lg:flex-1">
        {shown.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent">
              <Checkbox checked={!excluded.has(c.id)} onCheckedChange={(v) => toggle(c.id, v)} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.platform && <span className="shrink-0 text-xs text-muted-foreground">{c.platform}</span>}
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">Không có account khớp</li>}
      </ul>
      {invalid.length > 0 && (
        <p className="border-t p-3 text-xs text-muted-foreground">
          Bỏ qua {invalid.length} account có tên không phải username Threads: {invalid.map((c) => c.name).join(', ')}
        </p>
      )}
    </Card>
  )
}

export function SeedingPage() {
  const [perRow, setPerRow] = useState(5)
  const [commentsPerRow, setCommentsPerRow] = useState(30)
  const [platform, setPlatform] = useState('all')
  // Luu account BO CHON (khong phai da chon) -> account moi them vao mac dinh duoc chon
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [seed, setSeed] = useState(newSeed)
  const [downloading, setDownloading] = useState(false)

  const {
    data: candidates,
    isLoading,
    error,
    refetch,
  } = useQuery({ queryKey: ['seeding-candidates'], queryFn: fetchSeedingCandidates, retry: false })
  const accountIds = useMemo(
    () =>
      (candidates ?? [])
        .filter((c) => !c.invalid && (platform === 'all' || c.platform === platform) && !excluded.has(c.id))
        .map((c) => c.id),
    [candidates, platform, excluded],
  )
  const opts = { accountIds, perRow, commentsPerRow, seed }
  const enough = accountIds.length >= 2

  const { data: plan, isFetching } = useQuery({
    queryKey: ['seeding-preview', accountIds.join(','), perRow, commentsPerRow, seed],
    queryFn: () => fetchSeedingPreview(opts),
    enabled: enough,
    placeholderData: keepPreviousData,
  })

  const download = async () => {
    setDownloading(true)
    try {
      await downloadSeedingXlsx(opts)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tạo file')
    } finally {
      setDownloading(false)
    }
  }

  const k = plan?.perRow ?? 0
  return (
    <div className="mx-auto max-w-8xl space-y-4 pb-6 sm:space-y-6">
      <PageHeader
        title="Seeding chéo"
        description="Xuất file Excel cho script GPM SeedingThreads: profile ở cột A vào xem, like, comment bài của các account ở cột B. Cột C là comment ngẫu nhiên."
        primary={{
          label: 'Tải Excel',
          icon: Download,
          onClick: download,
          busy: downloading,
          disabled: !enough || !plan,
        }}
        secondary={[{ label: 'Trộn lại', icon: Shuffle, onClick: () => setSeed(newSeed()), title: 'Xếp cặp ngẫu nhiên lại' }]}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <NumberField label="Mỗi profile xem" unit="account" value={perRow} min={1} max={MAX_PER_ROW} onChange={setPerRow} />
        <NumberField label="Comment mỗi dòng" unit="câu" value={commentsPerRow} min={0} max={MAX_COMMENTS} onChange={setCommentsPerRow} />
        <SingleFilterDropdown label="Platform" value={platform} options={PLATFORM_OPTS} onChange={setPlatform} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : error ? (
          // 404 = server chua nap code moi (chay tu truoc khi co trang nay) -> noi ro cach xu ly
          <Card className="space-y-3 p-4 text-sm">
            <p className="font-medium text-destructive">Không tải được danh sách account</p>
            <p className="text-muted-foreground">
              {isAxiosError(error) && error.response?.status === 404
                ? 'Server chưa có tính năng này — khởi động lại server (cổng 3000) rồi bấm Thử lại.'
                : error.message}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Thử lại
            </Button>
          </Card>
        ) : (
          <AccountList candidates={candidates ?? []} platform={platform} excluded={excluded} setExcluded={setExcluded} />
        )}

        <Card className={cn('min-w-0 transition-opacity', isFetching && 'opacity-60')}>
          <div className="border-b px-4 py-3 text-sm">
            {enough && plan ? (
              <>
                <span className="font-medium tabular-nums">{plan.rows.length}</span> profile · mỗi profile xem{' '}
                <span className="font-medium tabular-nums">{k}</span> account · mỗi account được{' '}
                <span className="font-medium tabular-nums">{k}</span> profile ghé
                {k < perRow && <span className="text-muted-foreground"> (tối đa {k} vì chỉ có {plan.rows.length} account)</span>}
                {plan.commentsPerRow > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {plan.commentsPerRow} comment/dòng lấy từ {plan.commentPool} câu
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                {error ? 'Chưa có danh sách account.' : 'Chọn ít nhất 2 account để xếp cặp.'}
              </span>
            )}
          </div>

          {enough && plan && (
            <ul className="divide-y">
              {plan.rows.map((r) => (
                <li key={r.profile} className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                  <div className="min-w-0 truncate text-sm font-medium">{r.profile}</div>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {r.targets.map((t) => (
                        <span key={t} className="rounded-full bg-pill-neutral px-2 py-0.5 text-xs text-pill-neutral-ink">
                          {t}
                        </span>
                      ))}
                    </div>
                    {r.comments.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground" title={r.comments.join(' · ')}>
                        {r.comments.length} comment: {r.comments.slice(0, 3).join(' · ')}…
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
