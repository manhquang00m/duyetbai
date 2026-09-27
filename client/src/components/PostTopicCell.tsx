import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Plus } from 'lucide-react'
import { ACCOUNT_TOPICS } from '@/lib/api'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  topic: string | null
  onChange: (topic: string | null) => Promise<void>
}

/**
 * Chip hien chu de cua DUNG 1 bai + popover chon 1 chu de (thay the, khac TopicChipsCell la
 * multi-select cho tai khoan) - bam la luu ngay, khong qua dialog rieng.
 */
export function PostTopicCell({ topic, onChange }: Props) {
  const popover = usePopover()
  const [saving, setSaving] = useState(false)

  const handlePick = async (next: string | null) => {
    if (next === topic) {
      popover.setOpen(false)
      return
    }
    setSaving(true)
    try {
      await onChange(next)
      popover.setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật chủ đề')
    } finally {
      setSaving(false)
    }
  }

  return (
    // stopPropagation: tranh bam vao chip lai mo luon Sheet chi tiet bai (hang <tr> co onClick rieng)
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        disabled={saving}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : topic ? (
          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {topic}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Plus className="h-3 w-3" /> Gán
          </span>
        )}
      </button>
      <PopoverPanel popover={popover} className="w-48 p-1.5">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => handlePick(null)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors',
              !topic
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {!topic && <Check className="h-3 w-3" />}— Bỏ gán —
          </button>
          {ACCOUNT_TOPICS.map((t) => {
            const active = t === topic
            return (
              <button
                key={t}
                type="button"
                onClick={() => handlePick(t)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {active && <Check className="h-3 w-3" />}
                {t}
              </button>
            )
          })}
        </div>
      </PopoverPanel>
    </div>
  )
}
