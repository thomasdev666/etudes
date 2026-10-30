import { AlertTriangle, FileAudio, Loader2, Mic, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserId } from '@/context/auth'
import { usePlan } from '@/lib/plans'
import { jobProgress, useJobs } from '@/context/jobs'
import { useRecorder, useStartTranscription } from '@/context/recorder'
import { useSpace } from '@/context/space'
import { fmt } from '@/lib/dates'
import { useRecordings, useTrash } from '@/lib/data'
import { BUCKET, must, supabase } from '@/lib/supabase'
import type { Recording } from '@/lib/types'
import { Badge, Button, Card, cx, ErrorBox, Field, IconButton, Input, Modal, ProgressBar, Select } from './ui'

// Limite d'un fichier sur l'offre gratuite de Supabase
const MAX_FILE = 50 * 1024 * 1024

export function clockLabel(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`
}

const durationText = (sec: number) => (sec < 60 ? `${sec} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`)

function LanguageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Langue du cours" id="rlang">
      <Select id="rlang" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="fr">Français</option>
        <option value="en">Anglais</option>
        <option value="auto">Détection automatique</option>
      </Select>
    </Field>
  )
}

// Voyant d'enregistrement, visible sur toutes les pages
export function RecorderBar() {
  const rec = useRecorder()
  if (rec.status === 'idle' && !rec.error) return null
  if (rec.status === 'idle')
    return (
      <div className="fixed inset-x-3 top-3 z-40 mx-auto flex max-w-md items-start gap-2 rounded-2xl border border-border bg-surface p-3 text-sm shadow-lg" role="alert">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <span className="flex-1">{rec.error}</span>
      </div>
    )
  const live = rec.status === 'recording'
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-full lg:left-64 border border-danger/30 bg-surface py-2 pl-4 pr-2 shadow-lg"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <span className="relative flex size-3 shrink-0" aria-hidden>
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />}
        <span className={cx('relative inline-flex size-3 rounded-full', live ? 'bg-danger' : 'bg-muted')} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-display text-lg font-bold tabular-nums">{clockLabel(rec.elapsed)}</p>
        <p className="truncate text-xs text-muted">
          {rec.status === 'saving' ? 'Envoi de l’audio…' : rec.status === 'paused' ? 'En pause' : rec.status === 'starting' ? 'Démarrage…' : `Enregistrement · ${rec.meta?.title}`}
        </p>
      </div>
      {rec.status === 'saving' || rec.status === 'starting' ? (
        <Loader2 className="mr-2 size-5 animate-spin text-muted" aria-hidden />
      ) : (
        <>
          {live ? (
            <IconButton label="Mettre en pause" onClick={rec.pause} className="size-10">
              <Pause className="size-5" />
            </IconButton>
          ) : (
            <IconButton label="Reprendre l’enregistrement" onClick={rec.resume} className="size-10">
              <Play className="size-5" />
            </IconButton>
          )}
          <Button
            size="sm"
            variant="danger"
            icon={<Square className="size-4 fill-current" />}
            onClick={() => {
              if (confirm('Terminer l’enregistrement et lancer la transcription ?')) rec.stop()
            }}
          >
            Terminer
          </Button>
        </>
      )}
    </div>
  )
}

export function RecordModal({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const rec = useRecorder()
  const { data: plan } = usePlan()
  const free = plan === 'free'
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('fr')
  const busy = rec.status !== 'idle'
  const defaultTitle = `Cours du ${fmt(new Date(), 'd MMMM')}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enregistrer un cours"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            icon={<Mic className="size-4" />}
            disabled={busy || free}
            onClick={async () => {
              await rec.start({ subjectId, title: title.trim() || defaultTitle, language })
              setTitle('')
              onClose()
            }}
          >
            Démarrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {busy && <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Un enregistrement est déjà en cours.</p>}
        {free && <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">La transcription est réservée à l’offre Premium. <Link to="/abonnement" className="font-medium text-accent-ink underline">Essaie-la gratuitement 7 jours</Link></p>}
        <Field label="Titre" id="rtitle">
          <Input id="rtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} />
        </Field>
        <LanguageField value={language} onChange={setLanguage} />
        <ul className="list-disc space-y-1 rounded-2xl bg-surface-2 py-3 pl-8 pr-3 text-sm text-muted">
          <li>Pose ton téléphone ou ton ordinateur près de l’enseignant. L’écran reste allumé pendant l’enregistrement.</li>
          <li>Tu peux continuer à utiliser l’appli : le voyant rouge reste visible en haut.</li>
          <li>Sur iPhone, ne verrouille pas l’écran et ne quitte pas Safari : l’enregistrement s’arrêterait.</li>
          <li>À la fin, la transcription devient un cours de la matière. L’enregistrement reste privé.</li>
        </ul>
      </div>
    </Modal>
  )
}

