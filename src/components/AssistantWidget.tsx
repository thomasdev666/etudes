import { BookOpen, Check, NotebookPen, RotateCcw, Send, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJobs } from '@/context/jobs'
import { useCreateAssistantDoc } from '@/lib/assistant'
import { useCourses, useNotesList, useSubjects } from '@/lib/data'
import { useUsage } from '@/lib/plans'
import { Button, cx, SubjectDot } from './ui'

// Assistant flottant : un petit personnage accessible depuis toutes les pages.
// La conversation est guidée : il demande ce qui manque (type de document, matières,
// contenus, précisions) avec des boutons simples, puis crée le document.

export function Mascot({ className, mood = 'happy' }: { className?: string; mood?: 'happy' | 'busy' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {/* toque d'étudiant */}
      <path d="M14 20 L32 12 L50 20 L32 28 Z" fill="#2B2118" />
      <path d="M44 22.5 V30" stroke="#2B2118" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="44" cy="31.5" r="2.2" fill="#F5B841" />
      {/* tête */}
      <circle cx="32" cy="38" r="17" fill="#F26B4F" />
      <ellipse cx="25.5" cy="36" rx="3" ry={mood === 'busy' ? 1.2 : 3.4} fill="#FFFDF8" />
      <ellipse cx="38.5" cy="36" rx="3" ry={mood === 'busy' ? 1.2 : 3.4} fill="#FFFDF8" />
      <circle cx="26" cy="36.6" r="1.5" fill="#2B2118" />
      <circle cx="39" cy="36.6" r="1.5" fill="#2B2118" />
      <path d="M25.5 44 Q32 49.5 38.5 44" stroke="#FFFDF8" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="42.5" r="2.4" fill="#F7A08A" />
      <circle cx="44" cy="42.5" r="2.4" fill="#F7A08A" />
    </svg>
  )
}

const KINDS = [
  { id: 'fiche', label: 'Une fiche de révision complète', ask: 'Une fiche de révision complète et visuelle : plan, définitions, formules, schémas en étapes, exemples et pièges.' },
  { id: 'formules', label: 'Une fiche des formules à retenir', ask: 'Une fiche avec seulement les formules à retenir, ce que représente chaque variable, et quand utiliser chacune.' },
  { id: 'definitions', label: 'Les définitions à connaître', ask: 'Les définitions à connaître par cœur, classées par chapitre, avec un exemple pour chacune.' },
  { id: 'examen', label: 'Des questions d’examen corrigées', ask: '15 questions probables à l’examen, avec leurs réponses détaillées.' },
  { id: 'resume', label: 'Un résumé express', ask: 'Un résumé d’une page de l’essentiel, avec les mots clés en gras.' },
  { id: 'methodes', label: 'Les méthodes de calcul pas à pas', ask: 'Les méthodes de calcul, étape par étape, avec un exemple chiffré pour chacune.' },
]
const DETAILS = ['Version courte', 'Très détaillée', 'Avec des tableaux comparatifs', 'En anglais']

type Step = 'kind' | 'subjects' | 'sources' | 'details' | 'confirm' | 'done'
type Msg = { from: 'bot' | 'me'; text: ReactNode }

function Bubble({ m }: { m: Msg }) {
  return (
    <div className={cx('flex gap-2', m.from === 'me' && 'justify-end')}>
      {m.from === 'bot' && <Mascot className="mt-0.5 size-7 shrink-0" />}
      <div className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.from === 'bot' ? 'rounded-tl-sm bg-surface-2' : 'rounded-tr-sm bg-accent text-white')}>{m.text}</div>
    </div>
  )
}

function Chip({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-left text-sm', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border hover:bg-surface-2')}
    >
      {on && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  )
}

