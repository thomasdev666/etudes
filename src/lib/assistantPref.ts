// Bouton flottant de GIRAFA affiché ou caché (réglage de l'appareil, comme le thème).
// GIRAFA reste accessible depuis le menu quand le bouton est caché.
import { useSyncExternalStore } from 'react'

const KEY = 'regulya.girafa-hidden'
const EVENT = 'regulya:girafa-pref'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setGirafaHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* stockage indisponible : le réglage ne durera que le temps de la page */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: hidden }))
}

let memo: boolean | null = null
function subscribe(cb: () => void) {
  const on = (e: Event) => {
    memo = e instanceof CustomEvent ? Boolean(e.detail) : read()
    cb()
  }
  window.addEventListener(EVENT, on)
  window.addEventListener('storage', on)
  return () => {
    window.removeEventListener(EVENT, on)
    window.removeEventListener('storage', on)
  }
}

export function useGirafaHidden() {
  return useSyncExternalStore(subscribe, () => (memo ??= read()))
}
