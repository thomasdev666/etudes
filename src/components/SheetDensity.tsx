import { AlignJustify, LayoutList } from 'lucide-react'
import { useState } from 'react'
import { cx, Modal } from './ui'

// Format d'une fiche de révision : compacte (1 à 2 pages) ou aérée (détaillée, illustrée).
// Le dernier choix est retenu sur l'appareil et proposé en premier.
export type Density = 'compact' | 'aere'
const KEY = 'regulya.sheet-density'

export function readDensity(): Density {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'aere'
  } catch {
    return 'aere'
  }
}

const OPTIONS: { value: Density; title: string; text: string; icon: React.ReactNode }[] = [
  { value: 'compact', title: 'Compacte', text: 'L’essentiel sur 1 à 2 pages : points courts, tableaux et schémas qui condensent.', icon: <AlignJustify className="size-5" /> },
  { value: 'aere', title: 'Aérée', text: 'Détaillée et illustrée : tout le cours, avec exemples, schémas et encadrés.', icon: <LayoutList className="size-5" /> },
]

export function useDensityChoice() {
  const [resolve, setResolve] = useState<((d: Density | null) => void) | null>(null)
  const last = readDensity()
  const ask = () => new Promise<Density | null>((r) => setResolve(() => r))
  const done = (d: Density | null) => {
    resolve?.(d)
    setResolve(null)
    if (d)
      try {
        localStorage.setItem(KEY, d)
      } catch {
        /* stockage indisponible : le choix ne sera pas retenu */
      }
  }
  const modal = (
    <Modal open={!!resolve} onClose={() => done(null)} title="Quel format de fiche ?">
      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => done(o.value)}
            className={cx(
              'flex items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors',
              o.value === last ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
            )}
          >
            <span className="mt-0.5 text-accent-ink">{o.icon}</span>
            <span className="min-w-0">
              <span className="block font-semibold">
                {o.title}
                {o.value === last && <span className="ml-2 text-xs font-normal text-muted">dernier choix</span>}
              </span>
              <span className="block text-sm text-muted">{o.text}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
  return { ask, modal }
}