function Conversation({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateAssistantDoc()
  const { find } = useJobs()
  const { data: subjects = [] } = useSubjects()
  const { data: courses = [] } = useCourses()
  const { data: notes = [] } = useNotesList()
  const { data: usage = [] } = useUsage()
  const [step, setStep] = useState<Step>('kind')
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: 'Salut, moi c’est JadeBot ! Je prépare des documents de révision à partir de tes cours. Qu’est-ce que je fais pour toi ?' }])
  const [ask, setAsk] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [showSources, setShowSources] = useState(false)
  const [details, setDetails] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ noteId: string; jobId: string } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [msgs, step, showSources])

  const sources = useMemo(
    () =>
      [
        ...courses.map((c) => ({ id: c.id, kind: 'course' as const, title: c.title, subjectId: c.subject_id, size: c.content.length })),
        ...notes.map((n) => ({ id: n.id, kind: 'note' as const, title: n.title, subjectId: n.subject_id, size: n.content_text.length })),
      ].filter((s) => s.size > 0 && s.subjectId && picked.includes(s.subjectId)),
    [courses, notes, picked],
  )
  const chosen = sources.filter((s) => !excluded.has(s.id))
  const quota = usage.find((u) => u.kind === 'sheet')
  const left = quota ? Math.max(0, quota.max - quota.used) : null
  const job = result ? find((j) => j.id === result.jobId) : undefined

  const say = (...m: Msg[]) => setMsgs((cur) => [...cur, ...m])

  function chooseKind(instruction: string, label: string) {
    setAsk(instruction)
    say({ from: 'me', text: label })
    if (!subjects.length) {
      say({ from: 'bot', text: 'Il me faut au moins une matière avec des cours. Commence par en créer une et y importer un cours.' })
      setStep('done')
      return
    }
    say({ from: 'bot', text: 'Sur quelle matière ? Tu peux en choisir plusieurs pour les mélanger.' })
    setStep('subjects')
  }

  function confirmSubjects() {
    const names = subjects.filter((s) => picked.includes(s.id)).map((s) => s.name)
    say({ from: 'me', text: names.join(', ') })
    const n = courses.filter((c) => picked.includes(c.subject_id) && c.content.length).length + notes.filter((x) => x.subject_id && picked.includes(x.subject_id) && x.content_text.length).length
    if (!n) {
      say({ from: 'bot', text: 'Je ne trouve aucun cours ni aucune note dans cette sélection. Importe d’abord un cours, puis reviens me voir.' })
      setStep('done')
      return
    }
    say({ from: 'bot', text: `J’ai trouvé ${n} contenu${n > 1 ? 's' : ''}. Je les utilise tous, sauf si tu veux en retirer.` })
    setStep('sources')
  }

  function confirmSources() {
    say({ from: 'me', text: `${chosen.length} contenu${chosen.length > 1 ? 's' : ''}` })
    say({ from: 'bot', text: 'Une précision ? Un chapitre en particulier, une longueur, une langue… Sinon, je m’en occupe.' })
    setStep('details')
  }

  function confirmDetails(extra: string) {
    const all = [...details, extra.trim()].filter(Boolean)
    say({ from: 'me', text: all.length ? all.join(' · ') : 'Non, c’est parti' })
    if (all.length) setAsk((a) => `${a}\nPrécisions : ${all.join(' ; ')}.`)
    setText('')
    say({ from: 'bot', text: 'Parfait, voici ce que je vais faire :' })
    setStep('confirm')
  }

  async function launch() {
    setBusy(true)
    try {
      const r = await create({
        subjectId: picked.length === 1 ? picked[0] : null,
        courseIds: chosen.filter((s) => s.kind === 'course').map((s) => s.id),
        noteIds: chosen.filter((s) => s.kind === 'note').map((s) => s.id),
        instruction: ask,
      })
      setResult(r)
      say({ from: 'bot', text: 'C’est lancé ! Ça prend en général une à deux minutes. Tu peux fermer cette fenêtre : je te préviens quand c’est prêt.' })
      setStep('done')
    } catch (e) {
      say({ from: 'bot', text: e instanceof Error ? e.message : 'Je n’ai pas pu lancer le document. Réessaie dans un instant.' })
    } finally {
      setBusy(false)
    }
  }

  function restart() {
    setMsgs([{ from: 'bot', text: 'On recommence ! Qu’est-ce que je prépare pour toi ?' }])
    setStep('kind')
    setAsk('')
    setPicked([])
    setExcluded(new Set())
    setDetails([])
    setResult(null)
  }

  // Réponse écrite librement : selon l'étape, c'est la demande ou une précision
  function sendText() {
    const t = text.trim()
    if (!t) return
    if (step === 'kind') {
      setText('')
      chooseKind(t, t)
    } else if (step === 'details') confirmDetails(t)
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {msgs.map((m, i) => (
          <Bubble key={i} m={m} />
        ))}

        {step === 'kind' && (
          <div className="flex flex-col gap-1.5 pl-9">
            {KINDS.map((k) => (
              <Chip key={k.id} onClick={() => chooseKind(k.ask, k.label)}>
                {k.label}
              </Chip>
            ))}
            <p className="mt-1 text-xs text-muted">Ou écris ta demande en bas, comme tu veux.</p>
          </div>
        )}

        {step === 'subjects' && (
          <div className="flex flex-col gap-2 pl-9">
            <div className="flex flex-wrap gap-1.5">
              {subjects.map((s) => (
                <Chip key={s.id} on={picked.includes(s.id)} onClick={() => setPicked((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}>
                  <SubjectDot color={s.color} />
                  <span translate="no">{s.name}</span>
                </Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!picked.length} onClick={confirmSubjects}>
                Valider
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked(subjects.map((s) => s.id))}>
                Toutes
              </Button>
            </div>
          </div>
        )}

        {step === 'sources' && (
          <div className="flex flex-col gap-2 pl-9">
            <button type="button" onClick={() => setShowSources(!showSources)} className="self-start text-sm font-medium text-accent-ink hover:underline">
              {showSources ? 'Masquer la liste' : `Voir les ${sources.length} contenus`}
            </button>
            {showSources && (
              <ul className="flex max-h-48 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">
                {sources.map((s) => {
                  const on = !excluded.has(s.id)
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setExcluded((cur) => {
                              const next = new Set(cur)
                              if (on) next.add(s.id)
                              else next.delete(s.id)
                              return next
                            })
                          }
                          className="size-4 shrink-0 accent-[var(--accent)]"
                        />
                        {s.kind === 'course' ? <BookOpen className="size-4 shrink-0 text-muted" aria-hidden /> : <NotebookPen className="size-4 shrink-0 text-muted" aria-hidden />}
                        <span className="min-w-0 flex-1 truncate" translate="no">
                          {s.title}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button size="sm" className="self-start" disabled={!chosen.length} onClick={confirmSources}>
              C’est bon ({chosen.length})
            </Button>
          </div>
        )}

        {step === 'details' && (
          <div className="flex flex-col gap-2 pl-9">
            <div className="flex flex-wrap gap-1.5">
              {DETAILS.map((d) => (
                <Chip key={d} on={details.includes(d)} onClick={() => setDetails((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}>
                  {d}
                </Chip>
              ))}
            </div>
            <Button size="sm" className="self-start" onClick={() => confirmDetails(text)}>
              {details.length || text.trim() ? 'Valider' : 'Non, c’est parti'}
            </Button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="flex flex-col gap-2 pl-9">
            <div className="rounded-2xl border border-border bg-surface p-3 text-sm">
              <p className="whitespace-pre-line">{ask}</p>
              <p className="mt-2 text-xs text-muted">
                À partir de {chosen.length} contenu{chosen.length > 1 ? 's' : ''} · ta note d’origine n’est jamais modifiée
              </p>
            </div>
            {left === 0 ? (
              <p className="text-sm text-danger">Tu as utilisé tous tes documents de la semaine. Passe en Premium, ou reviens dans quelques jours.</p>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" loading={busy} onClick={launch}>
                  Créer le document
                </Button>
                <Button size="sm" variant="ghost" onClick={restart}>
                  Changer
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col gap-2 pl-9">
            {result && job?.status === 'done' && (
              <Button
                size="sm"
                className="self-start"
                onClick={() => {
                  onClose()
                  navigate(`/notes/${result.noteId}`)
                }}
              >
                Ouvrir le document
              </Button>
            )}
            {result && job?.status === 'error' && <p className="text-sm text-danger">{job.error ?? 'La génération a échoué.'}</p>}
            {result && (job?.status === 'pending' || job?.status === 'running') && <p className="text-xs text-muted">En cours de rédaction…</p>}
            <Button size="sm" variant="secondary" className="self-start" icon={<RotateCcw className="size-4" />} onClick={restart}>
              Faire autre chose
            </Button>
          </div>
        )}
        <div ref={end} />
      </div>

      {(step === 'kind' || step === 'details') && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            sendText()
          }}
          className="flex gap-2 border-t border-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1500}
            placeholder={step === 'kind' ? 'Ex. : une fiche des formules d’analyse financière' : 'Ex. : seulement les chapitres 3 et 4'}
            aria-label="Ta demande"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" aria-label="Envoyer" disabled={!text.trim()} icon={<Send className="size-4" />} />
        </form>
      )}
    </>
  )
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false)
  // La conversation repart de zéro à chaque ouverture, sauf pendant une création
  const [key, setKey] = useState(0)
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir JadeBot"
          title="JadeBot"
          className="fixed right-3 z-30 flex size-14 items-center justify-center rounded-full border border-border bg-surface shadow-lg motion-safe:transition-transform motion-safe:hover:scale-105 lg:right-5"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + var(--jobs-offset))' }}
        >
          <Mascot className="size-11" />
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="JadeBot" className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl border border-border bg-bg shadow-2xl lg:inset-x-auto lg:right-5 lg:bottom-5 lg:h-[36rem] lg:w-[24rem] lg:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Mascot className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold" translate="no">JadeBot</p>
              <p className="text-xs text-muted">Je travaille uniquement à partir de tes cours</p>
            </div>
            <button
              type="button"
              aria-label="Fermer JadeBot"
              onClick={() => {
                setOpen(false)
                setKey((k) => k + 1)
              }}
              className="rounded-xl p-2 text-muted hover:bg-surface-2"
            >
              <X className="size-5" />
            </button>
          </div>
          <Conversation key={key} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}
