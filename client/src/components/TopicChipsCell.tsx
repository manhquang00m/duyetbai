import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Plus } from 'lucide-react'
import { ACCOUNT_TOPICS } from '@/lib/api'
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
export function TopicChipsCell({ topics, onToggle, compact }: Props) {
  const popover = usePopover()
  const [pending, setPending] = useState<string | null>(null)

  const handleToggle = async (topic: string) => {
    const has = topics.includes(topic)
    setPending(topic)
    try {
      await onToggle(topic, has)
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
                className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {t}
              </span>
            ))}
            {compact && topics.length > compact && (
              <span className="inline-flex rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium">
                +{topics.length - compact}
              </span>
            )}
          </>
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
                onClick={() => handleToggle(t)}
                disabled={pending === t}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 sm:px-2 sm:py-1',
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
