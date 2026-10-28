import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Extraction du texte d'un PDF dans le navigateur (aucun envoi à un tiers)
export async function extractPdfText(file: File, onProgress?: (p: number) => void): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
    }
    pages.push(text.replace(/[ \t]+/g, ' ').trim())
    onProgress?.(i / doc.numPages)
  }
  return pages.filter(Boolean).join('\n\n')
}
