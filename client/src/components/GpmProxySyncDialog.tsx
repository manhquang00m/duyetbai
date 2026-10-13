import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'
import { syncGpmProxies, type ProxySyncResult } from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
}

function StatusBadge({ status }: { status?: 'live' | 'die' }) {
  if (!status) return <span className="text-xs text-muted-foreground">chưa kiểm tra</span>
  if (status === 'live')
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        Live
      </span>
    )
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
      Die
    </span>
  )
}

/**
 * Doc proxy hien tai tu GPM Login (theo accounts.platform: Global cong 9495, Stable cong 19995 -
 * xem server/src/config.ts) va cap nhat vao account co ten TRUNG voi profile GPM. Proxy nao vua
 * doi se duoc kiem tra Live/Die ngay, khong can buoc rieng.
 */
export function GpmProxySyncDialog({ open, onClose }: Props) {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ProxySyncResult | null>(null)

  useEffect(() => {
    if (!open) {
      setResult(null)
      return
    }
    setRunning(true)
    setResult(null)
    syncGpmProxies()
      .then((r) => {
        setResult(r)
        qc.invalidateQueries({ queryKey: ['accounts'] })
        qc.invalidateQueries({ queryKey: ['proxies'] })
        if (r.changed.length > 0) toast.success(`Đã đồng bộ ${r.changed.length} proxy thay đổi`)
        else if (r.errors.length === 0) toast.success('Không có proxy nào thay đổi')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Lỗi đồng bộ proxy GPM')
      })
      .finally(() => setRunning(false))
  }, [open, qc])

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="pr-8 text-lg font-semibold">Đồng bộ proxy từ GPM Login</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        So khớp tên account với tên profile trong GPM Login (Global cổng 9495, Stable cổng 19995
        theo cột Platform của account) — proxy đổi thì cập nhật và kiểm tra Live/Die ngay.
      </p>

      {running && (
        <div className="mt-6 flex items-center justify-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang đọc dữ liệu từ GPM Login...
        </div>
      )}

      {!running && result && (
        <div className="mt-4 space-y-3">
          {result.errors.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              {result.errors.map((e, i) => (
                <div key={i} className="flex gap-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>{e.platform}</strong>: {e.error}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:gap-4">
            <span>
              Đã đổi: <strong className="tabular-nums text-foreground">{result.changed.length}</strong>
            </span>
            <span>
              Không đổi: <strong className="tabular-nums text-foreground">{result.uncheckedCount}</strong>
            </span>
            <span>
              Không khớp tên: <strong className="tabular-nums text-foreground">{result.unmatchedAccounts.length}</strong>
            </span>
            <span>
              Chưa gán Platform: <strong className="tabular-nums text-foreground">{result.skippedNoPlatform.length}</strong>
            </span>
          </div>

          {result.changed.length > 0 && (
            <div className="table-scroll max-h-[45dvh] overflow-y-auto rounded-lg border">
              <table className="w-full min-w-[30rem] text-xs">
                <thead className="sticky top-0 bg-muted/40 uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Account</th>
                    <th className="p-2 text-left font-medium">Proxy cũ</th>
                    <th className="p-2 text-left font-medium">Proxy mới</th>
                    <th className="p-2 text-left font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {result.changed.map((c) => (
                    <tr key={c.account} className="border-b last:border-0">
                      <td className="p-2 font-medium">{c.account}</td>
                      <td className="max-w-[10rem] truncate p-2 font-mono text-muted-foreground">
                        {c.oldProxy ?? '—'}
                      </td>
                      <td className="max-w-[10rem] truncate p-2 font-mono">{c.newProxy}</td>
                      <td className="p-2">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.unmatchedAccounts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Không tìm thấy profile GPM trùng tên:{' '}
              <span className="break-words font-mono">{result.unmatchedAccounts.join(', ')}</span>
            </p>
          )}
          {result.skippedNoPlatform.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Chưa gán Platform (Stable/Global) nên bỏ qua:{' '}
              <span className="break-words font-mono">{result.skippedNoPlatform.join(', ')}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose} disabled={running}>
          Đóng
        </Button>
      </div>
    </Dialog>
  )
}
