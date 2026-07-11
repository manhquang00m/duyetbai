import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Loader2, VideoOff } from 'lucide-react'
import {
  beautifyVideos,
  batchStreamUrl,
  fetchPost,
  type BeautifyConfig,
  type BeautifyWatermark,
  type JobState,
} from '@/lib/api'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  postIds: string[]
  onClose: () => void
  onDone: () => void
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const FILTERS: { value: BeautifyConfig['filter']; label: string }[] = [
  { value: 'none', label: 'Không áp dụng' },
  { value: 'vivid', label: 'Rực rỡ' },
  { value: 'warm', label: 'Ấm' },
  { value: 'cool', label: 'Lạnh' },
  { value: 'bw', label: 'Đen trắng' },
  { value: 'vintage', label: 'Cổ điển' },
]

const CROPS: { value: BeautifyConfig['crop']; label: string }[] = [
  { value: 'none', label: 'Giữ nguyên' },
  { value: '1:1', label: 'Vuông 1:1' },
  { value: '9:16', label: 'Dọc 9:16' },
  { value: '4:5', label: 'Dọc 4:5' },
  { value: '16:9', label: 'Ngang 16:9' },
]

const POSITIONS: { value: BeautifyWatermark['position']; label: string }[] = [
  { value: 'top-left', label: 'Trên trái' },
  { value: 'top-right', label: 'Trên phải' },
  { value: 'bottom-left', label: 'Dưới trái' },
  { value: 'bottom-right', label: 'Dưới phải' },
  { value: 'center', label: 'Giữa' },
]

function defaultConfig(): BeautifyConfig {
  return {
    filter: 'none',
    brightness: 0,
    contrast: 1,
    saturation: 1,
    crop: 'none',
    rotate: 0,
    speed: 1,
    removeMetadata: false,
    watermark: undefined,
  }
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-primary"
      />
    </div>
  )
}

/** Ap xap xi bo loc mau bang CSS filter de xem truoc truc tiep (khong chinh xac 100% so voi ffmpeg). */
function buildPreviewFilter(config: BeautifyConfig): string {
  const parts = [
    `brightness(${(1 + config.brightness).toFixed(2)})`,
    `contrast(${config.contrast.toFixed(2)})`,
    `saturate(${config.saturation.toFixed(2)})`,
  ]
  switch (config.filter) {
    case 'vivid':
      parts.push('contrast(1.15)', 'saturate(1.4)')
      break
    case 'warm':
      parts.push('sepia(0.25)', 'saturate(1.1)', 'hue-rotate(-8deg)')
      break
    case 'cool':
      parts.push('hue-rotate(8deg)', 'saturate(1.05)')
      break
    case 'bw':
      parts.push('grayscale(1)')
      break
    case 'vintage':
      parts.push('sepia(0.35)', 'contrast(0.9)', 'brightness(1.02)')
      break
    default:
      break
  }
  return parts.join(' ')
}

const CROP_ASPECT: Record<BeautifyConfig['crop'], string | undefined> = {
  none: undefined,
  '1:1': '1 / 1',
  '9:16': '9 / 16',
  '4:5': '4 / 5',
  '16:9': '16 / 9',
}

const WATERMARK_POSITION_CLASS: Record<BeautifyWatermark['position'], string> = {
  'top-left': 'left-2 top-2',
  'top-right': 'right-2 top-2',
  'bottom-left': 'bottom-2 left-2',
  'bottom-right': 'bottom-2 right-2',
  center: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
}

