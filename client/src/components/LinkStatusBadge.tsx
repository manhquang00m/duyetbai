import { CheckCircle2, XCircle, AlertTriangle, PackageX } from 'lucide-react'
import { SHOPEE_LINK_STATUS_LABEL, type ShopeeLinkStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATUS_CLASS: Record<ShopeeLinkStatus, string> = {
  available: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  dead: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  out_of_stock: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  unknown: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}

/** Nhan trang thai cua 1 link Shopee. status = null nghia la chua kiem tra bao gio. */
export function LinkStatusBadge({
  status,
  message,
}: {
  status: ShopeeLinkStatus | null
  message?: string | null
}) {
  if (!status)
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Chưa kiểm tra
      </span>
    )
  return (
    <span
      className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[status])}
      title={message ?? undefined}
    >
      {SHOPEE_LINK_STATUS_LABEL[status]}
    </span>
  )
}

/** Icon gon cho danh sach tien trinh kiem tra. */
export function ShopeeItemIcon({ status }: { status?: ShopeeLinkStatus }) {
  if (status === 'available') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
  if (status === 'dead') return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
  if (status === 'out_of_stock') return <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
}