// Durée d'un fichier audio ou vidéo, lue par le navigateur
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio')
    const url = URL.createObjectURL(file)
    const done = (v: number) => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(v) ? Math.round(v) : 0)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(el.duration)
    el.onerror = () => done(0)
    setTimeout(() => done(0), 8000)
    el.src = url
  })
}

export function AudioImportModal({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const { spaceId } = useSpace()
  const { data: plan } = usePlan()
  const free = plan === 'free'
  const userId = useUserId()
  const startTranscription = useStartTranscription()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('fr')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<unknown>(null)

  const tooBig = !!file && file.size > MAX_FILE
  const isVideo = !!file && (file.type.startsWith('video') || /\.(mp4|mov)$/i.test(file.name))

  async function send() {
    if (!file || tooBig) return
    setError(null)
    try {
      setBusy('Lecture du fichier…')
      const duration = await readDuration(file)
      const name = title.trim() || file.name.replace(/\.[^.]+$/, '')
      const rec = must(
        await supabase
          .from('recordings')
          .insert({ space_id: spaceId, subject_id: subjectId, title: name, language, source: 'import', status: 'uploading', duration_sec: duration, size_bytes: file.size })
          .select('id')
          .single(),
      ) as { id: string }
      setBusy('Envoi du fichier…')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'audio'
      const path = `${userId}/${spaceId}/recordings/${rec.id}/part-0.${ext}`
      must(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined }))
      must(
        await supabase
          .from('files')
          .insert({ space_id: spaceId, path, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, recording_id: rec.id, part_index: 0, duration_sec: duration }),
      )
      await startTranscription({ id: rec.id, subjectId, title: name, durationSec: duration })
      setFile(null)
      setTitle('')
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transcrire un fichier audio"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={send} loading={!!busy} disabled={!file || tooBig || free}>
            {busy || 'Transcrire'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center hover:border-accent">
          <FileAudio className="size-7 text-muted" aria-hidden />
          <span className="font-medium">{file ? file.name : 'Choisir un fichier'}</span>
          <span className="text-sm text-muted">MP3, M4A (Dictaphone), WAV, MP4 ou MOV · 50 Mo au plus</span>
          <input
            type="file"
            accept="audio/*,video/mp4,video/quicktime,.mp3,.m4a,.wav,.mp4,.mov"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
            }}
          />
        </label>
        {tooBig && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
            Ce fichier fait {Math.round(file!.size / 1024 / 1024)} Mo : le stockage gratuit accepte 50 Mo par fichier. Enregistre plutôt le cours directement dans
            l’appli (environ 15 Mo pour 1 h), ou exporte l’audio en qualité « compressée ».
          </p>
        )}
        {isVideo && !tooBig && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Pour une vidéo, seule la parole est transcrite. Une vidéo longue (plus de 30 min) peut dépasser le quota gratuit : préfère l’audio seul.</p>
        )}
        <Field label="Titre" id="atitle">
          <Input id="atitle" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <LanguageField value={language} onChange={setLanguage} />
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}

