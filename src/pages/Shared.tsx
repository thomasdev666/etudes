import { useQuery } from '@tanstack/react-query'
import { generateHTML } from '@tiptap/core'
import katex from 'katex'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleHelp, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { buildExtensions } from '@/components/editor/extensions'
import { Logo } from '@/components/Logo'
import { MathText } from '@/components/MathText'
import { Button, Card, cx, ProgressBar, Spinner } from '@/components/ui'
import { fmt } from '@/lib/dates'
import { fetchShare, type SharedContent, type SharedQuestion } from '@/lib/share'
import { sanitizeDoc } from '@/lib/shareSanitize'
import type { MindNode } from '@/lib/types'
import { frenchSpacingDoc } from '@/lib/frenchSpacing'
import type { JSONContent } from '@tiptap/core'

// Page publique d'un contenu partagé par lien, en lecture seule

function NoteView({ doc }: { doc: JSONContent }) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => generateHTML(frenchSpacingDoc(sanitizeDoc(doc) ?? { type: 'doc', content: [] }), buildExtensions(() => null)), [doc])
  // Formules : rendu KaTeX après l'insertion du HTML
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((el) => {
      katex.render(el.dataset.latex ?? '', el, { throwOnError: false, displayMode: el.dataset.type === 'block-math' })
    })
  }, [html])
  return <div ref={ref} className="prose-note" dangerouslySetInnerHTML={{ __html: html }} />
}

