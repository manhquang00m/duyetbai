import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Keo file vao bat ky dau tren trang -> lop phu "Tha file de …"; tha xong goi onFiles. Nut chon file
 * cu van giu nguyen (day chi la them 1 cach dua file vao). Tat khi co dialog dang mo, hoac khi
 * `disabled`. `accept` la danh sach duoi file, vd ['.xlsx', '.xls'].
 */
export function FileDropOverlay({
  accept,
  multiple = false,
  maxSizeMb = 20,
  label,
  onFiles,
  disabled,
}: {
  accept: string[]
  multiple?: boolean
  maxSizeMb?: number
  label: string
  onFiles: (files: File[]) => void
  disabled?: boolean
}) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const cb = useRef(onFiles)
  cb.current = onFiles

  useEffect(() => {
    if (disabled) return
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const blocked = () => !!document.querySelector('[role="dialog"]')

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e) || blocked()) return
      depth.current++
      setOver(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setOver(false)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e) && !blocked()) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || blocked()) return
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const all = Array.from(e.dataTransfer?.files ?? [])
      const ok = all.filter((f) => accept.some((ext) => f.name.toLowerCase().endsWith(ext)))
      if (ok.length < all.length) toast.warning(`Chỉ nhận file ${accept.join(', ')}`)
      const sized = ok.filter((f) => f.size <= maxSizeMb * 1024 * 1024)
      if (sized.length < ok.length) toast.warning(`File lớn hơn ${maxSizeMb} MB bị bỏ qua`)
      const files = multiple ? sized : sized.slice(0, 1)
      if (files.length) cb.current(files)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [accept, multiple, maxSizeMb, disabled])

  if (!over) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-6 animate-in fade-in duration-100">
      <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-chart-1 bg-card px-6 py-10 text-center">
        <Upload className="h-6 w-6 text-chart-1" aria-hidden />
        <div className="text-base font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">
          {accept.join(', ')} · tối đa {maxSizeMb} MB{multiple ? ' · nhiều file' : ''}
        </div>
      </div>
    </div>
  )
}
