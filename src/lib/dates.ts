import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns'
import { enGB, fr } from 'date-fns/locale'
import { isEn } from '@/i18n/lang'

const EN = isEn()
const locale = EN ? enGB : fr
// Les formats écrits pour le français (« d MMMM 'à' HH'h'mm ») sont adaptés à l'anglais
const adapt = (p: string) => (EN ? p.replace(/'à'/g, "'at'").replace(/HH'h'mm/g, 'HH:mm').replace(/'h'/g, ':') : p)

export const fmt = (d: Date | string, pattern: string) => format(new Date(d), adapt(pattern), { locale })

export function countdown(due: string | Date): { label: string; tone: 'danger' | 'warning' | 'muted' } {
  const d = new Date(due)
  const diff = d.getTime() - Date.now()
  if (diff < 0) return { label: `en retard de ${formatDistanceToNowStrict(d, { locale })}`, tone: 'danger' }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000)
    return { label: h >= 1 ? `dans ${h} h` : `dans ${Math.max(1, Math.round(diff / 60_000))} min`, tone: 'danger' }
  }
  const days = differenceInCalendarDays(d, new Date())
  return { label: `J-${days}`, tone: days <= 3 ? 'warning' : 'muted' }
}

export function relativeDay(d: Date | string) {
  const date = new Date(d)
  if (isToday(date)) return "Aujourd'hui"
  if (isTomorrow(date)) return 'Demain'
  return fmt(date, 'EEEE d MMMM')
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function minutesLabel(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`
}

// Valeur pour <input type="datetime-local">
export function toLocalInput(d: Date | string) {
  const date = new Date(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
