import { useLayoutEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Be rong that cua phan tu (de SVG ve theo px that, chu truc khong bi co nho tren man hep). */
function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** So gon de in tren dau cot: 1.234 -> 1,2k; 1.234.567 -> 1,2tr. */
function compact(n: number): string {
  const fmt = (v: number) => (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v))).replace('.', ',')
  if (n >= 1_000_000) return `${fmt(n / 1_000_000)}tr`
  if (n >= 1_000) return `${fmt(n / 1_000)}k`
  return String(n)
}

export interface DailyPoint {
  date: string
  value: number
}

/**
 * Cot theo ngay, 1 chuoi mau cam Shopee (chart-1), so in san tren dau cot khi du cho, tooltip khi
 * re chuot. Khong khung - dat trong card nao cung duoc.
 */
export function BarsPlot({
  data,
  unit,
  label,
  height = 160,
}: {
  data: DailyPoint[]
  unit: string
  label: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [boxRef, W] = useElementWidth<HTMLDivElement>(560)
  const H = height
  const top = 18
  const bottom = 20
  const max = Math.max(1, ...data.map((d) => d.value))
  const slot = data.length > 0 ? W / data.length : W
  const barW = Math.max(2, Math.min(28, slot - 2))
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(W / 64)))
  const showValues = slot >= 22
  const plotH = H - top - bottom
  return (
    <div className="relative">
      <div ref={boxRef} className="min-w-0 overflow-hidden">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={label}>
          <line x1={0} x2={W} y1={top + plotH} y2={top + plotH} className="stroke-border" strokeWidth={1} />
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0
            const x = i * slot + (slot - barW) / 2
            const r = Math.min(4, barW / 2, h)
            const y = top + plotH - h
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* vung bat chuot rong hon cot */}
                <rect x={i * slot} y={top} width={slot} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                    className={cn('fill-chart-1', hover !== null && hover !== i && 'opacity-40')}
                  />
                )}
                {d.value > 0 && showValues && (
                  <text
                    x={i * slot + slot / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize={11}
                    className="fill-foreground tabular-nums"
                  >
                    {compact(d.value)}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
                    {shortDate(d.date)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs"
          style={{ left: `calc(${((hover + 0.5) / data.length) * 100}% )`, transform: 'translateX(-50%)' }}
        >
          <div className="text-muted-foreground">{shortDate(data[hover].date)}</div>
          <div className="font-medium tabular-nums">
            {data[hover].value.toLocaleString('vi-VN')} {unit}
          </div>
        </div>
      )}
    </div>
  )
}

/** Card: tieu de + tong ben phai + BarsPlot. */
export function DailyBars({
  title,
  data,
  unit,
  total: totalProp,
}: {
  title: string
  data: DailyPoint[]
  unit: string
  /** Tong lam tron 1 lan tu so goc (vd tien) - tranh lech voi KPI khi cong cac cot da lam tron. */
  total?: number
}) {
  const total = totalProp ?? data.reduce((s, d) => s + d.value, 0)
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          Tổng <b className="font-semibold text-foreground tabular-nums">{total.toLocaleString('vi-VN')}</b> {unit}
        </span>
      </div>
      <BarsPlot data={data} unit={unit} label={title} />
    </Card>
  )
}
