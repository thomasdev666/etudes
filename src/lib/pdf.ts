import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Extracted, ExtractedImage } from './courseImages'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const IMAGE_OPS = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject])

// Extraction du texte d'un PDF dans le navigateur (aucun envoi à un tiers).
// Les pages qui contiennent des images (formules, schémas) sont rendues en image
// pour être lues ensuite par l'IA.
export async function extractPdf(file: File, onProgress?: (p: number) => void): Promise<Extracted> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const parts: string[] = []
  const images: ExtractedImage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
    }
    let block = `--- Page ${i} ---\n${text.replace(/[ \t]+/g, ' ').trim()}`

    const ops = await page.getOperatorList()
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
