import { generateHTML, type JSONContent } from '@tiptap/react'
import { buildExtensions } from '@/components/editor/extensions'
import { safeFilename } from './exportNote'
import { downloadBlob, STORAGE_PREFIX } from './storage'
import { toOutline } from './mindmap'
import { must, supabase } from './supabase'
import type { MindNode } from './types'

const TABLES = [
  'spaces',
  'subjects',
  'courses',
  'assignments',
  'work_blocks',
  'study_plans',
  'plan_items',
  'flashcards',
  'flashcard_reviews',
  'quizzes',
  'quiz_sessions',
  'quiz_answers',
  'error_items',
  'notes',
  'note_versions',
  'files',
  'calendar_links',
  'note_outputs',
] as const

type Row = Record<string, unknown> & { id: string; space_id?: string; subject_id?: string | null; deleted_at?: string | null }

async function fetchAll(table: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const page = must(await supabase.from(table).select('*').range(from, from + 999)) as Row[]
    out.push(...page)
    if (page.length < 1000) return out
  }
}

const csv = (rows: (string | number | null | undefined)[][]) =>
  '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')

// Archive ZIP lisible sans l'application : JSON brut + versions lisibles + fichiers originaux
export async function exportEverything(onProgress: (msg: string) => void): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const data: Record<string, Row[]> = {}

  for (const t of TABLES) {
    onProgress(`Lecture : ${t}`)
    data[t] = await fetchAll(t)
  }
  // Tables des mises à jour récentes : absentes si la mise à jour n'a pas été lancée
  for (const t of ['recordings', 'imported_events']) {
    onProgress(`Lecture : ${t}`)
    data[t] = await fetchAll(t).catch(() => [])
  }
  onProgress('Lecture : questions de QCM')
  data.quiz_questions = must(await supabase.rpc('export_quiz_questions')) as Row[]

  const json = zip.folder('donnees-json')!
  for (const [t, rows] of Object.entries(data)) json.file(`${t}.json`, JSON.stringify(rows, null, 2))

  const extensions = buildExtensions(() => null)
  const live = (r: Row) => !r.deleted_at
  const spaceName = new Map(data.spaces.map((s) => [s.id, safeFilename(String(s.name))]))
  const subjectName = new Map(data.subjects.map((s) => [s.id, safeFilename(String(s.name))]))
  const dir = (r: Row) => `lisible/${spaceName.get(r.space_id!) ?? 'espace'}/${r.subject_id ? (subjectName.get(r.subject_id) ?? 'matiere') : 'Sans matière'}`
  const used = new Set<string>()
  const unique = (p: string) => {
    let name = p
    for (let i = 2; used.has(name); i++) name = p.replace(/(\.\w+)$/, ` (${i})$1`)
    used.add(name)
    return name
  }

  for (const n of data.notes.filter(live)) {
    let body = ''
    try {
      body = generateHTML(n.content as JSONContent, extensions)
    } catch {
      body = `<pre>${String(n.content_text ?? '')}</pre>`
    }
    body = body.replace(/data-latex="([^"]*)"[^>]*>/g, (m, latex) => `${m}<code>${latex}</code>`)
    zip.file(
      unique(`${dir(n)}/notes/${safeFilename(String(n.title))}.html`),
      `<!doctype html><meta charset="utf-8"><title>${n.title}</title><style>body{font-family:system-ui;max-width:760px;margin:2rem auto;padding:0 1rem;line-height:1.6}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}img{max-width:100%}</style><h1>${n.title}</h1>${body}`,
    )
  }

  for (const m of data.note_outputs.filter(live)) {
    if (m.status !== 'ready') continue
    zip.file(unique(`${dir(m)}/cartes-mentales/${safeFilename(String(m.title))}.txt`), toOutline(m.content as MindNode))
  }

  const transcribed = new Set(data.recordings.map((r) => r.course_id))
  for (const c of data.courses.filter(live))
    zip.file(unique(`${dir(c)}/${transcribed.has(c.id) ? 'transcriptions' : 'cours'}/${safeFilename(String(c.title))}.txt`), String(c.content ?? ''))

  for (const s of data.subjects.filter(live)) {
    const cards = data.flashcards.filter((f) => f.subject_id === s.id && live(f))
    if (cards.length) zip.file(`${dir({ ...s, subject_id: s.id })}/flashcards.csv`, csv([['Recto', 'Verso'], ...cards.map((f) => [f.front as string, f.back as string])]))
  }

  for (const q of data.quizzes.filter(live)) {
    const qs = data.quiz_questions.filter((x) => x.quiz_id === q.id).sort((a, b) => Number(a.position) - Number(b.position))
    const text = qs
      .map((x, i) => {
        const choices = (x.choices as string[]).map((c, j) => `   ${j === x.correct_index ? '✔' : ' '} ${String.fromCharCode(65 + j)}. ${c}`).join('\n')
        return `${i + 1}. ${x.question}\n${choices}\n   → ${x.explanation}\n   Notion : ${x.notion}`
      })
      .join('\n\n')
    zip.file(unique(`${dir(q)}/qcm/${safeFilename(String(q.title))}.txt`), `${q.title}\n\n${text}`)
  }

  zip.file(
    'lisible/devoirs.csv',
    csv([
      ['Espace', 'Matière', 'Titre', 'Échéance', 'Statut', 'Description'],
      ...data.assignments
        .filter(live)
        .map((a) => [spaceName.get(a.space_id!), a.subject_id ? subjectName.get(a.subject_id) : '', a.title as string, a.due_at as string, a.status as string, a.description as string]),
    ]),
  )

  const paths = [
    ...data.files.map((f) => ({ path: String(f.path), name: String(f.name), row: f })),
    ...data.courses.filter((c) => c.file_path).map((c) => ({ path: String(c.file_path), name: String(c.file_name ?? 'fichier'), row: c })),
  ]
  for (const [i, f] of paths.entries()) {
    onProgress(`Fichiers ${i + 1} / ${paths.length}`)
    try {
      zip.file(unique(`fichiers/${spaceName.get(f.row.space_id!) ?? 'espace'}/${safeFilename(f.name)}`), await downloadBlob(f.path))
    } catch {
      /* fichier déjà purgé */
    }
  }

  zip.file(
    'LISEZMOI.txt',
    [
      'Export complet — Regulya',
      `Créé le ${new Date().toLocaleString('fr')}`,
      '',
      'lisible/       Notes (.html), cours et transcriptions (.txt), cartes mentales (.txt), QCM avec corrigés (.txt), flash cards (.csv, importables dans Anki ou Quizlet), devoirs (.csv)',
      'fichiers/      Fichiers originaux (PDF de cours, images et pièces jointes des notes, audios gardés)',
      'donnees-json/  Toutes les données brutes, table par table',
      '',
      `Les images des notes sont référencées par « ${STORAGE_PREFIX}chemin » : le fichier correspondant est dans fichiers/.`,
    ].join('\n'),
  )

  onProgress('Compression…')
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
