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
import type { ReactNode } from 'react'
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
      <Btn label="Tableau" active={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table2 className={i} />
      </Btn>
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
