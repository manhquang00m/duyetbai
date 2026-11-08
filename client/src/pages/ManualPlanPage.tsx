import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CalendarX, Download, Keyboard } from 'lucide-react'
import {
  addPlanItem,
  apiErrorData,
  distributionExportUrl,
  fetchDistributionPlan,
  fetchPlanCandidates,
  fetchPostingAccounts,
  planEditedAfterExport,
  removePlanItem,
  setPlanItemVariant,
  type ManualCandidate,
  type PlanItem,
} from '@/lib/api'
import { q, useUrlState } from '@/lib/useUrlState'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { addDaysIso, todayIso } from '@/lib/dates'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { AccountColumn } from '@/components/manual-plan/AccountColumn'
import { CandidateList, type PendingGap } from '@/components/manual-plan/CandidateList'
import { ScheduleColumn } from '@/components/manual-plan/ScheduleColumn'
import { dayLabel, isPostingAccount, isTyping, shortDay } from '@/components/manual-plan/shared'
import { cn } from '@/lib/utils'
import { MEDIA_VALUES } from '@/components/filters/mediaOptions'

// Ngu canh dang gan song tren URL: F5 / gui link van mo dung nick + ngay + bo loc
const SCHEMA = {
  account: q.int(0),
  date: q.str(''),
  topic: q.list([]),
  q: q.str(''),
  media: q.enum(MEDIA_VALUES, 'all'),
  hide: q.bool(false),
}
const PAGE = 50
type Tab = 'nick' | 'posts' | 'schedule'

