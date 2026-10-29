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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {value.days.map((d, i) => (
          <div key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[7rem_9rem_minmax(0,1fr)]">
            <span className="text-sm font-medium">{DAYS[i]}</span>
            <Select value={d.minutes} onChange={(e) => setDay(i, { minutes: Number(e.target.value) })} aria-label={`Temps de travail le ${DAYS[i].toLowerCase()}`} className="py-1.5 text-sm">
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {durationText(m)}
                </option>
              ))}
            </Select>
            <div className={`col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 text-sm sm:col-span-1 sm:col-start-3 ${d.minutes ? '' : 'opacity-40'}`}>
              <span className="text-muted">entre</span>
              <input type="time" value={d.from} disabled={!d.minutes} onChange={(e) => setDay(i, { from: e.target.value })} aria-label={`Début le ${DAYS[i].toLowerCase()}`} className="w-[7.5rem] min-w-0 rounded-lg border border-border bg-surface px-2 py-1" />
              <span className="text-muted">et</span>
              <input type="time" value={d.to} disabled={!d.minutes} onChange={(e) => setDay(i, { to: e.target.value })} aria-label={`Fin le ${DAYS[i].toLowerCase()}`} className="w-[7.5rem] min-w-0 rounded-lg border border-border bg-surface px-2 py-1" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Séance de travail au plus</span>
          <Select value={value.sessionMax} onChange={(e) => onChange({ ...value, sessionMax: Number(e.target.value) })} className="py-1.5 text-sm">
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {durationText(m)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Pause après un cours</span>
          <Select value={value.afterClass} onChange={(e) => onChange({ ...value, afterClass: Number(e.target.value) })} className="py-1.5 text-sm">
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
