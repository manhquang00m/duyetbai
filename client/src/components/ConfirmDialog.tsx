import { useEffect, useState } from 'react'
import { setConfirmPresenter, type ConfirmRequest } from '@/lib/confirm'
import { Button } from '@/components/ui/button'

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    setConfirmPresenter((r) => setReq(r))
    return () => setConfirmPresenter(null)
  }, [])

  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        close(false)
      }
    }
    // capture: chan Escape truoc khi dialog ben duoi nhan duoc
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req])

  const close = (ok: boolean) => {
    req?.resolve(ok)
    setReq(null)
  }

  if (!req) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={() => close(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-sm rounded-t-2xl border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl animate-in fade-in zoom-in-95 duration-150 sm:rounded-2xl"
      >
        <h2 id="confirm-title" className="text-base font-semibold">
          {req.title}
        </h2>
        {req.description && <div className="mt-1.5 text-sm text-muted-foreground">{req.description}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            {req.cancelLabel ?? 'Hủy'}
          </Button>
          <Button autoFocus variant={req.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
            {req.confirmLabel ?? 'Đồng ý'}
          </Button>
        </div>
      </div>
    </div>
  )
}
