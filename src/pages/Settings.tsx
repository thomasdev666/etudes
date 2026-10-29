import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Coffee, Download, LogOut, Monitor, Moon, Pencil, Sun, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AvailabilityEditor } from '@/components/AvailabilityEditor'
import { useAvailability } from '@/lib/planning'
import { TimetableImport } from '@/components/TimetableImport'
import { Badge, Button, Card, ErrorBox, Field, IconButton, Input, PageHeader, Tabs } from '@/components/ui'
import { useAuth, useUserId } from '@/context/auth'
import { useSpace } from '@/context/space'
import { useToast } from '@/context/toast'
import { fmt } from '@/lib/dates'
import { exportEverything } from '@/lib/exportAll'
import { saveBlob } from '@/lib/exportNote'
import { useOnboarding } from '@/lib/onboarding'
import { applyTheme, readTheme, type Theme } from '@/lib/theme'
import { authHeader, must, supabase } from '@/lib/supabase'

// Que faire de l'audio une fois la transcription terminée (la transcription reste toujours)
function AudioSetting() {
  const userId = useUserId()
  const qc = useQueryClient()
  const key = ['user_settings', userId, 'audio_after']
  const { data, isError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_settings').select('audio_after').maybeSingle()
      if (error) throw error
      return (data?.audio_after ?? 'delete') as 'delete' | 'keep'
    },
    retry: false,
  })
  if (isError) return <p className="text-sm text-muted">Lance la mise à jour 0007_recordings.sql dans Supabase pour régler cette option.</p>
  return (
    <Tabs
      label="Audio après la transcription"
      value={data ?? 'delete'}
      onChange={async (v) => {
        qc.setQueryData(key, v)
        await supabase.from('user_settings').upsert({ user_id: userId, audio_after: v })
      }}
      items={[
        { value: 'delete', label: 'Supprimer l’audio' },
        { value: 'keep', label: 'Garder l’audio' },
      ]}
    />
  )
}

const REMIND_DAYS = [
  { d: 7, label: 'J-7' },
  { d: 3, label: 'J-3' },
  { d: 2, label: 'J-2' },
  { d: 1, label: 'La veille' },
  { d: 0, label: 'Le jour même' },
]

