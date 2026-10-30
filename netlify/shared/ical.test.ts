import { describe, expect, it } from 'vitest'
import { parseIcs, safeIcsUrl } from './ical'

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-TIMEZONE:Europe/Paris
BEGIN:VEVENT
UID:a
SUMMARY:Finance d'entreprise
LOCATION:Amphi B
DTSTART;TZID=Europe/Paris:20261103T090000
DTEND;TZID=Europe/Paris:20261103T103000
END:VEVENT
BEGIN:VEVENT
UID:b
SUMMARY:Marketing
DTSTART:20261104T130000Z
DTEND:20261104T150000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:b
RECURRENCE-ID:20261111T130000Z
SUMMARY:Marketing (salle changée)
LOCATION:Salle 12
DTSTART:20261111T140000Z
DTEND:20261111T160000Z
END:VEVENT
BEGIN:VEVENT
UID:c
SUMMARY:Annulé
STATUS:CANCELLED
DTSTART:20261105T080000Z
DTEND:20261105T090000Z
END:VEVENT
END:VCALENDAR`

describe('agenda iCal', () => {
  const from = new Date('2026-11-01T00:00:00Z')
  const to = new Date('2026-12-31T00:00:00Z')

  it('lit les événements, fuseau compris', () => {
    const ev = parseIcs(ICS, from, to)
    const fin = ev.find((e) => e.title.startsWith('Finance'))!
    expect(fin.start.toISOString()).toBe('2026-11-03T08:00:00.000Z')
    expect(fin.location).toBe('Amphi B')
  })

  it('déroule les récurrences et applique les exceptions', () => {
    const mk = parseIcs(ICS, from, to).filter((e) => e.title.startsWith('Marketing'))
    expect(mk).toHaveLength(3)
    expect(mk[1].title).toBe('Marketing (salle changée)')
    expect(mk[1].start.toISOString()).toBe('2026-11-11T14:00:00.000Z')
  })

  it('ignore les événements annulés et hors fenêtre', () => {
    expect(parseIcs(ICS, from, to).some((e) => e.title === 'Annulé')).toBe(false)
    expect(parseIcs(ICS, new Date('2027-01-01'), new Date('2027-02-01'))).toHaveLength(0)
  })

  it('refuse les adresses internes et les protocoles non chiffrés', async () => {
    await expect(safeIcsUrl('http://exemple.fr/a.ics')).rejects.toThrow()
    await expect(safeIcsUrl('https://127.0.0.1/a.ics')).rejects.toThrow()
    await expect(safeIcsUrl('https://192.168.1.4/a.ics')).rejects.toThrow()
    expect((await safeIcsUrl('webcal://8.8.8.8/a.ics')).protocol).toBe('https:')
  })
})
