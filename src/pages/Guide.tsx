import { Check, ChevronRight, Lock, Plus, Rocket, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AssignmentForm } from '@/components/AssignmentForm'
import { CalendarConnect } from '@/components/CalendarConnect'
import { CourseImport } from '@/components/CourseImport'
import { GenerateCardsModal, GenerateMindmapModal } from '@/components/Generate'
import { Button, Card, cx, Input, ProgressBar, Select, Spinner, SubjectDot } from '@/components/ui'
import { useSpace } from '@/context/space'
import { SUBJECT_PALETTE } from '@/lib/colors'
import { useFlashcards, useInsert, useSubjects, useTrash, useUpdate } from '@/lib/data'
import { useOnboarding, type Step, type StepId } from '@/lib/onboarding'
import { must, supabase } from '@/lib/supabase'
import type { Subject } from '@/lib/types'

function SubjectsStep({ onDone }: { onDone: () => void }) {
  const { data: subjects = [] } = useSubjects()
  const insert = useInsert<Subject>('subjects')
  const trash = useTrash('subjects')
  const [name, setName] = useState('')

  function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    insert.mutate({ name: name.trim(), color: SUBJECT_PALETTE[subjects.length % SUBJECT_PALETTE.length].hex, position: subjects.length })
    setName('')
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la matière, puis Entrée" aria-label="Nouvelle matière" autoFocus />
        <Button type="submit" disabled={!name.trim()} loading={insert.isPending} aria-label="Ajouter">
          <Plus className="size-4" />
        </Button>
      </form>
      {subjects.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm">
              <SubjectDot color={s.color} />
              {s.name}
              <button type="button" aria-label={`Retirer ${s.name}`} onClick={() => trash.mutate(s.id)} className="rounded-full p-1 text-muted hover:bg-surface-2">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Tu pourras changer les couleurs et en ajouter plus tard dans « Matières ».</p>
      <div>
        <Button onClick={onDone} disabled={!subjects.length}>
          J’ai ajouté toutes mes matières
        </Button>
      </div>
    </div>
  )
}

function ExamsStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { data: subjects = [] } = useSubjects()
  const update = useUpdate<Subject>('subjects')
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {subjects.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <SubjectDot color={s.color} className="size-3" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
            <Input
              type="date"
              aria-label={`Date d’examen de ${s.name}`}
              value={s.exam_date ?? ''}
              onChange={(e) => update.mutate({ id: s.id, patch: { exam_date: e.target.value || null } })}
              className="w-44 py-1.5"
            />
          </li>
        ))}
      </ul>
      <StepButtons onDone={onDone} onSkip={onSkip} doneLabel="Continuer" />
    </div>
  )
}

function StepButtons({ onDone, onSkip, doneLabel = 'C’est fait' }: { onDone?: () => void; onSkip?: () => void; doneLabel?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {onDone && <Button onClick={onDone}>{doneLabel}</Button>}
      {onSkip && (
        <Button variant="ghost" onClick={onSkip}>
          Plus tard
        </Button>
      )}
    </div>
  )
}

function StepAction({ step, ob }: { step: Step; ob: ReturnType<typeof useOnboarding> }) {
  const navigate = useNavigate()
  const { spaceId } = useSpace()
  const { data: subjects = [] } = useSubjects()
  const { data: cards = [] } = useFlashcards()
  const [subjectId, setSubjectId] = useState('')
  const [modal, setModal] = useState<'course' | 'cards' | 'mindmap' | 'assignment' | null>(null)
  const sid = subjectId || subjects[0]?.id || ''

  const subjectSelect = (
    <Select value={sid} onChange={(e) => setSubjectId(e.target.value)} aria-label="Matière" className="sm:w-60">
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  )

  const id: StepId = step.id
  return (
    <div className="mt-3">
      {id === 'matieres' && <SubjectsStep onDone={() => ob.confirm('matieres')} />}
      {id === 'agenda' && (
        <div className="flex flex-col gap-3">
          <CalendarConnect />
          <StepButtons onSkip={() => ob.skip('agenda')} />
        </div>
      )}
      {id === 'examens' && <ExamsStep onDone={() => ob.confirm('examens')} onSkip={() => ob.skip('examens')} />}
      {id === 'cours' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {subjectSelect}
          <Button onClick={() => setModal('course')}>Importer un PowerPoint ou un PDF</Button>
        </div>
      )}
      {id === 'qcm' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {subjectSelect}
          <Button onClick={() => navigate(`/qcm/nouveau?matiere=${sid}`)}>Créer mon premier QCM</Button>
        </div>
      )}
      {id === 'cartes' &&
        (cards.length ? (
          <Button onClick={() => navigate('/reviser/cartes')}>Faire ma première révision</Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            {subjectSelect}
            <Button onClick={() => setModal('cards')}>Générer des flash cards</Button>
          </div>
        ))}
      {id === 'mentale' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {subjectSelect}
          <Button onClick={() => setModal('mindmap')}>Générer une carte mentale</Button>
        </div>
      )}
      {id === 'notes' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {subjectSelect}
          <Button
            onClick={async () => {
              const n = must(await supabase.from('notes').insert({ space_id: spaceId, subject_id: sid || null, title: 'Ma première note' }).select('id').single()) as { id: string }
              navigate(`/notes/${n.id}`)
            }}
          >
            Écrire ma première note
          </Button>
        </div>
      )}
      {id === 'devoir' && <Button onClick={() => setModal('assignment')}>Ajouter un devoir</Button>}
      {id === 'plan' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            {subjectSelect}
            <Button onClick={() => navigate(`/matieres/${sid}?onglet=plans`)}>Créer un plan</Button>
          </div>
          <StepButtons onSkip={() => ob.skip('plan')} />
        </div>
      )}
      {id === 'installer' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Ouvre le menu du navigateur et choisis « Ajouter à l’écran d’accueil » (ou « Installer »).</p>
          <StepButtons onDone={() => ob.confirm('installer')} onSkip={() => ob.skip('installer')} />
        </div>
      )}

      {sid && <CourseImport open={modal === 'course'} onClose={() => setModal(null)} subjectId={sid} />}
      <GenerateCardsModal open={modal === 'cards'} onClose={() => setModal(null)} subjectId={sid || undefined} />
      <GenerateMindmapModal open={modal === 'mindmap'} onClose={() => setModal(null)} subjectId={sid || undefined} />
      <AssignmentForm open={modal === 'assignment'} onClose={() => setModal(null)} />
    </div>
  )
}

