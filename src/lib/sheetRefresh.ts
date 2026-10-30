// Fiches de révision faites avant les fiches visuelles (schémas, encadrés) : on propose de les refaire.
// Le lien vers les cours d'origine n'est pas conservé : on le retrouve par le titre « Fiche — <titre du cours> ».
type Titled = { id: string; title: string; subject_id: string | null }

export const SHEET_PREFIX = 'Fiche — '

export function oldSheetSource(note: Titled & { content: unknown }, courses: Titled[], notes: Titled[]) {
  if (!note.title.startsWith(SHEET_PREFIX)) return null
  const json = JSON.stringify(note.content ?? '')
  if (json.includes('"diagram"') || json.includes('"callout"') || json.includes('Fiche en cours de rédaction')) return null
  const title = note.title.slice(SHEET_PREFIX.length).trim()
  const same = (x: Titled) => x.title.trim() === title && (!note.subject_id || !x.subject_id || x.subject_id === note.subject_id)
  const courseIds = courses.filter(same).map((c) => c.id)
  const noteIds = notes.filter((n) => n.id !== note.id && same(n)).map((n) => n.id)
  return courseIds.length || noteIds.length ? { title, courseIds, noteIds } : null
}
