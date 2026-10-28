import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { must, supabase } from '@/lib/supabase'
import type { Space } from '@/lib/types'
import { useUserId } from './auth'

type SpaceState = {
  spaces: Space[]
  space: Space | null
  spaceId: string
  setSpaceId: (id: string) => void
  loading: boolean
}
const Ctx = createContext<SpaceState | null>(null)
const KEY = 'etudes.space'

function readStored() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function SpaceProvider({ children }: { children: ReactNode }) {
  const userId = useUserId()
  const qc = useQueryClient()
  const [stored, setStored] = useState(readStored)
  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ['spaces', userId],
    queryFn: async () =>
      must(await supabase.from('spaces').select('*').is('deleted_at', null).order('created_at')) as Space[],
    enabled: !!userId,
  })

  const active = spaces.filter((s) => !s.archived_at)
  const space = spaces.find((s) => s.id === stored && !s.archived_at) ?? active[0] ?? null

  useEffect(() => {
    if (space && space.id !== stored) setStored(space.id)
  }, [space, stored])

  const value = useMemo<SpaceState>(
    () => ({
      spaces,
      space,
      spaceId: space?.id ?? '',
      loading: isLoading,
      setSpaceId: (id) => {
        try {
          localStorage.setItem(KEY, id)
        } catch {
          /* stockage indisponible : on garde en mémoire */
        }
        setStored(id)
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'spaces' })
      },
    }),
    [spaces, space, isLoading, qc],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSpace() {
  const v = useContext(Ctx)
  if (!v) throw new Error('SpaceProvider manquant')
  return v
}
