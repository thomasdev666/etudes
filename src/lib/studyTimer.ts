import { useEffect, useRef, useState } from 'react'
import { useSpace } from '@/context/space'
import { supabase } from './supabase'

// Au-delà de 10 minutes sans action, le chronomètre s'arrête de compter
export const IDLE_MS = 10 * 60_000
const SAVE_EVERY_MS = 30_000

export type Activity = 'quiz' | 'cards' | 'exam' | 'note' | 'course' | 'other'

// Une seconde compte si la page est visible et qu'une action a eu lieu il y a moins de 10 minutes
export function isActive(now: number, lastAction: number, visible: boolean) {
  return visible && now - lastAction < IDLE_MS
}

// Chronomètre de session : mesure le temps réellement passé sur une activité
// et l'enregistre (sans rien créer tant que rien n'a été compté)
export function useStudyTimer(activity: Activity, subjectId: string | null | undefined, enabled = true) {
  const { spaceId } = useSpace()
  const [seconds, setSeconds] = useState(0)
  const [idle, setIdle] = useState(false)
  const r = useRef({ chain: Promise.resolve(), id: '', created: false, seconds: 0, saved: 0, startedAt: '', lastAction: Date.now(), subjectId, broken: false })
  r.current.subjectId = subjectId

  useEffect(() => {
    if (!enabled || !spaceId) return
    const cur = r.current
    cur.lastAction = Date.now()
    const onAction = () => {
      cur.lastAction = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'input'] as const
    for (const e of events) window.addEventListener(e, onAction, { passive: true, capture: true })

    // Sauvegardes l'une après l'autre (jamais deux créations pour la même session)
    const save = () => {
      cur.chain = cur.chain.then(doSave, doSave)
    }
    async function doSave() {
      // Table absente (mise à jour 0011 non lancée) : on n'insiste pas
      if (cur.broken || cur.seconds === cur.saved || cur.seconds < 5) return
      const row = { active_seconds: cur.seconds, ended_at: new Date().toISOString() }
      const value = cur.seconds
      if (!cur.created) {
        cur.id = crypto.randomUUID()
        cur.startedAt = cur.startedAt || new Date(Date.now() - value * 1000).toISOString()
        const { error } = await supabase
          .from('study_sessions')
          .insert({ id: cur.id, space_id: spaceId, subject_id: cur.subjectId ?? null, activity, started_at: cur.startedAt, ...row })
        if (error) {
          cur.broken = true
          return
        }
        cur.created = true
      } else {
        await supabase.from('study_sessions').update(row).eq('id', cur.id)
      }
      cur.saved = value
    }

    const tick = setInterval(() => {
      const active = isActive(Date.now(), cur.lastAction, document.visibilityState === 'visible')
      setIdle(!active)
      if (!active) return
      if (!cur.startedAt) cur.startedAt = new Date().toISOString()
      cur.seconds++
      setSeconds(cur.seconds)
    }, 1000)
    const autosave = setInterval(save, SAVE_EVERY_MS)
    const onHide = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)

    return () => {
      clearInterval(tick)
      clearInterval(autosave)
      for (const e of events) window.removeEventListener(e, onAction, { capture: true })
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
      save()
    }
  }, [activity, enabled, spaceId])

  return { seconds, idle }
}

export const timerLabel = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`)
