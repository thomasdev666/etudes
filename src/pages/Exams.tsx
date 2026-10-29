import { Clock, GraduationCap, Headphones, Play, Timer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, cx, ErrorBox, IconButton, Modal, PageHeader, ProgressBar, Spinner } from '@/components/ui'
import { jobProgress, useJobs } from '@/context/jobs'
import { fmt } from '@/lib/dates'
import { useInvalidate } from '@/lib/data'
import { scoreSummary, useExamSessions, useStartExam, type ExamSession } from '@/lib/examSession'
import { EXAMS, type ExamId, type SectionDef } from '@/lib/exams'
import { supabase } from '@/lib/supabase'

const fullMinutes = (exam: ExamId) => EXAMS[exam].sections.reduce((n, s) => n + s.minutes, 0)
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`)

// Nombres de questions proposés pour un entraînement sur une section
function countOptions(s: SectionDef) {
  const step = s.perPassage ?? 5
  const opts = [step, step * 2, step * 3].filter((n) => n < s.count)
  return [...new Set([...opts, s.count])]
}

function SectionModal({ exam, section, onClose }: { exam: ExamId; section: SectionDef | null; onClose: () => void }) {
  const startExam = useStartExam()
  const navigate = useNavigate()
  const [count, setCount] = useState<number | null>(null)
  const [timed, setTimed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!section) return null
  const options = countOptions(section)
  const n = count ?? options[0]

  return (
    <Modal
      open={!!section}
      onClose={onClose}
      title={section.label}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const id = await startExam({ exam, mode: 'section', sections: [{ key: section.key, count: n }], timed })
                onClose()
                navigate(`/entrainements/${id}`)
              } catch (e) {
                setError(e)
              } finally {
                setBusy(false)
              }
            }}
          >
            Préparer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{section.brief.split('.')[0]}.</p>
        <div>
          <p className="mb-2 text-sm font-medium">Nombre de questions</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={n === o}
                onClick={() => setCount(o)}
                className={cx('rounded-full border px-3 py-1 text-sm font-medium', n === o ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-muted hover:bg-surface-2')}
              >
                {o}
                {o === section.count && ' (comme à l’épreuve)'}
              </button>
            ))}
          </div>
        </div>
        {!section.audio && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            <span>
              Chronométré : {hours(Math.round((section.minutes * n) / section.count))}, comme à l’épreuve
            </span>
          </label>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}

function ExamCard({ exam }: { exam: ExamId }) {
  const def = EXAMS[exam]
  const startExam = useStartExam()
  const navigate = useNavigate()
  const [section, setSection] = useState<SectionDef | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const total = def.sections.reduce((n, s) => n + s.count, 0)

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          {exam === 'toeic' ? <Headphones className="size-5" aria-hidden /> : <GraduationCap className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{def.name}</h2>
          <p className="text-sm text-muted">{def.description}</p>
        </div>
      </div>
      <Button
        size="lg"
        icon={<Timer className="size-5" />}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const id = await startExam({ exam, mode: 'full', sections: def.sections.map((s) => ({ key: s.key, count: s.count })), timed: true })
            navigate(`/entrainements/${id}`)
          } catch (e) {
            setError(e)
          } finally {
            setBusy(false)
          }
        }}
      >
        Examen blanc · {total} questions · {hours(fullMinutes(exam))}
      </Button>
      <ErrorBox error={error} />
      <div>
        <p className="mb-2 text-sm font-medium text-muted">Ou s’entraîner sur une section :</p>
        <ul className="flex flex-col gap-1.5">
          {def.sections.map((s) => (
            <li key={s.key}>
              <button type="button" onClick={() => setSection(s)} className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left hover:bg-surface-2">
                {s.audio ? <Headphones className="size-4 shrink-0 text-muted" aria-hidden /> : <Clock className="size-4 shrink-0 text-muted" aria-hidden />}
                <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                <span className="shrink-0 text-xs text-muted">
                  {s.count} q · {s.minutes} min
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <SectionModal key={section?.key} exam={exam} section={section} onClose={() => setSection(null)} />
    </Card>
  )
}

function SessionRow({ s }: { s: ExamSession }) {
  const { find } = useJobs()
  const invalidate = useInvalidate()
  const def = EXAMS[s.exam]
  const job = find((j) => j.kind === 'exam' && j.params.session_id === s.id)
  const title = s.mode === 'full' ? `Examen blanc ${def.short}` : `${def.short} · ${def.sections.find((x) => x.key === s.sections[0]?.key)?.label ?? ''}`
  const summary = s.status === 'finished' && s.result ? scoreSummary(s.exam, s.result) : null
  return (
    <Card className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <Link to={`/entrainements/${s.id}`} className="font-medium hover:underline">
          {title}
        </Link>
        <p className="text-sm text-muted">
          {fmt(s.created_at, 'd MMM yyyy')}
          {summary && <> · <strong className="text-text">{summary.total}</strong></>}
        </p>
        {s.status === 'preparing' && (
          <div className="mt-2 max-w-xs">
            <ProgressBar value={job ? jobProgress(job) : 20} label="Préparation" />
            <p className="mt-1 text-xs text-muted">{job?.result?.phase ?? 'Préparation des questions…'}</p>
          </div>
        )}
      </div>
      {s.status === 'ready' && <Badge tone="accent">Prêt</Badge>}
      {s.status === 'in_progress' && <Badge tone="warning">En cours</Badge>}
      {s.status === 'error' && <Badge tone="danger">Échec</Badge>}
      {(s.status === 'ready' || s.status === 'in_progress') && (
        <Link to={`/entrainements/${s.id}`}>
          <Button size="sm" icon={<Play className="size-4" />}>
            {s.status === 'ready' ? 'Commencer' : 'Reprendre'}
          </Button>
        </Link>
      )}
      <IconButton
        label="Supprimer"
        onClick={async () => {
          if (!confirm('Supprimer cette épreuve de l’historique ?')) return
          await supabase.from('exam_sessions').update({ deleted_at: new Date().toISOString() }).eq('id', s.id)
          invalidate('exam_sessions')
        }}
      >
        <Trash2 className="size-4" />
      </IconButton>
    </Card>
  )
}

export default function ExamsPage() {
  const { data: sessions = [], isLoading, error } = useExamSessions()
  return (
    <>
      <PageHeader title="Entraînements" subtitle="TAGE MAGE et TOEIC, dans le format de l’épreuve. Questions originales générées par l’IA, jamais de sujets officiels." />
      {error ? (
        <p className="mb-4 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Les entraînements ne sont pas encore installés : lance la mise à jour 0009_exams.sql dans Supabase.</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExamCard exam="tage" />
        <ExamCard exam="toeic" />
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Mes épreuves</h2>
      {isLoading ? (
        <Spinner />
      ) : !sessions.length ? (
        <p className="text-sm text-muted">Aucune épreuve pour l’instant. Commence par une section courte pour découvrir le format.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </div>
      )}
    </>
  )
}
