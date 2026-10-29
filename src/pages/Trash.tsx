import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, ErrorBox, IconButton, PageHeader, Spinner } from '@/components/ui'
import { useSpace } from '@/context/space'
import { fmt } from '@/lib/dates'
import { must, supabase } from '@/lib/supabase'

const KINDS = [
  { table: 'subjects', label: 'Matière', title: 'name' },
  { table: 'assignments', label: 'Devoir', title: 'title' },
  { table: 'notes', label: 'Note', title: 'title' },
  { table: 'courses', label: 'Cours', title: 'title' },
  { table: 'quizzes', label: 'QCM', title: 'title' },
  { table: 'flashcards', label: 'Flash card', title: 'front' },
  { table: 'study_plans', label: 'Plan', title: 'title' },
  { table: 'plan_items', label: 'Étape de plan', title: 'label' },
  { table: 'note_outputs', label: 'Carte mentale', title: 'title' },
  { table: 'recordings', label: 'Enregistrement', title: 'title' },
  { table: 'resources', label: 'Ressource', title: 'title' },
] as const

type Trashed = { table: string; label: string; id: string; title: string; deleted_at: string; subject_id?: string | null }

const RETENTION_MS = 30 * 86_400_000

export default function TrashPage() {
  const { spaceId } = useSpace()
  const qc = useQueryClient()

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['trash', spaceId],
    queryFn: async () => {
      const out: Trashed[] = []
      for (const k of KINDS) {
        const res = await supabase.from(k.table).select(`id, ${k.title}, deleted_at`).eq('space_id', spaceId).not('deleted_at', 'is', null)
        // Table d'une mise à jour pas encore lancée : on l'ignore
        if (res.error && ['recordings', 'resources'].includes(k.table)) continue
        const rows = must(res) as unknown as Record<string, string>[]
        out.push(...rows.map((r) => ({ table: k.table, label: k.label, id: r.id, title: r[k.title], deleted_at: r.deleted_at })))
      }
      return out.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
    },
  })

  // Les espaces supprimés n'apparaissent pas dans la liste normale : on les charge à part
  const { data: deletedSpaces = [] } = useQuery({
    queryKey: ['spaces', 'deleted'],
    queryFn: async () => must(await supabase.from('spaces').select('id, name, deleted_at').not('deleted_at', 'is', null)) as { id: string; name: string; deleted_at: string }[],
  })

  const refresh = () => qc.invalidateQueries()
  async function restore(t: Trashed) {
    await supabase.from(t.table).update({ deleted_at: null }).eq('id', t.id)
    refresh()
  }
  async function destroy(t: Trashed) {
    if (!confirm(`Supprimer définitivement « ${t.title} » ? C’est irréversible.`)) return
    await supabase.from(t.table).delete().eq('id', t.id)
    refresh()
  }

  const items = [...data, ...deletedSpaces.map((s) => ({ table: 'spaces', label: 'Espace', id: s.id, title: s.name, deleted_at: s.deleted_at }))]

  return (
    <>
      <PageHeader title="Corbeille" subtitle="Les éléments supprimés restent récupérables 30 jours, puis sont effacés définitivement." />
      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState icon={<Trash2 className="size-8" />} title="La corbeille est vide" />
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-border">
            {items.map((t) => {
              const left = Math.max(0, Math.ceil((new Date(t.deleted_at).getTime() + RETENTION_MS - Date.now()) / 86_400_000))
              return (
                <li key={t.table + t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs text-muted">
                      {t.label} · supprimé le {fmt(t.deleted_at, 'd MMM')} · encore {left} jour{left > 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => restore(t)}>
                    Restaurer
                  </Button>
                  <IconButton label="Supprimer définitivement" onClick={() => destroy(t)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
