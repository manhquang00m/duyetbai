import { useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { ArrowRight, Maximize2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { buttonVariants } from '@/components/ui/button'
import { GUIDES, findGuide, type Guide, type GuideStep } from '@/lib/guides'
import { cn } from '@/lib/utils'

/** Render **dam** va `code` trong text huong dan - chi tao element React, khong innerHTML. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i): ReactNode => {
        if (p.startsWith('**') && p.endsWith('**'))
          return (
            <strong key={i} className="font-medium text-foreground">
              {p.slice(2, -2)}
            </strong>
          )
        if (p.startsWith('`') && p.endsWith('`'))
          return (
            <code key={i} className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">
              {p.slice(1, -1)}
            </code>
          )
        return p
      })}
    </>
  )
}

interface ZoomImage {
  src: string
  caption: string
}

function StepItem({ step, index, onZoom }: { step: GuideStep; index: number; onZoom: (img: ZoomImage) => void }) {
  return (
    <li className="group/step relative flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {index}
        </span>
        <span className="mt-2 w-px flex-1 bg-border group-last/step:hidden" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5 pb-6">
        <h3 className="pt-0.5 text-sm font-medium sm:text-[15px]">
          B{index}: {step.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <RichText text={step.body} />
        </p>
        {step.tips && step.tips.length > 0 && (
          <ul className="list-disc space-y-1 rounded-lg bg-muted p-3 pl-7 text-[13px] text-muted-foreground">
            {step.tips.map((t) => (
              <li key={t}>
                <RichText text={t} />
              </li>
            ))}
          </ul>
        )}
        {step.link && (
          <Link to={step.link.to} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            {step.link.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
        {step.image && (
          <button
            type="button"
            onClick={() => onZoom({ src: step.image!, caption: `B${index}: ${step.title}` })}
            className="group relative block w-full overflow-hidden rounded-lg border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Phóng to ảnh: ${step.title}`}
          >
            <img
              src={step.image}
              alt={step.title}
              loading="lazy"
              className="block h-auto w-full transition-opacity group-hover:opacity-90"
            />
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Maximize2 className="h-3 w-3" aria-hidden />
              Phóng to
            </span>
          </button>
        )}
      </div>
    </li>
  )
}

function LessonNav({ active }: { active: Guide }) {
  return (
    <>
      {/* Phone/tablet: hang chip cuon ngang */}
      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden" aria-label="Danh sách bài hướng dẫn">
        {GUIDES.map((g, i) => (
          <NavLink
            key={g.id}
            to={`/guide/${g.id}`}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              g.id === active.id ? 'border-primary bg-accent text-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <g.icon className="h-3.5 w-3.5" aria-hidden />
            Bài {i + 1}: {g.title}
          </NavLink>
        ))}
      </nav>

      {/* Desktop: cot trai sticky */}
      <aside className="hidden lg:block">
        <Card className="sticky top-4 p-2">
          <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Bài học</p>
          <nav className="space-y-0.5" aria-label="Danh sách bài hướng dẫn">
            {GUIDES.map((g, i) => (
              <NavLink
                key={g.id}
                to={`/guide/${g.id}`}
                className={cn(
                  'flex items-start gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                  g.id === active.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <g.icon className={cn('mt-0.5 h-4 w-4 shrink-0', g.id === active.id && 'text-chart-1-ink')} aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">
                    Bài {i + 1}: {g.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{g.summary}</span>
                </span>
              </NavLink>
            ))}
          </nav>
        </Card>
      </aside>
    </>
  )
}

export function GuidePage() {
  const { lessonId } = useParams()
  const [zoom, setZoom] = useState<ZoomImage | null>(null)
  const guide = findGuide(lessonId)

  // /guide hoac id sai -> ve bai dau
  if (!guide) return <Navigate to={`/guide/${GUIDES[0].id}`} replace />

  const lessonNo = GUIDES.indexOf(guide) + 1

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Hướng dẫn" description="Các bước thao tác từng việc trong quy trình. Bấm vào ảnh để phóng to." />

      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <LessonNav active={guide} />

        <div className="min-w-0 space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-chart-1-ink">
              <guide.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">
                Bài {lessonNo}: {guide.title}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{guide.summary}</p>
            </div>
          </div>

          {guide.sections.map((section, si) => (
            <Card key={section.title} className="p-4 sm:p-5">
              <div className="mb-4 border-b pb-3">
                <p className="text-xs font-medium uppercase tracking-wide text-chart-1-ink">Phần {si + 1}</p>
                <h2 className="text-base font-medium">{section.title}</h2>
                {section.description && <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>}
              </div>
              <ol>
                {section.steps.map((step, i) => (
                  <StepItem key={step.title} step={step} index={i + 1} onZoom={setZoom} />
                ))}
              </ol>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!zoom} onClose={() => setZoom(null)} className="max-w-6xl sm:p-4">
        {zoom && (
          <figure className="space-y-2">
            <figcaption className="pr-10 text-sm font-medium">{zoom.caption}</figcaption>
            <img src={zoom.src} alt={zoom.caption} className="h-auto w-full rounded-md border" />
          </figure>
        )}
      </Dialog>
    </div>
  )
}
