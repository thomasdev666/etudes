import { fitFormulas } from './fitFormulas'
import { fixFrenchSpacing } from './frenchSpacing'

// Export PDF direct (téléchargement d'un fichier, sans boîte d'impression).
// Le rendu exact de l'écran (formules, tableaux, images) est capturé puis
// découpé en pages A4 entre deux blocs, jamais au milieu d'une ligne.

const A4 = { w: 210, h: 297 }
const MARGIN = 15
const CONTENT_PX = 680 // largeur de mise en page à l'écran

// Au-delà d'environ 16 millions de pixels, Safari (iPhone, iPad) rend un canvas vide ou noir
const MAX_CANVAS_AREA = 14_000_000

async function capture(el: HTMLElement, onclone?: (clone: HTMLElement) => void) {
  const { default: html2canvas } = await import('html2canvas-pro')
  await document.fonts?.ready
  await Promise.all(
    [...el.querySelectorAll('img')].map((img) =>
      img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))),
    ),
  )
  const area = el.scrollWidth * el.scrollHeight
  const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_CANVAS_AREA / Math.max(1, area))))
  el.dataset.capture = '1'
  try {
    return await html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (doc) => {
        const clone = doc.querySelector<HTMLElement>('[data-capture="1"]')
        if (clone && onclone) onclone(clone)
      },
    })
  } finally {
    delete el.dataset.capture
  }
}

// Conteneur hors écran, toujours en thème clair
function offscreen(width: number) {
  const box = document.createElement('div')
  box.className = 'force-light'
  box.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;background:#fff;color:#111827;`
  document.body.appendChild(box)
  return box
}

// Éléments entre lesquels on peut couper une page sans trancher une ligne de texte
const CUTTABLE = 'h1, h2, h3, p, li, tr, blockquote, pre, hr, img, .diagram, .callout, [data-type="block-math"], .tableWrapper, table'

function frenchSpacing(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest('.katex')) continue
    const fixed = fixFrenchSpacing(n.textContent ?? '')
    if (fixed !== n.textContent) n.textContent = fixed
  }
}

// Pas de coupe juste avant cet élément : il reste sur la même page que celui qui le précède
// (titre puis contenu, nom d'une formule puis la formule, formule puis son explication)
function keepsWithPrevious(el: Element) {
  const prev = el.previousElementSibling
  if (!prev) return false
  if (/^H[1-3]$/.test(prev.tagName)) return true
  const isBlock = (e: Element) => e.matches('[data-type="block-math"], .diagram, .callout, .tableWrapper, table')
  // Paragraphe court (un nom de formule, « Exemple : ») suivi du bloc qu'il annonce
  if (isBlock(el) && prev.tagName === 'P' && (prev.textContent ?? '').trim().length < 140) return true
  // Courte explication juste sous une formule
  if (prev.matches('[data-type="block-math"]') && el.tagName === 'P' && (el.textContent ?? '').trim().length < 300) return true
  return false
}

// Choix des coupes : pour chaque page, la dernière frontière sûre qui tient dans la page.
// Une frontière juste après un titre est évitée (le titre ne reste pas seul en bas de page).
export function pageCuts(safe: number[], total: number, pagePx: number) {
  const points = [...new Set(safe.map(Math.round))].filter((y) => y > 0 && y < total).sort((a, b) => a - b)
  const cuts: number[] = []
  let start = 0
  while (total - start > pagePx) {
    const limit = start + pagePx
    const fit = points.filter((y) => y > start + pagePx * 0.25 && y <= limit)
    const cut = fit.length ? fit[fit.length - 1] : limit
    cuts.push(cut)
    start = cut
  }
  return cuts
}

export async function notePages(title: string, renderedHtml: string): Promise<{ pages: HTMLCanvasElement[]; heights: number[] }> {
  const box = offscreen(CONTENT_PX)
  try {
    const h1 = document.createElement('h1')
    h1.className = 'font-display'
    h1.style.cssText = 'font-size:28px;font-weight:700;margin:0 0 20px'
    h1.textContent = title
    const body = document.createElement('div')
    body.className = 'prose-note'
    body.style.minHeight = '0'
    body.innerHTML = renderedHtml
    body.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'))
    frenchSpacing(body)
    // Décorations de l'éditeur qui n'ont rien à faire dans un PDF
    body.querySelectorAll('.ProseMirror-gapcursor, .ProseMirror-separator, .ProseMirror-trailingBreak, .column-resize-handle').forEach((n) => n.remove())
    box.append(h1, body)
    // Une formule trop large est réduite pour tenir dans la page (sinon elle serait coupée)
    fitFormulas(body)

    // Les positions sont mesurées dans la copie capturée : c'est elle qui est dessinée,
    // et sa mise en page peut différer de quelques pixels de celle de la page
    let safe: number[] = []
    let total = 0
    const canvas = await capture(box, (clone) => {
      const top0 = clone.getBoundingClientRect().top
      total = clone.scrollHeight
      safe = [...clone.querySelectorAll<HTMLElement>(CUTTABLE)]
        // Un schéma, un encadré ou une formule ne se coupe pas ; un titre ne reste pas seul en bas de page
        .filter((el) => !el.parentElement?.closest('.diagram, .callout, [data-type="block-math"]'))
        .filter((el) => !keepsWithPrevious(el))
        .map((el) => el.getBoundingClientRect().top - top0 - 4)
    })
    const ratio = canvas.width / CONTENT_PX // pixels de canvas par pixel CSS
    const mmPerPx = (A4.w - 2 * MARGIN) / CONTENT_PX
    const pagePx = Math.floor((A4.h - 2 * MARGIN) / mmPerPx)
    total = Math.min(total || box.scrollHeight, canvas.height / ratio)
    const bounds = [0, ...pageCuts(safe, total, pagePx), total]
    const pages: HTMLCanvasElement[] = []
    const heights: number[] = []
    for (let i = 0; i < bounds.length - 1; i++) {
      const y0 = bounds[i]
      const h = bounds[i + 1] - y0
      if (h <= 0) continue
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.ceil(h * ratio)
      const ctx = slice.getContext('2d')!
      // Fond blanc : une zone transparente deviendrait noire en JPEG
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      const sy = Math.floor(y0 * ratio)
      const sh = Math.min(slice.height, canvas.height - sy)
      if (sh > 0) ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
      pages.push(slice)
      heights.push(h * mmPerPx)
    }
    return { pages, heights }
  } finally {
    box.remove()
  }
}

export async function noteToPdf(title: string, renderedHtml: string): Promise<Blob> {
  const { pages, heights } = await notePages(title, renderedHtml)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage()
    pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, A4.w - 2 * MARGIN, heights[i])
  })
  pdf.setProperties({ title, creator: 'Regulya' })
  return pdf.output('blob')
}

// Une seule page à la taille de l'élément (cartes mentales)
export async function elementToPdf(el: HTMLElement, title: string): Promise<Blob> {
  const canvas = await capture(el)
  const { jsPDF } = await import('jspdf')
  const w = canvas.width / 2
  const h = canvas.height / 2
  const pdf = new jsPDF({ unit: 'px', format: [w + 40, h + 40], orientation: w > h ? 'landscape' : 'portrait', hotfixes: ['px_scaling'] })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20, 20, w, h)
  pdf.setProperties({ title, creator: 'Regulya' })
  return pdf.output('blob')
}

export async function elementToPng(el: HTMLElement): Promise<Blob> {
  const canvas = await capture(el)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export impossible'))), 'image/png'))
}
