import type { ReactNode } from 'react'
import { toast } from 'sonner'

export interface ConfirmRequest {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  resolve: (ok: boolean) => void
}

let push: ((r: ConfirmRequest) => void) | null = null

/** ConfirmHost dang ky noi hien hop thoai (null khi chua mount). */
export function setConfirmPresenter(fn: ((r: ConfirmRequest) => void) | null) {
  push = fn
}

/**
 * Thay window.confirm(): `if (!(await confirmDialog({ title: 'Xoa 3 proxy?' }))) return`.
 * Can <ConfirmHost /> mount 1 lan o goc app. Noi dung nen neu ro doi tuong + so luong.
 */
export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) {
      resolve(window.confirm(opts.title))
      return
    }
    push({ ...opts, resolve })
  })
}

/**
 * Xoa co "Hoan tac": an ngay tren UI (caller tu cap nhat cache), cho `delayMs` roi moi goi run().
 * Bam Hoan tac trong luc cho -> khong goi server, goi onUndo de hien lai. Dong tab khi dang cho ->
 * khong xoa (an toan). Chi dung cho xoa don le; xoa hang loat van hoi confirmDialog.
 */
export function undoable({
  message,
  run,
  onUndo,
  onError,
  delayMs = 5000,
}: {
  message: string
  run: () => Promise<unknown>
  onUndo?: () => void
  onError?: (e: unknown) => void
  delayMs?: number
}) {
  let cancelled = false
  const timer = setTimeout(async () => {
    if (cancelled) return
    try {
      await run()
    } catch (e) {
      onUndo?.()
      if (onError) onError(e)
      else toast.error('Xóa không thành công, đã khôi phục')
    }
  }, delayMs)
  toast(message, {
    duration: delayMs,
    action: {
      label: 'Hoàn tác',
      onClick: () => {
        cancelled = true
        clearTimeout(timer)
        onUndo?.()
      },
    },
  })
}
