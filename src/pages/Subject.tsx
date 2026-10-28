import { AlertTriangle, FileText, ListChecks, NotebookPen, Pencil, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CardsPanel } from '@/components/Cards'
import { startQuizJob } from '@/components/Generate'
import { GeneratingBar, MindmapsPanel } from '@/components/Mindmaps'
import { CourseImport } from '@/components/CourseImport'
import { PlansPanel } from '@/components/Plans'
import { SubjectForm } from '@/components/SubjectForm'
import { Badge, Button, Card, EmptyState, ErrorBox, IconButton, Spinner, Tabs } from '@/components/ui'
import { useSpace } from '@/context/space'
import { useToast } from '@/context/toast'
import { useJobs } from '@/context/jobs'
import { countdown, fmt } from '@/lib/dates'
import {
  useCourses,
  useErrorItems,
  useFlashcards,
  useInvalidate,
  useNotesList,
  useQuizSessions,
  useQuizzes,
  useSubjects,
  useTrash,
} from '@/lib/data'
import { startErrorSession, startQuizSession } from '@/lib/quiz'
import { must, supabase } from '@/lib/supabase'
import type { Quiz } from '@/lib/types'

type Tab = 'cours' | 'notes' | 'qcm' | 'cartes' | 'mentales' | 'plans' | 'erreurs'

const DIFF = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' }

function QuizList({ subjectId }: { subjectId: string }) {
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: quizzes = [] } = useQuizzes()
  const { data: sessions = [] } = useQuizSessions()
  const trash = useTrash('quizzes')
  const { find, start: startJob } = useJobs()
  const invalidate = useInvalidate()
  const mine = quizzes.filter((q) => q.subject_id === subjectId)
  const lock = useRef(false)

  async function retry(q: Quiz) {
    if (lock.current) return
    lock.current = true
    try {
      must(await supabase.from('quizzes').update({ status: 'generating', error: null }).eq('id', q.id))
      await invalidate('quizzes')
      await startQuizJob(startJob, q)
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : String(e), tone: 'error' })
    } finally {
      lock.current = false
    }
  }

  async function start(q: Quiz) {
    if (lock.current) return
    lock.current = true
    try {
      navigate(`/qcm/session/${await startQuizSession(spaceId, q)}`)
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : String(e), tone: 'error' })
      lock.current = false
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Link to={`/qcm/nouveau?matiere=${subjectId}`}>
          <Button icon={<Plus className="size-4" />}>Nouveau QCM</Button>
        </Link>
      </div>
      {!mine.length ? (
        <EmptyState icon={<ListChecks className="size-8" />} title="Aucun QCM">
          Génère un QCM à partir de tes cours pour t’entraîner comme à l’examen.
        </EmptyState>
      ) : (
        mine.map((q) => {
          const done = sessions.filter((s) => s.quiz_id === q.id && s.finished_at)
          const best = done.reduce((m, s) => Math.max(m, s.total ? (s.score! / s.total) * 100 : 0), 0)
          const open = sessions.find((s) => s.quiz_id === q.id && !s.finished_at)
          return (
            <Card key={q.id} className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{q.title}</p>
                <p className="text-sm text-muted">
                  {q.question_count} questions · {q.qtype === 'mcq' ? 'QCM' : 'Vrai / faux'} · {DIFF[q.difficulty]} · {fmt(q.created_at, 'd MMM')}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {q.status === 'error' && <Badge tone="danger">Échec : {q.error?.slice(0, 120)}</Badge>}
                  {done.length > 0 && <Badge tone={best >= 80 ? 'success' : 'muted'}>Meilleur score {Math.round(best)} %</Badge>}
                </div>
                {q.status === 'generating' && (
                  <GeneratingBar job={find((j) => j.params.quiz_id === q.id)} />
                )}
              </div>
              {q.status === 'error' && (
                <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => retry(q)}>
                  Réessayer
                </Button>
              )}
              {q.status === 'ready' &&
                (open ? (
                  <Link to={`/qcm/session/${open.id}`}>
                    <Button icon={<Play className="size-4" />}>Reprendre</Button>
                  </Link>
                ) : (
                  <Button icon={done.length ? <RotateCcw className="size-4" /> : <Play className="size-4" />} onClick={() => start(q)}>
                    {done.length ? 'Refaire' : 'Commencer'}
                  </Button>
                ))}
              <IconButton label="Supprimer le QCM" onClick={() => trash.mutate(q.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </Card>
          )
        })
      )}
    </div>
  )
}

function ErrorsPanel({ subjectId }: { subjectId: string }) {
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const { data: items = [] } = useErrorItems()
  const [error, setError] = useState<unknown>(null)
  const open = items.filter((e) => e.subject_id === subjectId && !e.resolved_at)
  const resolved = items.filter((e) => e.subject_id === subjectId && e.resolved_at).length
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <AlertTriangle className="size-8 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold">{open.length}</p>
          <p className="text-sm text-muted">
            question{open.length > 1 ? 's' : ''} ratée{open.length > 1 ? 's' : ''} à retravailler · {resolved} corrigée{resolved > 1 ? 's' : ''}
          </p>
        </div>
        <Button
          disabled={!open.length}
          onClick={async () => {
            try {
              navigate(`/qcm/session/${await startErrorSession(spaceId, subjectId)}`)
            } catch (e) {
              setError(e)
            }
          }}
        >
          Revoir mes erreurs
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted">Chaque question ratée revient ici jusqu’à ce que tu la réussisses deux fois de suite.</p>
      <div className="mt-2">
        <ErrorBox error={error} />
      </div>
    </Card>
  )
}

