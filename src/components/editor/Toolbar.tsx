import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Paperclip,
  Quote,
  Redo2,
  Sigma,
  SquareFunction,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../ui'

function Btn({ label, active, onClick, children, disabled }: { label: string; active?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        active ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

// Choix de la taille du tableau en survolant une grille, comme dans Word / Excel
function TablePicker({ active, onPick }: { active: boolean; onPick: (rows: number, cols: number) => void }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState({ r: 2, c: 2 })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const N = 8

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative" data-tour="note-table">
      <Btn
        label="Insérer un tableau"
        active={active || open}
        onClick={() => {
          // La barre d'outils défile horizontalement : le menu est positionné par rapport à l'écran
          const r = ref.current!.getBoundingClientRect()
          setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) })
          setOpen(!open)
        }}
      >
        <Table2 className="size-[18px]" />
      </Btn>
      {open &&
        createPortal(
        <div ref={pop} className="anim-pop fixed z-50 rounded-2xl border border-border bg-surface p-3 shadow-lg" style={pos}>
          <p className="mb-2 text-center text-sm font-medium tabular-nums">
            {hover.r} × {hover.c}
          </p>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${N}, 1.4rem)` }} onMouseLeave={() => setHover({ r: 2, c: 2 })}>
            {Array.from({ length: N * N }, (_, i) => {
              const r = Math.floor(i / N) + 1
              const c = (i % N) + 1
              const on = r <= hover.r && c <= hover.c
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Tableau de ${r} ligne${r > 1 ? 's' : ''} et ${c} colonne${c > 1 ? 's' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHover({ r, c })}
                  onFocus={() => setHover({ r, c })}
                  onClick={() => {
                    onPick(r, c)
                    setOpen(false)
                  }}
                  className={cx('size-[1.4rem] rounded-[5px] border', on ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2')}
                />
              )
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted">La première ligne sert d’en-tête</p>
        </div>,
          document.body,
        )}
    </div>
  )
}

const Sep = () => <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />

export function Toolbar({ editor, onImage, onAttach }: { editor: Editor; onImage: () => void; onAttach: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()
  const i = 'size-[18px]'

  function link() {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('Adresse du lien', prev ?? 'https://')
    if (url === null) return
    if (!url) c().extendMarkRange('link').unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: url }).run()
  }

  function math(kind: 'inline' | 'block') {
    const latex = prompt(kind === 'inline' ? 'Formule (LaTeX), ex. \\frac{a}{b}' : 'Formule centrée (LaTeX)', '')
    if (!latex) return
    if (kind === 'inline') c().insertInlineMath({ latex }).run()
    else c().insertBlockMath({ latex }).run()
  }

  return (
    <div role="toolbar" aria-label="Mise en forme" className="flex items-center gap-0.5 overflow-x-auto">
      <Btn label="Annuler" onClick={() => c().undo().run()} disabled={!s.canUndo}>
        <Undo2 className={i} />
      </Btn>
      <Btn label="Rétablir" onClick={() => c().redo().run()} disabled={!s.canRedo}>
        <Redo2 className={i} />
      </Btn>
      <Sep />
      <Btn label="Titre 1" active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}>
        <Heading1 className={i} />
      </Btn>
      <Btn label="Titre 2" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className={i} />
      </Btn>
      <Btn label="Titre 3" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 className={i} />
      </Btn>
      <Sep />
      <Btn label="Gras (Ctrl+B)" active={s.bold} onClick={() => c().toggleBold().run()}>
        <Bold className={i} />
      </Btn>
      <Btn label="Italique (Ctrl+I)" active={s.italic} onClick={() => c().toggleItalic().run()}>
        <Italic className={i} />
      </Btn>
      <Btn label="Souligné (Ctrl+U)" active={s.underline} onClick={() => c().toggleUnderline().run()}>
        <Underline className={i} />
      </Btn>
      <Btn label="Barré" active={s.strike} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className={i} />
      </Btn>
      <Btn label="Surligner" active={s.highlight} onClick={() => c().toggleHighlight().run()}>
        <Highlighter className={i} />
      </Btn>
      <Btn label="Lien" active={s.link} onClick={link}>
        <Link2 className={i} />
      </Btn>
      <Sep />
      <Btn label="Liste à puces" active={s.bullet} onClick={() => c().toggleBulletList().run()}>
        <List className={i} />
      </Btn>
      <Btn label="Liste numérotée" active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className={i} />
      </Btn>
      <Btn label="Liste de tâches" active={s.task} onClick={() => c().toggleTaskList().run()}>
        <ListChecks className={i} />
      </Btn>
      <Btn label="Citation" active={s.quote} onClick={() => c().toggleBlockquote().run()}>
        <Quote className={i} />
      </Btn>
      <Btn label="Bloc de code" active={s.code} onClick={() => c().toggleCodeBlock().run()}>
        <Code2 className={i} />
      </Btn>
      <Btn label="Séparateur" onClick={() => c().setHorizontalRule().run()}>
        <Minus className={i} />
      </Btn>
      <Sep />
      <Btn label="Formule dans le texte" onClick={() => math('inline')}>
        <Sigma className={i} />
      </Btn>
      <Btn label="Formule centrée" onClick={() => math('block')}>
        <SquareFunction className={i} />
      </Btn>
      <TablePicker active={s.table} onPick={(rows, cols) => c().insertTable({ rows, cols, withHeaderRow: true }).run()} />
      <Btn label="Image" onClick={onImage}>
        <ImagePlus className={i} />
      </Btn>
      <Btn label="Pièce jointe" onClick={onAttach}>
        <Paperclip className={i} />
      </Btn>
      {s.table && (
        <>
          <Sep />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addRowAfter().run()} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2">
            + ligne
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addColumnAfter().run()} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2">
            + colonne
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteRow().run()} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2">
            − ligne
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteColumn().run()} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2">
            − colonne
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteTable().run()} className="shrink-0 rounded-lg px-2 py-1 text-xs text-danger hover:bg-danger-soft">
            Supprimer le tableau
          </button>
        </>
      )}
    </div>
  )
}
