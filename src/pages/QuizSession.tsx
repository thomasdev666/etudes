import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, RotateCcw, Timer, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, cx, ErrorBox, IconButton, ProgressBar, Spinner } from '@/components/ui'
import { useSpace } from '@/context/space'
import { celebrate } from '@/lib/confetti'
import { useInvalidate, useSubjectMap } from '@/lib/data'
import { startErrorSession, startQuizSession } from '@/lib/quiz'
import { timerLabel, useStudyTimer } from '@/lib/studyTimer'
import { must, supabase } from '@/lib/supabase'
import { QUESTION_PUBLIC_COLUMNS, type Correction, type QuizQuestionPublic, type QuizSession } from '@/lib/types'

const LETTERS = ['A', 'B', 'C', 'D']

function Results({ session, corrections }: { session: QuizSession; corrections: Correction[] }) {
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const subjects = useSubjectMap()
  const subject = subjects.get(session.subject_id)
  const score = corrections.filter((c) => c.is_correct).length
  const pct = corrections.length ? (score / corrections.length) * 100 : 0
  const celebrated = useRef(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (pct > 80 && !celebrated.current) {
      celebrated.current = true
      celebrate()
    }
  }, [pct])

  // Notions ratées, de la plus fréquente à la moins fréquente
  const weak = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of corrections) if (!c.is_correct && c.notion) m.set(c.notion, (m.get(c.notion) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [corrections])

  async function again() {
    try {
      const id = session.quiz_id
        ? await startQuizSession(spaceId, { id: session.quiz_id, subject_id: session.subject_id }, { timeLimitSec: session.time_limit_sec ?? undefined })
        : await startErrorSession(spaceId, session.subject_id)
      navigate(`/qcm/session/${id}`, { replace: true })
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="text-center">
        <p className="text-sm text-muted">{session.kind === 'errors' ? 'Révision des erreurs' : 'Résultat'}</p>
        <p className={cx('mt-1 font-display text-5xl font-bold', pct >= 80 ? 'text-success' : pct >= 50 ? 'text-text' : 'text-danger')}>
          {Math.round(pct)} %
        </p>
        <p className="mt-1 text-muted">
          {score} bonne{score > 1 ? 's' : ''} réponse{score > 1 ? 's' : ''} sur {corrections.length}
        </p>
        {session.time_limit_sec && (
          <p className="mt-1 text-sm text-muted">
            Mode examen · temps utilisé{' '}
            {Math.ceil(Math.min(session.time_limit_sec, (new Date(session.finished_at ?? Date.now()).getTime() - new Date(session.started_at).getTime()) / 1000) / 60)} min sur{' '}
            {Math.round(session.time_limit_sec / 60)}
          </p>
        )}
        <div className="mx-auto mt-4 max-w-xs">
          <ProgressBar value={pct} color={pct >= 80 ? 'var(--success)' : subject?.color} label="Score" />
        </div>
        {weak.length > 0 && (
          <div className="mt-5 text-left">
            <p className="text-sm font-semibold">À retravailler en priorité</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {weak.map(([n, k]) => (
                <Badge key={n} tone="danger">
                  {n}
                  {k > 1 ? ` ×${k}` : ''}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">Les questions ratées ont été ajoutées à ta session « Erreurs ».</p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={again}>
            {session.kind === 'errors' ? 'Revoir les erreurs restantes' : 'Refaire ce QCM'}
          </Button>
          <Link to={subject ? `/matieres/${subject.id}?onglet=qcm` : '/reviser'}>
            <Button>Terminer</Button>
          </Link>
        </div>
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      </Card>

      <h2 className="mt-2 text-lg font-semibold">Correction</h2>
      {corrections.map((c, i) => (
        <Card key={c.question_id} className={cx('border-l-4', c.is_correct ? 'border-l-success' : 'border-l-danger')}>
          <div className="flex items-start gap-2">
            <span className={cx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', c.is_correct ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
              {c.is_correct ? <Check className="size-4" aria-label="Juste" /> : <X className="size-4" aria-label="Faux" />}
            </span>
            <p className="font-medium">
              {i + 1}. {c.question}
            </p>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {c.choices.map((ch, j) => (
              <li
                key={j}
                className={cx(
                  'rounded-xl border px-3 py-2 text-sm',
                  j === c.correct_index ? 'border-success bg-success-soft text-success' : j === c.chosen_index ? 'border-danger bg-danger-soft text-danger' : 'border-border',
                )}
              >
                <span className="font-semibold">{c.choices.length > 2 ? LETTERS[j] + '. ' : ''}</span>
                {ch}
                {j === c.chosen_index && <span className="ml-1 text-xs">(ta réponse)</span>}
              </li>
            ))}
            {c.chosen_index === null && <li className="text-sm text-muted">Pas de réponse</li>}
          </ul>
          <p className="mt-3 text-sm leading-relaxed">{c.explanation}</p>
          {c.notion && <p className="mt-2 text-xs text-muted">Notion : {c.notion}</p>}
        </Card>
      ))}
    </div>
  )
}

export default function QuizSessionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const subjects = useSubjectMap()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<QuizSession['progress']>([])
  const [corrections, setCorrections] = useState<Correction[] | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const shownAt = useRef(Date.now())
  // Un pavé tactile peut envoyer deux clics : pas deux questions d'un coup
  const lockUntil = useRef(0)

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['quiz_session', id],
    queryFn: async () => {
      const session = must(await supabase.from('quiz_sessions').select('*').eq('id', id).single()) as QuizSession
      const rows = must(await supabase.from('quiz_questions').select(QUESTION_PUBLIC_COLUMNS).in('id', session.question_ids)) as QuizQuestionPublic[]
      const byId = new Map(rows.map((r) => [r.id, r]))
      const questions = session.question_ids.map((qid) => byId.get(qid)).filter(Boolean) as QuizQuestionPublic[]
      let corr: Correction[] | null = null
      if (session.finished_at) corr = must(await supabase.rpc('get_quiz_correction', { p_session_id: id })) as Correction[]
      return { session, questions, corr }
    },
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!data) return
    setAnswers(data.session.progress ?? [])
    setIndex(Math.min(data.session.current_index, Math.max(0, data.questions.length - 1)))
    setCorrections(data.corr)
    shownAt.current = Date.now()
  }, [data])

  // Temps de travail mesuré (pause automatique après 10 minutes sans action)
  const study = useStudyTimer('quiz', data?.session.subject_id, !!data && !corrections)

  // Mode examen : chrono global, la session se termine d'elle-même à la fin du temps
  const limit = data?.session.time_limit_sec ?? null
  const [now, setNow] = useState(Date.now())
  const endsAt = limit && data ? new Date(data.session.started_at).getTime() + limit * 1000 : null
  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null
  useEffect(() => {
    if (!endsAt || corrections) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [endsAt, corrections])
  const timeUp = useRef(false)
  useEffect(() => {
    if (remaining === 0 && !corrections && !timeUp.current) {
      timeUp.current = true
      finish()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, corrections])

  const questions = data?.questions ?? []
  const q = questions[index]
  const current = answers.find((a) => a.question_id === q?.id)

  function choose(choice: number) {
    if (!q) return
    const elapsed = Date.now() - shownAt.current
    setAnswers((all) => {
      const prev = all.find((a) => a.question_id === q.id)
      const rest = all.filter((a) => a.question_id !== q.id)
      return [...rest, { question_id: q.id, chosen_index: choice, time_ms: (prev?.time_ms ?? 0) + elapsed }]
    })
    shownAt.current = Date.now()
  }

  async function persist(nextIndex: number, list = answers) {
    await supabase.from('quiz_sessions').update({ progress: list, current_index: nextIndex }).eq('id', id)
  }

  async function next() {
    if (Date.now() < lockUntil.current || finishing) return
    lockUntil.current = Date.now() + 500
    if (index < questions.length - 1) {
      setIndex(index + 1)
      shownAt.current = Date.now()
      persist(index + 1)
    } else {
      await finish()
    }
  }

  async function finish() {
    setFinishing(true)
    setError(null)
    try {
      await persist(index)
      const corr = must(await supabase.rpc('finish_quiz_session', { p_session_id: id })) as Correction[]
      setCorrections(corr)
      qc.setQueryData(['quiz_session', id], (old: typeof data) => (old ? { ...old, session: { ...old.session, finished_at: new Date().toISOString() }, corr } : old))
      invalidate('quiz_sessions', 'error_items')
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e)
    } finally {
      setFinishing(false)
    }
  }

  // Raccourcis clavier : 1-4 / A-D pour répondre, Entrée pour continuer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (corrections || !q || e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      const n = ['1', '2', '3', '4'].indexOf(k) >= 0 ? Number(k) - 1 : ['a', 'b', 'c', 'd'].indexOf(k)
      if (n >= 0 && n < q.choices.length) choose(n)
      if (e.key === 'Enter' && current) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (isLoading) return <Spinner />
  if (loadError || !data) return <div className="p-6"><ErrorBox error={loadError ?? 'Session introuvable'} /></div>
  const subject = subjects.get(data.session.subject_id)

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
          <IconButton label="Quitter (ta progression est gardée)" onClick={() => navigate(-1)}>
            <X className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            {!corrections && <ProgressBar value={((index + (current ? 1 : 0)) / Math.max(1, questions.length)) * 100} color={subject?.color} label="Avancement" />}
          </div>
          {!corrections && remaining !== null && (
            <span
              className={cx('flex items-center gap-1 rounded-full px-2.5 py-0.5 font-display font-bold tabular-nums', remaining <= 60 ? 'bg-danger-soft text-danger' : 'bg-surface-2')}
              aria-label={`Temps restant ${Math.floor(remaining / 60)} minutes ${remaining % 60} secondes`}
            >
              <Timer className="size-4" aria-hidden />
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </span>
          )}
          {!corrections && remaining === null && (
            <span className="hidden text-xs text-muted sm:inline" title="Temps de travail (pause après 10 minutes sans action)">
              ⏱ {study.idle ? 'en pause' : timerLabel(study.seconds)}
            </span>
          )}
          <span className="text-sm tabular-nums text-muted">{corrections ? subject?.name : `${index + 1} / ${questions.length}`}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-safe">
        {corrections ? (
          <Results session={data.session} corrections={corrections} />
        ) : q ? (
          <div key={q.id} className="anim-pop flex flex-col gap-5">
            {data.session.kind === 'errors' && <Badge tone="warning">Révision des erreurs</Badge>}
            {remaining !== null && index === 0 && !current && (
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Mode examen : tu peux passer une question et y revenir. À la fin du temps, ta copie est rendue automatiquement.</p>
            )}
            <h1 className="font-sans text-xl font-semibold leading-snug sm:text-2xl">{q.question}</h1>
            <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Réponses">
              {q.choices.map((c, i) => {
                const selected = current?.chosen_index === i
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choose(i)}
                    className={cx(
                      'flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all duration-150',
                      selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-accent/50',
                    )}
                  >
                    <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold', selected ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}>
                      {q.choices.length > 2 ? LETTERS[i] : i === 0 ? 'V' : 'F'}
                    </span>
                    <span>{c}</span>
                  </button>
                )
              })}
            </div>
            <ErrorBox error={error} />
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                icon={<ArrowLeft className="size-4" />}
                disabled={index === 0}
                onClick={() => {
                  setIndex(index - 1)
                  shownAt.current = Date.now()
                }}
              >
                Précédente
              </Button>
              <Button onClick={next} disabled={!current && remaining === null} loading={finishing} icon={index === questions.length - 1 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}>
                {index === questions.length - 1 ? 'Terminer et voir la correction' : 'Suivante'}
              </Button>
            </div>
            <p className="hidden text-center text-xs text-muted sm:block">Raccourcis : touches 1 à 4 pour répondre, Entrée pour continuer.</p>
          </div>
        ) : (
          <ErrorBox error="Aucune question dans cette session." />
        )}
      </main>
    </div>
  )
}
