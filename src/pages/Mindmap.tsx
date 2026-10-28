import { useQuery } from '@tanstack/react-query'
import katex from 'katex'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FoldVertical,
  FileDown,
  Image as ImageIcon,
  ListTree,
  Minus,
  Network,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GenerateMindmapModal } from '@/components/Generate'
import { Button, cx, ErrorBox, Field, IconButton, Input, Spinner, Tabs, Textarea } from '@/components/ui'
import { useSpace } from '@/context/space'
import { SUBJECT_PALETTE, tint } from '@/lib/colors'
import { useInvalidate, useSubjectMap, useTrash } from '@/lib/data'
import { saveBlob, safeFilename } from '@/lib/exportNote'
import { addChild, addSibling, indent, locate, move, outdent, remove, update, withIds, type Node } from '@/lib/mindmap'
import { elementToPdf, elementToPng } from '@/lib/pdfExport'
import { must, supabase } from '@/lib/supabase'
import type { NoteOutput } from '@/lib/types'

// Texte avec formules $...$ rendues par KaTeX
function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    return text
      .split(/(\$[^$]+\$)/g)
      .map((part) =>
        part.startsWith('$') && part.endsWith('$') && part.length > 2
          ? katex.renderToString(part.slice(1, -1), { throwOnError: false })
          : esc(part),
      )
      .join('')
  }, [text])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

type Ctx = {
  selected: string | null
  select: (id: string) => void
  showDetails: boolean
  toggle: (id: string) => void
}