export function GuideSummary() {
  const ob = useOnboarding()
  if (!ob.available || ob.loading || ob.allDone || ob.hidden || !ob.current) return null
  return (
    <Card className="mb-4 border-accent/30">
      <div className="flex items-center gap-3">
        <Rocket className="size-6 shrink-0 text-accent-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Guide de démarrage · {ob.percent} %</p>
          <p className="truncate text-sm text-muted">Prochaine étape : {ob.current.title}</p>
        </div>
        <Link to="/bienvenue">
          <Button size="sm" icon={<ChevronRight className="size-4" />}>
            Continuer
          </Button>
        </Link>
      </div>
      <div className="mt-3">
        <ProgressBar value={ob.percent} label="Progression du guide" />
      </div>
      <button type="button" onClick={() => ob.setHidden(true)} className="mt-2 text-xs text-muted hover:underline">
        Masquer le guide
      </button>
    </Card>
  )
}

function Row({ step, index, state, children }: { step: Step; index: number; state: 'done' | 'current' | 'locked'; children?: ReactNode }) {
  return (
    <li className={cx('relative flex gap-3 pb-5', state === 'locked' && 'opacity-60')}>
      <span
        className={cx(
          'z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          state === 'done' ? 'bg-success text-white' : state === 'current' ? 'bg-accent text-white' : 'border-2 border-border bg-surface text-muted',
        )}
        aria-hidden
      >
        {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : state === 'locked' ? <Lock className="size-3.5" /> : index + 1}
      </span>
      <div className={cx('min-w-0 flex-1', state === 'current' && 'rounded-2xl border border-accent/40 bg-surface p-4 shadow-card')}>
        <p className="font-semibold">
          <span className="sr-only">Étape {index + 1}{state === 'done' ? ' (terminée)' : state === 'locked' ? ' (à venir)' : ' (en cours)'} : </span>
          {step.title}
          {step.optional && state !== 'done' && <span className="ml-2 text-xs font-normal text-muted">facultatif</span>}
        </p>
        <p className="text-sm text-muted">{step.why}</p>
        {children}
      </div>
    </li>
  )
}

export default function GuidePage() {
  const ob = useOnboarding()
  const navigate = useNavigate()
  if (ob.loading) return <Spinner />
  const currentIndex = ob.steps.findIndex((s) => !s.done)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <p className="text-sm font-medium text-accent-ink">Guide de démarrage</p>
        <h1 className="text-2xl font-bold sm:text-3xl">{ob.setupDone ? 'Découvre toutes les fonctionnalités' : 'Configurons ton espace'}</h1>
        <p className="mt-1 text-muted">
          {ob.setupDone
            ? 'Ton espace est prêt. Suis les étapes pour essayer chaque outil de révision.'
            : 'Quelques étapes pour tout relier avant de commencer : tes matières, ton agenda et tes examens.'}
        </p>
      </div>

      <Card className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-3xl font-bold">{ob.percent} %</span>
          <span className="text-sm text-muted">
            {ob.steps.filter((s) => s.done).length} / {ob.steps.length} étapes
          </span>
        </div>
        <ProgressBar value={ob.percent} label="Progression du guide" />
        {ob.setupDone && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/')}>
              Aller à l’accueil
            </Button>
          </div>
        )}
      </Card>

      {!ob.available && (
        <p className="mb-4 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
          La progression ne peut pas être enregistrée : lance la mise à jour de la base (fichier 0002) dans Supabase.
        </p>
      )}

      <ol className="relative before:absolute before:bottom-6 before:left-4 before:top-2 before:w-0.5 before:bg-border">
        {ob.steps.map((s, i) => {
          const state = s.done ? 'done' : i === currentIndex ? 'current' : 'locked'
          return (
            <Row key={s.id} step={s} index={i} state={state}>
              {state === 'current' && <StepAction step={s} ob={ob} />}
            </Row>
          )
        })}
      </ol>

      {ob.allDone && (
        <Card className="text-center">
          <p className="font-display text-xl font-bold">Bravo, tu connais tout ! 🎉</p>
          <Button className="mt-3" onClick={() => navigate('/')}>
            Commencer à réviser
          </Button>
        </Card>
      )}

      {ob.setupDone && !ob.allDone && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            Continuer plus tard
          </Button>
        </div>
      )}
    </div>
  )
}
