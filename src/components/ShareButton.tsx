import { Copy, Link2, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { shareUrl, useShare, type ShareKind } from '@/lib/share'

const WHAT: Record<ShareKind, string> = { note: 'cette note', mindmap: 'cette carte mentale', deck: 'ce paquet de flash cards', quiz: 'ce QCM' }

// Bouton « Partager » : crée, copie ou désactive un lien en lecture seule
export function ShareButton({ kind, targetId, size = 'sm' }: { kind: ShareKind; targetId: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" size={size} icon={<Share2 className="size-4" />} onClick={() => setOpen(true)}>
        Partager
      </Button>
      {open && <ShareModal kind={kind} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  )
}

function ShareModal({ kind, targetId, onClose }: { kind: ShareKind; targetId: string; onClose: () => void }) {
  const { share, loading, error, create, revoke } = useShare(kind, targetId)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const url = share ? shareUrl(share.token) : ''

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      ;(document.getElementById('share-url') as HTMLInputElement | null)?.select()
    }
  }

  return (
    <Modal open onClose={onClose} title={`Partager ${WHAT[kind]}`}>
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          {kind === 'quiz'
            ? 'Toute personne qui a le lien peut faire ce QCM en ligne, sans compte, avec la correction à la fin. Elle ne peut pas le modifier et ne voit pas tes résultats. Tu peux désactiver le lien à tout moment.'
            : `Toute personne qui a le lien peut lire ${WHAT[kind]}, sans compte et sans pouvoir le modifier. Tu peux désactiver le lien à tout moment.`}
        </p>
        {loading ? null : share ? (
          <>
            <div className="flex gap-2">
              <input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2" aria-label="Lien de partage" />
              <Button icon={<Copy className="size-4" />} onClick={copy}>
                {copied ? 'Copié ✓' : 'Copier'}
              </Button>
            </div>
            <p className="text-xs text-muted">
              Ouvert {share.views} fois. Les images et pièces jointes ne sont pas partagées.
            </p>
            <Button variant="ghost" loading={busy} onClick={() => run(revoke)}>
              Désactiver le lien
            </Button>
          </>
        ) : (
          <Button icon={<Link2 className="size-4" />} loading={busy} onClick={() => run(create)}>
            Créer un lien de partage
          </Button>
        )}
        <ErrorBox error={err ?? error} />
      </div>
    </Modal>
  )
}
