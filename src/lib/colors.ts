export const SUBJECT_PALETTE = [
  { hex: '#F26B4F', name: 'Corail' },
  { hex: '#F5B841', name: 'Ambre' },
  { hex: '#5CB58A', name: 'Vert sauge' },
  { hex: '#4F9BD9', name: 'Bleu' },
  { hex: '#9B7FD6', name: 'Lavande' },
  { hex: '#E97BAE', name: 'Rose' },
  { hex: '#3FB8B0', name: 'Turquoise' },
  { hex: '#64748B', name: 'Ardoise' },
]

function luminance(hex: string) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Texte lisible (contraste AA) posé sur une couleur de matière
export function readableOn(hex: string) {
  const l = luminance(hex)
  const withDark = (l + 0.05) / (0.0137 + 0.05)
  const withWhite = 1.05 / (l + 0.05)
  return withDark >= withWhite ? '#111827' : '#ffffff'
}

// Fond pâle dérivé de la couleur, pour les pastilles
export function tint(hex: string, alpha = 0.14) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

const rgbOf = (hex: string) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

// Mélange de deux couleurs (t = part de la seconde)
export function mix(hex: string, other: string, t: number) {
  const a = rgbOf(hex)
  const b = rgbOf(other)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

// Couleurs d'une fiche de révision, dérivées de la couleur de la matière (variables CSS)
export function sheetTheme(hex = '#D2553A'): Record<string, string> {
  const [r, g, b] = rgbOf(/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#D2553A')
  const base = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  return {
    '--sheet': base,
    '--sheet-soft': `rgba(${r}, ${g}, ${b}, 0.13)`,
    '--sheet-line': `rgba(${r}, ${g}, ${b}, 0.35)`,
    '--sheet-ink-light': mix(base, '#2B2118', 0.45),
    '--sheet-ink-dark': mix(base, '#ffffff', 0.35),
    '--sheet-on': readableOn(base),
  }
}
