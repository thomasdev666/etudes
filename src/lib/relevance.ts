// Pertinence par mots-clés, sans service externe : utilisé par GIRAFA (côté serveur) pour trouver
// les passages de cours qui répondent à une question, et (des deux côtés) pour proposer les
// matières concernées par une demande. Accents, majuscules et pluriels sont ignorés.

const STOP = new Set(
  (
    'les des une que qui quoi dans pour par sur avec sans est sont etre ete fait faire fais moi toi nous vous ils elles leur leurs ' +
    'cette ces cet mon mes ton tes son ses mais donc car pas plus tres tout tous toute toutes comme quel quelle quels quelles ' +
    'comment pourquoi quand combien entre aussi bien peux peut veux veut voudrais faut alors cela ceci celui celle dont ' +
    'liste complete complet fiche fiches resume cours chapitre notion notions explique expliquer donne donner question questions ' +
    'the and for with what how why does this that are from'
  ).split(' '),
)

export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Racine courte : « financière », « financier », « finance » se retrouvent
const stem = (w: string) => (w.length > 6 ? w.slice(0, 6) : w.replace(/s$/, ''))

export function terms(text: string): string[] {
  const words = fold(text).match(/[a-z0-9]{3,}/g) ?? []
  return [...new Set(words.filter((w) => !STOP.has(w)).map(stem))]
}

function countHits(haystack: string, keys: string[]) {
  const words = fold(haystack).match(/[a-z0-9]{3,}/g) ?? []
  const counts = new Map<string, number>()
  for (const w of words) {
    const s = stem(w)
    if (keys.includes(s)) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return counts
}

export type Doc = { id: string; title: string; subject_id: string | null; text: string }

// Découpe en passages d'environ `size` caractères, sur les fins de paragraphe
export function chunks(text: string, size = 1200): string[] {
  const out: string[] = []
  let cur = ''
  for (const para of text.split(/\n{1,}/)) {
    if (cur && cur.length + para.length > size) {
      out.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + para
    while (cur.length > size * 1.6) {
      out.push(cur.slice(0, size))
      cur = cur.slice(size)
    }
  }
  if (cur.trim()) out.push(cur)
  return out
}

// Passages les plus pertinents pour la question, dans la limite de `maxChars`
export function pickPassages(question: string, docs: Doc[], maxChars = 24_000) {
  const keys = terms(question)
  if (!keys.length) return { text: '', titles: [] as string[] }
  const scored: { doc: Doc; text: string; score: number }[] = []
  for (const doc of docs) {
    const titleHits = countHits(doc.title, keys).size
    for (const c of chunks(doc.text)) {
      const hits = countHits(c, keys)
      if (!hits.size && !titleHits) continue
      // Plusieurs mots différents de la question comptent plus que la répétition d'un seul
      const score = hits.size * 3 + [...hits.values()].reduce((a, b) => a + Math.min(b, 4), 0) + titleHits * 2
      if (hits.size) scored.push({ doc, text: c, score })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const parts: string[] = []
  const titles = new Set<string>()
  let used = 0
  for (const s of scored) {
    if (used + s.text.length > maxChars) continue
    parts.push(`### ${s.doc.title}\n${s.text}`)
    titles.add(s.doc.title)
    used += s.text.length
  }
  return { text: parts.join('\n\n'), titles: [...titles] }
}

// Matières concernées par une demande : nom de la matière, titres et contenus de ses cours
export function rankSubjects(request: string, subjects: { id: string; name: string; keywords?: string[] | null }[], docs: Doc[]) {
  const keys = terms(request)
  if (!keys.length) return []
  const scores = subjects.map((s) => {
    let score = countHits(`${s.name} ${(s.keywords ?? []).join(' ')}`, keys).size * 10
    for (const d of docs.filter((x) => x.subject_id === s.id)) {
      score += countHits(d.title, keys).size * 3
      score += Math.min(countHits(d.text.slice(0, 20_000), keys).size, 3)
    }
    return { id: s.id, score }
  })
  const best = Math.max(0, ...scores.map((s) => s.score))
  // Seulement les matières vraiment concernées (au moins un tiers du meilleur score)
  return scores
    .filter((s) => s.score > 0 && s.score >= best / 3)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.id)
}
