// Export PDF direct (téléchargement d'un fichier, sans boîte d'impression).
// Le rendu exact de l'écran (formules, tableaux, images) est capturé puis
// découpé en pages A4 entre deux blocs, jamais au milieu d'une ligne.

const A4 = { w: 210, h: 297 }
const MARGIN = 15
const CONTENT_PX = 680 // largeur de mise en page à l'écran

async function capture(el: HTMLElement) {
  const { default: html2canvas } = await import('html2canvas-pro')
  await document.fonts?.ready
  await Promise.all(
    [...el.querySelectorAll('img')].map((img) =>
      img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))),
    ),
  )
  return html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
}

// Conteneur hors écran, toujours en thème clair
function offscreen(width: number) {
  const box = document.createElement('div')
  box.className = 'force-light'
  box.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;background:#fff;color:#111827;`
  document.body.appendChild(box)
  return box
}

export async function noteToPdf(title: string, renderedHtml: string): Promise<Blob> {
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
    box.append(h1, body)

    const canvas = await capture(box)
    const ratio = canvas.width / CONTENT_PX // pixels de canvas par pixel CSS
    const mmPerPx = (A4.w - 2 * MARGIN) / CONTENT_PX
    const pagePx = Math.floor((A4.h - 2 * MARGIN) / mmPerPx)

    // Points de coupe : entre les blocs de premier niveau
    const blocks = [h1, ...([...body.children] as HTMLElement[])]
    const top0 = box.getBoundingClientRect().top
    const cuts: number[] = []
    let start = 0
    for (const b of blocks) {
      const r = b.getBoundingClientRect()
      const top = r.top - top0
      const bottom = r.bottom - top0
      while (bottom - start > pagePx) {
        const cut = top > start + 40 ? top : start + pagePx
        cuts.push(cut)
        start = cut
      }
    }
    const total = box.scrollHeight
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const bounds = [0, ...cuts, total]
    for (let i = 0; i < bounds.length - 1; i++) {
      const y0 = bounds[i]
      const h = Math.min(bounds[i + 1], total) - y0
      if (h <= 0) continue
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.ceil(h * ratio)
      slice.getContext('2d')!.drawImage(canvas, 0, -Math.floor(y0 * ratio))
      if (i > 0) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, A4.w - 2 * MARGIN, h * mmPerPx)
    }
    pdf.setProperties({ title, creator: 'Regulya' })
    return pdf.output('blob')
  } finally {
    box.remove()
  }
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
