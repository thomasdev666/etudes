import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PartyPopper, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, cx, ErrorBox, IconButton, ProgressBar, Spinner, SubjectChip } from '@/components/ui'
import { useSpace } from '@/context/space'
import { celebrate } from '@/lib/confetti'
import { useInvalidate, useSubjectMap } from '@/lib/data'
import { GRADE_LABELS, previewLabel, review, type Grade } from '@/lib/sm2'
import { isNetworkError, queueReview } from '@/lib/offline'
import { must, supabase } from '@/lib/supabase'
import { timerLabel, useStudyTimer } from '@/lib/studyTimer'
import type { Flashcard } from '@/lib/types'

const SESSION_MAX = 80
const GRADE_STYLE: Record<Grade, string> = {
  0: 'border-danger/40 text-danger hover:bg-danger-soft',
  1: 'border-warning/40 text-warning hover:bg-warning-soft',
  2: 'border-success/40 text-success hover:bg-success-soft',
  3: 'border-accent/40 text-accent-ink hover:bg-accent-soft',
}

// Alterne les matières (l'entrelacement améliore la mémorisation)
function interleave(cards: Flashcard[]) {
  const groups = new Map<string, Flashcard[]>()
  for (const c of cards) groups.set(c.subject_id, [...(groups.get(c.subject_id) ?? []), c])
  const lists = [...groups.values()]
  const out: Flashcard[] = []
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(l.shift()!)
  return out
}

