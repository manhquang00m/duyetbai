import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'
import { usePopover, PopoverPanel } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Health {
  status: string
  startedAt: string
  uptimeSec: number
}

type State =
  | { kind: 'checking' }
  | { kind: 'ok'; health: Health; ms: number; at: Date }
  | { kind: 'down'; message: string; at: Date }

const POLL_MS = 20_000
// Thong bao trang thai server hien giua tren, tach khoi toast nghiep vu (goc phai tren).
const TOAST = { position: 'top-center' } as const

function uptimeText(sec: number): string {
  if (sec < 60) return `${sec} giây`
  if (sec < 3600) return `${Math.floor(sec / 60)} phút`
  const h = Math.floor(sec / 3600)
  return `${h} giờ ${Math.floor((sec % 3600) / 60)} phút`
}

/**
 * Cham tron tren header: xanh = server tra loi, do = khong ket noi duoc (se gap 502 khi goi API).
 * Tu kiem tra moi 20s, bam de kiem tra ngay + xem chi tiet. Bao khi server vua khoi dong lai.
 */
export function ServerHealthButton() {
  const popover = usePopover({ placement: 'bottom-end' })
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [busy, setBusy] = useState(false)
  const lastStart = useRef<string | null>(null)
  const wasDown = useRef(false)

  const check = async (manual = false) => {
    setBusy(true)
    const t0 = performance.now()
    try {
      // axios rieng (khong qua interceptor cua api.ts), timeout ngan de phat hien server treo.
      const { data } = await axios.get<Health>('/api/health', { timeout: 5000 })
      const ms = Math.round(performance.now() - t0)
      if (lastStart.current && lastStart.current !== data.startedAt) {
        toast.info('Server vừa khởi động lại', TOAST)
      } else if (wasDown.current) {
        toast.success('Server đã hoạt động lại', TOAST)
      }
      lastStart.current = data.startedAt
      wasDown.current = false
      setState({ kind: 'ok', health: data, ms, at: new Date() })
      if (manual) toast.success(`Server OK (${ms}ms)`, TOAST)
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      const message =
        status === 502 || status === 504 || !status
          ? 'Không kết nối được server (cổng 3000). Server có thể đang tắt, crash hoặc đang khởi động lại.'
          : `Server trả lỗi ${status}`
      if (!wasDown.current || manual) toast.error(message, TOAST)
      wasDown.current = true
      setState({ kind: 'down', message, at: new Date() })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void check()
    const id = setInterval(() => void check(), POLL_MS)
    return () => clearInterval(id)
    // check doc ref, khong phu thuoc state -> chi can chay 1 lan khi mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dot =
    state.kind === 'ok' ? 'bg-green-500' : state.kind === 'down' ? 'bg-red-500' : 'bg-muted-foreground/50'
  const label = state.kind === 'ok' ? 'Server OK' : state.kind === 'down' ? 'Server lỗi' : 'Đang kiểm tra'

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={() => {
          popover.setOpen(!popover.open)
          void check(true)
        }}
        aria-label="Kiểm tra server"
        className="inline-flex h-10 items-center gap-2 rounded-md px-2.5 sm:h-9 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <span className="relative flex h-2.5 w-2.5">
          {state.kind === 'down' && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
          )}
          <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', dot)} />
        </span>
        <span className="hidden sm:inline">{label}</span>
      </button>
      <PopoverPanel popover={popover} className="w-72 max-w-[calc(100vw-1rem)] p-3 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">Trạng thái server</span>
          <button
            type="button"
            onClick={() => void check(true)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Kiểm tra lại
          </button>
        </div>
        {state.kind === 'ok' && (
          <div className="space-y-1 text-muted-foreground">
            <div>
              Phản hồi: <span className="text-foreground">{state.ms}ms</span>
            </div>
            <div>
              Đã chạy: <span className="text-foreground">{uptimeText(state.health.uptimeSec)}</span>
            </div>
            <div>
              Khởi động lúc:{' '}
              <span className="text-foreground">{new Date(state.health.startedAt).toLocaleString('vi-VN')}</span>
            </div>
          </div>
        )}
        {state.kind === 'down' && (
          <div className="space-y-1.5">
            <p className="text-destructive">{state.message}</p>
            <p className="text-muted-foreground">
              Xem cửa sổ terminal chạy server hoặc file <code>logs/server-&lt;ngày&gt;.log</code>. Nếu server đã tắt,
              chạy lại <code>npm start</code> ở thư mục gốc.
            </p>
          </div>
        )}
        {state.kind !== 'checking' && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            Kiểm tra lúc {state.at.toLocaleTimeString('vi-VN')} · tự kiểm tra mỗi 20 giây
          </div>
        )}
      </PopoverPanel>
    </>
  )
}
