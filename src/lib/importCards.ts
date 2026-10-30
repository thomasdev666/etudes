// Lecture des exports de flash cards : Quizlet (terme⇥définition), Anki (texte brut, avec ou
// sans HTML), CSV à virgules ou points-virgules, avec guillemets.

export type ImportedCard = { front: string; back: string }

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" }

// Retire le HTML des exports Anki, en gardant les retours à la ligne
export function cleanField(s: string) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Découpe une ligne CSV en tenant compte des guillemets (et des guillemets doublés)
function splitRows(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function detectSeparator(lines: string[]) {
  const sample = lines.slice(0, 20)
  const score = (sep: string) => sample.filter((l) => l.includes(sep)).length
  return (['\t', ';', ','] as const).reduce((best, sep) => (score(sep) > score(best) ? sep : best), '\t' as string)
}

export function parseCards(raw: string, opts: { swap?: boolean } = {}): ImportedCard[] {
  // Lignes d'en-tête d'Anki : #separator:tab, #html:true, #columns:…
  const header = Object.fromEntries(
    raw
      .split('\n')
      .filter((l) => l.startsWith('#') && l.includes(':'))
      .map((l) => l.slice(1).split(':').map((x) => x.trim().toLowerCase()) as [string, string]),
  )
  const body = raw
    .split('\n')
    .filter((l) => !/^#\w+:/.test(l))
    .join('\n')
  const named: Record<string, string> = { tab: '\t', semicolon: ';', comma: ',', pipe: '|' }
  const sep = named[header.separator ?? ''] ?? detectSeparator(body.split('\n').filter((l) => l.trim()))
  const cards: ImportedCard[] = []
  for (const cols of splitRows(body, sep)) {
    const fields = cols.map(cleanField).filter((c, i) => c || i < 2)
    if (fields.length < 2 || !fields[0] || !fields[1]) continue
    const [a, b] = [fields[0].slice(0, 2000), fields[1].slice(0, 4000)]
    cards.push(opts.swap ? { front: b, back: a } : { front: a, back: b })
  }
  return cards
}