export default function FlashcardSession() {
  const [params] = useSearchParams()
  const subjectId = params.get('matiere')
  const { spaceId } = useSpace()
  const study = useStudyTimer('cards', subjectId)
  const navigate = useNavigate()
  const invalidate = useInvalidate()
  const subjects = useSubjectMap()
  const [queue, setQueue] = useState<Flashcard[] | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [stats, setStats] = useState({ reviewed: 0, success: 0, total: 0 })
  const [error, setError] = useState<unknown>(null)
  const [offline, setOffline] = useState(false)
  const qc = useQueryClient()
  const shownAt = useRef(Date.now())
  const celebrated = useRef(false)
  // Un pavé tactile peut envoyer deux clics : on ignore les actions trop rapprochées
  const lockUntil = useRef(0)
  const locked = () => Date.now() < lockUntil.current
  const lock = () => (lockUntil.current = Date.now() + 450)
  function flip() {
    if (flipped || locked()) return
    lock()
    setFlipped(true)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['flashcards', spaceId, 'due', subjectId],
    queryFn: async () => {
      try {
        let q = supabase.from('flashcards').select('*').eq('space_id', spaceId).is('deleted_at', null).lte('due_at', new Date().toISOString())
        if (subjectId) q = q.eq('subject_id', subjectId)
        return must(await q.order('due_at').limit(SESSION_MAX)) as Flashcard[]
      } catch (e) {
        if (!isNetworkError(e)) throw e
        // Hors ligne : les cartes déjà chargées sur l'appareil
        const now = new Date()
        const cached = (qc.getQueryData<Flashcard[]>(['flashcards', spaceId]) ?? []).filter(
          (c) => !c.deleted_at && new Date(c.due_at) <= now && (!subjectId || c.subject_id === subjectId),
        )
        setOffline(true)
        return cached.sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, SESSION_MAX)
      }
    },
    networkMode: 'always',
    staleTime: Infinity,
  })

  useEffect(() => {
    if (data && queue === null) {
      setQueue(interleave(data))
      setStats((s) => ({ ...s, total: data.length }))
    }
  }, [data, queue])

  const card = queue?.[0]
  const finished = queue !== null && !card

  useEffect(() => {
    if (finished && stats.reviewed > 0 && stats.success / stats.reviewed > 0.8 && !celebrated.current) {
      celebrated.current = true
      celebrate()
    }
    if (finished) invalidate('flashcards')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  async function grade(g: Grade) {
    if (!card || !queue || !flipped || locked()) return
    lock()
    const r = review(card, g)
    const updated: Flashcard = { ...card, ...r, due_at: r.due_at.toISOString(), last_reviewed_at: new Date().toISOString() }
    // Carte ratée : elle revient en fin de session
    setQueue(r.interval_days === 0 ? [...queue.slice(1), updated] : queue.slice(1))
    setFlipped(false)
    setStats((s) => ({ ...s, reviewed: s.reviewed + 1, success: s.success + (g > 0 ? 1 : 0) }))
    const duration = Date.now() - shownAt.current
    shownAt.current = Date.now()
    const patch = {
      interval_days: r.interval_days,
      ease: r.ease,
      repetitions: r.repetitions,
      lapses: r.lapses,
      due_at: updated.due_at,
      last_reviewed_at: updated.last_reviewed_at,
    }
    const reviewRow = { space_id: spaceId, flashcard_id: card.id, grade: g, interval_days: r.interval_days, ease: r.ease, duration_ms: duration }
    // Garde la carte à jour dans le cache, pour une session hors ligne cohérente
    qc.setQueryData<Flashcard[]>(['flashcards', spaceId], (list) => list?.map((c) => (c.id === card.id ? updated : c)))
    try {
      must(await supabase.from('flashcards').update(patch).eq('id', card.id))
      must(await supabase.from('flashcard_reviews').insert(reviewRow))
    } catch (e) {
      if (isNetworkError(e)) {
        queueReview({ cardId: card.id, patch, review: reviewRow })
        setOffline(true)
      } else setError(e)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card) return
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        flip()
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        grade((Number(e.key) - 1) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (isLoading || queue === null) return <Spinner />
  const subject = card ? subjects.get(card.subject_id) : subjectId ? subjects.get(subjectId) : undefined

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
          <IconButton label="Quitter la session" onClick={() => navigate(-1)}>
            <X className="size-5" />
          </IconButton>
          <div className="flex-1">
            <ProgressBar value={stats.total ? (Math.min(stats.reviewed, stats.total) / stats.total) * 100 : 100} color={subject?.color} label="Avancement" />
          </div>
          <span className="hidden text-xs text-muted sm:inline" title="Temps de travail (pause après 10 minutes sans action)">
            ⏱ {study.idle ? 'en pause' : timerLabel(study.seconds)}
          </span>
          <span className="text-sm tabular-nums text-muted">{queue.length} restantes</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 pb-safe">
        {finished ? (
          <div className="anim-pop m-auto flex flex-col items-center gap-3 text-center">
            <PartyPopper className="size-12 text-accent-ink" aria-hidden />
            <h1 className="text-2xl font-bold">{stats.reviewed ? 'Session terminée' : 'Rien à réviser'}</h1>
            <p className="max-w-sm text-muted">
              {stats.reviewed
                ? `${stats.reviewed} révision${stats.reviewed > 1 ? 's' : ''}, ${Math.round((stats.success / stats.reviewed) * 100)} % de réussite. Les cartes reviendront au bon moment.`
                : 'Toutes tes cartes sont à jour. Reviens demain, ou ajoute de nouvelles cartes.'}
            </p>
            <Link to={subjectId ? `/matieres/${subjectId}?onglet=cartes` : '/reviser'}>
              <Button>Terminer</Button>
            </Link>
          </div>
        ) : (
          card && (
            <>
              {subject && (
                <div className="mb-3">
                  <SubjectChip name={subject.name} color={subject.color} />
                </div>
              )}
              <div className="flip flex-1">
                <button
                  type="button"
                  onClick={flip}
                  aria-label={flipped ? 'Réponse affichée' : 'Afficher la réponse'}
                  className={cx('flip-inner block h-full min-h-72 w-full text-left', flipped && 'flipped')}
                >
                  <div className="flip-face flex h-full min-h-72 flex-col rounded-3xl border border-border bg-surface p-6 shadow-card">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">Question</span>
                    <p className="m-auto whitespace-pre-wrap text-center text-xl font-medium leading-relaxed sm:text-2xl">{card.front}</p>
                    <span className="text-center text-sm text-muted">Touchez ou appuyez sur Espace pour voir la réponse</span>
                  </div>
                  <div className="flip-face flip-back flex flex-col rounded-3xl border border-border bg-surface p-6 shadow-card">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">Réponse</span>
                    <p className="mt-2 text-sm text-muted">{card.front}</p>
                    <p className="m-auto whitespace-pre-wrap text-center text-lg leading-relaxed sm:text-xl">{card.back}</p>
                  </div>
                </button>
              </div>
              <div className="mt-5 min-h-20">
                {flipped ? (
                  <>
                  <p className="mb-2 text-center text-xs text-muted">Tu la connaissais ? Sous chaque bouton : quand la carte reviendra.</p>
                  <div className="anim-pop grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([0, 1, 2, 3] as Grade[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => grade(g)}
                        className={cx('flex flex-col items-center rounded-2xl border-2 bg-surface px-2 py-2.5 font-medium transition-colors', GRADE_STYLE[g])}
                      >
                        <span className="text-sm">{GRADE_LABELS[g]}</span>
                        <span className="text-xs opacity-80">{previewLabel(card, g)}</span>
                      </button>
                    ))}
                  </div>
                  </>
                ) : (
                  <Button size="lg" className="w-full" onClick={flip}>
                    Afficher la réponse
                  </Button>
                )}
              </div>
              <div className="mt-3">
                {offline && <p className="text-sm text-muted">Hors ligne : tes réponses sont gardées sur l’appareil et seront envoyées au retour du réseau.</p>}
                <ErrorBox error={error} />
              </div>
            </>
          )
        )}
      </main>
    </div>
  )
}