export default function SubjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('onglet') as Tab) || 'cours'
  const { spaceId } = useSpace()
  const { data: subjects, isLoading } = useSubjects()
  const { data: courses = [] } = useCourses()
  const { data: notes = [] } = useNotesList()
  const { data: cards = [] } = useFlashcards()
  const { data: errors = [] } = useErrorItems()
  const trash = useTrash('subjects', ['courses', 'assignments', 'study_plans', 'flashcards', 'quizzes', 'notes', 'note_outputs'])
  const [edit, setEdit] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  if (isLoading) return <Spinner />
  const subject = subjects?.find((s) => s.id === id)
  if (!subject) return <EmptyState title="Matière introuvable" action={<Link to="/matieres">Retour aux matières</Link>} />

  const sc = courses.filter((c) => c.subject_id === id)
  const sn = notes.filter((n) => n.subject_id === id)
  const due = cards.filter((c) => c.subject_id === id && new Date(c.due_at) <= new Date()).length
  const errs = errors.filter((e) => e.subject_id === id && !e.resolved_at).length
  const exam = subject.exam_date ? countdown(subject.exam_date + 'T08:00:00') : null

  async function newNote() {
    const n = must(await supabase.from('notes').insert({ space_id: spaceId, subject_id: id, title: 'Nouvelle note' }).select('id').single()) as {
      id: string
    }
    navigate(`/notes/${n.id}`)
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="h-12 w-2 rounded-full" style={{ background: subject.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <Link to="/matieres" className="text-sm text-muted hover:underline">
            Matières
          </Link>
          <h1 className="truncate text-2xl font-bold sm:text-3xl">{subject.name}</h1>
          {exam && (
            <p className="text-sm text-muted">
              Examen le {fmt(subject.exam_date!, 'EEEE d MMMM')} · <strong className="text-text">{exam.label}</strong>
            </p>
          )}
        </div>
        <IconButton label="Modifier la matière" onClick={() => setEdit(true)}>
          <Pencil className="size-5" />
        </IconButton>
        <IconButton
          label="Supprimer la matière"
          onClick={() => {
            if (confirm(`Mettre « ${subject.name} » et tout son contenu à la corbeille ?`)) {
              trash.mutate(subject.id)
              navigate('/matieres')
            }
          }}
        >
          <Trash2 className="size-5" />
        </IconButton>
      </div>

      <Tabs
        label="Contenu de la matière"
        value={tab}
        onChange={(v) => setParams({ onglet: v }, { replace: true })}
        items={[
          { value: 'cours', label: 'Cours', count: sc.length },
          { value: 'notes', label: 'Notes', count: sn.length },
          { value: 'qcm', label: 'QCM' },
          { value: 'cartes', label: 'Flash cards', count: due },
          { value: 'mentales', label: 'Cartes mentales' },
          { value: 'erreurs', label: 'Erreurs', count: errs },
          { value: 'plans', label: 'Plans' },
        ]}
      />

      <div className="mt-4">
        {tab === 'cours' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <Button icon={<Plus className="size-4" />} onClick={() => setImportOpen(true)}>
                Importer un cours
              </Button>
            </div>
            {!sc.length ? (
              <EmptyState icon={<FileText className="size-8" />} title="Aucun cours">
                Importe tes supports (PDF ou texte) : ils serviront à générer QCM et flash cards.
              </EmptyState>
            ) : (
              sc.map((c) => (
                <Link key={c.id} to={`/cours/${c.id}`}>
                  <Card className="flex items-center gap-3 hover:shadow-md">
                    <FileText className="size-5 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.title}</p>
                      <p className="text-sm text-muted">
                        {c.content.length.toLocaleString('fr')} caractères · ajouté le {fmt(c.created_at, 'd MMM yyyy')}
                        {c.status === 'processing' && ' · lecture des images…'}
                      </p>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        )}
        {tab === 'notes' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <Button icon={<Plus className="size-4" />} onClick={newNote}>
                Nouvelle note
              </Button>
            </div>
            {!sn.length ? (
              <EmptyState icon={<NotebookPen className="size-8" />} title="Aucune note" />
            ) : (
              sn.map((n) => (
                <Link key={n.id} to={`/notes/${n.id}`}>
                  <Card className="hover:shadow-md">
                    <p className="font-medium">{n.title}</p>
                    <p className="line-clamp-1 text-sm text-muted">{n.content_text || 'Vide'}</p>
                  </Card>
                </Link>
              ))
            )}
          </div>
        )}
        {tab === 'qcm' && <QuizList subjectId={id} />}
        {tab === 'cartes' && <CardsPanel subject={subject} />}
        {tab === 'mentales' && <MindmapsPanel subjectId={id} />}
        {tab === 'erreurs' && <ErrorsPanel subjectId={id} />}
        {tab === 'plans' && <PlansPanel subject={subject} />}
      </div>

      <SubjectForm open={edit} onClose={() => setEdit(false)} subject={subject} />
      <CourseImport open={importOpen} onClose={() => setImportOpen(false)} subjectId={id} />
    </>
  )
}
