import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Extracted, ExtractedImage } from './courseImages'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const IMAGE_OPS = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject])

type Item = { str: string; hasEOL: boolean; fontName: string }

function isBoldFont(page: pdfjs.PDFPageProxy, id: string) {
  try {
    if (!page.commonObjs.has(id)) return false
    const font = page.commonObjs.get(id) as { name?: string; bold?: boolean }
    return font.bold === true || /bold|black|heavy|semibold|demi/i.test(font.name ?? '')
  } catch {
    return false
  }
}

// Texte d'une page, avec le gras entre ** ** (indice pour l'IA : termes importants).
// Si presque tout est en gras (titres, police du modèle), on ne marque rien.
export function pageText(items: Item[], bold: (fontName: string) => boolean) {
  const marks = items.map((it) => bold(it.fontName) && it.str.trim() !== '')
  const total = items.reduce((n, it) => n + it.str.trim().length, 0)
  const inBold = items.reduce((n, it, k) => n + (marks[k] ? it.str.trim().length : 0), 0)
  const useMarks = inBold > 0 && inBold < total * 0.4
  let out = ''
  let open = false
  const close = () => {
    const tail = out.match(/[ \t]*$/)![0]
    out = out.slice(0, out.length - tail.length) + '**' + tail
    open = false
  }
  items.forEach((it, k) => {
    let str = it.str
    if (str.trim()) {
      const b = useMarks && marks[k]
      if (b && !open) {
        out += '**'
        str = str.trimStart()
        open = true
      } else if (!b && open) close()
    }
    out += str
    if (it.hasEOL) {
      if (open) close()
      out += '\n'
    } else out += ' '
  })
  if (open) close()
  return out.replace(/[ \t]+/g, ' ').trim()
}

// Extraction du texte d'un PDF dans le navigateur (aucun envoi à un tiers).
// Les pages qui contiennent des images (formules, schémas) sont rendues en image
// pour être lues ensuite par l'IA.
export async function extractPdf(file: File, onProgress?: (p: number) => void): Promise<Extracted> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const parts: string[] = []
  const images: ExtractedImage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    // La liste des opérations charge aussi les polices : on peut alors repérer le gras
    const ops = await page.getOperatorList()
    const content = await page.getTextContent()
    const items = content.items.filter((it) => 'str' in it)
    let block = `--- Page ${i} ---\n${pageText(items, (f) => isBoldFont(page, f))}`

    if (ops.fnArray.some((fn) => IMAGE_OPS.has(fn))) {
      const viewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2, 1280 / Math.max(viewport.width, viewport.height))
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      await page.render({ canvas, viewport: vp }).promise
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
      if (blob) {
        const marker = `[[image:${images.length}]]`
        images.push({ blob, label: `page ${i} (page entière : le texte simple est déjà extrait)`, marker })
        block += `\n${marker}`
      }
    }
    parts.push(block)
    onProgress?.(i / doc.numPages)
  }
  return { text: parts.join('\n\n'), images, skipped: 0 }
}

// Texte brut d'un PDF (sans images), pour les fichiers structurés comme les plannings
export async function readPdfText(file: File): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    let text = ''
    for (const item of content.items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
    pages.push(text)
  }
  return pages.join('\n')
}
