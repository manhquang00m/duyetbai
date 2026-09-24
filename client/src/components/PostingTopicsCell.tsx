import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Plus } from 'lucide-react'
import { bulkPostingTopics, ACCOUNT_TOPICS } from '@/lib/api'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  accountId: number
  topics: string[]
  onChanged: () => void
}

/**
 * Sua chu de NGAY TREN DONG, khong qua dialog rieng: bam chip -> luu ngay 1 chu de do (add/remove),
 * dong khac khong bi dong theo. Truoc day phai tick chon + mo dialog + chon + luu cho MOI to hop
 * khac nhau - voi 55 account moi cai can chu de rieng thi lap lai ca chuoi do hang chuc lan.
 * Dialog gan hang loat (AssignPostingTopicsDialog) van giu lai cho truong hop that su ap CUNG
 * 1 bo chu de cho nhieu account cung luc.
 */
export function PostingTopicsCell({ accountId, topics, onChanged }: Props) {
  const popover = usePopover()
  const [pending, setPending] = useState<string | null>(null)

  const toggle = async (topic: string) => {
    const has = topics.includes(topic)
    setPending(topic)
    try {
      await bulkPostingTopics([accountId], [topic], has ? 'remove' : 'add')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật chủ đề')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="relative inline-block">
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        className="flex max-w-[13rem] flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent"
      >
        {topics.length > 0 ? (
          topics.map((t) => (
            <span
              key={t}
              className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {t}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Plus className="h-3 w-3" /> Gán chủ đề
          </span>
        )}
      </button>
      <PopoverPanel popover={popover} className="w-56 p-1.5">
        <div className="flex flex-wrap gap-1">
          {ACCOUNT_TOPICS.map((t) => {
            const active = topics.includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                disabled={pending === t}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {pending === t ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  active && <Check className="h-3 w-3" />
                )}
                {t}
              </button>
            )
          })}
        </div>
      </PopoverPanel>
    </div>
  )
}
