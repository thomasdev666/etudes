// Lecture d'un agenda iCal (Google Agenda, Hyperplanning, Celcat, Outlook publié) :
// événements, y compris récurrents, sur une fenêtre de dates.
import ICAL from 'ical.js'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type IcsEvent = { uid: string; title: string; location: string; start: Date; end: Date }

// Heure locale d'un fuseau IANA → instant UTC (quand l'agenda ne fournit pas la définition du fuseau)
function zonedToUtc(t: ICAL.Time, tz: string): Date {
  const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(guess))
    const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]))
    const asLocal = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second)
    return new Date(guess - (asLocal - guess))
  } catch {
    return new Date(guess)
  }
}

function toDate(t: ICAL.Time, tzid: string | null, fallbackTz: string): Date {
  if (t.isDate) return zonedToUtc(t, fallbackTz)
  const zone = t.zone?.tzid
  if (zone === 'UTC' || (zone && zone !== 'floating')) return t.toJSDate()
  return zonedToUtc(t, tzid ?? fallbackTz)
}

export function parseIcs(text: string, from: Date, to: Date, fallbackTz = 'Europe/Paris'): IcsEvent[] {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      /* fuseau mal formé : on retombe sur Intl */
    }
  }
  const calTz = (root.getFirstPropertyValue('x-wr-timezone') as string | null) ?? fallbackTz
  const vevents = root.getAllSubcomponents('vevent')
  // Exceptions d'occurrences (RECURRENCE-ID) : elles remplacent l'occurrence d'origine
  const overrides = new Map<string, ICAL.Event>()
  for (const v of vevents) {
    const ev = new ICAL.Event(v)
    if (ev.isRecurrenceException()) overrides.set(`${ev.uid}|${ev.recurrenceId.toJSDate().getTime()}`, ev)
  }

  const out: IcsEvent[] = []
  const push = (uid: string, ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if ((v(ev, 'status') ?? '').toUpperCase() === 'CANCELLED') return
    const tzid = (ev.component.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined) ?? null
    const s = toDate(start, tzid, calTz)
    const e = toDate(end, tzid, calTz)
    if (e < from || s > to) return
    out.push({ uid, title: (ev.summary || 'Sans titre').slice(0, 300), location: (ev.location || '').slice(0, 300), start: s, end: e > s ? e : new Date(s.getTime() + 3600_000) })
  }
  const v = (ev: ICAL.Event, name: string) => ev.component.getFirstPropertyValue(name) as string | null

  for (const vevent of vevents) {
    const ev = new ICAL.Event(vevent)
    if (ev.isRecurrenceException() || !ev.startDate) continue
    if (!ev.isRecurring()) {
      push(ev.uid, ev, ev.startDate, ev.endDate ?? ev.startDate)
      continue
    }
    const it = ev.iterator()
    for (let n = 0, next = it.next(); next && n < 2000; n++, next = it.next()) {
      const occStart = next.toJSDate()
      if (occStart > to) break
      const key = `${ev.uid}|${occStart.getTime()}`
      const o = overrides.get(key)
      if (o) push(`${ev.uid}|${n}`, o, o.startDate, o.endDate ?? o.startDate)
      else {
        const det = ev.getOccurrenceDetails(next)
        push(`${ev.uid}|${n}`, ev, det.startDate, det.endDate)
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

// Refuse les adresses internes (protection contre l'usage du serveur pour sonder un réseau privé)
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(127|10|192\.168|169\.254)\./i]

export async function safeIcsUrl(raw: string): Promise<URL> {
  const url = new URL(raw.trim().replace(/^webcal:/i, 'https:'))
  if (url.protocol !== 'https:') throw new Error('Le lien doit commencer par https:// ou webcal://')
  if (url.username || url.password) throw new Error('Lien non accepté')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (!addresses.length || addresses.some((a) => PRIVATE.some((r) => r.test(a)) || a === 'localhost')) throw new Error('Ce lien pointe vers une adresse non autorisée.')
  return url
}

export async function fetchIcs(raw: string): Promise<string> {
  const url = await safeIcsUrl(raw)
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { Accept: 'text/calendar, */*' } })
  if (res.status >= 300 && res.status < 400) {
    const to = res.headers.get('location')
    if (!to) throw new Error('Agenda introuvable')
    return fetchIcsOnce(await safeIcsUrl(new URL(to, url).href))
  }
  return readLimited(res)
}

async function fetchIcsOnce(url: URL) {
  return readLimited(await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) }))
}

async function readLimited(res: Response) {
  if (!res.ok) throw new Error(res.status === 404 ? 'Agenda introuvable : vérifie le lien.' : `L’agenda ne répond pas (${res.status}).`)
  const max = 8 * 1024 * 1024
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) throw new Error('Agenda trop volumineux (8 Mo maximum).')
    chunks.push(value)
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks))
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Ce lien ne renvoie pas un agenda iCal.')
  return text
}