export function ManualPlanPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { values: v, set } = useUrlState(SCHEMA)

  const planQ = useQuery({ queryKey: ['dist-plan', id], queryFn: () => fetchDistributionPlan(id), retry: false })
  const accountsQ = useQuery({ queryKey: ['posting-accounts'], queryFn: fetchPostingAccounts })
  const plan = planQ.data?.plan
  const planItems = useMemo(() => planQ.data?.items ?? [], [planQ.data])

  const dates = useMemo(
    () => (plan ? Array.from({ length: plan.days }, (_, i) => addDaysIso(plan.start_date, i)) : []),
    [plan],
  )
  // Nick du dieu kien dang; nick co chu de len truoc (chon duoc), nick chua co chu de xuong cuoi
  const accounts = useMemo(
    () =>
      (accountsQ.data ?? [])
        .filter(isPostingAccount)
        .sort(
          (a, b) =>
            Number(b.topics.length > 0) - Number(a.topics.length > 0) || a.name.localeCompare(b.name, 'vi'),
        ),
    [accountsQ.data],
  )
  const selectable = useMemo(() => accounts.filter((a) => a.topics.length > 0), [accounts])
  const account = selectable.find((a) => a.id === v.account) ?? null
  const date = dates.includes(v.date) ? v.date : dates.includes(todayIso()) ? todayIso() : (dates[0] ?? '')
  const topics = account ? v.topic.filter((t) => account.topics.includes(t)) : []
  const search = useDebouncedValue(v.q.trim(), 300)
  const media = v.media === 'all' ? undefined : v.media

  // Chua chon nick / ngay (hoac tren URL khong hop le) -> tu chon nick dau tien, ngay hom nay/ngay dau
  useEffect(() => {
    if (!plan || !accountsQ.data) return
    const patch: Partial<typeof v> = {}
    if (!account && selectable[0]) patch.account = selectable[0].id
    if (date && v.date !== date) patch.date = date
    if (Object.keys(patch).length) set(patch, { replace: true })
  }, [plan, accountsQ.data, account, selectable, date, v.date, set])

  const candQ = useInfiniteQuery({
    queryKey: ['dist-candidates', id, account?.id, date, topics, search, media, v.hide],
    queryFn: ({ pageParam }) =>
      fetchPlanCandidates(id, {
        accountId: account!.id,
        postDate: date,
        topics,
        search,
        media,
        hideUsed: v.hide,
        limit: PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    enabled: !!account && !!date && plan?.kind === 'manual',
    // Giu danh sach cu khi chi doi bo loc (do nhay); doi nick/ngay thi KHONG giu de khoi nham bai cua nick khac
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[2] === account?.id && prevQuery?.queryKey[3] === date
        ? keepPreviousData(prev)
        : undefined,
  })
  const candidates = useMemo(() => candQ.data?.pages.flatMap((p) => p.items) ?? [], [candQ.data])
  const total = candQ.data?.pages[0]?.total ?? 0

  const [activeIndex, setActiveIndex] = useState(0)
  const [pending, setPending] = useState<PendingGap | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<number | null>(null)
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())
  const [tab, setTab] = useState<Tab>('posts')

  const contextKey = `${account?.id}|${date}|${topics.join(',')}|${search}|${media}|${v.hide}`
  useEffect(() => {
    setActiveIndex(0)
    setPending(null)
  }, [contextKey])

  const accountItems = useMemo(
    () => planItems.filter((it) => it.post_id && account && (it.account_id === account.id || it.account_name === account.name)),
    [planItems, account],
  )
  const countByAccount = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of planItems) if (it.post_id) m.set(it.account_name, (m.get(it.account_name) ?? 0) + 1)
    return m
  }, [planItems])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['dist-plan', id] })
    qc.invalidateQueries({ queryKey: ['dist-candidates', id] })
    qc.invalidateQueries({ queryKey: ['dist-plans'] })
  }
  const flash = (itemId: number) => {
    setFlashId(itemId)
    setTimeout(() => setFlashId((cur) => (cur === itemId ? null : cur)), 1600)
  }
  const setBusy = (itemId: number, on: boolean) =>
    setBusyIds((s) => {
      const n = new Set(s)
      if (on) n.add(itemId)
      else n.delete(itemId)
      return n
    })

  async function assign(c: ManualCandidate, confirmGap = false) {
    if (!account || !date || assigningId) return
    if (c.state === 'same_account' || c.state === 'full') return
    if (c.state === 'gap' && !confirmGap) {
      setPending({ postId: c.post_id, uses: c.uses })
      return
    }
    setAssigningId(c.post_id)
    try {
      const it = await addPlanItem(id, { accountId: account.id, postDate: date, postId: c.post_id, confirmGap })
      setPending(null)
      flash(it.id)
      toast.success(`Đã gán vào ${dayLabel(date)}`, { duration: 1500 })
      setActiveIndex((i) => Math.min(i + 1, Math.max(candidates.length - 1, 0)))
      refresh()
    } catch (e) {
      const d = apiErrorData(e)
      if (d.code === 'GAP_WARNING') {
        setPending({ postId: c.post_id, uses: (d.uses as PendingGap['uses']) ?? [] })
      } else {
        toast.error(e instanceof Error ? e.message : 'Gán không thành công')
        qc.invalidateQueries({ queryKey: ['dist-candidates', id] })
      }
    } finally {
      setAssigningId(null)
    }
  }

  async function remove(it: PlanItem) {
    setBusy(it.id, true)
    try {
      const removed = await removePlanItem(id, it.id)
      refresh()
      toast(`Đã bỏ 1 bài khỏi ${dayLabel(it.post_date)}`, {
        action: {
          label: 'Hoàn tác',
          onClick: async () => {
            try {
              const back = await addPlanItem(id, {
                accountId: removed.account_id ?? it.account_id ?? 0,
                postDate: removed.post_date,
                postId: removed.post_id ?? '',
                confirmGap: true, // bai vua nam o day -> khoi phuc, khong hoi lai
                variant: removed.caption_variant,
              })
              flash(back.id)
              refresh()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Không hoàn tác được')
            }
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bỏ gán không thành công')
    } finally {
      setBusy(it.id, false)
    }
  }

  // Doi sang ban caption ke tiep; ban do da dung trong ngay (409) thi thu ban sau nua
  async function cycleVariant(it: PlanItem) {
    const n = it.variant_count ?? 0
    if (n < 2 || !it.caption_variant) return
    setBusy(it.id, true)
    try {
      for (let step = 1; step < n; step++) {
        const next = ((it.caption_variant - 1 + step) % n) + 1
        try {
          await setPlanItemVariant(id, it.id, next)
          qc.invalidateQueries({ queryKey: ['dist-plan', id] })
          qc.invalidateQueries({ queryKey: ['dist-candidates', id] })
          return
        } catch (e) {
          if (apiErrorData(e).status !== 409) throw e
        }
      }
      toast.error(`Các bản caption khác của bài này đã dùng trong ${dayLabel(it.post_date)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không đổi được bản caption')
    } finally {
      setBusy(it.id, false)
    }
  }

  const selectAccount = (accountId: number) => {
    set({ account: accountId, topic: [] }, { replace: true })
    setTab('posts')
  }
  const moveAccount = (d: number) => {
    if (selectable.length === 0) return
    const i = Math.max(0, selectable.findIndex((a) => a.id === account?.id))
    const next = selectable[Math.min(selectable.length - 1, Math.max(0, i + d))]
    if (next && next.id !== account?.id) {
      set({ account: next.id, topic: [] }, { replace: true })
      document.querySelector(`[data-account-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }
  const moveDate = (d: number) => {
    const i = dates.indexOf(date)
    const next = dates[Math.min(dates.length - 1, Math.max(0, i + d))]
    if (next && next !== date) {
      set({ date: next }, { replace: true })
      document.querySelector(`[data-date="${next}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  // Phim tat: dang ky 1 lan, luon goi ban handler moi nhat qua ref
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  useLayoutEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        moveAccount(e.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      // Enter tren nut dang focus -> de trinh duyet tu click, khong gan 2 lan
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest('button, a')) return
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, Math.max(candidates.length - 1, 0)))
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          break
        case 'ArrowRight':
          e.preventDefault()
          moveDate(1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          moveDate(-1)
          break
        case 'Enter': {
          e.preventDefault()
          if (pending) {
            const c = candidates.find((x) => x.post_id === pending.postId)
            if (c) assign(c, true)
          } else if (candidates[activeIndex]) {
            assign(candidates[activeIndex])
          }
          break
        }
        case 'Escape':
          if (pending) setPending(null)
          break
      }
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ---------- render ----------
  if (planQ.isLoading || accountsQ.isLoading) {
    return (
      <div className="mx-auto max-w-8xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }
  if (!plan) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Không tìm thấy kế hoạch"
        description="Kế hoạch có thể đã bị xoá."
        action={<BackLink />}
      />
    )
  }
  if (plan.kind !== 'manual') {
    return (
      <EmptyState
        icon={CalendarX}
        title="Kế hoạch tự động không gán tay được"
        description="Tạo kế hoạch thủ công bằng nút “Gán thủ công” ở trang Phân phối bài."
        action={<BackLink />}
      />
    )
  }

  const assignedTotal = planItems.filter((i) => i.post_id).length
  const columnHeight = 'h-[70dvh] lg:h-auto'

  return (
    <div className="mx-auto flex max-w-8xl flex-col gap-4 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[560px]">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Link
            to="/distribution"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Phân phối bài
          </Link>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-semibold">
            <span className="min-w-0 truncate">{plan.name || `Kế hoạch thủ công ${shortDay(plan.start_date)}`}</span>
            <span className="rounded-full bg-pill-neutral px-2 py-0.5 text-[11px] font-medium text-pill-neutral-ink">
              Thủ công
            </span>
          </h1>
          <p className="text-xs tabular-nums text-muted-foreground">
            {dayLabel(dates[0] ?? plan.start_date)} → {dayLabel(dates[dates.length - 1] ?? plan.start_date)} ·{' '}
            <strong className="font-medium text-foreground">{assignedTotal}</strong> bài · {countByAccount.size} nick ·
            tự lưu sau mỗi lần gán
          </p>
        </div>
        <a
          href={distributionExportUrl(plan.id)}
          className={cn(buttonVariants({ variant: 'outline' }), assignedTotal === 0 && 'pointer-events-none opacity-50')}
          aria-disabled={assignedTotal === 0}
        >
          <Download className="h-4 w-4" /> Tải file
        </a>
      </div>

      {planEditedAfterExport(plan) && (
        <div className="flex items-start gap-2 rounded-lg bg-pill-warning px-3 py-2 text-sm text-pill-warning-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Kế hoạch đã sửa sau lần xuất file gần nhất — <strong>tải lại file</strong> trước khi đưa cho tool đăng.
          </span>
        </div>
      )}

      {/* Tab cho man hinh hep */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-sm lg:hidden" role="tablist">
        {(
          [
            ['nick', account ? `@${account.name}` : 'Nick'],
            ['posts', 'Bài'],
            ['schedule', `Lịch (${accountItems.length})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('truncate rounded-md px-2 py-1.5', tab === k ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <AccountColumn
          accounts={accounts}
          selectedId={account?.id ?? 0}
          countByAccount={countByAccount}
          onSelect={selectAccount}
          className={cn(columnHeight, tab !== 'nick' && 'hidden lg:flex')}
        />
        <CandidateList
          accountName={account?.name ?? null}
          targetDayLabel={date ? dayLabel(date) : '—'}
          accountTopics={account?.topics ?? []}
          topics={topics}
          onTopicsChange={(t) => set({ topic: t }, { replace: true })}
          search={v.q}
          onSearchChange={(s) => set({ q: s }, { replace: true })}
          media={v.media}
          onMediaChange={(m) => set({ media: m }, { replace: true })}
          hideUsed={v.hide}
          onHideUsedChange={(h) => set({ hide: h }, { replace: true })}
          items={candidates}
          total={total}
          loading={candQ.isLoading || (candQ.isFetching && candidates.length === 0)}
          fetching={candQ.isFetching}
          hasMore={!!candQ.hasNextPage}
          loadingMore={candQ.isFetchingNextPage}
          onLoadMore={() => candQ.fetchNextPage()}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          assigningId={assigningId}
          pending={pending}
          onAssign={(c) => assign(c)}
          onConfirmGap={() => {
            const c = candidates.find((x) => x.post_id === pending?.postId)
            if (c) assign(c, true)
          }}
          onCancelGap={() => setPending(null)}
          className={cn(columnHeight, tab !== 'posts' && 'hidden lg:flex')}
        />
        <ScheduleColumn
          accountName={account?.name ?? null}
          dates={dates}
          selectedDate={date}
          onSelectDate={(d) => set({ date: d }, { replace: true })}
          items={accountItems}
          flashId={flashId}
          busyIds={busyIds}
          onRemove={remove}
          onCycleVariant={cycleVariant}
          className={cn(columnHeight, tab !== 'schedule' && 'hidden lg:flex')}
        />
      </div>

      <p className="hidden items-center gap-3 text-[11px] text-muted-foreground lg:flex">
        <Keyboard className="h-3.5 w-3.5" aria-hidden />
        <Kbd>J</Kbd>/<Kbd>K</Kbd> chọn bài <Kbd>Enter</Kbd> gán <Kbd>←</Kbd>/<Kbd>→</Kbd> đổi ngày
        <Kbd>Alt</Kbd>+<Kbd>↑</Kbd>/<Kbd>↓</Kbd> đổi nick <Kbd>/</Kbd> tìm bài
      </p>
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border bg-muted px-1 font-sans text-[10px] text-foreground">{children}</kbd>
}

function BackLink() {
  return (
    <Link to="/distribution" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      <ArrowLeft className="h-4 w-4" /> Về Phân phối bài
    </Link>
  )
}
