import { AlertTriangle, Brain, ListChecks, Network, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { planProgress } from '@/components/Plans'
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, ProgressBar, SubjectDot } from '@/components/ui'
import { useSpace } from '@/context/space'
import { countdown } from '@/lib/dates'
import { useErrorItems, useFlashcards, usePlanItems, usePlans, useQuizSessions, useSubjects } from '@/lib/data'
import { startErrorSession } from '@/lib/quiz'

export default function ReviewPage() {
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const { data: subjects = [] } = useSubjects()
  const { data: cards = [] } = useFlashcards()
  const { data: errors = [] } = useErrorItems()
  const { data: plans = [] } = usePlans()
  const { data: items = [] } = usePlanItems()
  const { data: sessions = [] } = useQuizSessions()
  const [error, setError] = useState<unknown>(null)

  const now = new Date()
  const due = cards.filter((c) => new Date(c.due_at) <= now)
  const openErrors = errors.filter((e) => !e.resolved_at)

  // Les matières dont l'examen approche passent en premier
  const ordered = [...subjects].sort((a, b) => (a.exam_date ?? '9999').localeCompare(b.exam_date ?? '9999'))

  if (!subjects.length) {
    return (
      <>
        <PageHeader title="Réviser" />
        <EmptyState title="Crée d’abord une matière" action={<Link to="/matieres"><Button>Mes matières</Button></Link>} />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Réviser" subtitle="Rappel actif et répétition espacée : la méthode la plus efficace pour retenir." />

      <Card className="mb-5 flex flex-wrap items-center gap-4 bg-accent-soft">
        <Brain className="size-9 text-accent-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-bold">
            {due.length} carte{due.length > 1 ? 's' : ''} à réviser aujourd’hui
          </p>
          <p className="text-sm text-muted">
            Environ {Math.max(1, Math.round((due.length * 8) / 60))} min · toutes matières mélangées
          </p>
        </div>
        <Link to="/reviser/cartes">
          <Button size="lg" disabled={!due.length}>
            Commencer
          </Button>
        </Link>
      </Card>

      <ErrorBox error={error} />

      <div className="flex flex-col gap-3">
        {ordered.map((s) => {
          const sd = due.filter((c) => c.subject_id === s.id).length
          const se = openErrors.filter((e) => e.subject_id === s.id).length
          const sp = plans.filter((p) => p.subject_id === s.id)
          const si = items.filter((i) => sp.some((p) => p.id === i.plan_id))
          const last = sessions.find((x) => x.subject_id === s.id && x.finished_at && x.total)
          const exam = s.exam_date ? countdown(s.exam_date + 'T08:00:00') : null
          return (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center gap-2">
                <SubjectDot color={s.color} className="size-3" />
                <Link to={`/matieres/${s.id}`} className="min-w-0 flex-1 truncate text-lg font-semibold hover:underline">
                  {s.name}
                </Link>
                {exam && <Badge tone={exam.tone === 'muted' ? 'accent' : exam.tone}>Examen {exam.label}</Badge>}
                {last && <Badge tone={last.score! / last.total! >= 0.8 ? 'success' : 'muted'}>Dernier QCM {Math.round((last.score! / last.total!) * 100)} %</Badge>}
              </div>
              {si.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>Plan de révision</span>
                    <span>{Math.round(planProgress(si))} %</span>
                  </div>
                  <ProgressBar value={planProgress(si)} color={s.color} label={`Plan ${s.name}`} />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/reviser/cartes?matiere=${s.id}`}>
                  <Button size="sm" variant={sd ? 'primary' : 'secondary'} disabled={!sd} icon={<Brain className="size-4" />}>
                    {sd} carte{sd > 1 ? 's' : ''}
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!se}
                  icon={<AlertTriangle className="size-4" />}
                  onClick={async () => {
                    try {
                      navigate(`/qcm/session/${await startErrorSession(spaceId, s.id)}`)
                    } catch (e) {
                      setError(e)
                    }
                  }}
                >
                  {se} erreur{se > 1 ? 's' : ''}
                </Button>
                <Link to={`/qcm/nouveau?matiere=${s.id}`}>
                  <Button size="sm" variant="secondary" icon={<ListChecks className="size-4" />}>
                    QCM
                  </Button>
                </Link>
                <Link to={`/matieres/${s.id}?onglet=mentales`}>
                  <Button size="sm" variant="secondary" icon={<Network className="size-4" />}>
                    Cartes mentales
                  </Button>
                </Link>
                <Link to={`/matieres/${s.id}?onglet=plans`}>
                  <Button size="sm" variant="ghost" icon={<Plus className="size-4" />}>
                    Plan
                  </Button>
                </Link>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
