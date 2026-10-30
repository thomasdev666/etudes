// Convertit une fiche générée en document de l'éditeur de notes (TipTap), pour qu'elle soit éditable et exportable
import type { CustomDoc, Sheet, Visual } from './ai'

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string }[] }

// Espace insécable avant « : ; ! ? » % » et après « : la ponctuation ne passe jamais seule à la ligne
export const frenchSpacing = (t: string) => t.replace(/ ([:;!?»%])/g, '\u00a0$1').replace(/« /g, '«\u00a0')

// « **gras** » et « $x^2$ » dans le texte (les formules ne sont pas retouchées)
export function inline(s: string): Node[] {
  const out: Node[] = []
  for (const part of s.split(/(\$[^$]+\$|\*\*[^*]+\*\*)/)) {
    if (!part) continue
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) out.push({ type: 'inlineMath', attrs: { latex: part.slice(1, -1) } })
    else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) out.push({ type: 'text', text: frenchSpacing(part.slice(2, -2)), marks: [{ type: 'bold' }] })
    else out.push({ type: 'text', text: frenchSpacing(part) })
  }
  return out
}

const p = (s: string): Node => ({ type: 'paragraph', content: inline(s) })
const h = (level: number, s: string): Node => ({ type: 'heading', attrs: { level }, content: inline(s) })
const list = (items: string[]): Node => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) })

const plain = (s: string) => s.replace(/\*\*/g, '').replace(/\$/g, '')
const cell = (type: 'tableHeader' | 'tableCell', s: string): Node => ({ type, content: [p(s)] })

const CALLOUT: Partial<Record<Visual['kind'], { tone: string; label: string }>> = {
  exemple: { tone: 'example', label: 'Exemple' },
  a_retenir: { tone: 'key', label: 'À retenir' },
  attention: { tone: 'warning', label: 'Attention' },
  chiffre_cle: { tone: 'figure', label: 'Chiffre clé' },
  definition: { tone: 'definition', label: '' },
}
const DIAGRAM: Partial<Record<Visual['kind'], string>> = { etapes: 'flow', cycle: 'cycle', carte: 'tree' }

// Illustration → bloc de l'éditeur (schéma, tableau ou encadré), et son texte pour la recherche
export function visualToNodes(v: Visual): { nodes: Node[]; text: string[] } {
  const diagram = DIAGRAM[v.kind]
  if (diagram) return { nodes: [{ type: 'diagram', attrs: { kind: diagram, title: plain(v.title), items: v.items.map(plain) } }], text: [v.title, ...v.items] }
  const callout = CALLOUT[v.kind]
  if (callout) {
    // Définition : le terme seul en titre ; sinon « Exemple : titre »
    const label = !callout.label ? plain(v.title) : v.title && v.title.toLowerCase() !== callout.label.toLowerCase() ? `${callout.label}\u00a0: ${plain(v.title)}` : callout.label
    return {
      nodes: [{ type: 'callout', attrs: { tone: callout.tone }, content: [{ type: 'paragraph', content: [{ type: 'text', text: label, marks: [{ type: 'bold' }] }] }, ...v.items.map(p)] }],
      text: [label, ...v.items],
    }
  }
  // Tableau : première ligne = en-têtes ; toutes les lignes ont le même nombre de colonnes
  const rows = v.items.map((r) => r.split('|').map((c) => c.trim()))
  const width = Math.max(...rows.map((r) => r.length))
  if (width < 2) return { nodes: [list(v.items)], text: v.items }
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')].slice(0, width)
  const nodes: Node[] = []
  if (v.title) nodes.push({ type: 'paragraph', content: [{ type: 'text', text: plain(v.title), marks: [{ type: 'bold' }] }] })
  nodes.push({
    type: 'table',
    content: rows.map((r, i) => ({ type: 'tableRow', content: pad(r).map((c) => cell(i === 0 ? 'tableHeader' : 'tableCell', c)) })),
  })
  return { nodes, text: [v.title, ...v.items.map((r) => r.replace(/\|/g, ' '))] }
}

