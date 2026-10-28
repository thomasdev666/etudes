import { useState, type FormEvent } from 'react'
import { useAuth } from '@/context/auth'
import { supabase } from '@/lib/supabase'
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui'

type Mode = 'login' | 'signup' | 'reset'

const FR_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': "Confirme d'abord ton email (regarde dans ta boîte de réception).",
  'User already registered': 'Un compte existe déjà avec cet email.',
}
const translate = (m: string) =>
  FR_ERRORS[m] ??
  (/rate limit/i.test(m)
    ? 'Trop d’emails envoyés en peu de temps (limite du service d’envoi gratuit). Réessaie dans une heure.'
    : m)

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl font-bold">
            Études<span className="text-accent">.</span>
          </div>
          <p className="mt-1 text-muted">Organise tes cours, révise mieux, réussis tes examens.</p>
        </div>
        <Card className="p-5">{children}</Card>
      </div>
    </div>
  )
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) setInfo('Compte créé. Clique sur le lien reçu par email pour l’activer, puis connecte-toi.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setInfo('Si un compte existe, un email de réinitialisation vient d’être envoyé.')
      }
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const titles = { login: 'Connexion', signup: 'Créer un compte', reset: 'Mot de passe oublié' }

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">{titles[mode]}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" id="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== 'reset' && (
          <Field label="Mot de passe" id="password" hint={mode === 'signup' ? '8 caractères minimum' : undefined}>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        <ErrorBox error={error} />
        {info && <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{info}</p>}
        <Button type="submit" loading={busy} className="w-full">
          {mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}
        </Button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-1 text-sm">
        {mode === 'login' ? (
          <>
            <button type="button" className="text-accent-ink hover:underline" onClick={() => setMode('signup')}>
              Pas encore de compte ? S’inscrire
            </button>
            <button type="button" className="text-muted hover:underline" onClick={() => setMode('reset')}>
              Mot de passe oublié
            </button>
          </>
        ) : (
          <button type="button" className="text-accent-ink hover:underline" onClick={() => setMode('login')}>
            J’ai déjà un compte
          </button>
        )}
      </div>
    </Shell>
  )
}

export function UpdatePasswordPage() {
  const { clearRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else clearRecovery()
  }
  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">Nouveau mot de passe</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Mot de passe" id="np">
          <Input id="np" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <Button type="submit" loading={busy}>
          Enregistrer
        </Button>
      </form>
    </Shell>
  )
}
