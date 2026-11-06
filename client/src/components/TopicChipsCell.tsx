import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Plus } from 'lucide-react'
import { useTopics } from '@/lib/useTopics'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  topics: string[]
  onToggle: (topic: string, hasIt: boolean) => Promise<void>
  // Chi hien toi da `compact` chip tren 1 dong + "+N" (danh sach day du o tooltip) - tranh day
  // cao hang trong bang nhieu cot.
  compact?: number
}

/**
 * Chip hien thi + popover bam-de-bat/tat 1 chu de, luu ngay (khong qua dialog rieng) - noi goi
 * (PostingTopicsCell / AssignTopicDialog) tu quyet dinh goi API nao. Tach ra dung chung cho ca 2
 * loai chu de (tai khoan dang vs tac gia bai cao) vi UI giong het nhau.
 */
export function TopicChipsCell({ topics: saved, onToggle, compact }: Props) {
  const topicOptions = useTopics()
  const popover = usePopover()
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  // Optimistic: chip doi ngay khi bam, khong cho request + refetch. Du lieu moi tu cha ve -> bo
  // ban tam. Loi -> tra ve ban da luu + toast.
  const [optimistic, setOptimistic] = useState<string[] | null>(null)
  useEffect(() => setOptimistic(null), [saved])
  const topics = optimistic ?? saved

  const handleToggle = async (topic: string) => {
    const has = topics.includes(topic)
    setOptimistic(has ? topics.filter((t) => t !== topic) : [...topics, topic])
    setPending((p) => new Set(p).add(topic))
    try {
      await onToggle(topic, has)
    } catch (err) {
      setOptimistic(null)
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật chủ đề')
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(topic)
        return next
      })
    }
  }

  return (
    <div className="relative inline-block">
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        title={compact && topics.length > compact ? topics.join(', ') : undefined}
        className={cn(
          'flex min-h-8 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent sm:min-h-0',
          compact ? 'flex-nowrap whitespace-nowrap' : 'max-w-[min(13rem,70vw)] flex-wrap',
        )}
      >
        {topics.length > 0 ? (
          <>
            {(compact ? topics.slice(0, compact) : topics).map((t) => (
              <span
                key={t}
                className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-pill-neutral px-2 py-0.5 text-[11px] font-medium text-pill-neutral-ink"
              >
                {t}
              </span>
            ))}
            {compact && topics.length > compact && (
              <span className="inline-flex shrink-0 whitespace-nowrap px-1 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                +{topics.length - compact}
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            <Plus className="h-3 w-3" /> Gán chủ đề
          </span>
        )}
      </button>
      <PopoverPanel popover={popover} className="w-56 p-1.5">
        <div className="flex flex-wrap gap-1">
          {topicOptions.map((t) => {
            const active = topics.includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleToggle(t)}
                disabled={pending.has(t)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 sm:px-2 sm:py-1',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {pending.has(t) ? (
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