function Outline({ node, depth = 0 }: { node: MindNode; depth?: number }) {
  return (
    <li className={depth ? 'mt-2' : ''}>
      <p className={depth === 0 ? 'font-display text-xl font-bold' : depth === 1 ? 'font-semibold' : ''}>
        <MathText text={node.title} />
      </p>
      {node.detail && (
        <p className="text-sm text-muted">
          <MathText text={node.detail} />
        </p>
      )}
      {!!node.children?.length && (
        <ul className="ml-3 border-l-2 border-border pl-4">
          {node.children.map((c, i) => (
            <Outline key={i} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Deck({ cards }: { cards: { front: string; back: string }[] }) {
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  if (!cards.length) return <p className="text-muted">Ce paquet est vide.</p>
  const c = cards[i]
  const go = (d: number) => {
    setI((i + d + cards.length) % cards.length)
    setFlipped(false)
  }
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setFlipped(!flipped)}
        className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-surface p-8 text-center shadow-card"
        aria-label={flipped ? 'Voir la question' : 'Voir la réponse'}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{flipped ? 'Réponse' : 'Question'}</span>
        <span className="whitespace-pre-line text-xl">{flipped ? c.back : c.front}</span>
        {!flipped && <span className="text-sm text-accent-ink">Touche pour retourner</span>}
      </button>
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" icon={<ChevronLeft className="size-4" />} onClick={() => go(-1)}>
          Précédente
        </Button>
        <span className="text-sm text-muted">
          {i + 1} / {cards.length}
        </span>
        <Button variant="secondary" onClick={() => go(1)}>
          Suivante <ChevronRight className="size-4" />
        </Button>
      </div>
      {i === cards.length - 1 && flipped && (
        <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => go(1)}>
          Recommencer
        </Button>
      )}
    </div>
  )
}


const LETTERS = ['A', 'B', 'C', 'D']
const choiceLabel = (n: number, i: number) => (n > 2 ? LETTERS[i] : i === 0 ? 'V' : 'F')

// QCM partagé : questions une à une, correction seulement à la fin (rien n'est enregistré)
function QuizPlay({ questions }: { questions: SharedQuestion[] }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(number | null | undefined)[]>([])
  const [done, setDone] = useState(false)
  if (!questions.length) return <p className="text-muted">Ce QCM est vide.</p>
  const q = questions[index]
  const current = answers[index]
  const set = (v: number | null) => setAnswers((a) => Object.assign([...a], { [index]: v }))
  const last = index === questions.length - 1
  const restart = () => {
    setAnswers([])
    setIndex(0)
    setDone(false)
    window.scrollTo({ top: 0 })
  }

  if (done) {
    const score = questions.filter((qq, i) => answers[i] === qq.correct_index).length
    const pct = Math.round((score / questions.length) * 100)
    return (
      <div className="flex flex-col gap-4">
        <Card className="text-center">
          <p className="text-sm text-muted">Résultat</p>
          <p className={cx('mt-1 font-display text-5xl font-bold', pct >= 80 ? 'text-success' : pct >= 50 ? 'text-text' : 'text-danger')}>{pct} %</p>
          <p className="mt-1 text-muted">
            {score} bonne{score > 1 ? 's' : ''} réponse{score > 1 ? 's' : ''} sur {questions.length}
          </p>
          <Button className="mt-4" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={restart}>
            Refaire ce QCM
          </Button>
        </Card>
        <h2 className="mt-2 text-lg font-semibold">Correction</h2>
        {questions.map((qq, i) => {
          const ok = answers[i] === qq.correct_index
          return (
            <Card key={i} className={cx('border-l-4', ok ? 'border-l-success' : 'border-l-danger')}>
              <div className="flex items-start gap-2">
                <span className={cx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
                  {ok ? <Check className="size-4" aria-label="Juste" /> : <X className="size-4" aria-label="Faux" />}
                </span>
                <p className="font-medium">
                  {i + 1}. <MathText text={qq.question} />
                </p>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {qq.choices.map((ch, j) => (
                  <li
                    key={j}
                    className={cx(
                      'rounded-xl border px-3 py-2 text-sm',
                      j === qq.correct_index ? 'border-success bg-success-soft text-success' : j === answers[i] ? 'border-danger bg-danger-soft text-danger' : 'border-border',
                    )}
                  >
                    <span className="font-semibold">{qq.choices.length > 2 ? LETTERS[j] + '. ' : ''}</span>
                    <MathText text={ch} />
                    {j === answers[i] && <span className="ml-1 text-xs">(ta réponse)</span>}
                  </li>
                ))}
                {answers[i] == null && <li className="text-sm text-muted">{answers[i] === null ? 'Tu ne savais pas' : 'Pas de réponse'}</li>}
              </ul>
              {qq.explanation && (
                <p className="mt-3 text-sm leading-relaxed">
                  <MathText text={qq.explanation} />
                </p>
              )}
              {qq.notion && <p className="mt-2 text-xs text-muted">Notion : {qq.notion}</p>}
            </Card>
          )
        })}
      </div>
    )
  }

  return (
    <div key={index} className="anim-pop flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={((index + (current !== undefined ? 1 : 0)) / questions.length) * 100} label="Avancement" />
        </div>
        <span className="text-sm tabular-nums text-muted">
          {index + 1} / {questions.length}
        </span>
      </div>
      <h2 className="text-xl font-semibold leading-snug sm:text-2xl">
        <MathText text={q.question} />
      </h2>
      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Réponses">
        {q.choices.map((c, i) => {
          const selected = current === i
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => set(i)}
              className={cx(
                'flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all duration-150',
                selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-accent/50',
              )}
            >
              <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold', selected ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}>
                {choiceLabel(q.choices.length, i)}
              </span>
              <MathText text={c} className="min-w-0 break-words" />
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          set(null)
          if (!last) setIndex(index + 1)
        }}
        aria-pressed={current === null}
        className={cx(
          'flex items-center justify-center gap-2 self-center rounded-full border px-4 py-2 text-sm',
          current === null ? 'border-accent bg-accent-soft font-medium text-accent-ink' : 'border-dashed border-border text-muted hover:text-text',
        )}
      >
        <CircleHelp className="size-4" aria-hidden />
        {current === null ? 'Noté : tu ne savais pas' : 'Je ne sais pas du tout'}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Précédente
        </Button>
        <Button
          disabled={current === undefined}
          icon={last ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
          onClick={() => {
            if (last) {
              setDone(true)
              window.scrollTo({ top: 0 })
            } else setIndex(index + 1)
          }}
        >
          {last ? 'Terminer et voir la correction' : 'Suivante'}
        </Button>
      </div>
    </div>
  )
}

const KIND_LABEL = { note: 'Note', mindmap: 'Carte mentale', deck: 'Flash cards', quiz: 'QCM' }

export default function SharedPage() {
  const { token = '' } = useParams()
  const q = useQuery({ queryKey: ['share', token], queryFn: () => fetchShare(token), staleTime: Infinity, retry: false })
  const data = q.data as SharedContent | null | undefined

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/" aria-label="Regulya">
            <Logo withBaseline={false} className="h-8 w-auto text-text" />
          </Link>
          <Link to="/connexion?mode=signup" className="ml-auto">
            <Button size="sm">Créer un compte gratuit</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {q.isLoading ? (
          <Spinner />
        ) : !data ? (
          <Card className="text-center">
            <h1 className="font-display text-2xl font-bold">Ce lien n’est plus actif</h1>
            <p className="mt-2 text-muted">La personne qui l’a partagé l’a peut-être désactivé, ou le contenu a été supprimé.</p>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted">
              {KIND_LABEL[data.kind]}
              {data.subject ? ` · ${data.subject}` : ''}
              {data.updated_at && <> · mis à jour le {fmt(data.updated_at, 'd MMMM yyyy')}</>}
            </p>
            {data.kind !== 'mindmap' && <h1 className="mb-6 mt-1 font-display text-3xl font-bold">{data.title}</h1>}
            {data.kind === 'note' && <NoteView doc={data.content as JSONContent} />}
            {data.kind === 'mindmap' && (
              <ul className="mt-3">
                <Outline node={data.content as MindNode} />
              </ul>
            )}
            {data.kind === 'deck' && <Deck cards={data.cards ?? []} />}
            {data.kind === 'quiz' && <QuizPlay questions={data.questions ?? []} />}
            <Card className="mt-10 flex flex-col gap-3 bg-accent-soft sm:flex-row sm:items-center">
              <p className="flex-1">
                <strong>Partagé avec Regulya.</strong> Crée tes propres fiches, QCM et flash cards à partir de tes cours, et révise au bon moment.
              </p>
              <Link to="/connexion?mode=signup">
                <Button>Essayer gratuitement</Button>
              </Link>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
