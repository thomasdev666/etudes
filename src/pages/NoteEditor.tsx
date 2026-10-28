import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react'
import { ArrowLeft, Download, FileDown, FileText, History, ListChecks, MoreHorizontal, Network, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { buildExtensions } from '@/components/editor/extensions'
import { Toolbar } from '@/components/editor/Toolbar'
import { GenerateCardsModal, GenerateMindmapModal, useGenerateSheet } from '@/components/Generate'
import { Button, ErrorBox, IconButton, Modal, Select, Spinner } from '@/components/ui'
import { useUserId } from '@/context/auth'
import { useSpace } from '@/context/space'
import { useToast } from '@/context/toast'
import { fmt } from '@/lib/dates'
import { useInvalidate, useSubjects, useTrash } from '@/lib/data'
import { noteToDocx, safeFilename, saveBlob } from '@/lib/exportNote'
import { noteToPdf } from '@/lib/pdfExport'
import { signedUrl, STORAGE_PREFIX, uploadNoteFile } from '@/lib/storage'
import { must, supabase } from '@/lib/supabase'
import { useFirstTimeTour } from '@/lib/tours'
import type { Note, NoteVersion } from '@/lib/types'

type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

function Versions({ noteId, open, onClose, onRestore }: { noteId: string; open: boolean; onClose: () => void; onRestore: (v: NoteVersion) => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['note_versions', noteId],
    enabled: open,
    queryFn: async () =>
      must(await supabase.from('note_versions').select('*').eq('note_id', noteId).order('created_at', { ascending: false }).limit(50)) as NoteVersion[],
  })
  return (
    <Modal open={open} onClose={onClose} title="Versions précédentes">
      {isLoading ? (
        <Spinner />
      ) : !data.length ? (
        <p className="text-sm text-muted">Pas encore de version. Une copie est gardée toutes les 10 minutes d’édition.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{fmt(v.created_at, "EEEE d MMMM 'à' HH'h'mm")}</p>
                <p className="truncate text-sm text-muted">{v.title}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onRestore(v)}>
                Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// Une instance d'éditeur par note (évite de mélanger deux notes)
export default function NoteEditorPage() {
  const { id = '' } = useParams()
  return <NoteEditor key={id} id={id} />
}

function NoteEditor({ id }: { id: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const userId = useUserId()
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const trash = useTrash('notes')
  const { data: subjects = [] } = useSubjects()
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState<string>('')
  const [state, setState] = useState<SaveState>('saved')
  const [menu, setMenu] = useState(false)
  const [versions, setVersions] = useState(false)
  const [gen, setGen] = useState(false)
  const [mind, setMind] = useState(false)
  const generateSheet = useGenerateSheet()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const [ready, setReady] = useState(false)
  const tour = useFirstTimeTour('note', ready)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const { data: note, isLoading, error: loadError } = useQuery({
    queryKey: ['notes', spaceId, 'one', id],
    queryFn: async () => must(await supabase.from('notes').select('*').eq('id', id).single()) as Note,
    staleTime: Infinity,
    gcTime: 0,
  })

  const editor = useEditor(
    {
      extensions: buildExtensions(() => editorRef.current),
      content: '',
      editorProps: {
        attributes: { class: 'prose-note', 'aria-label': 'Contenu de la note' },
        handleClick: (_view, _pos, event) => {
          const a = (event.target as HTMLElement).closest('a')
          const href = a?.getAttribute('href') ?? ''
          if (href.startsWith(STORAGE_PREFIX)) {
            signedUrl(href.slice(STORAGE_PREFIX.length)).then((u) => window.open(u, '_blank', 'noopener'))
            return true
          }
          if (a && (event.metaKey || event.ctrlKey)) {
            window.open(href, '_blank', 'noopener')
            return true
          }
          return false
        },
      },
      onUpdate: () => schedule(),
    },
    [],
  )
  editorRef.current = editor

  useEffect(() => {
    if (!note || !editor) return
    setTitle(note.title)
    setSubjectId(note.subject_id ?? '')
    editor.commands.setContent(note.content as JSONContent, { emitUpdate: false })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, editor])

  // Sauvegarde automatique 800 ms après la dernière frappe
  const latest = useRef({ title, subjectId })
  latest.current = { title, subjectId }
  function schedule() {
    setState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(save, 800)
  }
  async function save() {
    const ed = editorRef.current
    if (!ed) return
    setState('saving')
    const { error } = await supabase
      .from('notes')
      .update({
        title: latest.current.title.trim() || 'Sans titre',
        subject_id: latest.current.subjectId || null,
        content: ed.getJSON(),
        content_text: ed.getText({ blockSeparator: '\n' }),
      })
      .eq('id', id)
    setState(error ? 'error' : 'saved')
    if (!error) invalidate('notes')
  }

  // Sauvegarde avant de quitter la page
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current)
        save()
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function upload(file: File, kind: 'image' | 'file') {
    if (!editor) return
    setBusy(kind === 'image' ? 'Envoi de l’image…' : 'Envoi du fichier…')
    try {
      const path = await uploadNoteFile({ userId, spaceId, noteId: id, file })
      if (kind === 'image') editor.chain().focus().setImage({ src: STORAGE_PREFIX + path, alt: file.name }).run()
      else
        editor
          .chain()
          .focus()
          .insertContent({ type: 'text', text: `📎 ${file.name}`, marks: [{ type: 'link', attrs: { href: STORAGE_PREFIX + path } }] })
          .insertContent(' ')
          .run()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function exportDocx() {
    if (!editor) return
    setMenu(false)
    setBusy('Création du fichier Word…')
    try {
      saveBlob(await noteToDocx(title || 'Note', editor.getJSON()), `${safeFilename(title)}.docx`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function exportPdf() {
    if (!editor) return
    setMenu(false)
    setBusy('Création du PDF…')
    try {
      saveBlob(await noteToPdf(title || 'Note', editor.view.dom.innerHTML), `${safeFilename(title)}.pdf`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function restore(v: NoteVersion) {
    if (!editor) return
    editor.commands.setContent(v.content as JSONContent)
    setTitle(v.title)
    setVersions(false)
    await save()
    toast({ message: 'Version restaurée' })
  }

  if (isLoading) return <Spinner />
  if (loadError || !note) return <ErrorBox error={loadError ?? 'Note introuvable'} />

  const stateLabel = { saved: 'Enregistré', saving: 'Enregistrement…', dirty: 'Modifications…', error: 'Erreur d’enregistrement' }[state]

  return (
    <div className="-mx-4 sm:mx-0">
      <div className="mb-3 flex items-center gap-2 px-4 sm:px-0">
        <IconButton label="Retour" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <Select
          aria-label="Matière"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value)
            latest.current.subjectId = e.target.value
            schedule()
          }}
          className="w-auto max-w-[45vw] py-1.5 text-sm sm:max-w-xs"
        >
          <option value="">Sans matière</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <span className={`flex-1 text-right text-xs ${state === 'error' ? 'text-danger' : 'text-muted'}`} aria-live="polite">
          {busy ?? stateLabel}
        </span>
        <div className="relative">
          <IconButton data-tour="note-menu" label="Plus d’actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <MoreHorizontal className="size-5" />
          </IconButton>
          {menu && (
            <div role="menu" className="anim-pop absolute right-0 z-30 mt-1 w-60 rounded-2xl border border-border bg-surface p-1 shadow-lg">
              <MenuItem icon={<FileDown className="size-4" />} onClick={exportPdf}>
                Exporter en PDF
              </MenuItem>
              <MenuItem icon={<Download className="size-4" />} onClick={exportDocx}>
                Exporter en Word (DOCX)
              </MenuItem>
              <MenuItem
                icon={<Sparkles className="size-4" />}
                onClick={async () => {
                  setMenu(false)
                  await save()
                  setGen(true)
                }}
              >
                Générer des flash cards
              </MenuItem>
              <MenuItem
                icon={<ListChecks className="size-4" />}
                onClick={async () => {
                  setMenu(false)
                  await save()
                  navigate(`/qcm/nouveau?note=${id}${subjectId ? `&matiere=${subjectId}` : ''}`)
                }}
              >
                Générer un QCM
              </MenuItem>
              <MenuItem
                icon={<Network className="size-4" />}
                onClick={async () => {
                  setMenu(false)
                  await save()
                  setMind(true)
                }}
              >
                Générer une carte mentale
              </MenuItem>
              <MenuItem
                icon={<FileText className="size-4" />}
                onClick={async () => {
                  setMenu(false)
                  await save()
                  await generateSheet({ subjectId: subjectId || null, title: title.trim() || 'Note', noteIds: [id] })
                }}
              >
                Générer une fiche de révision
              </MenuItem>
              <MenuItem
                icon={<History className="size-4" />}
                onClick={() => {
                  setMenu(false)
                  setVersions(true)
                }}
              >
                Versions précédentes
              </MenuItem>
              <MenuItem
                icon={<Trash2 className="size-4" />}
                danger
                onClick={() => {
                  clearTimeout(timer.current)
                  timer.current = undefined
                  trash.mutate(id)
                  qc.removeQueries({ queryKey: ['notes', spaceId, 'one', id] })
                  navigate('/notes')
                }}
              >
                Mettre à la corbeille
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      {tour}
      <div className="border-y border-border bg-surface sm:rounded-[var(--radius-card)] sm:border">
        <div data-tour="note-toolbar" className="sticky top-[57px] z-10 border-b border-border bg-surface/95 px-2 py-1 backdrop-blur sm:rounded-t-[var(--radius-card)] lg:top-0">
          {editor && <Toolbar editor={editor} onImage={() => imageInput.current?.click()} onAttach={() => fileInput.current?.click()} />}
        </div>
        <div className="px-4 py-5 sm:px-8">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              latest.current.title = e.target.value
              schedule()
            }}
            aria-label="Titre de la note"
            placeholder="Titre"
            className="mb-4 w-full bg-transparent font-display text-3xl font-bold outline-none placeholder:text-muted/60"
          />
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="mt-3 px-4 sm:px-0">
        <ErrorBox error={error} />
      </div>

      <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'image')} />
      <input ref={fileInput} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'file')} />
      <Versions noteId={id} open={versions} onClose={() => setVersions(false)} onRestore={restore} />
      <GenerateCardsModal open={gen} onClose={() => setGen(false)} subjectId={subjectId || undefined} initialNoteIds={[id]} />
      <GenerateMindmapModal open={mind} onClose={() => setMind(false)} subjectId={subjectId || undefined} initialNoteIds={[id]} />
      <p className="mt-4 px-4 text-xs text-muted sm:px-0">
        Astuce : sélectionne du texte et utilise Ctrl+B / Ctrl+I. Clique sur une formule pour la modifier.{' '}
        <Link to="/notes" className="underline">
          Toutes les notes
        </Link>
      </p>
    </div>
  )
}

function MenuItem({ icon, children, onClick, danger, disabled }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm disabled:opacity-40 ${danger ? 'text-danger hover:bg-danger-soft' : 'hover:bg-surface-2'}`}
    >
      {icon}
      {children}
    </button>
  )
}
