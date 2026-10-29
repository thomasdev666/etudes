import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, Flame, Layers } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, cx, EmptyState, ErrorBox, PageHeader, Spinner, SubjectDot } from '@/components/ui'
import { useSpace } from '@/context/space'
import { fmt } from '@/lib/dates'
import { useFlashcards, useQuizSessions, useQuizzes, useSubjectMap, useSubjects } from '@/lib/data'
import { startErrorSession } from '@/lib/quiz'
import {
  ACTIVITY_LABEL,
  bySubject,
  dailyStudy,
  durationLabel,
  recentTime,
  streak,
  studyByKey,
  weakNotions,
  weeklySuccess,
  type AnswerRow,
  type DayStudy,
  type ReviewRow,
  type StudyRow,
  type WeekPoint,
} from '@/lib/stats'
import { supabase } from '@/lib/supabase'

// Lecture complète d'une table (Supabase renvoie au plus 1 000 lignes par requête)
async function fetchAll<T>(table: string, columns: string, spaceId: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).eq('space_id', spaceId).is('deleted_at', null).range(from, from + 999)
    if (error) throw error
    out.push(...(data as T[]))
    if (data.length < 1000) return out
  }
}

function useStatsData() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: ['stats', spaceId],
    enabled: !!spaceId,
    queryFn: async () => {
      const [answers, reviews, questions, study] = await Promise.all([
        fetchAll<AnswerRow>('quiz_answers', 'session_id, question_id, is_correct, time_ms, answered_at', spaceId),
        fetchAll<ReviewRow>('flashcard_reviews', 'flashcard_id, grade, duration_ms, reviewed_at', spaceId),
        fetchAll<{ id: string; notion: string }>('quiz_questions', 'id, notion', spaceId),
        // Temps mesuré par le chronomètre (table absente sans la mise à jour 0011)
        fetchAll<StudyRow>('study_sessions', 'subject_id, activity, started_at, active_seconds', spaceId).catch(() => [] as StudyRow[]),
      ])
      return { answers, reviews, questions, study }
    },
  })
}

function Tile({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <Card className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">{icon}</span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold leading-tight">{value}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </Card>
  )
}

// Courbe du taux de réussite par semaine (une seule série : pas de légende, le titre la nomme)
function TrendChart({ points: all }: { points: WeekPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  // Dessin à la taille réelle (le texte garde sa taille sur téléphone)
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Sur un petit écran, les 6 dernières semaines seulement
  const points = W < 480 ? all.slice(-6) : all
  const H = 220
  const pad = { l: 40, r: 16, t: 16, b: 28 }
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1)
  const y = (v: number) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100
  // Segments continus entre semaines avec QCM ; une semaine vide coupe la ligne
  const segments: string[] = []
  let cur = ''
  points.forEach((p, i) => {
    if (p.rate === null) {
      if (cur) segments.push(cur)
      cur = ''
    } else cur += `${cur ? 'L' : 'M'}${x(i)},${y(p.rate)}`
  })
  if (cur) segments.push(cur)
  const hp = hover !== null ? points[hover] : null

  return (
    <div className="relative" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Taux de réussite aux QCM par semaine" onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {v} %
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % 2 === points.length % 2 ? null : (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {fmt(p.week, 'd MMM')}
            </text>
          ),
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p, i) =>
          p.rate === null ? null : <circle key={i} cx={x(i)} cy={y(p.rate)} r={hover === i ? 5.5 : 4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />,
        )}
        {/* Zones de survol plus larges que les points */}
        {points.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - pad.l - pad.r) / (2 * Math.max(1, points.length - 1))}
            y={pad.t}
            width={(W - pad.l - pad.r) / Math.max(1, points.length - 1)}
            height={H - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover!) / W) * 100}%` }}
        >
          <p className="font-semibold">Semaine du {fmt(hp.week, 'd MMMM')}</p>
          <p className="text-muted">{hp.rate === null ? 'Aucun QCM' : `${hp.rate} % de bonnes réponses (${hp.correct} / ${hp.total})`}</p>
        </div>
      )}
      {/* Version texte pour les lecteurs d'écran */}
      <table className="sr-only">
        <caption>Taux de réussite par semaine</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th>Semaine du {fmt(p.week, 'd MMMM')}</th>
              <td>{p.rate === null ? 'aucun QCM' : `${p.rate} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Barres du temps de travail par jour (une seule série : le titre la nomme)
