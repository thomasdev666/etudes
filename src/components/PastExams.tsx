import { Download, Eye, FileUp, GraduationCap, ListChecks, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserId } from '@/context/auth'
import { useSpace } from '@/context/space'
import { useToast } from '@/context/toast'
import { fmt } from '@/lib/dates'
import { extractExamText, looksScanned, PAST_EXAMS_MIGRATION, pastExamContent, usePastExams, type PastExam } from '@/lib/pastExams'
import { BUCKET, must, supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Input, Modal, Spinner, Tabs, Textarea } from './ui'

const safeName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')

function ExamImport({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const { spaceId } = useSpace()
  const userId = useUserId()
  const qc = useQueryClient()
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [title, setTitle] = useState('')
  const [session, setSession] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const lock = useRef(false)

  function reset() {
    setTitle('')
    setSession('')
    setText('')
    setFile(null)
    setError(null)
  }

  async function onFile(f: File | null) {
    setFile(f)
    setError(null)
    setText('')
    if (!f) return
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    if (!session) setSession(f.name.match(/20\d\d/)?.[0] ?? '')
    setReading(true)
    try {
      setText(await extractExamText(f))
    } catch (e) {
      setError(e)
    } finally {
      setReading(false)
    }
  }

  async function save() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      const file_path = file ? `${userId}/${spaceId}/exams/${crypto.randomUUID()}-${safeName(file.name)}` : null
      if (file && file_path) must(await supabase.storage.from(BUCKET).upload(file_path, file, { contentType: file.type || undefined }))
      const res = await supabase
        .from('past_exams')
        .insert({ space_id: spaceId, subject_id: subjectId, title: title.trim() || 'Ancien partiel', session: session.trim(), content: text.trim(), file_path, file_name: file?.name ?? null })
      if (res.error && /past_exams/.test(res.error.message)) throw new Error(PAST_EXAMS_MIGRATION)
      must(res)
      await qc.invalidateQueries({ queryKey: ['past_exams'] })
      reset()
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
      lock.current = false
    }
  }

  const scanned = !!file && !reading && looksScanned(text)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter un ancien partiel"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} loading={busy} disabled={reading || text.trim().length < 40}>
            Enregistrer le partiel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Sujet seul ou avec son corrigé. L’IA s’en sert comme modèle (format, niveau, type de questions, notions qui tombent) pour tes QCM et tes partiels blancs : elle ne recopie
          jamais les questions.
        </p>
        <Tabs
          label="Source"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'file', label: 'Fichier (PDF, Word…)' },
            { value: 'text', label: 'Coller du texte' },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label="Titre" id="etitle">
            <Input id="etitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Partiel de finance" />
          </Field>
          <Field label="Année ou session (optionnel)" id="esession">
            <Input id="esession" value={session} onChange={(e) => setSession(e.target.value)} placeholder="Janvier 2025" />
          </Field>
        </div>
        {mode === 'file' && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-center hover:border-accent">
            <FileUp className="size-7 text-muted" aria-hidden />
            <span className="font-medium">{file ? file.name : 'Choisir un fichier'}</span>
            <span className="text-sm text-muted">PDF, Word (.docx), PowerPoint (.pptx) ou texte. Le texte est extrait sur ton appareil.</span>
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {reading && <Spinner label="Lecture du fichier" />}
        {scanned && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm">
            Ce fichier semble être un scan (une photo des pages) : presque aucun texte n’a pu être lu. Colle le texte du sujet ci-dessous, ou utilise une version PDF avec du
            texte sélectionnable.
          </p>
        )}
        {(mode === 'text' || (file && !reading)) && (
          <Field label="Texte du sujet" id="etext" hint="Tu peux corriger ou compléter le texte avant d’enregistrer.">
            <Textarea id="etext" className="min-h-60 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}

function ExamView({ exam, onClose }: { exam: PastExam; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const started = useRef(false)
  if (!started.current) {
    started.current = true
    pastExamContent(exam.id).then(setText, setError)
  }
  async function download() {
    if (!exam.file_path) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(exam.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={exam.title}
      footer={
        exam.file_path ? (
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={download}>
            Télécharger le fichier
          </Button>
        ) : undefined
      }
    >
      <ErrorBox error={error} />
      {text === null && !error ? <Spinner /> : <pre translate="no" className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text}</pre>}
    </Modal>
  )
}

export function PastExamsPanel({ subjectId }: { subjectId: string }) {
  const { data, isLoading } = usePastExams()
  const qc = useQueryClient()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<PastExam | null>(null)
  if (isLoading) return <Spinner />
  if (data === null) return <ErrorBox error={PAST_EXAMS_MIGRATION} />
  const mine = (data ?? []).filter((e) => e.subject_id === subjectId)

  async function remove(e: PastExam) {
    must(await supabase.from('past_exams').update({ deleted_at: new Date().toISOString() }).eq('id', e.id))
    await qc.invalidateQueries({ queryKey: ['past_exams'] })
    toast({
      message: 'Mis à la corbeille (récupérable 30 jours)',
      action: {
        label: 'Annuler',
        run: async () => {
          await supabase.from('past_exams').update({ deleted_at: null }).eq('id', e.id)
          qc.invalidateQueries({ queryKey: ['past_exams'] })
        },
      },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3 bg-accent-soft sm:flex-row sm:items-center">
        <GraduationCap className="size-8 shrink-0 text-accent-ink" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">
          <strong>Tes anciens partiels rendent l’IA plus réaliste.</strong> Dépose les sujets des années précédentes : tes QCM et partiels blancs reprendront leur format, leur
          niveau et les notions qui tombent souvent, sans recopier les questions.
        </p>
        <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Ajouter un partiel
        </Button>
      </Card>

      {!mine.length ? (
        <EmptyState icon={<GraduationCap className="size-8" />} title="Aucun ancien partiel">
          PDF, Word ou texte collé, avec ou sans corrigé.
        </EmptyState>
      ) : (
        <>
          {mine.map((e) => (
            <Card key={e.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {e.title} {e.session && <Badge>{e.session}</Badge>}
                </p>
                <p className="text-sm text-muted">Ajouté le {fmt(e.created_at, 'd MMM yyyy')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="secondary" size="sm" icon={<Eye className="size-4" />} onClick={() => setViewing(e)}>
                  Voir
                </Button>
                <IconButton label="Supprimer le partiel" onClick={() => remove(e)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Link to={`/qcm/nouveau?matiere=${subjectId}&partiel=1`}>
              <Button icon={<ListChecks className="size-4" />}>QCM type partiel</Button>
            </Link>
            <Link to={`/assistant?demande=${encodeURIComponent('Fais-moi un partiel blanc corrigé, dans le même format que mes anciens partiels')}&matiere=${subjectId}`}>
              <Button variant="secondary" icon={<Sparkles className="size-4" />}>
                Partiel blanc avec GIRAFA
              </Button>
            </Link>
          </div>
        </>
      )}
      <ExamImport open={adding} onClose={() => setAdding(false)} subjectId={subjectId} />
      {viewing && <ExamView exam={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
