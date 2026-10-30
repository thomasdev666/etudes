// Formules en bloc trop larges : on réduit leur taille pour qu'elles tiennent dans la largeur
// (jusqu'à 60 % ; au-delà, elles défilent dans leur cadre à l'écran).
const MIN_SCALE = 0.6

export function fitFormulas(root: HTMLElement) {
  for (const box of root.querySelectorAll<HTMLElement>('[data-type="block-math"]')) {
    const math = box.querySelector<HTMLElement>('.katex')
    if (!math) continue
    math.style.fontSize = ''
    const available = box.clientWidth
    const needed = math.scrollWidth
    if (available > 0 && needed > available) math.style.fontSize = `${Math.max(MIN_SCALE, (available - 4) / needed) * 1.21}em`
  }
}
