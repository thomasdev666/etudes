// Lit un planning exporté depuis Outlook en PDF (Imprimer → « Imprimer l'agenda détaillé »).
// Chaque cours ressemble à :
//   B2 FT - Budget & Analyse Financière
//   Jeu 01/10/2026 08:30 - 11:30
//   Emplacement : EENT (050pl) H134 (…)

export type TimetableEvent = { title: string; location: string; start: Date; end: Date }

// La date peut être seule sur sa ligne ou collée au titre selon le PDF.
// Selon la police, l'extraction perd parfois « : » et « - » : on accepte n'importe quel séparateur.
const DATE_RE = /(?:lun|mar|mer|jeu|ven|sam|dim)[a-zéû]*\.?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})\D{0,3}(\d{2})\D{1,10}?(\d{1,2})\D{0,3}(\d{2})(?!\d)/i
const PRIVATE = /[\uE000-\uF8FF]/g
const BULLET = /^[■▪●◼■-◿]\s*/

export function parseTimetable(text: string): TimetableEvent[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const out: TimetableEvent[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DATE_RE)
    if (!m || m.index === undefined) continue
    const [, d, mo, y, h1, mi1, h2, mi2] = m
    const before = lines[i].slice(0, m.index).trim()
    const after = lines[i].slice(m.index + m[0].length).trim()
    const prev = lines[i - 1] ?? ''
    // Titre juste avant la date (même ligne ou ligne du dessus), sans la pastille colorée
    const rawTitle = before || (/^---|Emplacement\s*:/i.test(prev) ? '' : prev)
    // Selon la police, la ponctuation sort en caractères « privés » (U+E000–F8FF) :
    // dans un titre c'est presque toujours le tiret « B2 FT - Achats »
    const title = rawTitle
      .replace(BULLET, '')
      .replace(PRIVATE, '-')
      .replace(/\s+/g, ' ')
      .replace(/\s*-(\s*-)+\s*/g, ' - ')
      .trim()
    let location = ''
    for (const candidate of [after, ...lines.slice(i + 1, i + 4)]) {
      const loc = candidate.match(/Emplacement\s*:\s*(.+)$/i)
      if (loc) {
        location = loc[1].replace(PRIVATE, ' ').replace(/\s+/g, ' ').trim()
        break
      }
    }
    out.push({
      title: title || '(sans titre)',
      location,
      start: new Date(+y, +mo - 1, +d, +h1, +mi1),
      end: new Date(+y, +mo - 1, +d, +h2, +mi2),
    })
  }
  return out
}
