import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type AuthState = { session: Session | null; loading: boolean; recovery: boolean; clearRecovery: () => void }
const Ctx = createContext<AuthState>({ session: null, loading: true, recovery: false, clearRecovery: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{ session, loading, recovery, clearRecovery: () => setRecovery(false) }}>{children}</Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
export const useUserId = () => useContext(Ctx).session?.user.id ?? ''
