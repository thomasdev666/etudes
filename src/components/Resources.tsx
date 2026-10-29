import { ExternalLink, FileText, Library, Link2, Paperclip, Plus, Trash2, Video } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useUserId } from '@/context/auth'
import { useSpace } from '@/context/space'
import { fmt } from '@/lib/dates'
import { useInvalidate, useResources, useTrash } from '@/lib/data'
import { hostOf, isVideoUrl, normalizeUrl, youtubeId } from '@/lib/resources'
import { highlight } from '@/lib/search'
import { BUCKET, must, supabase } from '@/lib/supabase'
import type { Resource } from '@/lib/types'
import { Button, Card, cx, EmptyState, ErrorBox, Field, IconButton, Input, Modal, Textarea } from './ui'

const MAX_FILE = 50 * 1024 * 1024
const safeName = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_')
const FILTERS = [
  { value: '', label: 'Tout' },
  { value: 'link', label: 'Liens' },
  { value: 'video', label: 'Vidéos' },
  { value: 'file', label: 'Documents' },
] as const

function LinkModal({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = normalizeUrl(url)
    if (!clean) return setError(new Error('Ce lien n’est pas valide (exemple : https://www.youtube.com/watch?v=…).'))
    setBusy(true)
    setError(null)
    try {
      must(
        await supabase.from('resources').insert({
          space_id: spaceId,
          subject_id: subjectId,
          kind: isVideoUrl(clean) ? 'video' : 'link',
          title: title.trim() || hostOf(clean),
          description: description.trim(),
          url: clean,
        }),
      )
      await invalidate('resources')
      setUrl('')
      setTitle('')
      setDescription('')
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un lien ou une vidéo">
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Lien" id="rurl">
          <Input id="rurl" type="url" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus />
        </Field>
        <Field label="Titre (optionnel)" id="rtit">
          <Input id="rtit" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={normalizeUrl(url) ? hostOf(normalizeUrl(url)!) : 'Vidéo sur la VAN'} />
        </Field>
        <Field label="Description (optionnelle)" id="rdesc" hint="Elle sert aussi à retrouver la ressource dans la recherche.">
          <Textarea id="rdesc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
        </Field>
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={busy}>
            Ajouter
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// Envoi d'un document ; le texte des PDF est extrait sur l'appareil pour la recherche
function useUploadResource(subjectId: string) {
  const { spaceId } = useSpace()
  const userId = useUserId()
  const invalidate = useInvalidate()
  return async (file: File) => {
    if (file.size > MAX_FILE) throw new Error(`« ${file.name} » fait plus de 50 Mo, la limite du stockage gratuit.`)
    let content_text = ''
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const { readPdfText } = await import('@/lib/pdf')
      content_text = (await readPdfText(file).catch(() => '')).slice(0, 200_000)
    } else if (/^text\//.test(file.type) || /\.(txt|md|csv)$/i.test(file.name)) content_text = (await file.text()).slice(0, 200_000)
    const path = `${userId}/${spaceId}/resources/${crypto.randomUUID()}-${safeName(file.name)}`
    must(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined }))
    must(
      await supabase.from('resources').insert({
        space_id: spaceId,
        subject_id: subjectId,
        kind: 'file',
        title: file.name.replace(/\.[^.]+$/, ''),
        file_path: path,
        file_name: file.name,
        mime: file.type || null,
        size: file.size,
        content_text,
      }),
    )
    await invalidate('resources')
  }
}

function ResourceItem({ r, query }: { r: Resource; query: string }) {
  const trash = useTrash('resources')
  const yt = r.url ? youtubeId(r.url) : null
  const mark = (t: string) =>
    highlight(t, query).map((p, i) =>
      p.hit ? (
        <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent-ink">
          {p.text}
        </mark>
      ) : (
        <span key={i}>{p.text}</span>
      ),
    )

  async function open() {
    if (r.url) return window.open(r.url, '_blank', 'noopener')
    if (!r.file_path) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_path, 600)
    if (data) window.open(data.signedUrl, '_blank', 'noopener')
  }

  const Icon = r.kind === 'video' ? Video : r.kind === 'file' ? FileText : Link2
  return (
    <Card className="flex items-start gap-3">
      {yt ? (
        <button type="button" onClick={open} className="shrink-0 overflow-hidden rounded-xl" aria-label={`Ouvrir la vidéo ${r.title}`}>
          <img src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`} alt="" loading="lazy" className="h-12 w-20 object-cover sm:h-16 sm:w-28" />
        </button>
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={open} className="block max-w-full text-left font-semibold hover:underline">
          {mark(r.title)}
          <ExternalLink className="ml-1 inline size-3.5 text-muted" aria-hidden />
        </button>
        {r.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{mark(r.description)}</p>}
        <p className="mt-0.5 text-xs text-muted">
          {r.url ? hostOf(r.url) : r.file_name}
          {r.size ? ` · ${(r.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : ''} · ajouté le {fmt(r.created_at, 'd MMM yyyy')}
        </p>
      </div>
      <IconButton label={`Supprimer ${r.title}`} onClick={() => trash.mutate(r.id)}>
        <Trash2 className="size-4" />
      </IconButton>
    </Card>
  )
}

export function ResourcesPanel({ subjectId }: { subjectId: string }) {
  const { data = [], error: loadError } = useResources()
  const upload = useUploadResource(subjectId)
  const [linkOpen, setLinkOpen] = useState(false)
  const [kind, setKind] = useState<'' | Resource['kind']>('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<unknown>(null)

  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = norm(query.trim())
  const list = data.filter(
    (r) =>
      r.subject_id === subjectId &&
      (!kind || r.kind === kind) &&
      (!q || norm(`${r.title} ${r.description} ${r.url ?? ''} ${r.file_name ?? ''} ${r.content_text}`).includes(q)),
  )
  const total = data.filter((r) => r.subject_id === subjectId).length

  if (loadError)
    return <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">La bibliothèque n’est pas encore installée : lance la mise à jour 0008_resources_reminders.sql dans Supabase.</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2" data-tour="res-add">
        <label className={cx('inline-flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-border bg-surface px-4 font-medium hover:bg-surface-2', busy && 'pointer-events-none opacity-60')}>
          <Paperclip className="size-4" aria-hidden /> {busy || 'Document'}
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              setError(null)
              try {
                for (const [i, f] of files.entries()) {
                  setBusy(files.length > 1 ? `Envoi ${i + 1} / ${files.length}…` : 'Envoi…')
                  await upload(f)
                }
              } catch (err) {
                setError(err)
              } finally {
                setBusy('')
              }
            }}
          />
        </label>
        <Button icon={<Plus className="size-4" />} onClick={() => setLinkOpen(true)}>
          Lien ou vidéo
        </Button>
      </div>
      <ErrorBox error={error} />

      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type de ressource">
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
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher dans les ressources…" aria-label="Chercher dans les ressources" className="py-1.5 text-sm sm:ml-auto sm:w-64" />
        </div>
      )}

      {!total ? (
        <EmptyState icon={<Library className="size-8" />} title="Aucune ressource">
          Range ici les vidéos, articles, manuels et documents utiles pour cette matière. Le texte des PDF est lu pour que tu les retrouves dans la recherche.
        </EmptyState>
      ) : !list.length ? (
        <p className="py-6 text-center text-sm text-muted">Aucune ressource ne correspond.</p>
      ) : (
        list.map((r) => <ResourceItem key={r.id} r={r} query={query} />)
      )}
      <LinkModal open={linkOpen} onClose={() => setLinkOpen(false)} subjectId={subjectId} />
    </div>
  )
}