function DailyChart({ days }: { days: DayStudy[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(30 * 60, ...days.map((d) => d.seconds))
  const H = 140
  const hd = hover !== null ? days[hover] : null
  // Repères discrets : toutes les heures (ou la demi-heure si les journées sont courtes)
  const step = max >= 2 * 3600 ? 3600 : 1800
  const marks = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step).slice(-4)
  return (
    <div className="relative pl-10">
      {marks.map((m) => (
        <div key={m} className="pointer-events-none absolute left-0 right-0 flex items-center gap-1" style={{ bottom: 18 + 4 + (m / max) * (H - 4) - 6 }} aria-hidden>
          <span className="w-9 whitespace-nowrap text-right text-[10px] text-muted">{m % 3600 ? `${m / 60} min` : `${m / 3600} h`}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ))}
      <div className="relative flex items-end gap-1 sm:gap-1.5" style={{ height: H }} role="img" aria-label="Temps de travail par jour sur 14 jours" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            className="flex h-full flex-1 flex-col justify-end"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${fmt(d.day, 'EEEE d MMMM')} : ${durationLabel(d.seconds * 1000)}`}
          >
            <span
              className={cx('block w-full rounded-t-[4px]', d.seconds ? 'bg-accent' : 'bg-surface-2', hover === i && 'opacity-80')}
              style={{ height: d.seconds ? Math.max(4, (d.seconds / max) * (H - 4)) : 3 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[10px] text-muted sm:gap-1.5">
        {days.map((d, i) => (
          <span key={i} className="flex-1">
            {fmt(d.day, 'EEEEE')}
          </span>
        ))}
      </div>
      {hd && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `calc(2.5rem + (100% - 2.5rem) * ${(hover! + 0.5) / days.length})` }}
        >
          <p className="font-semibold">{capitalizeFirst(fmt(hd.day, 'EEEE d MMMM'))}</p>
          <p className="text-muted">{hd.seconds ? durationLabel(hd.seconds * 1000) : 'Pas de travail mesuré'}</p>
          {Object.entries(hd.byActivity).map(([a, sec]) => (
            <p key={a} className="text-muted">
              {ACTIVITY_LABEL[a] ?? a} : {durationLabel(sec * 1000)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

const capitalizeFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export default function StatsPage() {
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const { data, isLoading, error } = useStatsData()
  const { data: subjects = [] } = useSubjects()
  const subjectMap = useSubjectMap()
  const { data: sessions = [] } = useQuizSessions()
  const { data: quizzes = [] } = useQuizzes()
  const { data: cards = [] } = useFlashcards()
  const [actionError, setActionError] = useState<unknown>(null)

  const s = useMemo(() => {
    if (!data) return null
    const sessionSubject = new Map(sessions.map((x) => [x.id, x.subject_id]))
    const cardSubject = new Map(cards.map((c) => [c.id, c.subject_id]))
    const notionOf = new Map(data.questions.map((q) => [q.id, q.notion]))
    const correct = data.answers.filter((a) => a.is_correct).length
    // Temps mesuré par le chronomètre de session quand il existe, sinon estimé d'après les réponses
    const measured = data.study.length > 0
    const subjectsStats = bySubject(data.answers, data.reviews, sessionSubject, cardSubject)
    if (measured)
      for (const [sid, sec] of studyByKey(data.study, 'subject_id')) {
        const st = subjectsStats.get(sid) ?? { subjectId: sid, correct: 0, total: 0, rate: null, timeMs: 0, cards: 0 }
        subjectsStats.set(sid, { ...st, timeMs: sec * 1000 })
      }
    return {
      streak: streak([
        ...data.answers.map((a) => new Date(a.answered_at)),
        ...data.reviews.map((r) => new Date(r.reviewed_at)),
        ...data.study.filter((x) => x.active_seconds >= 60).map((x) => new Date(x.started_at)),
      ]),
      rate: data.answers.length ? Math.round((correct / data.answers.length) * 100) : null,
      week: measured ? [...studyByKey(data.study, 'activity', 7).values()].reduce((n, x) => n + x, 0) * 1000 : recentTime(data.answers, data.reviews, 7),
      daily: measured ? dailyStudy(data.study, 14) : null,
      activities: measured ? [...studyByKey(data.study, 'activity', 7).entries()].sort((a, b) => b[1] - a[1]) : [],
      reviews7: data.reviews.filter((r) => Date.now() - new Date(r.reviewed_at).getTime() < 7 * 86_400_000).length,
      trend: weeklySuccess(data.answers, 10),
      subjects: subjectsStats,
      notions: weakNotions(data.answers, notionOf, sessionSubject, 8),
    }
  }, [data, sessions, cards])

  // Dernier score de chaque QCM terminé
  const quizScores = useMemo(() => {
    const seen = new Set<string>()
    return sessions
      .filter((x) => x.kind === 'quiz' && x.finished_at && x.total && x.quiz_id)
      .filter((x) => !seen.has(x.quiz_id!) && seen.add(x.quiz_id!))
      .slice(0, 8)
      .map((x) => ({ session: x, quiz: quizzes.find((q) => q.id === x.quiz_id) }))
  }, [sessions, quizzes])

  if (isLoading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  if (!s || (!data!.answers.length && !data!.reviews.length && !data!.study.length))
    return (
      <>
        <PageHeader title="Statistiques" />
        <EmptyState
          title="Pas encore de statistiques"
          action={
            <Link to="/reviser">
              <Button>Commencer à réviser</Button>
            </Link>
          }
        >
          Fais un QCM ou révise quelques flash cards : ta progression apparaîtra ici.
        </EmptyState>
      </>
    )

  const rows = subjects.map((sub) => ({ sub, st: s.subjects.get(sub.id) })).filter((r) => r.st && (r.st.total || r.st.cards))
  const hasTrend = s.trend.some((p) => p.rate !== null)

  return (
    <>
      <PageHeader title="Statistiques" subtitle="Ta progression, sans pression : l’important, c’est la régularité." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Flame className="size-5" />} value={`${s.streak} jour${s.streak > 1 ? 's' : ''}`} label="de révision d’affilée" />
        <Tile icon={<CheckCircle2 className="size-5" />} value={s.rate === null ? '—' : `${s.rate} %`} label="de bonnes réponses aux QCM" />
        <Tile icon={<Clock className="size-5" />} value={durationLabel(s.week)} label="de révision ces 7 jours" />
        <Tile icon={<Layers className="size-5" />} value={s.reviews7} label="cartes révisées ces 7 jours" />
      </div>

      {s.daily && (
        <Card className="mb-5">
          <h2 className="mb-1 font-semibold">Temps de travail par jour</h2>
          <p className="mb-3 text-sm text-muted">Mesuré pendant que tu travailles dans l’appli ; le chronomètre se met en pause après 10 minutes sans action.</p>
          <DailyChart days={s.daily} />
          {s.activities.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-muted">Ces 7 jours :</span>
              {s.activities.map(([a, sec]) => (
                <span key={a}>
                  {ACTIVITY_LABEL[a] ?? a} <strong>{durationLabel(sec * 1000)}</strong>
                </span>
              ))}
            </p>
          )}
        </Card>
      )}

      {hasTrend && (
        <Card className="mb-5">
          <h2 className="mb-2 font-semibold">Taux de réussite aux QCM, par semaine</h2>
          <TrendChart points={s.trend} />
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="mb-5">
          <h2 className="mb-3 font-semibold">Par matière</h2>
          <ul className="flex flex-col gap-3">
            {rows.map(({ sub, st }) => (
              <li key={sub.id}>
                <div className="mb-1 flex flex-col gap-x-3 text-sm sm:flex-row sm:items-baseline">
                  <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                    <SubjectDot color={sub.color} />
                    <span className="truncate">{sub.name}</span>
                  </span>
                  <span className="text-xs text-muted sm:text-sm">
                    {st!.total ? `${st!.rate} % · ${st!.total} réponses` : 'pas de QCM'} · {st!.cards} cartes · {durationLabel(st!.timeMs)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${st!.rate ?? 0}%`, background: sub.color }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> Notions à retravailler
          </h2>
          <p className="mb-3 text-sm text-muted">Les notions où tu te trompes le plus souvent.</p>
          {!s.notions.length ? (
            <p className="text-sm text-muted">Rien à signaler pour l’instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {s.notions.map((n) => {
                const sub = subjectMap.get(n.subjectId)
                return (
                  <li key={n.subjectId + n.notion} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n.notion}</p>
                      <p className="text-xs text-muted">
                        {sub && <SubjectDot color={sub.color} className="mr-1.5 inline-block align-middle" />}
                        {sub?.name} · {n.misses} erreur{n.misses > 1 ? 's' : ''} sur {n.total} ({n.rate} %)
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          navigate(`/qcm/session/${await startErrorSession(spaceId, n.subjectId)}`)
                        } catch (e) {
                          setActionError(e)
                        }
                      }}
                    >
                      Revoir
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <ErrorBox error={actionError} />
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Derniers QCM</h2>
          {!quizScores.length ? (
            <p className="text-sm text-muted">Aucun QCM terminé.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {quizScores.map(({ session: x, quiz }) => {
                const pct = Math.round((x.score! / x.total!) * 100)
                const sub = subjectMap.get(x.subject_id)
                return (
                  <li key={x.id} className="flex items-center gap-3 text-sm">
                    {sub && <SubjectDot color={sub.color} />}
                    <span className="min-w-0 flex-1 truncate">{quiz?.title ?? 'QCM'}</span>
                    <span className="text-muted">{fmt(x.finished_at!, 'd MMM')}</span>
                    <span className="w-12 text-right font-semibold">{pct} %</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
