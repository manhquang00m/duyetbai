import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import type { PostingAccount } from '@/lib/api'
import { AccountAvatar } from '@/components/AccountAvatar'
import { SearchInput } from '@/components/filters/SearchInput'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

/** Cot trai: chon nick. Nick chua co chu de van hien (mo) de nguoi dung biet vi sao khong chon duoc. */
export function AccountColumn({
  accounts,
  selectedId,
  countByAccount,
  onSelect,
  className,
}: {
  accounts: PostingAccount[]
  selectedId: number
  countByAccount: Map<string, number>
  onSelect: (id: number) => void
  className?: string
}) {
  const [search, setSearch] = useState('')
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : accounts
  }, [accounts, search])

  return (
    <section className={cn('flex min-h-0 flex-col rounded-xl border bg-card', className)} aria-label="Chọn nick">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Nick</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{accounts.length}</span>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm nick…"
          shortcut={false}
          className="sm:max-w-none"
          aria-label="Tìm nick"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {shown.length === 0 ? (
          <EmptyState icon={Users} title="Không có nick nào khớp" />
        ) : (
          <ul className="space-y-0.5">
            {shown.map((a) => {
              const noTopic = a.topics.length === 0
              const selected = a.id === selectedId
              const count = countByAccount.get(a.name) ?? 0
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={noTopic}
                    onClick={() => onSelect(a.id)}
                    aria-current={selected ? 'true' : undefined}
                    data-account-id={a.id}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      selected ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-accent',
                      noTopic && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                    )}
                  >
                    <AccountAvatar name={a.name} size="md" className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn('min-w-0 flex-1 truncate text-sm', selected && 'font-medium')}>
                          {a.name}
                        </span>
                        {count > 0 && (
                          <span
                            className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-medium tabular-nums leading-5 text-primary-foreground"
                            title={`${count} bài đã gán trong kế hoạch này`}
                          >
                            {count}
                          </span>
                        )}
                      </span>
                      {noTopic ? (
                        <span className="block text-[11px] text-muted-foreground">Chưa có chủ đề</span>
                      ) : (
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {a.topics.slice(0, 2).map((t) => (
                            <span
                              key={t}
                              className="max-w-[9rem] truncate rounded bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                          {a.topics.length > 2 && (
                            <span
                              className="rounded bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground"
                              title={a.topics.slice(2).join(', ')}
                            >
                              +{a.topics.length - 2}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {accounts.some((a) => a.topics.length === 0) && (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Nick mờ chưa có chủ đề —{' '}
          <Link to="/distribution" className="underline underline-offset-2 hover:text-foreground">
            gán chủ đề
          </Link>
        </p>
      )}
    </section>
  )
}
