import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpace } from '@/context/space'
import { runAiJob } from '@/lib/ai'
import { useCourses, useInvalidate, useNotesList } from '@/lib/data'
import { startQuizSession } from '@/lib/quiz'
import { must, supabase } from '@/lib/supabase'
import type { Quiz } from '@/lib/types'
import { Button, ErrorBox, Field, Modal, Select } from './ui'

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
  const sn = notes.filter((n) => n.subject_id === subjectId && n.content_text.trim())
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
          </label>
        ))}
        {sn.map((n) => (
          <label key={n.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={noteIds.includes(n.id)} onChange={() => onChange(courseIds, toggle(noteIds, n.id))} />
            <span className="min-w-0 flex-1 truncate">📝 {n.title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function GenerateCardsModal({
  open,
  onClose,
  subjectId,
  initialCourseIds = [],
  initialNoteIds = [],
}: {
  open: boolean
  onClose: () => void
  subjectId: string
  initialCourseIds?: string[]
  initialNoteIds?: string[]
}) {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const [courseIds, setCourseIds] = useState(initialCourseIds)
  const [noteIds, setNoteIds] = useState(initialNoteIds)
  const [count, setCount] = useState(20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setCourseIds(initialCourseIds)
      setNoteIds(initialNoteIds)
      setDone(null)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function go() {
    setBusy(true)
    setError(null)
    try {
      const job = await runAiJob(spaceId, 'flashcards', { subject_id: subjectId, course_ids: courseIds, note_ids: noteIds, count })
      await invalidate('flashcards')
      setDone(job.result?.count ?? 0)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Générer des flash cards"
      footer={
        done !== null ? (
          <Button onClick={onClose}>Fermer</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button icon={<Sparkles className="size-4" />} loading={busy} disabled={!courseIds.length && !noteIds.length} onClick={go}>
              {busy ? 'Génération…' : 'Générer'}
            </Button>
          </>
        )
      }
    >
      {done !== null ? (
        <p className="rounded-xl bg-success-soft px-3 py-3 text-success">{done} cartes ajoutées. Elles sont à réviser dès aujourd’hui.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <SourcePicker subjectId={subjectId} courseIds={courseIds} noteIds={noteIds} onChange={(c, n) => (setCourseIds(c), setNoteIds(n))} />
          <Field label="Nombre de cartes" id="gcount">
            <Select id="gcount" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[10, 20, 30, 40, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          {busy && <p className="text-sm text-muted">L’IA lit ton cours… cela prend en général 10 à 40 secondes.</p>}
          <ErrorBox error={error} />
        </div>
      )}
    </Modal>
  )
}

// Crée le QCM puis lance la génération ; renvoie vers la page de session dès que c'est prêt
export function useGenerateQuiz() {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const navigate = useNavigate()
  return async (p: {
    subjectId: string
    title: string
    courseIds: string[]
    noteIds: string[]
    count: number
    difficulty: Quiz['difficulty']
    qtype: Quiz['qtype']
  }) => {
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
          status: 'generating',
        })
        .select()
        .single(),
    ) as Quiz
    await invalidate('quizzes')
    try {
      await runAiJob(spaceId, 'quiz', {
        quiz_id: quiz.id,
        course_ids: p.courseIds,
        note_ids: p.noteIds,
        count: p.count,
        difficulty: p.difficulty,
        qtype: p.qtype,
      })
    } finally {
      await invalidate('quizzes')
    }
    const sessionId = await startQuizSession(spaceId, quiz)
    navigate(`/qcm/session/${sessionId}`)
  }
}
