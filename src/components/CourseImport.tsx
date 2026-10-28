import { FileUp, ImageIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useUserId } from '@/context/auth'
import { useJobs } from '@/context/jobs'
import { useSpace } from '@/context/space'
import { estimateSeconds } from '@/lib/ai'
import { MAX_IMAGES, type Extracted } from '@/lib/courseImages'
import { useInvalidate } from '@/lib/data'
import { BUCKET, must, supabase } from '@/lib/supabase'
import { Button, ErrorBox, Field, Input, Modal, Tabs, Textarea } from './ui'

const safeName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')

export function CourseImport({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const { spaceId } = useSpace()
  const userId = useUserId()
  const { start } = useJobs()
  const invalidate = useInvalidate()
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [extracted, setExtracted] = useState<Extracted | null>(null)
  const [readImages, setReadImages] = useState(true)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)

  function reset() {
    setTitle('')
    setText('')
    setFile(null)
    setExtracted(null)
    setProgress('')
    setError(null)
  }

  async function onFile(f: File | null) {
    setFile(f)
    setError(null)
    setExtracted(null)
    if (!f) return
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    const name = f.name.toLowerCase()
    try {
      let ex: Extracted
      if (name.endsWith('.pptx')) {
        setProgress('Lecture du PowerPoint…')
        const { extractPptx } = await import('@/lib/pptx')
        ex = await extractPptx(f, (p) => setProgress(`Lecture du PowerPoint… ${Math.round(p * 100)} %`))
      } else if (name.endsWith('.pdf') || f.type === 'application/pdf') {
        setProgress('Lecture du PDF…')
        const { extractPdf } = await import('@/lib/pdf')
        ex = await extractPdf(f, (p) => setProgress(`Lecture du PDF… ${Math.round(p * 100)} %`))
      } else if (name.endsWith('.ppt')) {
        throw new Error('Ancien format .ppt : ouvre-le dans PowerPoint et enregistre-le en .pptx (ou exporte-le en PDF).')
      } else {
        ex = { text: await f.text(), images: [], skipped: 0 }
      }
      setExtracted(ex)
      setText(ex.text)
      const chars = ex.text.replace(/\[\[image:\d+\]\]/g, '').length
      setProgress(
        `${chars.toLocaleString('fr')} caractères extraits` +
          (ex.images.length ? ` · ${ex.images.length} image${ex.images.length > 1 ? 's' : ''} (formules, schémas) à faire lire par l’IA` : '') +
          (ex.skipped ? ` · ${ex.skipped} image${ex.skipped > 1 ? 's' : ''} dans un format illisible (EMF/WMF) ignorée${ex.skipped > 1 ? 's' : ''}` : '') +
          '.',
      )
    } catch (e) {
      setError(e)
      setProgress('')
    }
  }

  async function save() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      const images = readImages ? (extracted?.images ?? []).slice(0, MAX_IMAGES) : []
      let content = text
      // Repères d'images non traitées : retirés du texte
      for (const im of extracted?.images ?? []) if (!images.includes(im)) content = content.replace(im.marker, '')

      let file_path: string | null = null
      if (file) {
        file_path = `${userId}/${spaceId}/courses/${crypto.randomUUID()}-${safeName(file.name)}`
        setProgress('Envoi du fichier…')
        must(await supabase.storage.from(BUCKET).upload(file_path, file, { contentType: file.type || undefined }))
      }
      const course = must(
        await supabase
          .from('courses')
          .insert({
            space_id: spaceId,
            subject_id: subjectId,
            title: title.trim() || 'Cours sans titre',
            content,
            file_path,
            file_name: file?.name ?? null,
            status: images.length ? 'processing' : 'ready',
          })
          .select('id')
          .single(),
      ) as { id: string }

      if (images.length) {
        const uploaded: { path: string; label: string; marker: string }[] = []
        for (const [i, im] of images.entries()) {
          setProgress(`Envoi des images… ${i + 1} / ${images.length}`)
          const path = `${userId}/${spaceId}/courses/${course.id}/image-${i}.jpg`
          must(await supabase.storage.from(BUCKET).upload(path, im.blob, { contentType: 'image/jpeg', upsert: true }))
          must(await supabase.from('files').insert({ space_id: spaceId, course_id: course.id, path, name: `image-${i}.jpg`, mime: 'image/jpeg', size: im.blob.size }))
          uploaded.push({ path, label: im.label, marker: im.marker })
        }
        await start(
          'course_images',
          { course_id: course.id, images: uploaded },
          { label: `Lecture des images de « ${title.trim() || 'cours'} »`, estimateSec: estimateSeconds('course_images', uploaded.length), link: `/cours/${course.id}`, linkLabel: 'Voir le cours' },
        )
      }
      await invalidate('courses')
      reset()
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
      lock.current = false
    }
  }

  const hasImages = !!extracted?.images.length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importer un cours"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} loading={busy} disabled={!text.trim()}>
            Enregistrer le cours
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs
          label="Source"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'file', label: 'Fichier (PowerPoint, PDF…)' },
            { value: 'text', label: 'Coller du texte' },
          ]}
        />
        <Field label="Titre" id="ctitle">
          <Input id="ctitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapitre 3 — Valorisation" />
        </Field>
        {mode === 'file' && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-center hover:border-accent">
            <FileUp className="size-7 text-muted" aria-hidden />
            <span className="font-medium">{file ? file.name : 'Choisir un fichier'}</span>
            <span className="text-sm text-muted">PowerPoint (.pptx), PDF, TXT ou Markdown. Le texte est extrait sur ton appareil.</span>
            <input
              type="file"
              accept=".pptx,.ppt,.pdf,.txt,.md,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {progress && <p className="text-sm text-muted">{progress}</p>}
        {hasImages && (
          <label className="flex items-start gap-3 rounded-2xl bg-accent-soft p-3 text-sm">
            <input type="checkbox" checked={readImages} onChange={(e) => setReadImages(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <ImageIcon className="size-4" aria-hidden /> Lire les images avec l’IA
              </span>
              <span className="text-muted">
                Formules, schémas et tableaux en image sont transcrits et ajoutés au cours (en arrière-plan), pour des QCM et cartes complets.
                {extracted!.images.length > MAX_IMAGES && ` Les ${MAX_IMAGES} premières seulement.`}
              </span>
            </span>
          </label>
        )}
        {(mode === 'text' || text) && (
          <Field label="Contenu du cours" id="ctext" hint="Tu peux corriger le texte extrait avant d’enregistrer. Les repères [[image:N]] seront remplacés par la transcription des images.">
            <Textarea id="ctext" className="min-h-60 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}
