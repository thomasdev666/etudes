import { useQuery } from '@tanstack/react-query'
import { BookOpen, Layers, ListChecks, Network, NotebookPen, Search as SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, cx, EmptyState, ErrorBox, PageHeader, Select, Spinner, SubjectChip } from '@/components/ui'
import { useSpace } from '@/context/space'
import { fmt } from '@/lib/dates'
import { useSubjectMap, useSubjects } from '@/lib/data'
import { highlight } from '@/lib/search'
import { supabase } from '@/lib/supabase'

type Kind = 'course' | 'note' | 'sheet' | 'mindmap' | 'quiz' | 'flashcard'
type Hit = { kind: Kind; id: string; subject_id: string | null; title: string; snippet: string; updated_at: string }

const KINDS: Record<Kind, { label: string; icon: ReactNode }> = {
  course: { label: 'Cours', icon: <BookOpen className="size-4" /> },
  note: { label: 'Note', icon: <NotebookPen className="size-4" /> },
  sheet: { label: 'Fiche', icon: <NotebookPen className="size-4" /> },
  mindmap: { label: 'Carte mentale', icon: <Network className="size-4" /> },
  quiz: { label: 'QCM', icon: <ListChecks className="size-4" /> },
  flashcard: { label: 'Flash card', icon: <Layers className="size-4" /> },
}
const FILTERS: { value: Kind | ''; label: string }[] = [
  { value: '', label: 'Tout' },
  { value: 'course', label: 'Cours' },
  { value: 'note', label: 'Notes et fiches' },
  { value: 'mindmap', label: 'Cartes mentales' },
  { value: 'quiz', label: 'QCM' },
  { value: 'flashcard', label: 'Flash cards' },
]

function linkTo(h: Hit) {
  switch (h.kind) {
    case 'course':
      return `/cours/${h.id}`
    case 'note':
      return `/notes/${h.id}`
    case 'mindmap':
      return `/cartes-mentales/${h.id}`
    case 'quiz':
      return `/qcm/demarrer/${h.id}`
    case 'flashcard':
      return h.subject_id ? `/matieres/${h.subject_id}?onglet=cartes` : '/reviser'
    default:
      return h.subject_id ? `/matieres/${h.subject_id}` : '/'
  }
}

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent-ink">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

export default function SearchPage() {
  const { spaceId } = useSpace()
  const { data: subjects = [] } = useSubjects()
  const subjectMap = useSubjectMap()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [query, setQuery] = useState(text)
  const [subject, setSubject] = useState('')
  const [kind, setKind] = useState<Kind | ''>('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])
  // On attend une courte pause dans la frappe avant de chercher
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(text.trim())
      setParams(text.trim() ? { q: text.trim() } : {}, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [text, setParams])

  const search = useQuery({
    queryKey: ['search', spaceId, query],
    enabled: query.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_space', { p_space: spaceId, p_query: query })
      if (error) {
        if (/search_space/.test(error.message)) throw new Error('La recherche n’est pas encore installée : lance la mise à jour 0006_search.sql dans Supabase.')
        throw error
      }
      return data as Hit[]
    },
  })

  const hits = (search.data ?? []).filter(
    (h) => (!subject || h.subject_id === subject) && (!kind || h.kind === kind || (kind === 'note' && h.kind === 'sheet')),
  )

  return (
    <>
      <PageHeader title="Rechercher" />
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={input}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Un mot, une notion, un auteur…"
          aria-label="Rechercher dans mes cours, notes, QCM et flash cards"
          className="w-full rounded-2xl border border-border bg-surface py-3 pl-12 pr-4 text-lg outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type de contenu">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={kind === f.value}
              onClick={() => setKind(f.value)}
              className={cx(
                'rounded-full border px-3 py-1 text-sm font-medium',
                kind === f.value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-muted hover:bg-surface-2',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Matière" className="py-1.5 text-sm sm:w-64">
          <option value="">Toutes les matières</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <ErrorBox error={search.error} />
      {query.length < 2 ? (
        <EmptyState icon={<SearchIcon className="size-8" />} title="Que cherches-tu ?">
          La recherche porte sur tes cours, notes, fiches, cartes mentales, QCM et flash cards. Les accents ne comptent pas.
        </EmptyState>
      ) : search.isLoading ? (
        <Spinner />
      ) : !hits.length ? (
        <EmptyState title="Aucun résultat">Essaie un autre mot, ou retire les filtres.</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {hits.length} résultat{hits.length > 1 ? 's' : ''}
          </p>
          <ul className="flex flex-col gap-2">
            {hits.map((h) => {
              const s = h.subject_id ? subjectMap.get(h.subject_id) : undefined
              return (
                <li key={h.kind + h.id}>
                  <Link to={linkTo(h)} className="block">
                    <Card className="transition-shadow hover:shadow-md">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="inline-flex items-center gap-1 font-medium text-accent-ink">
                          {KINDS[h.kind].icon}
                          {KINDS[h.kind].label}
                        </span>
                        {s && <SubjectChip name={s.name} color={s.color} />}
                        <span className="ml-auto">{fmt(h.updated_at, 'd MMM yyyy')}</span>
                      </div>
                      <p className="font-semibold">
                        <Marked text={h.title} query={query} />
                      </p>
                      {h.snippet && (
                        <p className="mt-1 line-clamp-3 text-sm text-muted">
                          <Marked text={h.snippet.replace(/\s+/g, ' ')} query={query} />
                        </p>
                      )}
                    </Card>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