function MapNode({ node, depth, color, ctx }: { node: Node; depth: number; color: string; ctx: Ctx }) {
  const isSel = ctx.selected === node.id
  const kids = node.children ?? []
  const box =
    depth === 0
      ? 'rounded-2xl bg-accent px-5 py-3 text-white font-display text-lg font-bold'
      : depth === 1
        ? 'rounded-2xl border-2 px-4 py-2.5 font-semibold'
        : 'rounded-xl border border-border bg-surface px-3 py-2 text-sm'
  return (
    <div className="mm-row">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => ctx.select(node.id)}
          aria-pressed={isSel}
          className={cx(box, 'max-w-72 text-left shadow-card transition-shadow', isSel && 'ring-4 ring-accent/40')}
          style={
            depth === 1
              ? { borderColor: color, background: tint(color, 0.18) }
              : depth > 1
                ? { borderLeft: `4px solid ${color}` }
                : undefined
          }
        >
          <MathText text={node.title} className="block" />
          {ctx.showDetails && node.detail && (
            <MathText text={node.detail} className={cx('mt-1 block text-xs font-normal leading-snug', depth === 0 ? 'text-white/85' : 'text-muted')} />
          )}
        </button>
        {kids.length > 0 && (
          <button
            type="button"
            onClick={() => ctx.toggle(node.id)}
            aria-label={node.collapsed ? `Déplier (${kids.length})` : 'Replier'}
            className="flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-surface px-1 text-xs text-muted hover:text-text"
          >
            {node.collapsed ? kids.length : '–'}
          </button>
        )}
      </div>
      {kids.length > 0 && !node.collapsed && (
        <div className="mm-children" style={{ ['--c' as string]: depth === 0 ? 'var(--border)' : color }}>
          {kids.map((c, i) => (
            <div key={c.id} className="mm-child" style={{ ['--c' as string]: depth === 0 ? SUBJECT_PALETTE[i % SUBJECT_PALETTE.length].hex : color }}>
              <MapNode node={c} depth={depth + 1} color={depth === 0 ? SUBJECT_PALETTE[i % SUBJECT_PALETTE.length].hex : color} ctx={ctx} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OutlineNode({ node, depth, ctx }: { node: Node; depth: number; ctx: Ctx }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => ctx.select(node.id)}
        className={cx('w-full rounded-lg px-2 py-1 text-left hover:bg-surface-2', ctx.selected === node.id && 'bg-accent-soft', depth <= 1 && 'font-semibold')}
      >
        <MathText text={node.title} />
        {ctx.showDetails && node.detail && <MathText text={` — ${node.detail}`} className="text-sm font-normal text-muted" />}
      </button>
      {!!node.children?.length && (
        <ul className="ml-4 border-l border-border pl-2">
          {node.children.map((c) => (
            <OutlineNode key={c.id} node={c} depth={depth + 1} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Tool({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export default function MindmapPage() {
  const { id = '' } = useParams()
  return <MindmapEditor key={id} id={id} />
}

function MindmapEditor({ id }: { id: string }) {
  const navigate = useNavigate()
  const { spaceId } = useSpace()
  const subjects = useSubjectMap()
  const invalidate = useInvalidate()
  const trash = useTrash('note_outputs')
  const [tree, setTree] = useState<Node | null>(null)
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'map' | 'outline'>('map')
  const [showDetails, setShowDetails] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const [regen, setRegen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<unknown>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const { data: output, isLoading, error: loadError } = useQuery({
    queryKey: ['note_outputs', spaceId, 'one', id],
    queryFn: async () => must(await supabase.from('note_outputs').select('*').eq('id', id).single()) as NoteOutput,
    staleTime: Infinity,
    gcTime: 0,
  })

  // Les sources ont-elles changé depuis la génération ?
  const { data: sourcesChanged } = useQuery({
    queryKey: ['note_outputs', 'sources', id],
    enabled: !!output?.sources_updated_at,
    queryFn: async () => {
      const dates: string[] = []
      if (output!.source_note_ids.length)
        dates.push(...((await supabase.from('notes').select('updated_at').in('id', output!.source_note_ids)).data ?? []).map((d) => d.updated_at))
      if (output!.source_course_ids.length)
        dates.push(...((await supabase.from('courses').select('updated_at').in('id', output!.source_course_ids)).data ?? []).map((d) => d.updated_at))
      return dates.some((d) => new Date(d).getTime() > new Date(output!.sources_updated_at!).getTime() + 1000)
    },
  })

  useEffect(() => {
    if (output?.status === 'ready') {
      setTree(withIds(output.content))
      setTitle(output.title)
    }
  }, [output])

  function change(next: Node, sel?: string | null) {
    setTree(next)
    if (sel !== undefined) setSelected(sel)
    setSaveState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(next), 800)
  }

  async function save(content: Node, t = title) {
    setSaveState('saving')
    const { error } = await supabase.from('note_outputs').update({ content, title: t.trim() || 'Carte mentale' }).eq('id', id)
    if (error) setError(error.message)
    setSaveState('saved')
    invalidate('note_outputs')
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const sel = tree && selected ? locate(tree, selected) : null

  // Raccourcis : Tab = enfant, Entrée = frère, Suppr = supprimer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!tree || !selected) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea')) return
      if (e.key === 'Tab') {
        e.preventDefault()
        const [n, nid] = addChild(tree, selected)
        change(n, nid)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const [n, nid] = addSibling(tree, selected)
        change(n, nid)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const [n, nid] = remove(tree, selected)
        change(n, nid)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function exportAs(kind: 'png' | 'pdf') {
    if (!canvasRef.current) return
    setBusy(kind === 'png' ? 'Image…' : 'PDF…')
    const el = canvasRef.current
    const prevZoom = zoom
    setZoom(1)
    el.classList.add('force-light')
    await new Promise((r) => setTimeout(r, 80))
    try {
      const blob = kind === 'png' ? await elementToPng(el) : await elementToPdf(el, title)
      saveBlob(blob, `${safeFilename(title)}.${kind}`)
    } catch (e) {
      setError(e)
    } finally {
      el.classList.remove('force-light')
      setZoom(prevZoom)
      setBusy('')
    }
  }

  if (isLoading) return <Spinner />
  if (loadError || !output) return <ErrorBox error={loadError ?? 'Carte introuvable'} />
  if (output.status !== 'ready' || !tree)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted">{output.status === 'error' ? `La génération a échoué : ${output.error}` : 'Génération en cours…'}</p>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Retour
        </Button>
      </div>
    )

  const subject = subjects.get(output.subject_id)
  const ctx: Ctx = {
    selected,
    select: setSelected,
    showDetails,
    toggle: (nid) => {
      const n = locate(tree, nid)?.node
      if (n) change(update(tree, nid, { collapsed: !n.collapsed }))
    },
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Retour" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setSaveState('dirty')
            clearTimeout(timer.current)
            const v = e.target.value
            timer.current = setTimeout(() => save(tree, v), 800)
          }}
          aria-label="Titre de la carte mentale"
          className="min-w-0 flex-1 bg-transparent font-display text-xl font-bold outline-none sm:text-2xl"
        />
        <span className="text-xs text-muted">{busy || (saveState === 'saved' ? 'Enregistré' : 'Enregistrement…')}</span>
      </div>
      {subject && <p className="-mt-2 ml-12 text-sm text-muted">{subject.name}</p>}

      {sourcesChanged && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-sm text-warning">
          <RefreshCw className="size-4" aria-hidden />
          <span className="flex-1">La note ou le cours d’origine a été modifié depuis la création de cette carte.</span>
          <Button size="sm" variant="secondary" onClick={() => setRegen(true)}>
            Générer une nouvelle version
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          label="Affichage"
          value={view}
          onChange={setView}
          items={[
            { value: 'map', label: 'Carte' },
            { value: 'outline', label: 'Plan' },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} className="accent-[var(--accent)]" />
          Détails
        </label>
        <span className="flex-1" />
        {view === 'map' && (
          <div className="flex items-center gap-1">
            <IconButton label="Dézoomer" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>
              <Minus className="size-4" />
            </IconButton>
            <button type="button" className="w-12 text-center text-sm tabular-nums text-muted" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)} %
            </button>
            <IconButton label="Zoomer" onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>
              <Plus className="size-4" />
            </IconButton>
          </div>
        )}
        <Button size="sm" variant="secondary" icon={<ImageIcon className="size-4" />} onClick={() => exportAs('png')} disabled={view !== 'map'}>
          PNG
        </Button>
        <Button size="sm" variant="secondary" icon={<FileDown className="size-4" />} onClick={() => exportAs('pdf')} disabled={view !== 'map'}>
          PDF
        </Button>
      </div>

      {/* Barre d'édition du nœud sélectionné */}
      <div className="sticky top-[57px] z-10 rounded-2xl border border-border bg-surface/95 p-2 shadow-card backdrop-blur lg:top-2">
        {sel ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-0.5 overflow-x-auto">
              <Tool label="Ajouter une sous-idée (Tab)" onClick={() => change(...addChild(tree, sel.node.id))}>
                <Plus className="size-4" /> Sous-idée
              </Tool>
              <Tool label="Ajouter une idée au même niveau (Entrée)" disabled={!sel.parent} onClick={() => change(...addSibling(tree, sel.node.id))}>
                <Network className="size-4" /> Même niveau
              </Tool>
              <Tool label="Monter" disabled={!sel.parent || sel.index === 0} onClick={() => change(move(tree, sel.node.id, -1))}>
                <ArrowUp className="size-4" />
              </Tool>
              <Tool label="Descendre" disabled={!sel.parent || sel.index === (sel.parent.children?.length ?? 1) - 1} onClick={() => change(move(tree, sel.node.id, 1))}>
                <ArrowDown className="size-4" />
              </Tool>
              <Tool label="Remonter d’un niveau" disabled={!sel.parent || sel.parent.id === tree.id} onClick={() => change(outdent(tree, sel.node.id))}>
                <ChevronLeft className="size-4" />
              </Tool>
              <Tool label="Rattacher à l’idée au-dessus" disabled={!sel.parent || sel.index === 0} onClick={() => change(indent(tree, sel.node.id))}>
                <ChevronRight className="size-4" />
              </Tool>
              <Tool label="Supprimer (Suppr)" disabled={!sel.parent} onClick={() => change(...remove(tree, sel.node.id))}>
                <Trash2 className="size-4" />
              </Tool>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Idée" id="mm-title">
                <Input id="mm-title" value={sel.node.title} onChange={(e) => change(update(tree, sel.node.id, { title: e.target.value }))} className="py-2" />
              </Field>
              <Field label="Détail (formules entre $…$)" id="mm-detail">
                <Textarea
                  id="mm-detail"
                  value={sel.node.detail ?? ''}
                  onChange={(e) => change(update(tree, sel.node.id, { detail: e.target.value }))}
                  className="min-h-10 py-2"
                  rows={1}
                />
              </Field>
            </div>
          </div>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted">Touche une idée pour la modifier, ajouter des sous-idées ou la déplacer.</p>
        )}
      </div>

      <ErrorBox error={error} />

      {view === 'map' ? (
        <div className="overflow-auto rounded-[var(--radius-card)] border border-border bg-surface-2/50" style={{ maxHeight: '75dvh' }}>
          <div ref={canvasRef} className="inline-block p-6" style={{ zoom }}>
            <MapNode node={tree} depth={0} color="var(--accent)" ctx={ctx} />
          </div>
        </div>
      ) : (
        <ul className="rounded-[var(--radius-card)] border border-border bg-surface p-3">
          <OutlineNode node={tree} depth={0} ctx={ctx} />
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          icon={<ListTree className="size-4" />}
          onClick={() => {
            const all = (n: Node): Node => ({ ...n, collapsed: false, children: n.children?.map(all) })
            change(all(tree))
          }}
        >
          Tout déplier
        </Button>
        <Button
          variant="ghost"
          icon={<FoldVertical className="size-4" />}
          onClick={() => {
            const fold = (n: Node, d: number): Node => ({ ...n, collapsed: d >= 1 && !!n.children?.length, children: n.children?.map((c) => fold(c, d + 1)) })
            change(fold(tree, 0))
          }}
        >
          Branches principales seulement
        </Button>
        <span className="flex-1" />
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={() => {
            trash.mutate(id)
            navigate(-1)
          }}
        >
          Supprimer
        </Button>
      </div>

      <GenerateMindmapModal
        open={regen}
        onClose={() => setRegen(false)}
        subjectId={output.subject_id}
        initialCourseIds={output.source_course_ids}
        initialNoteIds={output.source_note_ids}
      />
    </div>
  )
}
