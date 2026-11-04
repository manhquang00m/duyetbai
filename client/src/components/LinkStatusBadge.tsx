import { CheckCircle2, XCircle, AlertTriangle, PackageX } from 'lucide-react'
import { SHOPEE_LINK_STATUS_LABEL, type ShopeeLinkStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATUS_CLASS: Record<ShopeeLinkStatus, string> = {
  available: 'bg-pill-positive text-pill-positive-ink',
  dead: 'bg-pill-negative text-pill-negative-ink',
  out_of_stock: 'bg-pill-warning text-pill-warning-ink',
  unknown: 'bg-pill-warning text-pill-warning-ink',
}

/** Nhan trang thai cua 1 link Shopee. status = null nghia la chua kiem tra bao gio. */
export function LinkStatusBadge({
  status,
  message,
}: {
  status: ShopeeLinkStatus | null
  message?: string | null
}) {
  // Chua kiem tra / con hang = binh thuong -> chu xam; pill mau chi cho link can xu ly.
  if (!status || status === 'available')
    return (
      <span className="inline-flex shrink-0 whitespace-nowrap text-xs text-muted-foreground" title={message ?? undefined}>
        {status ? SHOPEE_LINK_STATUS_LABEL[status] : 'Chưa kiểm tra'}
      </span>
    )
  return (
    <span
      className={cn('inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[status])}
      title={message ?? undefined}
    >
      {SHOPEE_LINK_STATUS_LABEL[status]}
    </span>
  )
}

/** Icon gon cho danh sach tien trinh kiem tra. */
export function ShopeeItemIcon({ status }: { status?: ShopeeLinkStatus }) {
  if (status === 'available') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
  if (status === 'dead') return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
  if (status === 'out_of_stock') return <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
}
