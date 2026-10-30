import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Flag, Headphones, Loader2, RotateCcw, Timer, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, cx, EmptyState, ErrorBox, ProgressBar, Spinner } from '@/components/ui'
import { jobProgress, useJobs } from '@/context/jobs'
import { estimateSeconds } from '@/lib/ai'
import { useInvalidate } from '@/lib/data'
import { scoreSummary, sectionSeconds, type ExamQuestion, type ExamSession } from '@/lib/examSession'
import { EXAMS, sectionOf } from '@/lib/exams'
import { speak, speechSupported, splitScript, stopSpeaking, type Line } from '@/lib/speech'
import { must, supabase } from '@/lib/supabase'
import { useStudyTimer } from '@/lib/studyTimer'

const LETTERS = 'ABCDE'
const clock = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`

function useSession(id: string) {
  return useQuery({
    queryKey: ['exam_sessions', 'one', id],
    queryFn: async () => must(await supabase.from('exam_sessions').select('*').eq('id', id).single()) as ExamSession,
    // Pendant la préparation, on surveille l'arrivée des questions
    refetchInterval: (q) => (q.state.data?.status === 'preparing' ? 3000 : false),
  })
}

function useQuestions(session?: ExamSession) {
  const ids = session?.sections.flatMap((s) => s.question_ids ?? []) ?? []
  return useQuery({
    queryKey: ['exam_questions', session?.id, ids.length],
    enabled: !!session && ids.length > 0 && session.status !== 'preparing',
    staleTime: Infinity,
    queryFn: async () => {
      const out: ExamQuestion[] = []
      for (let i = 0; i < ids.length; i += 150) {
        const rows = must(
          await supabase.from('exam_questions').select('id, section, passage_id, passage, question, choices').in('id', ids.slice(i, i + 150)),
        ) as ExamQuestion[]
        out.push(...rows)
      }
      return new Map(out.map((q) => [q.id, q]))
    },
  })
}

// Écoute d'un enregistrement (script lu par la voix de l'appareil)
function Listen({ lines, once, onPlayed, played }: { lines: Line[]; once: boolean; played: boolean; onPlayed: () => void }) {
  const [playing, setPlaying] = useState(false)
  useEffect(() => () => stopSpeaking(), [])
  if (!speechSupported()) return <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Ce navigateur ne sait pas lire l’audio : utilise Chrome, Edge ou Safari.</p>
  const locked = once && played && !playing
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft p-3">
      <Button
        icon={playing ? <Loader2 className="size-4 animate-spin" /> : <Headphones className="size-4" />}
        disabled={playing || locked}
        onClick={async () => {
          setPlaying(true)
          onPlayed()
          try {
            await speak(lines, { pauseMs: 350 })
          } finally {
            setPlaying(false)
          }
        }}
      >
        {playing ? 'Écoute en cours…' : played ? (locked ? 'Déjà écouté' : 'Réécouter') : 'Écouter'}
      </Button>
      <span className="text-sm text-muted">{once ? 'Examen blanc : une seule écoute, comme le jour J.' : 'Entraînement : tu peux réécouter.'}</span>
    </div>
  )
}

function Results({ session, questions }: { session: ExamSession; questions: Map<string, ExamQuestion> }) {
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const { data: correction } = useQuery({
    queryKey: ['exam_correction', session.id],
    queryFn: async () => {
      const rows = must(await supabase.rpc('get_exam_correction', { p_session: session.id })) as { question_id: string; correct_index: number; explanation: string }[]
      return new Map(rows.map((r) => [r.question_id, r]))
    },
  })
  const summary = scoreSummary(session.exam, session.result ?? [])
  const def = EXAMS[session.exam]

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/entrainements" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:underline">
        <ArrowLeft className="size-4" /> Entraînements
      </Link>
      <Card className="mb-5 bg-accent-soft">
        <p className="text-sm text-muted">{session.mode === 'full' ? `Examen blanc ${def.short}` : def.short} · {session.finished_at && new Date(session.finished_at).toLocaleDateString('fr-FR')}</p>
        <p className="font-display text-3xl font-bold">{summary.total}</p>
        {session.exam === 'toeic' && <p className="mt-1 text-xs text-muted">Score estimé : la conversion officielle varie d’une session à l’autre.</p>}
      </Card>
      <div className="mb-6 flex flex-col gap-2">
        {summary.lines.map((l) => (
          <div key={l.key} className="flex flex-wrap items-baseline gap-x-3 rounded-xl border border-border bg-surface px-3 py-2">
            <span className="min-w-0 flex-1 font-medium">{l.label}</span>
            <span className="text-sm text-muted">{l.detail}</span>
            <span className="w-20 text-right font-semibold">{l.value}</span>
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <h2 className="flex-1 text-lg font-semibold">Correction</h2>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="accent-[var(--accent)]" /> Seulement mes erreurs
        </label>
      </div>
      {!correction ? (
        <Spinner />
      ) : (
        session.sections.map((sec) => {
          const sdef = sectionOf(session.exam, sec.key)
          const items = (sec.question_ids ?? [])
            .map((id, i) => ({ id, i, q: questions.get(id), c: correction.get(id), a: session.answers[id] }))
            .filter((x) => x.q && (!onlyErrors || x.a !== x.c?.correct_index))
          if (!items.length) return null
          return (
            <section key={sec.key} className="mb-6">
              <h3 className="mb-2 font-semibold text-muted">{sdef?.label}</h3>
              <div className="flex flex-col gap-2">
                {items.map(({ id, i, q, c, a }) => {
                  const ok = a === c?.correct_index
                  const blank = a === undefined
                  return (
                    <Card key={id}>
                      <div className="mb-2 flex items-start gap-2">
                        <span className={cx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', blank ? 'bg-muted' : ok ? 'bg-success' : 'bg-danger')}>
                          {blank ? '–' : ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                        </span>
                        <p className="min-w-0 flex-1 whitespace-pre-wrap font-medium">
                          {i + 1}. {q!.question}
                        </p>
                      </div>
                      {q!.passage && (
                        <div className="mb-2">
                          <button type="button" onClick={() => setOpen(open === id ? null : id)} className="inline-flex items-center gap-1 text-sm text-accent-ink">
                            <ChevronDown className={cx('size-4 transition-transform', open === id && 'rotate-180')} />
                            {sdef?.audio ? 'Voir le script' : 'Voir le texte'}
                          </button>
                          {open === id && <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{q!.passage}</p>}
                        </div>
                      )}
                      <ul className="flex flex-col gap-1 text-sm">
                        {q!.choices.map((ch, j) => (
                          <li
                            key={j}
                            className={cx(
                              'rounded-lg px-2 py-1',
                              j === c?.correct_index && 'bg-success-soft font-medium text-success',
                              j === a && j !== c?.correct_index && 'bg-danger-soft text-danger line-through',
                            )}
                          >
                            {LETTERS[j]}. {ch}
                          </li>
                        ))}
                      </ul>
                      {c?.explanation && <p className="mt-2 text-sm text-muted">{c.explanation}</p>}
                    </Card>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
      <Link to="/entrainements">
        <Button icon={<RotateCcw className="size-4" />}>Nouvelle épreuve</Button>
      </Link>
    </div>
  )
}

export default function ExamRunPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const { find, start } = useJobs()
  const { data: session, isLoading, error } = useSession(id)
  const { data: questions } = useQuestions(session)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [index, setIndex] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [played, setPlayed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<unknown>(null)
  const loaded = useRef(false)

  // Reprise : réponses déjà données
  useEffect(() => {
    if (session && !loaded.current && session.status !== 'preparing') {
      loaded.current = true
      setAnswers(session.answers ?? {})
    }
  }, [session])

  const secIndex = session?.current_section ?? 0
  const sec = session?.sections[secIndex]
  const def = session && sec ? sectionOf(session.exam, sec.key) : undefined
  const ids = useMemo(() => sec?.question_ids ?? [], [sec])
  const seconds = session && sec ? sectionSeconds(session.exam, sec.key, ids.length) : 0
  const running = session?.status === 'in_progress' && !!sec?.started_at && !sec?.finished_at
  const elapsed = running ? Math.floor((now - new Date(sec!.started_at!).getTime()) / 1000) : 0
  const limited = !!session?.timed && !def?.audio
  const remaining = seconds - elapsed
  useStudyTimer('exam', null, running)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  // Sauvegarde régulière des réponses (reprise possible après fermeture)
  const save = useCallback(
    async (patch: Partial<ExamSession>) => {
      const { error: e } = await supabase.from('exam_sessions').update(patch).eq('id', id)
      if (e) throw e
      qc.setQueryData(['exam_sessions', 'one', id], (old: ExamSession | undefined) => (old ? { ...old, ...patch } : old))
    },
    [id, qc],
  )
  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => save({ answers }).catch(() => {}), 800)
    return () => clearTimeout(t)
  }, [answers, running, save])

  async function startSection() {
    if (!session) return
    const sections = session.sections.map((s, i) => (i === secIndex ? { ...s, started_at: new Date().toISOString() } : s))
    await save({ sections, status: 'in_progress', started_at: session.started_at ?? new Date().toISOString() })
    setIndex(0)
    setNow(Date.now())
  }

  const endSection = useCallback(async () => {
    if (!session || busy) return
    setBusy(true)
    stopSpeaking()
    try {
      const sections = session.sections.map((s, i) => (i === secIndex ? { ...s, finished_at: new Date().toISOString() } : s))
      if (secIndex < session.sections.length - 1) {
        await save({ sections, current_section: secIndex + 1, answers })
        setIndex(0)
      } else {
        await save({ sections, answers })
        must(await supabase.rpc('finish_exam_session', { p_session: id, p_answers: answers }))
        await qc.invalidateQueries({ queryKey: ['exam_sessions', 'one', id] })
        invalidate('exam_sessions')
      }
    } catch (e) {
      setActionError(e)
    } finally {
      setBusy(false)
    }
  }, [session, busy, secIndex, save, answers, id, qc, invalidate])

  // Temps écoulé : la section se termine d'elle-même
  useEffect(() => {
    if (running && limited && remaining <= 0) endSection()
  }, [running, limited, remaining, endSection])

  if (isLoading) return <Spinner />
  if (error || !session) return <EmptyState title="Épreuve introuvable" action={<Link to="/entrainements">Retour</Link>} />
  const exam = EXAMS[session.exam]

  if (session.status === 'finished' && questions) return <Results session={session} questions={questions} />

  if (session.status === 'preparing' || session.status === 'error') {
    const job = find((j) => j.kind === 'exam' && j.params.session_id === id)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">{session.mode === 'full' ? `Examen blanc ${exam.short}` : exam.short}</h1>
          {session.status === 'preparing' ? (
            <>
              <ProgressBar value={job ? jobProgress(job) : 15} label="Préparation des questions" />
              <p className="text-sm text-muted">{job?.result?.phase ?? 'L’IA prépare des questions originales…'} Tu peux quitter cette page : l’épreuve sera prête dans « Entraînements ».</p>
            </>
          ) : (
            <>
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{session.error ?? 'La préparation a échoué.'}</p>
              <Button
                icon={<RotateCcw className="size-4" />}
                onClick={async () => {
                  await save({ status: 'preparing', error: null })
                  const total = session.sections.reduce((n, s) => n + (s.count ?? 0), 0)
                  await start('exam', { session_id: id }, { label: `Épreuve ${exam.short}`, estimateSec: estimateSeconds('exam', total), link: `/entrainements/${id}`, linkLabel: 'Commencer' })
                }}
              >
                Réessayer
              </Button>
            </>
          )}
          <Link to="/entrainements" className="text-sm text-accent-ink hover:underline">
            Retour aux entraînements
          </Link>
        </Card>
      </div>
    )
  }

  if (!questions || !sec || !def) return <Spinner />

  // Avant une section : consignes et lancement du chrono
  if (!sec.started_at) {
    const isFirst = secIndex === 0
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {session.mode === 'full' ? `Examen blanc ${exam.short} · section ${secIndex + 1} sur ${session.sections.length}` : exam.short}
          </p>
          <h1 className="text-2xl font-bold">{def.label}</h1>
          <p className="text-muted">
            {ids.length} questions{limited ? ` · ${clock(seconds)} minutes` : ''}
            {def.audio && ' · audio lu par ton appareil (monte le son ou mets des écouteurs)'}
          </p>
          <ul className="list-disc space-y-1 rounded-2xl bg-surface-2 py-3 pl-8 pr-3 text-sm text-muted">
            {session.exam === 'tage' && <li>Barème : +4 par bonne réponse, −1 par erreur, 0 sans réponse. Dans le doute, ne réponds pas.</li>}
            {limited && <li>Le chrono démarre maintenant. À la fin du temps, la section se termine automatiquement.</li>}
            <li>Tu peux passer d’une question à l’autre dans la section.</li>
            {session.mode === 'full' && <li>Une section terminée ne peut plus être modifiée.</li>}
            <li>Les réponses et les corrections s’affichent à la fin de l’épreuve.</li>
          </ul>
          <Button size="lg" icon={<Timer className="size-5" />} onClick={startSection}>
            {isFirst ? 'Commencer l’épreuve' : 'Commencer la section'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/entrainements')}>
            Plus tard
          </Button>
        </Card>
      </div>
    )
  }

  const qid = ids[Math.min(index, ids.length - 1)]
  const q = questions.get(qid)
  if (!q) return <Spinner />
  const answeredCount = ids.filter((x) => answers[x] !== undefined).length
  const hidden = !!def.hiddenChoices
  const lines: Line[] = def.audio
    ? q.passage
      ? splitScript(q.passage)
      : [{ speaker: 'W', text: q.question }, ...q.choices.map((c, j) => ({ speaker: 'M' as const, text: `${LETTERS[j]}. ${c}` }))]
    : []
  const playKey = q.passage_id ?? q.id
  const choose = (j: number) => setAnswers((a) => (a[qid] === j ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== qid)) : { ...a, [qid]: j }))

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-4">
      {/* Barre de l'épreuve */}
      <header className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="min-w-[min(100%,14rem)] flex-1">
          <p className="truncate text-xs text-muted">
            {exam.short}
            {session.sections.length > 1 && ` · section ${secIndex + 1} / ${session.sections.length}`}
          </p>
          <p className="truncate font-semibold">{def.label}</p>
        </div>
        <span
          className={cx('rounded-full px-3 py-1 font-display text-lg font-bold tabular-nums', limited && remaining <= 60 ? 'bg-danger-soft text-danger' : 'bg-surface-2')}
          aria-label={limited ? `Temps restant ${clock(remaining)}` : `Temps écoulé ${clock(elapsed)}`}
        >
          {limited ? clock(remaining) : clock(elapsed)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          icon={<Flag className="size-4" />}
          loading={busy}
          onClick={() => {
            const left = ids.length - answeredCount
            if (confirm(left ? `${left} question${left > 1 ? 's' : ''} sans réponse. Terminer la section ?` : 'Terminer la section ?')) endSection()
          }}
        >
          Terminer
        </Button>
      </header>
      <ErrorBox error={actionError} />

      <div className={cx('grid flex-1 gap-4', q.passage && !def.audio && 'lg:grid-cols-2')}>
        {q.passage && !def.audio && (
          <Card className="max-h-[70dvh] overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed lg:sticky lg:top-24">{q.passage}</Card>
        )}
        <div className="flex flex-col gap-4">
          {def.audio && <Listen key={playKey} lines={lines} once={session.mode === 'full'} played={played.has(playKey)} onPlayed={() => setPlayed((p) => new Set(p).add(playKey))} />}
          <div>
            <p className="mb-1 text-sm text-muted">
              Question {index + 1} / {ids.length}
            </p>
            {!hidden && <p className="whitespace-pre-wrap text-lg font-medium">{q.question}</p>}
            {hidden && <p className="text-lg font-medium">Écoute la phrase et les trois réponses, puis choisis la bonne.</p>}
          </div>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Réponses">
            {q.choices.map((c, j) => (
              <button
                key={j}
                type="button"
                role="radio"
                aria-checked={answers[qid] === j}
                onClick={() => choose(j)}
                className={cx(
                  'flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                  answers[qid] === j ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
                )}
              >
                <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold', answers[qid] === j ? 'border-accent bg-accent text-white' : 'border-border')}>
                  {LETTERS[j]}
                </span>
                {!hidden && <span className="pt-0.5">{c}</span>}
              </button>
            ))}
          </div>
          {answers[qid] !== undefined && <p className="text-xs text-muted">Touche à nouveau ta réponse pour la retirer (sans réponse).</p>}
          <div className="flex gap-2">
            <Button variant="secondary" icon={<ArrowLeft className="size-4" />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
              Précédente
            </Button>
            <span className="flex-1" />
            {index < ids.length - 1 ? (
              <Button icon={<ArrowRight className="size-4" />} onClick={() => setIndex(index + 1)}>
                Suivante
              </Button>
            ) : (
              <Button icon={<Flag className="size-4" />} loading={busy} onClick={() => confirm('Terminer la section ?') && endSection()}>
                Terminer la section
              </Button>
            )}
          </div>
          {/* Grille des questions de la section */}
          <div className="flex flex-wrap gap-1.5" aria-label="Aller à une question">
            {ids.map((x, i) => (
              <button
                key={x}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Question ${i + 1}${answers[x] !== undefined ? ', répondue' : ''}`}
                aria-current={i === index}
                className={cx(
                  'size-8 rounded-lg text-xs font-semibold',
                  i === index ? 'ring-2 ring-accent' : '',
                  answers[x] !== undefined ? 'bg-accent text-white' : 'bg-surface-2 text-muted',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Badge tone="muted">
              {answeredCount} / {ids.length} répondues
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

