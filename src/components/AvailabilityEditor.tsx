import type { Availability } from '@/lib/availability'
import { Select } from './ui'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const MINUTES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360]
export const durationText = (m: number) => (m === 0 ? 'Repos' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`)

// Résumé en une ligne : « Lun–ven 2 h (17:30–22:00) · sam. 3 h · dim. repos »
export function availabilitySummary(a: Availability) {
  const fmt = (d: Availability['days'][number]) => (d.minutes ? `${durationText(d.minutes)} (${d.from}–${d.to})` : 'repos')
  const week = a.days.slice(0, 5)
  const same = week.every((d) => d.minutes === week[0].minutes && d.from === week[0].from && d.to === week[0].to)
  const head = same ? `Lun–ven ${fmt(week[0])}` : week.map((d, i) => `${DAYS[i].slice(0, 3).toLowerCase()}. ${fmt(d)}`).join(' · ')
  return `${head} · sam. ${fmt(a.days[5])} · dim. ${fmt(a.days[6])}`
}

export function AvailabilityEditor({ value, onChange }: { value: Availability; onChange: (a: Availability) => void }) {
  const setDay = (i: number, patch: Partial<Availability['days'][number]>) => onChange({ ...value, days: value.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) })
  // Recopie le lundi sur le mardi au vendredi : le cas le plus courant
  const copyMonday = () => onChange({ ...value, days: value.days.map((d, j) => (j > 0 && j < 5 ? { ...value.days[0] } : d)) })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {value.days.map((d, i) => (
          <div key={i} className="flex flex-col gap-2 px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{DAYS[i]}</span>
              <span className="text-sm text-muted">{d.minutes ? `${durationText(d.minutes)}` : 'Repos'}</span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Temps de travail le ${DAYS[i].toLowerCase()}`}>
              {MINUTES.map((m) => {
                const on = d.minutes === m
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDay(i, { minutes: m })}
                    className={`min-h-9 rounded-full border px-3 text-sm font-medium ${on ? 'border-accent bg-accent text-white' : 'border-border text-muted hover:bg-surface-2'}`}
                  >
                    {m === 0 ? 'Repos' : durationText(m)}
                  </button>
                )
              })}
            </div>
            {d.minutes > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted">de</span>
                  <input type="time" value={d.from} onChange={(e) => setDay(i, { from: e.target.value })} aria-label={`Début le ${DAYS[i].toLowerCase()}`} className="min-h-9 rounded-lg border border-border bg-surface px-2" />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted">à</span>
                  <input type="time" value={d.to} onChange={(e) => setDay(i, { to: e.target.value })} aria-label={`Fin le ${DAYS[i].toLowerCase()}`} className="min-h-9 rounded-lg border border-border bg-surface px-2" />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={copyMonday} className="self-start text-sm font-medium text-accent-ink hover:underline">
        Recopier le lundi du mardi au vendredi
      </button>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Séance de travail au plus</span>
          <Select value={value.sessionMax} onChange={(e) => onChange({ ...value, sessionMax: Number(e.target.value) })} className="py-2 text-sm">
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {durationText(m)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Pause après un cours</span>
          <Select value={value.afterClass} onChange={(e) => onChange({ ...value, afterClass: Number(e.target.value) })} className="py-2 text-sm">
            {[0, 15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m ? `${m} min` : 'Aucune'}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  )
}
