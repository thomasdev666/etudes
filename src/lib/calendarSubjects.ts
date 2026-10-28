// Déduit les matières à partir des titres de l'emploi du temps.
// Méthode simple (sans IA) utilisée en secours, ou pour compléter la réponse de l'IA.
import { authHeader } from './supabase'

export type SubjectSuggestion = { name: string; keywords: string[]; count: number }

const SESSION_WORDS =
  /\b(cm|td|tp|cours|course|lecture|tutorial|tuto|seminar|séminaire|seminaire|examen|exam|partiel|final|rattrapage|amphi|salle|room|groupe|group|gr|grp|distanciel|présentiel|presentiel|online|en ligne|live|soutenance|projet|project|workshop|atelier)\b\.?/gi
const CODE = /\b[A-Z]{2,6}[-_ ]?\d{2,4}[A-Z]?\b/
const NOT_COURSES = /\b(férié|ferie|vacances|holiday|réunion|reunion|meeting|rdv|rendez-vous|anniversaire|birthday|pause|déjeuner|lunch|bde|asso|association|soirée|soiree)\b/i

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function suggestFromTitles(titles: string[]): SubjectSuggestion[] {
  const groups = new Map<string, { names: Map<string, number>; keywords: Set<string>; count: number }>()
  for (const raw of titles) {
    if (!raw || NOT_COURSES.test(raw)) continue
    const code = raw.match(CODE)?.[0]
    let t = raw.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    if (code) t = t.replace(code, ' ')
    const segments = t
      .split(/\s[-–|/:]\s|[|_]|\s-\s?|\s?-\s/)
      .map((x) => x.replace(SESSION_WORDS, ' ').replace(/\b(s|l|m|bba|bachelor|master|msc)\d*\b/gi, ' ').replace(/\s+/g, ' ').trim())
      .filter((x) => /[a-zà-ÿ]{3,}/i.test(x))
    const name = segments.sort((a, b) => b.length - a.length)[0]
    if (!name || name.length < 3) continue
    const key = normalize(name)
    const g = groups.get(key) ?? { names: new Map(), keywords: new Set(), count: 0 }
    g.names.set(name, (g.names.get(name) ?? 0) + 1)
    if (code) g.keywords.add(code)
    g.count++
    groups.set(key, g)
  }
  const list = [...groups.values()].map((g) => {
    const name = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
    return { name: name.charAt(0).toUpperCase() + name.slice(1), keywords: [...g.keywords], count: g.count }
  })
  // Les cours reviennent chaque semaine : on garde ce qui apparaît au moins deux fois
  const recurring = list.filter((s) => s.count >= 2)
  return (recurring.length >= 2 ? recurring : list).sort((a, b) => b.count - a.count).slice(0, 30)
}

// Essaie d'abord l'IA (titres souvent codés), sinon la méthode simple
export async function suggestSubjects(titles: string[]): Promise<{ list: SubjectSuggestion[]; ai: boolean }> {
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))]
  const counts = new Map<string, number>()
  for (const t of titles) counts.set(t.trim(), (counts.get(t.trim()) ?? 0) + 1)
  try {
    const res = await fetch('/.netlify/functions/ai-subjects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ titles: unique }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error('indisponible')
    const { subjects } = (await res.json()) as { subjects: { name: string; keywords: string[] }[] }
    if (!subjects?.length) throw new Error('vide')
    const list = subjects.map((s) => {
      const kws = s.keywords.filter((k) => k.trim().length >= 2)
      const count = unique.filter((t) => kws.some((k) => t.toLowerCase().includes(k.toLowerCase()))).reduce((n, t) => n + (counts.get(t) ?? 0), 0)
      return { name: s.name, keywords: kws, count }
    })
    return { list: list.sort((a, b) => b.count - a.count), ai: true }
  } catch {
    return { list: suggestFromTitles(titles), ai: false }
  }
}
