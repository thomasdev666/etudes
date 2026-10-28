import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = () => process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const publishable = () =>
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? ''

// Client qui agit avec les droits de l'utilisateur (la RLS s'applique).
export async function userClient(req: Request): Promise<{ db: SupabaseClient; userId: string }> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Non connecté')
  const db = createClient(url(), publishable(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Session expirée')
  return { db, userId: data.user.id }
}

export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) return null
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function errorResponse(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500
  const message = e instanceof Error ? e.message : 'Erreur inconnue'
  return Response.json({ error: message }, { status })
}
