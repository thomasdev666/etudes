// Convertit une fiche générée en document de l'éditeur de notes (TipTap), pour qu'elle soit éditable et exportable
import type { Sheet } from './ai'

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string }[] }

// « **gras** » et « $x^2$ » dans le texte
export function inline(s: string): Node[] {
  const out: Node[] = []
  for (const part of s.split(/(\$[^$]+\$|\*\*[^*]+\*\*)/)) {
    if (!part) continue
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) out.push({ type: 'inlineMath', attrs: { latex: part.slice(1, -1) } })
    else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) out.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'bold' }] })
    else out.push({ type: 'text', text: part })
  }
  return out
}

const p = (s: string): Node => ({ type: 'paragraph', content: inline(s) })
const h = (level: number, s: string): Node => ({ type: 'heading', attrs: { level }, content: inline(s) })
const list = (items: string[]): Node => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) })

export function sheetToDoc(sheet: Sheet): { doc: Node; text: string } {
  const c: Node[] = []
  const text: string[] = []
  if (sheet.intro) {
    c.push({ type: 'paragraph', content: inline(sheet.intro).map((n) => (n.type === 'text' ? { ...n, marks: [...(n.marks ?? []), { type: 'italic' }] } : n)) })
    text.push(sheet.intro)
  }
  for (const s of sheet.sections) {
    c.push(h(2, s.heading))
    text.push(s.heading, ...s.points)
    if (s.points.length) c.push(list(s.points))
    for (const sub of s.subsections ?? []) {
      c.push(h(3, sub.heading))
      text.push(sub.heading, ...sub.points)
      if (sub.points.length) c.push(list(sub.points))
    }
  }
  if (sheet.definitions.length) {
    c.push(h(2, 'Définitions à connaître'))
    c.push(list(sheet.definitions.map((d) => `**${d.term}** : ${d.definition}`)))
    text.push(...sheet.definitions.map((d) => `${d.term} : ${d.definition}`))
  }
  if (sheet.formulas.length) {
    c.push(h(2, 'Formules'))
    for (const f of sheet.formulas) {
      if (f.name) c.push({ type: 'paragraph', content: [{ type: 'text', text: f.name, marks: [{ type: 'bold' }] }] })
      c.push({ type: 'blockMath', attrs: { latex: f.latex.replace(/^\$+|\$+$/g, '') } })
      if (f.explanation) c.push(p(f.explanation))
      text.push(`${f.name} : ${f.latex} ${f.explanation}`)
    }
  }
  if (sheet.pitfalls.length) {
    c.push(h(2, 'Pièges à éviter'))
    c.push(list(sheet.pitfalls))
    text.push(...sheet.pitfalls)
  }
  if (sheet.checklist.length) {
    c.push(h(2, 'Le jour de l’examen, je sais…'))
    c.push({ type: 'taskList', content: sheet.checklist.map((i) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(i)] })) })
    text.push(...sheet.checklist)
  }
  return { doc: { type: 'doc', content: c }, text: text.join('\n').replace(/\*\*/g, '') }
}
