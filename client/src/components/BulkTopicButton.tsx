import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Tag } from 'lucide-react'
import { ACCOUNT_TOPICS, setPostsTopic } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { usePopover, PopoverPanel } from '@/components/ui/popover'

interface Props {
  postIds: string[]
  onDone: () => void
}

/** Nut tren thanh chon nhieu bai: chon 1 chu de de gan cho tat ca bai dang chon (ghi de chu de cu). */
export function BulkTopicButton({ postIds, onDone }: Props) {
  const popover = usePopover()
  const [saving, setSaving] = useState(false)

  const apply = async (topic: string | null) => {
    setSaving(true)
    try {
      const { updated } = await setPostsTopic(postIds, topic)
      toast.success(topic ? `Đã gán chủ đề "${topic}" cho ${updated} bài` : `Đã bỏ chủ đề của ${updated} bài`)
      popover.setOpen(false)
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi gán chủ đề')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => popover.setOpen(!popover.open)}
        disabled={saving}
        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
        Gán chủ đề
      </button>
      <PopoverPanel popover={popover} className="w-56 p-2">
        <div className="mb-1.5 px-1 text-[11px] text-muted-foreground">
          Gán cho {postIds.length} bài (ghi đè chủ đề cũ)
        </div>
        <div className="flex flex-wrap gap-1">
          {ACCOUNT_TOPICS.map((t) => (
            <Button key={t} size="sm" variant="outline" className="rounded-full" onClick={() => apply(t)}>
              {t}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={() => apply(null)}>
            Bỏ gán
          </Button>
        </div>
      </PopoverPanel>
    </>
  )
}
