// Surlignage des termes cherchés, sans tenir compte des accents ni des majuscules
const strip = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export type Part = { text: string; hit: boolean }

export function highlight(text: string, query: string): Part[] {
  const q = strip(query.trim())
  if (q.length < 2 || !text) return [{ text, hit: false }]
  // Texte normalisé + correspondance vers la position d'origine de chaque caractère
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const n = strip(text[i])
    norm += n
    for (let k = 0; k < n.length; k++) map.push(i)
  }
  const parts: Part[] = []
  let last = 0
  for (let at = norm.indexOf(q); at >= 0; at = norm.indexOf(q, at + q.length)) {
    const start = map[at]
    const end = map[at + q.length - 1] + 1
    if (start < last) continue
    if (start > last) parts.push({ text: text.slice(last, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    last = end
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false })
  return parts
}
