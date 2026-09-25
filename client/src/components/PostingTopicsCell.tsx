import { bulkPostingTopics } from '@/lib/api'
import { TopicChipsCell } from '@/components/TopicChipsCell'

interface Props {
  accountId: number
  topics: string[]
  onChanged: () => void
  compact?: number
}

/**
 * Sua chu de NGAY TREN DONG, khong qua dialog rieng: bam chip -> luu ngay 1 chu de do (add/remove),
 * dong khac khong bi dong theo. Truoc day phai tick chon + mo dialog + chon + luu cho MOI to hop
 * khac nhau - voi 55 account moi cai can chu de rieng thi lap lai ca chuoi do hang chuc lan.
 * Dialog gan hang loat (AssignPostingTopicsDialog) van giu lai cho truong hop that su ap CUNG
 * 1 bo chu de cho nhieu account cung luc.
 */
export function PostingTopicsCell({ accountId, topics, onChanged, compact }: Props) {
  return (
    <TopicChipsCell
      topics={topics}
      compact={compact}
      onToggle={async (topic, hasIt) => {
        await bulkPostingTopics([accountId], [topic], hasIt ? 'remove' : 'add')
        onChanged()
      }}
    />
  )
}
