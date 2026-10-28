import { X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui'

// Présentation pas à pas : une bulle à la fois, qui met en lumière l'élément décrit.
// Les éléments ciblés portent un attribut data-tour="…".
export type TourStep = { target?: string; title: string; body: ReactNode }

const PAD = 8
const GAP = 14

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)]
  return all.find((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden') ?? null
}

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (completed: boolean) => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [size, setSize] = useState({ w: 340, h: 200 })
  const card = useRef<HTMLDivElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const step = steps[i]
  const last = i === steps.length - 1

  const measure = useCallback(() => {
    const el = findTarget(step.target)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step.target])

  // Amène l'élément à l'écran puis mesure sa position
  useEffect(() => {
    const el = findTarget(step.target)
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    measure()
    const t = setTimeout(measure, 350)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    nextBtn.current?.focus()
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [i, measure, step.target])

  useLayoutEffect(() => {
    if (card.current) setSize({ w: card.current.offsetWidth, h: card.current.offsetHeight })
  }, [i, rect])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(false)
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, steps.length])

  const vw = window.innerWidth
  const vh = window.innerHeight
  let style: React.CSSProperties
  if (rect) {
    const below = rect.bottom + PAD + GAP + size.h < vh - 8
    const above = rect.top - PAD - GAP - size.h > 8
    const top = below || !above ? Math.min(rect.bottom + PAD + GAP, vh - size.h - 8) : rect.top - PAD - GAP - size.h
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - size.w / 2, vw - size.w - 12))
    style = { top: Math.max(8, top), left }
  } else {
    style = { top: Math.max(12, vh / 2 - size.h / 2), left: Math.max(12, vw / 2 - size.w / 2) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Voile : bloque les clics pendant la présentation */}
      <div className="absolute inset-0" style={rect ? undefined : { background: 'rgb(0 0 0 / 0.55)' }} />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55), 0 0 0 3px var(--accent)',
          }}
        />
      )}
      <div
        ref={card}
        key={i}
        className="anim-pop absolute w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border border-border bg-surface p-5 text-text shadow-2xl"
        style={style}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-accent-ink">
            {i + 1} / {steps.length}
          </span>
          <button type="button" aria-label="Fermer la présentation" onClick={() => onClose(false)} className="rounded-lg p-1 text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="tour-title" className="text-lg font-semibold">
          {step.title}
        </h2>
        <div className="mt-1 text-sm leading-relaxed text-muted">{step.body}</div>
        <div className="mt-4 flex items-center gap-2">
          {i === 0 ? (
            <button type="button" onClick={() => onClose(false)} className="text-sm text-muted hover:underline">
              Passer
            </button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}>
              Précédent
            </Button>
          )}
          <span className="flex-1" />
          <Button ref={nextBtn} size="sm" onClick={() => (last ? onClose(true) : setI(i + 1))}>
            {last ? 'C’est compris' : 'Suivant'}
          </Button>
        </div>
        <div className="mt-3 flex justify-center gap-1" aria-hidden>
          {steps.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-accent' : 'w-1.5 bg-border'}`} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