function pushVisuals(c: Node[], text: string[], visuals: Visual[] = []) {
  for (const v of visuals) {
    const r = visualToNodes(v)
    c.push(...r.nodes)
    text.push(...r.text)
  }
}

const withEmoji = (s: { heading: string; emoji?: string }) => (s.emoji ? `${s.emoji} ${s.heading}` : s.heading)

export function sheetToDoc(sheet: Sheet): { doc: Node; text: string } {
  const c: Node[] = []
  const text: string[] = []
  if (sheet.intro) {
    c.push({ type: 'paragraph', content: inline(sheet.intro).map((n) => (n.type === 'text' ? { ...n, marks: [...(n.marks ?? []), { type: 'italic' }] } : n)) })
    text.push(sheet.intro)
  }
  for (const s of sheet.sections) {
    c.push(h(2, withEmoji(s)))
    text.push(s.heading, ...s.points)
    if (s.points.length) c.push(list(s.points))
    pushVisuals(c, text, s.visuals)
    for (const sub of s.subsections ?? []) {
      c.push(h(3, sub.heading))
      text.push(sub.heading, ...sub.points)
      if (sub.points.length) c.push(list(sub.points))
    }
  }
  if (sheet.definitions.length) {
    // Chaque définition dans son encadré, le terme en évidence
    c.push(h(2, '📖 Définitions à connaître'))
    for (const d of sheet.definitions) c.push(...visualToNodes({ kind: 'definition', title: d.term, items: [d.definition] }).nodes)
    text.push(...sheet.definitions.map((d) => `${d.term} : ${d.definition}`))
  }
  if (sheet.formulas.length) {
    c.push(h(2, '🧮 Formules'))
    for (const f of sheet.formulas) {
      if (f.name) c.push({ type: 'paragraph', content: [{ type: 'text', text: f.name, marks: [{ type: 'bold' }] }] })
      c.push({ type: 'blockMath', attrs: { latex: f.latex.replace(/^\$+|\$+$/g, '') } })
      if (f.explanation) c.push(p(f.explanation))
      text.push(`${f.name} : ${f.latex} ${f.explanation}`)
    }
  }
  if (sheet.pitfalls.length) {
    c.push(h(2, '⚠️ Pièges à éviter'))
    c.push(list(sheet.pitfalls))
    text.push(...sheet.pitfalls)
  }
  if (sheet.checklist.length) {
    c.push(h(2, '✅ Le jour de l’examen, je sais…'))
    c.push({ type: 'taskList', content: sheet.checklist.map((i) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(i)] })) })
    text.push(...sheet.checklist)
  }
  return { doc: { type: 'doc', content: c }, text: text.join('\n').replace(/\*\*/g, '') }
}

// Document de l'assistant : sections avec points et formules
export function customToDoc(d: CustomDoc): { doc: Node; text: string } {
  const c: Node[] = []
  const text: string[] = []
  if (d.intro) {
    c.push({ type: 'paragraph', content: inline(d.intro).map((n) => (n.type === 'text' ? { ...n, marks: [...(n.marks ?? []), { type: 'italic' }] } : n)) })
    text.push(d.intro)
  }
  for (const s of d.sections) {
    c.push(h(2, withEmoji(s)))
    text.push(s.heading, ...s.points)
    if (s.points.length) c.push(list(s.points))
    pushVisuals(c, text, s.visuals)
    for (const f of s.formulas) {
      if (f.name) c.push({ type: 'paragraph', content: [{ type: 'text', text: f.name, marks: [{ type: 'bold' }] }] })
      c.push({ type: 'blockMath', attrs: { latex: f.latex.replace(/^\$+|\$+$/g, '') } })
      if (f.explanation) c.push(p(f.explanation))
      text.push(`${f.name} : ${f.latex} ${f.explanation}`)
    }
  }
  return { doc: { type: 'doc', content: c }, text: text.join('\n').replace(/\*\*/g, '') }
}