function PreviewPanel({
  config,
  watermarkOn,
  watermarkText,
  watermarkImageUrl,
  previewSrc,
  loading,
}: {
  config: BeautifyConfig
  watermarkOn: boolean
  watermarkText: string
  watermarkImageUrl: string | null
  previewSrc: string | null | undefined
  loading: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = config.speed
  }, [config.speed, previewSrc])

  const wm = config.watermark
  const position = wm?.position ?? 'bottom-right'
  const opacity = wm?.opacity ?? 0.8

  return (
    <div className="shrink-0 sm:w-56">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        Xem trước (không có âm thanh)
      </div>
      <div
        className="relative mx-auto overflow-hidden rounded-lg bg-black"
        style={{
          aspectRatio: CROP_ASPECT[config.crop] ?? '9 / 16',
          maxHeight: '20rem',
        }}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Đang tải...
          </div>
        ) : previewSrc ? (
          <video
            ref={videoRef}
            key={previewSrc}
            src={previewSrc}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{
              filter: buildPreviewFilter(config),
              transform: config.rotate ? `rotate(${config.rotate}deg)` : undefined,
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <VideoOff className="h-6 w-6" />
            <span className="text-xs">Không có video để xem trước</span>
          </div>
        )}

        {watermarkOn && previewSrc && (watermarkImageUrl || watermarkText.trim()) && (
          <div
            className={cn('pointer-events-none absolute max-w-[70%]', WATERMARK_POSITION_CLASS[position])}
            style={{ opacity }}
          >
            {watermarkImageUrl ? (
              <img src={watermarkImageUrl} alt="" className="max-h-12 max-w-full object-contain" />
            ) : (
              <span
                className="whitespace-nowrap rounded bg-black/25 px-1.5 py-0.5 font-medium"
                style={{ fontSize: Math.min(wm?.fontSize ?? 28, 32) / 2, color: wm?.color ?? 'white' }}
              >
                {watermarkText}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        Xem trước mang tính minh hoạ (dựng bằng CSS), kết quả xuất ra sẽ do ffmpeg xử lý và có thể khác
        đôi chút.
      </p>
    </div>
  )
}

export function BeautifyDialog({ open, postIds, onClose, onDone }: Props) {
  const [config, setConfig] = useState<BeautifyConfig>(defaultConfig())
  const [watermarkOn, setWatermarkOn] = useState(false)
  const [watermarkText, setWatermarkText] = useState('')
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null)
  const [phase, setPhase] = useState<'form' | 'progress'>('form')
  const [submitting, setSubmitting] = useState(false)
  const [job, setJob] = useState<JobState | null>(null)
  const [finished, setFinished] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!open) return
    setConfig(defaultConfig())
    setWatermarkOn(false)
    setWatermarkText('')
    setWatermarkImage(null)
    setPhase('form')
    setSubmitting(false)
    setJob(null)
    setFinished(false)
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [open])

  const previewPostId = postIds[0]
  const { data: previewPost, isLoading: previewLoading } = useQuery({
    queryKey: ['post', previewPostId],
    queryFn: () => fetchPost(previewPostId ?? ''),
    enabled: open && !!previewPostId,
  })
  const previewSrc = useMemo(
    () => previewPost?.media.find((m) => m.type === 'video')?.url,
    [previewPost],
  )

  const [watermarkImageUrl, setWatermarkImageUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!watermarkImage) {
      setWatermarkImageUrl(null)
      return
    }
    const url = URL.createObjectURL(watermarkImage)
    setWatermarkImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [watermarkImage])

  const submit = async () => {
    setSubmitting(true)
    try {
      const finalConfig: BeautifyConfig = {
        ...config,
        watermark: watermarkOn
          ? {
              text: watermarkImage ? undefined : watermarkText.trim() || undefined,
              position: config.watermark?.position ?? 'bottom-right',
              opacity: config.watermark?.opacity ?? 0.8,
              fontSize: config.watermark?.fontSize ?? 28,
              color: config.watermark?.color ?? 'white',
            }
          : undefined,
      }
      const { jobId } = await beautifyVideos(postIds, finalConfig, watermarkImage)
      setPhase('progress')
      const es = new EventSource(batchStreamUrl(jobId))
      esRef.current = es
      es.onmessage = (e) => {
        const d = JSON.parse(e.data) as { type: string; job: JobState }
        setJob(d.job)
        if (d.type === 'end') {
          es.close()
          esRef.current = null
          setFinished(true)
          onDone()
        }
      }
      es.onerror = () => {
        es.close()
        esRef.current = null
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không bắt đầu được xử lý')
    } finally {
      setSubmitting(false)
    }
  }

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0

  return (
    <Dialog open={open} onClose={onClose} className={phase === 'form' ? 'max-w-3xl' : 'max-w-lg'}>
      {phase === 'form' ? (
        <>
          <h2 className="text-lg font-semibold">Làm đẹp video</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Áp dụng cho video của {postIds.length} bài đã chọn · tạo file mới, giữ nguyên bản gốc
          </p>

          <div className="mt-4 flex flex-col gap-5 sm:flex-row">
          <PreviewPanel
            config={config}
            watermarkOn={watermarkOn}
            watermarkText={watermarkText}
            watermarkImageUrl={watermarkImageUrl}
            previewSrc={previewSrc}
            loading={previewLoading}
          />
          <div className="min-w-0 flex-1 max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            {/* Bo loc mau */}
            <div>
              <div className="mb-1 text-sm font-medium">Bộ lọc màu sắc</div>
              <select
                className={selectClass}
                value={config.filter}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, filter: e.target.value as BeautifyConfig['filter'] }))
                }
              >
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <div className="mt-3 space-y-3">
                <SliderField
                  label="Độ sáng"
                  value={config.brightness}
                  min={-0.5}
                  max={0.5}
                  step={0.05}
                  display={config.brightness.toFixed(2)}
                  onChange={(v) => setConfig((c) => ({ ...c, brightness: v }))}
                />
                <SliderField
                  label="Tương phản"
                  value={config.contrast}
                  min={0.5}
                  max={2}
                  step={0.05}
                  display={config.contrast.toFixed(2)}
                  onChange={(v) => setConfig((c) => ({ ...c, contrast: v }))}
                />
                <SliderField
                  label="Độ bão hòa"
                  value={config.saturation}
                  min={0}
                  max={3}
                  step={0.1}
                  display={config.saturation.toFixed(1)}
                  onChange={(v) => setConfig((c) => ({ ...c, saturation: v }))}
                />
              </div>
            </div>

            {/* Crop + xoay */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-sm font-medium">Crop khung hình</div>
                <select
                  className={selectClass}
                  value={config.crop}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, crop: e.target.value as BeautifyConfig['crop'] }))
                  }
                >
                  {CROPS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">Nghiêng / xoay</div>
                <div className="flex gap-1">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, rotate: deg }))}
                      className={cn(
                        'flex-1 rounded-md border px-1 py-1.5 text-xs',
                        config.rotate === deg
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <SliderField
              label="Góc nghiêng tự do"
              value={config.rotate}
              min={-45}
              max={45}
              step={1}
              display={`${config.rotate}°`}
              onChange={(v) => setConfig((c) => ({ ...c, rotate: v }))}
            />

            {/* Toc do */}
            <SliderField
              label="Tốc độ video"
              value={config.speed}
              min={0.5}
              max={2}
              step={0.05}
              display={`${config.speed.toFixed(2)}x`}
              onChange={(v) => setConfig((c) => ({ ...c, speed: v }))}
            />

            {/* Xoa metadata */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Xóa metadata</div>
                <div className="text-xs text-muted-foreground">
                  Bỏ thông tin EXIF/GPS/thiết bị quay khỏi file video xuất ra
                </div>
              </div>
              <Switch
                checked={config.removeMetadata}
                onCheckedChange={(v) => setConfig((c) => ({ ...c, removeMetadata: v }))}
              />
            </div>

            {/* Watermark */}
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Watermark</div>
                <Switch checked={watermarkOn} onCheckedChange={setWatermarkOn} />
              </div>
              {watermarkOn && (
                <div className="mt-2 space-y-2 rounded-lg border p-3">
                  <Input
                    placeholder="Nội dung watermark (vd: @tenkenh)"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    disabled={!!watermarkImage}
                  />
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Hoặc dùng ảnh logo (ưu tiên hơn chữ)
                    </label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => setWatermarkImage(e.target.files?.[0] ?? null)}
                      className="mt-1 block w-full text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Vị trí</div>
                      <select
                        className={selectClass}
                        value={config.watermark?.position ?? 'bottom-right'}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            watermark: {
                              text: c.watermark?.text,
                              position: e.target.value as BeautifyWatermark['position'],
                              opacity: c.watermark?.opacity ?? 0.8,
                              fontSize: c.watermark?.fontSize ?? 28,
                              color: c.watermark?.color ?? 'white',
                            },
                          }))
                        }
                      >
                        {POSITIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SliderField
                      label="Độ mờ"
                      value={config.watermark?.opacity ?? 0.8}
                      min={0.1}
                      max={1}
                      step={0.1}
                      display={(config.watermark?.opacity ?? 0.8).toFixed(1)}
                      onChange={(v) =>
                        setConfig((c) => ({
                          ...c,
                          watermark: {
                            text: c.watermark?.text,
                            position: c.watermark?.position ?? 'bottom-right',
                            opacity: v,
                            fontSize: c.watermark?.fontSize ?? 28,
                            color: c.watermark?.color ?? 'white',
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Bắt đầu xử lý
            </Button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Đang làm đẹp video</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {postIds.length} bài · xử lý bằng ffmpeg trên server
          </p>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">
                {finished ? 'Hoàn tất' : 'Đang chạy'} {job?.done ?? 0}/{job?.total ?? 0}
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <ul className="mt-4 max-h-64 space-y-1.5 overflow-auto text-sm">
            {(job?.items ?? []).map((it, i) => (
              <li key={i} className="rounded-md border p-2">
                <div className="flex items-center gap-2">
                  {it.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    @{it.username || it.url} — {it.file}
                  </span>
                </div>
                {!it.ok && it.error && (
                  <div className="mt-1 pl-6 text-xs text-destructive">{it.error}</div>
                )}
              </li>
            ))}
            {!job && (
              <li className="flex items-center gap-2 p-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang khởi động...
              </li>
            )}
          </ul>

          <div className="mt-4 flex justify-end">
            <Button variant={finished ? 'default' : 'outline'} onClick={onClose}>
              {finished ? 'Đóng' : 'Chạy nền / Đóng'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}
