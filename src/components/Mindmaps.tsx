import { Network, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { jobProgress, STALE_MS, useJobs } from '@/context/jobs'
import { fmt } from '@/lib/dates'
import { useNoteOutputs, useTrash } from '@/lib/data'
import type { MindNode } from '@/lib/types'
import { GenerateMindmapModal } from './Generate'
import { Badge, Button, Card, EmptyState, IconButton, ProgressBar } from './ui'

export function GeneratingBar({ job }: { job?: ReturnType<ReturnType<typeof useJobs>['find']> }) {
  return (
    <div className="mt-2 max-w-xs">
      <ProgressBar value={job ? jobProgress(job) : 50} label="Génération en cours" />
      <p className="mt-1 text-xs text-muted">{job?.result?.phase ?? 'Génération en cours…'}</p>
    </div>
  )
}

export function countNodes(n: MindNode): number {
  return 1 + (n.children ?? []).reduce((s, c) => s + countNodes(c), 0)
}

export function MindmapsPanel({ subjectId }: { subjectId: string }) {
  const { data = [] } = useNoteOutputs()
  const { find } = useJobs()
  const trash = useTrash('note_outputs')
  const [open, setOpen] = useState(false)
  // Restée « en cours » trop longtemps : le serveur s'est arrêté, on propose de relancer
  const maps = data
    .filter((m) => m.subject_id === subjectId && m.kind === 'mindmap')
    .map((m) =>
      m.status === 'generating' && Date.now() - new Date(m.created_at).getTime() > STALE_MS
        ? { ...m, status: 'error' as const, error: 'Génération interrompue (trop longue)' }
        : m,
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
          Nouvelle carte mentale
        </Button>
      </div>
      {!maps.length ? (
        <EmptyState icon={<Network className="size-8" />} title="Aucune carte mentale">
          Génère une carte mentale détaillée à partir d’un cours ou d’une note, puis complète-la à ta façon.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {maps.map((m) => (
            <Card key={m.id} className="flex items-start gap-3">
              <Network className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden />
              <div className="min-w-0 flex-1">
                {m.status === 'ready' ? (
                  <Link to={`/cartes-mentales/${m.id}`} className="font-semibold hover:underline">
                    {m.title}
                  </Link>
                ) : (
                  <p className="font-semibold">{m.title}</p>
                )}
                <p className="text-sm text-muted">
                  {fmt(m.created_at, 'd MMM yyyy')}
                  {m.status === 'ready' && ` · ${countNodes(m.content) - 1} idées`}
                </p>
                {m.status === 'generating' && <GeneratingBar job={find((j) => j.params.output_id === m.id)} />}
                {m.status === 'error' && (
                  <div className="mt-1">
                    <Badge tone="danger">Échec : {m.error?.slice(0, 100)}</Badge>
                  </div>
                )}
              </div>
              {m.status === 'error' && (
                <IconButton label="Recommencer" onClick={() => setOpen(true)}>
                  <RotateCcw className="size-4" />
                </IconButton>
              )}
              <IconButton label="Supprimer" onClick={() => trash.mutate(m.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </Card>
          ))}
        </div>
      )}
      <GenerateMindmapModal open={open} onClose={() => setOpen(false)} subjectId={subjectId} />
    </div>
  )
}
