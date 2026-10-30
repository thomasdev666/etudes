import { useQuery } from '@tanstack/react-query'
import { generateHTML } from '@tiptap/core'
import katex from 'katex'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { buildExtensions } from '@/components/editor/extensions'
import { Logo } from '@/components/Logo'
import { MathText } from '@/components/MathText'
import { Button, Card, Spinner } from '@/components/ui'
import { fmt } from '@/lib/dates'
import { fetchShare, type SharedContent } from '@/lib/share'
import { sanitizeDoc } from '@/lib/shareSanitize'
import type { MindNode } from '@/lib/types'
import type { JSONContent } from '@tiptap/core'

// Page publique d'un contenu partagé par lien, en lecture seule

function NoteView({ doc }: { doc: JSONContent }) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => generateHTML(sanitizeDoc(doc) ?? { type: 'doc', content: [] }, buildExtensions(() => null)), [doc])
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

const KIND_LABEL = { note: 'Note', mindmap: 'Carte mentale', deck: 'Flash cards' }

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
              {data.subject ? ` · ${data.subject}` : ''} · mis à jour le {fmt(data.updated_at, 'd MMMM yyyy')}
            </p>
            {data.kind !== 'mindmap' && <h1 className="mb-6 mt-1 font-display text-3xl font-bold">{data.title}</h1>}
            {data.kind === 'note' && <NoteView doc={data.content as JSONContent} />}
            {data.kind === 'mindmap' && (
              <ul className="mt-3">
                <Outline node={data.content as MindNode} />
              </ul>
            )}
            {data.kind === 'deck' && <Deck cards={data.cards ?? []} />}
            <Card className="mt-10 flex flex-col gap-3 bg-accent-soft sm:flex-row sm:items-center">
              <p className="flex-1">
                <strong>Partagé avec Regulya.</strong> Crée tes propres fiches et flash cards à partir de tes cours, et révise au bon moment.
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
