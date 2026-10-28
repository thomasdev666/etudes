import { FileUp } from 'lucide-react'
import { useState } from 'react'
import { useSpace } from '@/context/space'
import { useUserId } from '@/context/auth'
import { useInvalidate } from '@/lib/data'
import { extractPdfText } from '@/lib/pdf'
import { BUCKET, must, supabase } from '@/lib/supabase'
import { Button, ErrorBox, Field, Input, Modal, Tabs, Textarea } from './ui'

export function CourseImport({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const { spaceId } = useSpace()
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<string>('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setTitle('')
    setText('')
    setFile(null)
    setProgress('')
    setError(null)
  }

  async function onFile(f: File | null) {
    setFile(f)
    setError(null)
    if (!f) return
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    try {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        setProgress('Lecture du PDF…')
        const t = await extractPdfText(f, (p) => setProgress(`Lecture du PDF… ${Math.round(p * 100)} %`))
        setText(t)
        setProgress(t.length < 200 ? 'Très peu de texte trouvé : le PDF est peut-être scanné (image).' : `${t.length.toLocaleString('fr')} caractères extraits.`)
      } else {
        setText(await f.text())
        setProgress('')
      }
    } catch (e) {
      setError(e)
      setProgress('')
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      let file_path: string | null = null
      if (file) {
        const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_')
        file_path = `${userId}/${spaceId}/courses/${crypto.randomUUID()}-${safe}`
        must(await supabase.storage.from(BUCKET).upload(file_path, file, { contentType: file.type || undefined }))
      }
      must(
        await supabase.from('courses').insert({
          space_id: spaceId,
          subject_id: subjectId,
          title: title.trim() || 'Cours sans titre',
          content: text,
          file_path,
          file_name: file?.name ?? null,
        }),
      )
      await invalidate('courses')
      reset()
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

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
            { value: 'file', label: 'Fichier PDF ou texte' },
            { value: 'text', label: 'Coller du texte' },
          ]}
        />
        <Field label="Titre" id="ctitle">
          <Input id="ctitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapitre 3 — Valorisation" />
        </Field>
        {mode === 'file' ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-center hover:border-accent">
            <FileUp className="size-7 text-muted" aria-hidden />
            <span className="font-medium">{file ? file.name : 'Choisir un fichier'}</span>
            <span className="text-sm text-muted">PDF, TXT ou Markdown. Le texte est extrait sur ton appareil.</span>
            <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : null}
        {progress && <p className="text-sm text-muted">{progress}</p>}
        {(mode === 'text' || text) && (
          <Field label="Contenu du cours" id="ctext" hint="Tu peux corriger le texte extrait avant d’enregistrer.">
            <Textarea id="ctext" className="min-h-60 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  )
}
