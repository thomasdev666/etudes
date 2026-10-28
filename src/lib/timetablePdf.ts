// Lit un planning exporté depuis Outlook en PDF (Imprimer → « Imprimer l'agenda détaillé »).
// Chaque cours ressemble à :
//   B2 FT - Budget & Analyse Financière
//   Jeu 01/10/2026 08:30 - 11:30
//   Emplacement : EENT (050pl) H134 (…)
//   > FT - Budget (Cours) 03

export type TimetableEvent = { title: string; kind: string; session: number | null; location: string; start: Date; end: Date }

// La date peut être seule sur sa ligne ou collée au titre selon le PDF.
// Selon la police, l'extraction perd parfois « : » et « - » : on accepte n'importe quel séparateur.
const DATE_RE = /(?:lun|mar|mer|jeu|ven|sam|dim)[a-zéû]*\.?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})\D{0,3}(\d{2})\D{1,10}?(\d{1,2})\D{0,3}(\d{2})(?!\d)/i
const PRIVATE = /[-]/g
const BULLET = /^[■▪●◼■-◿]\s*/

const KIND = '(TD|TP|CM|Cours|Course|Lecture|Tutorial|Examen|Exam|Partiel|S[ée]minaire|Conf[ée]rence|Atelier|Workshop|Soutenance|Tutorat|Projet|E-?learning)'
// « (TD) 06 », « (Cours ) 4 », « (TD) n°6 »
const KIND_NUM = new RegExp(`\\(\\s*${KIND}\\s*\\)\\s*(?:n°|no\\.?|#)?\\s*0*(\\d{1,3})\\b`, 'i')
const KIND_ONLY = new RegExp(`\\(\\s*${KIND}\\s*\\)`, 'i')
const SEANCE = /s[ée]ance\s*(?:n°|no\.?|#)?\s*:?\s*0*(\d{1,3})\b/i

const ACRONYMS = new Set(['td', 'tp', 'cm'])
const normKind = (k: string) => (ACRONYMS.has(k.toLowerCase()) ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1).toLowerCase())

// Code de promo ou de groupe en tête du titre (« B2 FT », « B2S3 ») : pas de minuscules, court
const CODE_SEGMENT = /^[A-Z0-9][A-Z0-9 ._/]{0,11}$/

// « B2 FT - Budget & Analyse Financière (TD) 06 » → « Budget & Analyse Financière »
export function cleanCourseTitle(raw: string): string {
  let t = raw
    .replace(BULLET, '')
    .replace(PRIVATE, '-')
    .replace(KIND_NUM, ' ')
    .replace(KIND_ONLY, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-(\s*-)+\s*/g, ' - ')
    .trim()
  let parts = t.split(/\s+[-–]\s+/)
  while (parts.length > 1 && CODE_SEGMENT.test(parts[0].trim())) parts = parts.slice(1)
  t = parts.join(' - ').replace(/^[-–\s]+|[-–\s]+$/g, '')
  return t || raw.trim()
}

// Type et numéro de séance, cherchés dans le titre puis dans le détail du cours
export function findSession(texts: string[]): { kind: string; session: number | null } {
  for (const s of texts) {
    const m = s.replace(PRIVATE, ' ').match(KIND_NUM)
    if (m) return { kind: normKind(m[1]), session: +m[2] }
  }
  let kind = ''
  let session: number | null = null
  for (const s of texts) {
    const clean = s.replace(PRIVATE, ' ')
    if (!kind) kind = normKind(clean.match(KIND_ONLY)?.[1] ?? '')
    if (session === null) {
      const n = clean.match(SEANCE)
      if (n) session = +n[1]
    }
  }
  return { kind, session }
}

// « TD n°6 », « Cours n°4 », « Séance 3 »
export function sessionLabel(kind: string, session: number | null) {
  if (!kind && session === null) return ''
  if (session === null) return kind
  return `${kind || 'Séance'} n°${session}`
}

export function parseTimetable(text: string): TimetableEvent[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // 1. Repère chaque cours : ligne de la date et ligne du titre
  const found: { i: number; m: RegExpMatchArray; titleLine: number; rawTitle: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DATE_RE)
    if (!m || m.index === undefined) continue
    const before = lines[i].slice(0, m.index).trim()
    const prev = lines[i - 1] ?? ''
    const usePrev = !before && !/^---|Emplacement\s*:/i.test(prev)
    found.push({ i, m, titleLine: before ? i : usePrev ? i - 1 : i, rawTitle: before || (usePrev ? prev : '') })
  }

  // 2. Le détail d'un cours va de sa date jusqu'au titre du cours suivant
  return found.map(({ i, m, rawTitle }, k) => {
    const [, d, mo, y, h1, mi1, h2, mi2] = m
    const after = lines[i].slice(m.index! + m[0].length).trim()
    const stop = k + 1 < found.length ? found[k + 1].titleLine : Math.min(lines.length, i + 8)
    const detail = [after, ...lines.slice(i + 1, Math.max(i + 1, stop))]

    let location = ''
    for (const candidate of detail.slice(0, 4)) {
      const loc = candidate.match(/Emplacement\s*:\s*(.+)$/i)
      if (loc) {
        location = loc[1].replace(PRIVATE, ' ').replace(/\s+/g, ' ').trim()
        break
      }
    }
    const { kind, session } = findSession([rawTitle, ...detail.filter((l) => !/Emplacement\s*:/i.test(l))])
    return {
      title: rawTitle ? cleanCourseTitle(rawTitle) : '(sans titre)',
      kind,
      session,
      location,
      start: new Date(+y, +mo - 1, +d, +h1, +mi1),
      end: new Date(+y, +mo - 1, +d, +h2, +mi2),
    }
  })
}
