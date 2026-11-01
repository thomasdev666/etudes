import { Flag, ListChecks } from 'lucide-react'
import { cx } from './ui'

// Au début d'un QCM : correction après chaque question, ou tout à la fin.
// Chacun choisit selon sa façon de travailler ; le dernier choix est proposé par défaut.
export type RevealMode = 'each' | 'end'

const KEY = 'regulya:quiz-reveal'

export function lastRevealMode(): RevealMode | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'each' || v === 'end' ? v : null
  } catch {
    return null
  }
}

function remember(mode: RevealMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // stockage indisponible (navigation privée) : le choix vaut pour cette session seulement
  }
}

const OPTIONS: { mode: RevealMode; icon: typeof Flag; title: string; text: string }[] = [
  {
    mode: 'each',
    icon: ListChecks,
    title: 'Correction à chaque question',
    text: 'Tu vois la bonne réponse et l’explication juste après avoir répondu. Idéal pour apprendre au fur et à mesure.',
  },
  {
    mode: 'end',
    icon: Flag,
    title: 'Correction à la fin',
    text: 'Tu réponds à tout d’abord, comme le jour de l’examen, puis tu découvres ton score et toutes les explications.',
  },
]

export function RevealChooser({ count, onPick, busy }: { count: number; onPick: (mode: RevealMode) => void; busy?: boolean }) {
  const last = lastRevealMode()
  return (
    <div className="anim-pop flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold leading-snug">Comment veux-tu être corrigé ?</h1>
        <p className="mt-1 text-muted">{`${count} question${count > 1 ? 's' : ''}. Choisis ta façon de travailler avant de commencer.`}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ mode, icon: Icon, title, text }) => (
          <button
            key={mode}
            type="button"
            disabled={busy}
            onClick={() => {
              remember(mode)
              onPick(mode)
            }}
            className={cx(
              'flex flex-col gap-2 rounded-2xl border-2 bg-surface p-4 text-left transition-colors duration-150 hover:border-accent disabled:opacity-60',
              last === mode ? 'border-accent' : 'border-border',
            )}
          >
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden>
                <Icon className="size-4" />
              </span>
              {title}
            </span>
            <span className="text-sm text-muted">{text}</span>
            {last === mode && <span className="text-xs font-medium text-accent-ink">Ton choix la dernière fois</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
