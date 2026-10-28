import { describe, expect, it } from 'vitest'
import { matchSubject, parseIcs } from './calendar'
import type { Subject } from './types'

// Extrait typique d'un calendrier publié par Outlook (fuseau Windows + récurrence + exception)
const ICS = `BEGIN:VCALENDAR
METHOD:PUBLISH
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Romance Standard Time
BEGIN:STANDARD
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:finance-1
SUMMARY:FIN301 - Corporate Finance
LOCATION:Salle B204
DTSTART;TZID=Romance Standard Time:20261102T090000
DTEND;TZID=Romance Standard Time:20261102T120000
RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO
END:VEVENT
BEGIN:VEVENT
UID:finance-1
RECURRENCE-ID;TZID=Romance Standard Time:20261109T090000
SUMMARY:FIN301 - Corporate Finance (salle changée)
LOCATION:Amphi A
DTSTART;TZID=Romance Standard Time:20261109T140000
DTEND;TZID=Romance Standard Time:20261109T170000
END:VEVENT
BEGIN:VEVENT
UID:mkt-1
SUMMARY:Marketing digital
DTSTART;TZID=Romance Standard Time:20261103T100000
DTEND;TZID=Romance Standard Time:20261103T113000
END:VEVENT
BEGIN:VEVENT
UID:annule
SUMMARY:Cours annulé
STATUS:CANCELLED
DTSTART:20261104T080000Z
DTEND:20261104T090000Z
END:VEVENT
END:VCALENDAR`

const subject = (name: string, keywords: string[] = []) => ({ id: name, name, keywords }) as unknown as Subject

describe('calendrier Outlook (ICS)', () => {
  const events = parseIcs(ICS, new Date('2026-10-01'), new Date('2026-12-31'))

  it('développe les cours récurrents et applique les exceptions', () => {
    const fin = events.filter((e) => e.title.startsWith('FIN301'))
    expect(fin).toHaveLength(4)
    const moved = fin.find((e) => e.location === 'Amphi A')
    expect(moved?.start.toISOString()).toBe('2026-11-09T13:00:00.000Z')
  })

  it('convertit le fuseau Windows (heure de Paris, UTC+1 en novembre)', () => {
    const first = events.find((e) => e.title.startsWith('FIN301'))!
    expect(first.start.toISOString()).toBe('2026-11-02T08:00:00.000Z')
  })

  it('ignore les événements annulés', () => {
    expect(events.some((e) => e.title === 'Cours annulé')).toBe(false)
  })

  it('associe un cours à la matière par nom ou mot-clé', () => {
    const subjects = [subject('Marketing'), subject('Finance', ['FIN301'])]
    expect(matchSubject('FIN301 - Corporate Finance', subjects)?.name).toBe('Finance')
    expect(matchSubject('Marketing digital', subjects)?.name).toBe('Marketing')
    expect(matchSubject('Anglais', subjects)).toBeNull()
  })
})