const STATUS: Record<Recording['status'], string> = {
  uploading: 'Envoi de l’audio',
  transcribing: 'Transcription en cours',
  done: 'Transcrit',
  error: 'Échec',
}

// Enregistrements d'une matière qui ne sont pas encore (ou pas correctement) transcrits
export function RecordingsPanel({ subjectId }: { subjectId: string }) {
  const { data = [] } = useRecordings()
  const { find } = useJobs()
  const rec = useRecorder()
  const trash = useTrash('recordings')
  const startTranscription = useStartTranscription()
  const [error, setError] = useState<unknown>(null)
  const list = data.filter((r) => r.subject_id === subjectId && r.status !== 'done' && r.id !== rec.meta?.recordingId)
  if (!list.length) return null

  async function retry(r: Recording) {
    setError(null)
    try {
      // Durée totale d'après les morceaux réellement envoyés (enregistrement interrompu)
      const { data: parts } = await supabase.from('files').select('duration_sec').eq('recording_id', r.id)
      if (!parts?.length) throw new Error('Aucun audio n’a été envoyé pour cet enregistrement.')
      const duration = parts.reduce((s, p) => s + (p.duration_sec ?? 0), 0)
      await supabase.from('recordings').update({ duration_sec: duration }).eq('id', r.id)
      await startTranscription({ id: r.id, subjectId, title: r.title, durationSec: duration })
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {list.map((r) => {
        const job = find((j) => j.kind === 'transcription' && j.params.recording_id === r.id)
        const stuck = r.status === 'uploading' && Date.now() - new Date(r.created_at).getTime() > 60_000
        return (
          <Card key={r.id} className="flex items-start gap-3">
            <Mic className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.title}</p>
              <p className="text-sm text-muted">
                {fmt(r.created_at, 'd MMM')}
                {r.duration_sec > 0 && ` · ${durationText(r.duration_sec)}`} · {stuck ? 'Enregistrement interrompu' : STATUS[r.status]}
              </p>
              {r.status === 'transcribing' && (
                <div className="mt-2 max-w-xs">
                  <ProgressBar value={job ? jobProgress(job) : 30} label="Transcription en cours" />
                  <p className="mt-1 text-xs text-muted">{job?.result?.phase ?? 'Transcription en cours…'}</p>
                </div>
              )}
              {r.status === 'error' && (
                <div className="mt-1">
                  <Badge tone="danger">{r.error?.slice(0, 140) ?? 'Échec'}</Badge>
                </div>
              )}
            </div>
            {(r.status === 'error' || stuck) && r.audio_state === 'stored' && (
              <IconButton label={stuck ? 'Transcrire la partie enregistrée' : 'Relancer la transcription'} onClick={() => retry(r)}>
                <RotateCcw className="size-4" />
              </IconButton>
            )}
            <IconButton
              label="Supprimer l’enregistrement"
              onClick={() => {
                if (confirm('Mettre cet enregistrement à la corbeille ?')) trash.mutate(r.id)
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </Card>
        )
      })}
      <ErrorBox error={error} />
    </div>
  )
}

// Lecteur de l'audio d'origine, quand il a été gardé
export function RecordingAudio({ recordingId }: { recordingId: string }) {
  const [urls, setUrls] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  if (urls)
    return (
      <div className="flex flex-col gap-2">
        {urls.map((u, i) => (
          <audio key={u} controls preload="none" src={u} className="w-full" aria-label={`Audio, partie ${i + 1}`} />
        ))}
      </div>
    )
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={loading}
      icon={<Play className="size-4" />}
      onClick={async () => {
        setLoading(true)
        const { data: parts } = await supabase.from('files').select('path').eq('recording_id', recordingId).order('part_index')
        const signed = await Promise.all((parts ?? []).map(async (p) => (await supabase.storage.from(BUCKET).createSignedUrl(p.path, 3600)).data?.signedUrl))
        setUrls(signed.filter((u): u is string => !!u))
        setLoading(false)
      }}
    >
      Écouter l’enregistrement
    </Button>
  )
}
