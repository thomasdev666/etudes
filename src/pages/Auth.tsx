import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { useAuth } from '@/context/auth'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
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

// Champ mot de passe avec un bouton pour l'afficher
function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className="pr-12" />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-muted hover:text-text"
      >
        {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2 3.5-5 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo className="mx-auto h-28 w-auto text-text" />
          <p className="mt-1 text-muted">Organise tes cours, révise mieux, réussis tes examens.</p>
        </div>
        <Card className="p-5">{children}</Card>
        <p className="mt-5 text-center text-sm">
          <Link to="/" className="text-muted hover:underline">
            ← Découvrir Regulya
          </Link>
        </p>
      </div>
    </div>
  )
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'login'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [awaiting, setAwaiting] = useState(false)

  // Connexion avec un compte Google : Supabase renvoie ensuite l'utilisateur ici
  async function withGoogle() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setError(translate(error.message))
  }

  // Après avoir cliqué sur le lien de l'email (souvent sur le téléphone), on se connecte ici
  async function confirmed() {
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(translate(error.message))
  }

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
          options: { emailRedirectTo: `${window.location.origin}/compte-valide` },
        })
        if (error) throw error
        if (!data.session) setAwaiting(true)
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

  if (awaiting)
    return (
      <Shell>
        <div className="flex flex-col gap-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent-ink" aria-hidden>
            ✉
          </span>
          <h1 className="text-xl font-semibold">Vérifie ta boîte mail</h1>
          <p className="text-sm text-muted">
            Nous avons envoyé un lien à <strong className="text-text">{email}</strong>. Ouvre-le, où que tu sois : ton téléphone fait très bien l’affaire.
          </p>
          <p className="text-sm text-muted">Une fois le lien ouvert, reviens ici et connecte-toi.</p>
          <ErrorBox error={error} />
          <Button className="w-full" loading={busy} onClick={confirmed}>
            J’ai validé mon compte
          </Button>
          <button type="button" className="text-sm text-muted hover:underline" onClick={() => setAwaiting(false)}>
            Retour
          </button>
        </div>
      </Shell>
    )

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">{titles[mode]}</h1>
      {mode !== 'reset' && (
        <>
          <Button type="button" variant="secondary" className="w-full" onClick={withGoogle}>
            <GoogleLogo /> Continuer avec Google
          </Button>
          {mode === 'signup' && (
            <p className="mt-2 text-center text-xs text-muted">
              En continuant, tu acceptes les <Link to="/cgu" className="underline">conditions d’utilisation</Link> et la{' '}
              <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.
            </p>
          )}
          <div className="my-4 flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            ou avec ton email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" id="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== 'reset' && (
          <Field label="Mot de passe" id="password" hint={mode === 'signup' ? '8 caractères minimum' : undefined}>
            <PasswordInput
              id="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {mode === 'signup' && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" required />
            <span>
              J’accepte les <Link to="/cgu" className="text-accent-ink underline">conditions d’utilisation</Link> et la{' '}
              <Link to="/confidentialite" className="text-accent-ink underline">politique de confidentialité</Link>.
            </span>
          </label>
        )}
        <ErrorBox error={error} />
        {info && <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{info}</p>}
        <Button type="submit" loading={busy} className="w-full" disabled={mode === 'signup' && !accepted}>
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

// Page ouverte depuis le lien de l'email : confirme la validation sur cet appareil
export function ConfirmedPage() {
  return (
    <Shell>
      <div className="flex flex-col gap-4 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-2xl text-success" aria-hidden>
          ✓
        </span>
        <h1 className="text-xl font-semibold">Ton compte est validé</h1>
        <p className="text-sm text-muted">Tu peux fermer cette page. Pour continuer, reviens sur l’appareil où tu as créé ton compte et connecte-toi.</p>
        <Link to="/" className="text-sm text-accent-ink hover:underline">
          Ouvrir Regulya sur cet appareil
        </Link>
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
          <PasswordInput id="np" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <Button type="submit" loading={busy}>
          Enregistrer
        </Button>
      </form>
    </Shell>
  )
}