// Rappels d'échéances par email (envoyés chaque matin)
function ReminderSettings() {
  const userId = useUserId()
  const qc = useQueryClient()
  const key = ['user_settings', userId, 'reminders']
  const [test, setTest] = useState<{ busy?: boolean; ok?: string; error?: unknown }>({})
  const { data, isError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_settings').select('notify_email, notify_days').maybeSingle()
      if (error) throw error
      return { notify_email: data?.notify_email ?? true, notify_days: (data?.notify_days as number[] | undefined) ?? [3, 1] }
    },
    retry: false,
  })
  if (isError) return <p className="text-sm text-muted">Lance la mise à jour 0008_resources_reminders.sql dans Supabase pour régler les rappels.</p>
  if (!data) return null
  const save = async (patch: Partial<typeof data>) => {
    const next = { ...data, ...patch }
    qc.setQueryData(key, next)
    await supabase.from('user_settings').upsert({ user_id: userId, ...next })
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={data.notify_email} onChange={(e) => save({ notify_email: e.target.checked })} className="size-5 accent-[var(--accent)]" />
        <span className="font-medium">M’envoyer un rappel avant chaque échéance</span>
      </label>
      {data.notify_email && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quand envoyer les rappels">
          {REMIND_DAYS.map(({ d, label }) => {
            const on = data.notify_days.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => save({ notify_days: on ? data.notify_days.filter((x) => x !== d) : [...data.notify_days, d].sort((a, b) => b - a) })}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-muted hover:bg-surface-2'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          loading={test.busy}
          onClick={async () => {
            setTest({ busy: true })
            try {
              const res = await fetch('/.netlify/functions/test-email', { method: 'POST', headers: await authHeader() })
              const body = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error(body.error ?? `Envoi impossible (${res.status})`)
              setTest({ ok: `Email envoyé à ${body.to}. Regarde aussi dans les spams.` })
            } catch (e) {
              setTest({ error: e })
            }
          }}
        >
          M’envoyer un email de test
        </Button>
        {test.ok && <span className="text-sm text-success">{test.ok}</span>}
      </div>
      <ErrorBox error={test.error} />
    </div>
  )
}

function PlanningSettings() {
  const { availability, save } = useAvailability()
  return (
    <div className="flex flex-col gap-4">
      <AvailabilityEditor value={availability} onChange={save} />
      <Link to="/planification">
        <Button variant="secondary">Planifier mes séances</Button>
      </Link>
    </div>
  )
}

function Section({ id, title, children, description }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        <div className="mt-4">{children}</div>
      </Card>
    </section>
  )
}

function Spaces() {
  const { spaces, space, setSpaceId } = useSpace()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<unknown>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['spaces'] })

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    const { error } = await fn()
    if (error) setError(error.message)
    refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border">
        {spaces.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {s.name} {s.id === space?.id && <Badge tone="accent">Actuel</Badge>} {s.archived_at && <Badge>Archivé</Badge>}
              </p>
            </div>
            {!s.archived_at && s.id !== space?.id && (
              <Button size="sm" variant="ghost" onClick={() => setSpaceId(s.id)}>
                Ouvrir
              </Button>
            )}
            <IconButton
              label="Renommer"
              onClick={() => {
                const n = prompt('Nouveau nom', s.name)
                if (n?.trim()) run(() => supabase.from('spaces').update({ name: n.trim() }).eq('id', s.id))
              }}
            >
              <Pencil className="size-4" />
            </IconButton>
            <IconButton
              label={s.archived_at ? 'Désarchiver' : 'Archiver'}
              onClick={() => {
                if (!s.archived_at && spaces.filter((x) => !x.archived_at).length <= 1) return setError('Garde au moins un espace actif.')
                run(() => supabase.from('spaces').update({ archived_at: s.archived_at ? null : new Date().toISOString() }).eq('id', s.id))
              }}
            >
              {s.archived_at ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            </IconButton>
            <IconButton
              label="Supprimer"
              onClick={() => {
                if (spaces.length <= 1) return setError('Impossible de supprimer ton seul espace.')
                if (confirm(`Supprimer l’espace « ${s.name} » ? Il reste récupérable 30 jours dans la corbeille.`)) {
                  run(() => supabase.from('spaces').update({ deleted_at: new Date().toISOString() }).eq('id', s.id))
                  toast({ message: 'Espace mis à la corbeille' })
                }
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          run(() => supabase.from('spaces').insert({ name: name.trim() }))
          setName('')
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvel espace (ex. Hull)" aria-label="Nom du nouvel espace" />
        <Button type="submit" disabled={!name.trim()}>
          Créer
        </Button>
      </form>
      <ErrorBox error={error} />
    </div>
  )
}

function Account() {
  const { session } = useAuth()
  const userId = useUserId()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState<unknown>(null)
  const { data: deletion } = useQuery({
    queryKey: ['account_deletion', userId],
    queryFn: async () => must(await supabase.from('account_deletions').select('*').maybeSingle()) as { requested_at: string } | null,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['account_deletion'] })

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm">
        Connecté avec <strong>{session?.user.email}</strong>
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault()
          const { error } = await supabase.auth.updateUser({ password })
          if (error) setError(error.message)
          else {
            setMsg('Mot de passe modifié.')
            setPassword('')
          }
        }}
      >
        <div className="flex-1">
          <Field label="Nouveau mot de passe" id="npw">
            <Input id="npw" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={password.length < 8}>
          Modifier
        </Button>
      </form>
      {msg && <p className="text-sm text-success">{msg}</p>}

      <div className="rounded-2xl border border-danger/30 p-3">
        <p className="font-medium text-danger">Supprimer mon compte</p>
        {deletion ? (
          <>
            <p className="mt-1 text-sm">
              Suppression demandée le {fmt(deletion.requested_at, 'd MMMM yyyy')}. Effacement définitif de toutes tes données le{' '}
              <strong>{fmt(new Date(new Date(deletion.requested_at).getTime() + 30 * 86_400_000), 'd MMMM yyyy')}</strong>.
            </p>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              onClick={async () => {
                await supabase.from('account_deletions').delete().eq('user_id', userId)
                refresh()
              }}
            >
              Annuler la suppression
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Tes données sont effacées définitivement 30 jours après la demande. Tu peux annuler d’ici là. Pense à faire un export avant.</p>
            <Button
              className="mt-2"
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!confirm('Demander la suppression de ton compte et de toutes tes données dans 30 jours ?')) return
                const { error } = await supabase.from('account_deletions').insert({})
                if (error) setError(error.message)
                refresh()
              }}
            >
              Demander la suppression
            </Button>
          </>
        )}
      </div>
      <ErrorBox error={error} />
      <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => supabase.auth.signOut()}>
        Se déconnecter
      </Button>
    </div>
  )
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState<unknown>(null)
  const onboarding = useOnboarding()
  const navigate = useNavigate()

  useEffect(() => {
    const id = location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Paramètres" />

      <Section title="Présentation" description="Revoir la présentation de l’appli et celles de chaque écran (matières, cours, planification, entraînements, statistiques, recherche…).">
        <Button
          variant="secondary"
          onClick={async () => {
            await onboarding.resetTours()
            navigate('/')
          }}
        >
          Revoir la présentation
        </Button>
      </Section>

      <Section title="Apparence">
        <Tabs
          label="Thème"
          value={theme}
          onChange={(t) => {
            setTheme(t)
            applyTheme(t)
          }}
          items={[
            { value: 'system', label: 'Automatique' },
            { value: 'cream', label: 'Crème' },
            { value: 'light', label: 'Clair' },
            { value: 'dark', label: 'Sombre' },
          ]}
        />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Monitor className="size-3.5" aria-hidden /> crème le jour, sombre si ton appareil l’est</span>
          <span className="inline-flex items-center gap-1"><Coffee className="size-3.5" aria-hidden /> crème : doux pour les yeux</span>
          <span className="inline-flex items-center gap-1"><Sun className="size-3.5" aria-hidden /> clair</span>
          <span className="inline-flex items-center gap-1"><Moon className="size-3.5" aria-hidden /> sombre, reposant le soir</span>
        </p>
      </Section>

      <Section id="espaces" title="Espaces" description="Un espace par établissement. Les données d’un espace ne sont jamais visibles depuis un autre.">
        <Spaces />
      </Section>

      <Section id="calendrier" title="Emploi du temps" description="Affiche tes cours dans l’agenda à partir du PDF du planning de l’école.">
        <TimetableImport />
      </Section>

      <Section title="Rappels par email" description="Chaque matin, un email récapitule les devoirs qui arrivent, selon les délais choisis.">
        <ReminderSettings />
      </Section>

      <Section
        title="Enregistrements"
        description="Après la transcription, l’audio peut être supprimé (recommandé : il prend de la place) ou gardé pour être réécouté avant les examens. La transcription est toujours conservée."
      >
        <AudioSetting />
      </Section>

      <Section id="disponibilites" title="Disponibilités" description="Temps de travail personnel par jour et plage horaire : le planificateur y place tes séances, en dehors de tes cours.">
        <PlanningSettings />
      </Section>

      <Section title="Données" description="Export complet en archive ZIP, lisible sans l’application. Fais-en un chaque semaine pour être tranquille.">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Download className="size-4" />}
            loading={!!exporting}
            onClick={async () => {
              setExportError(null)
              try {
                const blob = await exportEverything(setExporting)
                saveBlob(blob, `etudes-export-${new Date().toISOString().slice(0, 10)}.zip`)
              } catch (e) {
                setExportError(e)
              } finally {
                setExporting('')
              }
            }}
          >
            {exporting || 'Tout exporter'}
          </Button>
          <Link to="/corbeille">
            <Button variant="secondary" icon={<Trash2 className="size-4" />}>
              Corbeille
            </Button>
          </Link>
        </div>
        <div className="mt-2">
          <ErrorBox error={exportError} />
        </div>
      </Section>

      <Section title="Compte">
        <Account />
      </Section>
    </div>
  )
}
