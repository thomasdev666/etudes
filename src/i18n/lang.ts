// Langue de l'interface : français (par défaut) ou anglais.
// Le choix est gardé sur l'appareil ; sans choix, on suit la langue du navigateur.
export type Lang = 'fr' | 'en'
const KEY = 'regulya.lang'

export function getLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'fr' || saved === 'en') return saved
  } catch {
    /* stockage indisponible */
  }
  return typeof navigator !== 'undefined' && !/^fr\b/i.test(navigator.language || 'fr') ? 'en' : 'fr'
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* stockage indisponible */
  }
  // L'interface est retraduite au rechargement
  window.location.reload()
}

export const isEn = () => getLang() === 'en'
