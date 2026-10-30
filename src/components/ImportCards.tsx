import { FileUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, ErrorBox, Modal, Textarea } from '@/components/ui'
import { useSpace } from '@/context/space'
import { useInvalidate } from '@/lib/data'
import { parseCards } from '@/lib/importCards'
import { must, supabase } from '@/lib/supabase'

// Import de flash cards depuis Anki, Quizlet ou un tableur
export function ImportCardsModal({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const { spaceId } = useSpace()
  const invalidate = useInvalidate()
  const [raw, setRaw] = useState('')
  const [swap, setSwap] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(0)
  const cards = useMemo(() => parseCards(raw, { swap }), [raw, swap])

  async function readFile(file: File) {
    if (file.size > 5 * 1024 * 1024) return setError(new Error('Fichier trop lourd (5 Mo maximum). Exporte sans les images ni les sons.'))
    setRaw(await file.text())
  }

  async function run() {
    setBusy(true)
    setError(null)
    try {
      for (let i = 0; i < cards.length; i += 200)
        must(await supabase.from('flashcards').insert(cards.slice(i, i + 200).map((c) => ({ space_id: spaceId, subject_id: subjectId, front: c.front, back: c.back, source: 'import' }))))
      await invalidate('flashcards')
      setDone(cards.length)
      setRaw('')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setDone(0)
    setRaw('')
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importer des flash cards"
      footer={
        done ? (
          <Button onClick={close}>Fermer</Button>
        ) : (
          <Button disabled={!cards.length} loading={busy} onClick={run}>
            Importer {cards.length || ''} carte{cards.length > 1 ? 's' : ''}
          </Button>
        )
      }
    >
      {done ? (
        <p className="text-success">{done} carte{done > 1 ? 's' : ''} importée{done > 1 ? 's' : ''} ✓ Elles sont à revoir dès aujourd’hui.</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <details className="rounded-xl bg-surface-2 px-3 py-2">
            <summary className="cursor-pointer font-medium">Comment exporter mes cartes ?</summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
              <li>
                <strong className="text-text">Quizlet</strong> : ouvre ton paquet, menu « … », puis « Exporter ». Garde « Tabulation » et « Nouvelle ligne », copie le texte et colle-le ici.
              </li>
              <li>
                <strong className="text-text">Anki</strong> : Fichier → Exporter → « Notes en texte brut (.txt) », puis choisis le fichier ici.
              </li>
              <li>
                <strong className="text-text">Tableur</strong> : deux colonnes (question, réponse), enregistrées en CSV.
              </li>
            </ul>
          </details>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-5 hover:bg-surface-2">
            <FileUp className="size-5 text-accent-ink" aria-hidden />
            <span>Choisir un fichier (.txt, .csv, .tsv)</span>
            <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </label>
          <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder={'Ou colle tes cartes ici, une par ligne :\nBFR\tBesoin en fonds de roulement'} aria-label="Cartes à importer" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Inverser question et réponse
          </label>
          {cards.length > 0 && (
            <div>
              <p className="mb-2 font-medium">
                {cards.length} carte{cards.length > 1 ? 's' : ''} trouvée{cards.length > 1 ? 's' : ''}. Aperçu :
              </p>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {cards.slice(0, 4).map((c, i) => (
                  <li key={i} className="px-3 py-2">
                    <p className="font-medium">{c.front}</p>
                    <p className="line-clamp-2 text-muted">{c.back}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {raw.trim() && !cards.length && <p className="text-warning">Aucune carte reconnue. Vérifie qu’il y a une question et une réponse par ligne, séparées par une tabulation, un point-virgule ou une virgule.</p>}
          <ErrorBox error={error} />
        </div>
      )}
    </Modal>
  )
}
