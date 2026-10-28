export type Theme = 'system' | 'cream' | 'light' | 'dark'
const KEY = 'etudes.theme'

export function readTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || 'cream'
  } catch {
    return 'cream'
  }
}

// « Automatique » = crème le jour (plus doux pour les yeux), sombre si l'appareil est en mode sombre
export function applyTheme(t: Theme = readTheme()) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* stockage indisponible */
  }
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = t === 'system' ? (prefersDark ? 'dark' : 'cream') : t
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('cream', resolved === 'cream')
  const color = { dark: '#0f1115', cream: '#f4ecdc', light: '#f5f6f8' }[resolved]
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color))
}
