import { FileText, FileUp, NotebookPen, Plus, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, cx, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner, SubjectChip } from '@/components/ui'
import { useSpace } from '@/context/space'
import { fmt } from '@/lib/dates'
import { insertSheetNote, isSheet, useInvalidate, useNotesList, useSubjectMap, useSubjects } from '@/lib/data'
import { fileToNote, NOTE_IMPORT_ACCEPT } from '@/lib/importNote'
import { must, supabase } from '@/lib/supabase'

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-warning-soft px-0.5 text-text">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

// Notes et fiches de révision : deux espaces séparés, mêmes outils (édition, export, partage)
export function NotesSwitch({ kind }: { kind: 'note' | 'sheet' }) {
  const tab = (active: boolean) => cx('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium', active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')
  return (
    <nav aria-label="Notes ou fiches" className="mb-4 inline-flex gap-1 rounded-2xl bg-surface-2 p-1">
      <Link to="/notes" aria-current={kind === 'note' ? 'page' : undefined} className={tab(kind === 'note')}>
        <NotebookPen className="size-4" aria-hidden /> Mes notes
      </Link>
      <Link to="/fiches" aria-current={kind === 'sheet' ? 'page' : undefined} className={tab(kind === 'sheet')}>
        <FileText className="size-4" aria-hidden /> Fiches de révision
      </Link>
    </nav>
  )
}

export function SheetsPage() {
  return <NotesPage kind="sheet" />
}

export default function NotesPage({ kind = 'note' }: { kind?: 'note' | 'sheet' }) {
  const sheets = kind === 'sheet'
  const { spaceId } = useSpace()
  const navigate = useNavigate()
  const { data: notes, isLoading } = useNotesList()
  const { data: subjects = [] } = useSubjects()
  const subjectMap = useSubjectMap()
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (notes ?? []).filter(
      (n) =>
        isSheet(n) === sheets &&
        (!subject || n.subject_id === subject) &&
        (!needle || n.title.toLowerCase().includes(needle) || n.content_text.toLowerCase().includes(needle)),
    )
  }, [notes, q, subject, sheets])
  const total = (notes ?? []).filter((n) => isSheet(n) === sheets).length

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<unknown>(null)
  const invalidate = useInvalidate()

  // Import de fichiers : une note par fichier, dans la matière filtrée s'il y en a une
  async function importFiles(files: FileList) {
    setImporting(true)
    setImportError(null)
    try {
      const ids: string[] = []
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`« ${file.name} » dépasse 10 Mo.`)
        const note = await fileToNote(file)
        const row = must(await supabase.from('notes').insert({ space_id: spaceId, subject_id: subject || null, ...note }).select('id').single()) as { id: string }
        ids.push(row.id)
      }
      await invalidate('notes')
      if (ids.length === 1) navigate(`/notes/${ids[0]}`)
    } catch (e) {
      setImportError(e)
    } finally {
      setImporting(false)
    }
  }

  async function create() {
    setCreating(true)
    const row = { space_id: spaceId, subject_id: subject || null, title: sheets ? 'Nouvelle fiche' : 'Nouvelle note' }
    const n = sheets ? await insertSheetNote(row) : (must(await supabase.from('notes').insert(row).select('id').single()) as { id: string })
    navigate(`/notes/${n.id}`)
  }

  // Fiches : regroupées par matière, dans l'ordre des matières
  const groups = useMemo(() => {
    if (!sheets) return [{ id: '', items: filtered }]
    const order = [...subjects.map((s) => s.id), '']
    return order.map((id) => ({ id, items: filtered.filter((n) => (n.subject_id ?? '') === id) })).filter((g) => g.items.length)
  }, [filtered, sheets, subjects])

  function snippet(text: string) {
    const needle = q.trim().toLowerCase()
    if (!needle) return text.slice(0, 160)
    const i = text.toLowerCase().indexOf(needle)
    return i < 0 ? text.slice(0, 160) : (i > 60 ? '…' : '') + text.slice(Math.max(0, i - 60), i + 100)
  }

  return (
    <>
      <PageHeader
        title={sheets ? 'Fiches de révision' : 'Notes'}
        subtitle={sheets ? 'Tes fiches générées par l’IA ou par GIRAFA, rangées par matière. Modifie-les, exporte-les ou partage-les comme une note.' : undefined}
        actions={
          sheets ? (
            <>
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={create} loading={creating}>
                Fiche vide
              </Button>
              <Link to="/assistant">
                <Button icon={<Sparkles className="size-4" />}>Demander à GIRAFA</Button>
              </Link>
            </>
          ) : (
          <>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 ${importing ? 'pointer-events-none opacity-60' : ''}`}>
              <FileUp className="size-4" aria-hidden />
              {importing ? 'Import…' : 'Importer'}
              <input type="file" multiple accept={NOTE_IMPORT_ACCEPT} className="sr-only" onChange={(e) => e.target.files?.length && importFiles(e.target.files)} />
            </label>
            <Button icon={<Plus className="size-4" />} onClick={create} loading={creating}>
              Nouvelle note
            </Button>
          </>
          )
        }
      />
      <NotesSwitch kind={kind} />
      <ErrorBox error={importError} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={sheets ? 'Rechercher dans les fiches…' : 'Rechercher dans les notes…'} aria-label="Rechercher" className="pl-9" />
        </div>
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filtrer par matière" className="sm:w-56">
          <option value="">Toutes les matières</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <Spinner />
      ) : !filtered.length ? (
        <EmptyState icon={sheets ? <FileText className="size-8" /> : <NotebookPen className="size-8" />} title={total ? 'Aucun résultat' : sheets ? 'Aucune fiche pour l’instant' : 'Aucune note'}>
          {total
            ? 'Essaie un autre mot.'
            : sheets
              ? 'Ouvre un cours et touche « Fiche de révision », ou demande à GIRAFA une fiche sur ce que tu veux.'
              : 'Prends tes notes de cours ici : titres, tableaux, formules, images. Tu peux aussi importer tes notes Notion (Markdown), Word ou texte.'}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.id || 'none'} aria-label={g.id ? subjectMap.get(g.id)?.name : 'Sans matière'}>
              {sheets && (
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: g.id ? subjectMap.get(g.id)?.color : 'var(--muted)' }} aria-hidden />
                  <span translate="no">{g.id ? subjectMap.get(g.id)?.name : 'Sans matière'}</span>
                  <span className="font-normal text-muted">· {g.items.length}</span>
                </h2>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {g.items.map((n) => {
            const s = n.subject_id ? subjectMap.get(n.subject_id) : undefined
            return (
              <Link key={n.id} to={`/notes/${n.id}`}>
                <Card className="h-full hover:shadow-md">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    {sheets ? <FileText className="size-4 text-accent-ink" aria-hidden /> : s ? <SubjectChip name={s.name} color={s.color} /> : <span className="text-xs text-muted">Sans matière</span>}
                    <span className="shrink-0 text-xs text-muted">{fmt(n.updated_at, 'd MMM')}</span>
                  </div>
                  <p className="font-semibold">
                    <Highlight text={n.title} q={q.trim()} />
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-muted">
                    <Highlight text={snippet(n.content_text) || 'Vide'} q={q.trim()} />
                  </p>
                </Card>
              </Link>
            )
          })}
        </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
