import { Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSpace } from '@/context/space'
import { useJobs } from '@/context/jobs'
import { estimateSeconds } from '@/lib/ai'
import { useCourses, useInvalidate, useNotesList, useSubjects } from '@/lib/data'
import { must, supabase } from '@/lib/supabase'
import type { Quiz } from '@/lib/types'
import { Button, ErrorBox, Field, Input, Modal, Select } from './ui'

export function SourcePicker({
  subjectId,
  courseIds,
  noteIds,
  onChange,
}: {
  subjectId: string
  courseIds: string[]
  noteIds: string[]
  onChange: (c: string[], n: string[]) => void
}) {
  const { data: courses = [] } = useCourses()
  const { data: notes = [] } = useNotesList()
  const sc = courses.filter((c) => c.subject_id === subjectId)
  const sn = notes.filter((n) => n.subject_id === subjectId || noteIds.includes(n.id))
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  if (!sc.length && !sn.length) {
    return <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Importe d’abord un cours ou écris une note dans cette matière.</p>
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1.5 text-sm font-medium">Contenu à utiliser</legend>
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1">
        {sc.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={courseIds.includes(c.id)} onChange={() => onChange(toggle(courseIds, c.id), noteIds)} />
            <span className="min-w-0 flex-1 truncate">📄 {c.title}</span>
            {c.status === 'processing' && <span className="shrink-0 text-xs text-warning">analyse en cours</span>}
          </label>
        ))}
        {sn.map((n) => (
          <label key={n.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={noteIds.includes(n.id)} onChange={() => onChange(courseIds, toggle(noteIds, n.id))} />
            <span className="min-w-0 flex-1 truncate">📝 {n.title}</span>
          </label>
        ))}
      </div>
      {sc.some((c) => c.status === 'processing' && courseIds.includes(c.id)) && (
        <p className="mt-1 text-xs text-muted">L’IA lit encore les images d’un cours choisi : la génération attendra automatiquement la fin, pour utiliser tout le contenu.</p>
      )}
    </fieldset>
  )
}

function SubjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: subjects = [] } = useSubjects()
  return (
    <Field label="Matière" id="gsubject">
      <Select id="gsubject" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choisir une matière…</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

type GenerateProps = {
  open: boolean
  onClose: () => void
  subjectId?: string
  initialCourseIds?: string[]
  initialNoteIds?: string[]
}

// Formulaire commun : matière, sources, puis lancement en arrière-plan
function useGenerateForm({ open, subjectId = '', initialCourseIds = [], initialNoteIds = [] }: GenerateProps) {
  const [sid, setSid] = useState(subjectId)
  const [courseIds, setCourseIds] = useState(initialCourseIds)
  const [noteIds, setNoteIds] = useState(initialNoteIds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const lock = useRef(false)

  useEffect(() => {
    if (open) {
      setSid(subjectId)
      setCourseIds(initialCourseIds)
      setNoteIds(initialNoteIds)
      setError(null)
      lock.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Un double clic ne lance jamais deux générations
  async function run(fn: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e)
      lock.current = false
    } finally {
      setBusy(false)
    }
  }

  const fields = (
    <>
      {!subjectId && <SubjectSelect value={sid} onChange={setSid} />}
      {sid && <SourcePicker subjectId={sid} courseIds={courseIds} noteIds={noteIds} onChange={(c, n) => (setCourseIds(c), setNoteIds(n))} />}
    </>
  )
  return { sid, courseIds, noteIds, busy, error, run, fields, ready: !!sid && (courseIds.length > 0 || noteIds.length > 0) }
}

export function GenerateCardsModal(props: GenerateProps) {
  const { start } = useJobs()
  const [count, setCount] = useState(20)
  const f = useGenerateForm(props)

  const go = () =>
    f.run(async () => {
      await start(
        'flashcards',
        { subject_id: f.sid, course_ids: f.courseIds, note_ids: f.noteIds, count },
        { label: `${count} flash cards`, estimateSec: estimateSeconds('flashcards', count), link: `/reviser/cartes?matiere=${f.sid}`, linkLabel: 'Réviser' },
      )
      props.onClose()
    })

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Générer des flash cards"
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose}>
            Annuler
          </Button>
          <Button icon={<Sparkles className="size-4" />} loading={f.busy} disabled={!f.ready} onClick={go}>
            Générer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {f.fields}
        <Field label="Nombre de cartes" id="gcount">
          <Select id="gcount" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[10, 20, 30, 40, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-muted">La génération continue en arrière-plan : tu peux fermer cette fenêtre et naviguer.</p>
        <ErrorBox error={f.error} />
      </div>
    </Modal>
  )
}

export function GenerateMindmapModal(props: GenerateProps) {
  const { spaceId } = useSpace()
  const { start } = useJobs()
  const invalidate = useInvalidate()
  const { data: courses = [] } = useCourses()
  const { data: notes = [] } = useNotesList()
  const [title, setTitle] = useState('')
  const f = useGenerateForm(props)

  const defaultTitle = () =>
    courses.find((c) => c.id === f.courseIds[0])?.title ?? notes.find((n) => n.id === f.noteIds[0])?.title ?? 'Carte mentale'

  const go = () =>
    f.run(async () => {
      const t = title.trim() || defaultTitle()
      const out = must(
        await supabase
          .from('note_outputs')
          .insert({ space_id: spaceId, subject_id: f.sid, kind: 'mindmap', title: t, source_note_ids: f.noteIds, source_course_ids: f.courseIds })
          .select('id')
          .single(),
      ) as { id: string }
      await invalidate('note_outputs')
      await start(
        'mindmap',
        { output_id: out.id, course_ids: f.courseIds, note_ids: f.noteIds, title: t },
        { label: `Carte mentale « ${t} »`, estimateSec: estimateSeconds('mindmap'), link: `/cartes-mentales/${out.id}`, linkLabel: 'Ouvrir' },
      )
      props.onClose()
    })

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Générer une carte mentale"
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose}>
            Annuler
          </Button>
          <Button icon={<Sparkles className="size-4" />} loading={f.busy} disabled={!f.ready} onClick={go}>
            Générer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {f.fields}
        <Field label="Titre (optionnel)" id="mtitle">
          <Input id="mtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle()} />
        </Field>
        <p className="text-sm text-muted">Ta note ou ton cours ne sont jamais modifiés : la carte mentale est un document séparé, que tu pourras éditer.</p>
        <ErrorBox error={f.error} />
      </div>
    </Modal>
  )
}

export type QuizParams = {
  subjectId: string
  title: string
  courseIds: string[]
  noteIds: string[]
  count: number
  difficulty: Quiz['difficulty']
  qtype: Quiz['qtype']
}

// Crée le QCM et lance la génération en arrière-plan
export function useGenerateQuiz() {
  const { spaceId } = useSpace()
  const { start } = useJobs()
  const invalidate = useInvalidate()
  return async (p: QuizParams) => {
    const quiz = must(
      await supabase
        .from('quizzes')
        .insert({
          space_id: spaceId,
          subject_id: p.subjectId,
          title: p.title,
          difficulty: p.difficulty,
          qtype: p.qtype,
          question_count: p.count,
          source_course_ids: p.courseIds,
          source_note_ids: p.noteIds,
          status: 'generating',
        })
        .select()
        .single(),
    ) as Quiz
    await invalidate('quizzes')
    await startQuizJob(start, quiz, p.noteIds)
    return quiz
  }
}

export function startQuizJob(start: ReturnType<typeof useJobs>['start'], quiz: Quiz, noteIds = quiz.source_note_ids ?? []) {
  return start(
    'quiz',
    {
      quiz_id: quiz.id,
      course_ids: quiz.source_course_ids,
      note_ids: noteIds,
      count: quiz.question_count,
      difficulty: quiz.difficulty,
      qtype: quiz.qtype,
    },
    { label: `QCM « ${quiz.title} »`, estimateSec: estimateSeconds('quiz', quiz.question_count), link: `/qcm/demarrer/${quiz.id}`, linkLabel: 'Commencer' },
  )
}
