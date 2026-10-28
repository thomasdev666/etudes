// Lecture d'un PowerPoint (.pptx) dans le navigateur : texte des diapositives,
// notes de l'orateur, formules Office, et images à faire lire par l'IA.
import { prepareImage, type ExtractedImage, type Extracted } from './courseImages'

const SUPPORTED = /\.(png|jpe?g|gif|bmp|webp)$/i
const MIN_BYTES = 6_000 // en dessous : icône ou puce décorative

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

function resolvePath(base: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function rels(doc: Document) {
  return [...doc.getElementsByTagName('Relationship')].map((r) => ({
    id: r.getAttribute('Id') ?? '',
    type: r.getAttribute('Type') ?? '',
    target: r.getAttribute('Target') ?? '',
  }))
}

function insideCell(el: Element) {
  for (let n = el.parentElement; n; n = n.parentElement) if (n.localName === 'tc') return true
  return false
}

// Texte d'une diapositive : un paragraphe par ligne, cellules de tableau séparées par « | »
function slideText(doc: Document) {
  const lines: string[] = []
  for (const p of doc.getElementsByTagNameNS('*', 'p')) {
    if (p.namespaceURI?.includes('drawingml') === false) continue
    if (insideCell(p)) continue
    const t = [...p.getElementsByTagNameNS('*', 't')].map((n) => n.textContent ?? '').join('')
    if (t.trim()) lines.push(t.trim())
  }
  for (const row of doc.getElementsByTagNameNS('*', 'tr')) {
    const cells = [...row.getElementsByTagNameNS('*', 'tc')].map((c) =>
      [...c.getElementsByTagNameNS('*', 't')].map((n) => n.textContent ?? '').join(' ').trim(),
    )
    if (cells.some(Boolean)) lines.push(cells.join(' | '))
  }
  return lines.join('\n')
}

export async function extractPptx(file: File, onProgress?: (p: number) => void): Promise<Extracted> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const read = (p: string) => zip.file(p)?.async('string')

  // Ordre réel des diapositives
  const pres = parseXml((await read('ppt/presentation.xml')) ?? '')
  const presRels = rels(parseXml((await read('ppt/_rels/presentation.xml.rels')) ?? ''))
  let slidePaths = [...pres.getElementsByTagNameNS('*', 'sldId')]
    .map((s) => s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))
    .map((rid) => presRels.find((r) => r.id === rid)?.target)
    .filter(Boolean)
    .map((t) => resolvePath('ppt/presentation.xml', t!))
  if (!slidePaths.length)
    slidePaths = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))

  // Images répétées sur beaucoup de diapositives = logo ou fond de modèle.
  // On compare le contenu (et non le nom), car chaque diapositive peut avoir sa copie.
  const hashOf = new Map<string, string>()
  const usage = new Map<string, number>()
  const slideImages: string[][] = []
  const slideRels: ReturnType<typeof rels>[] = []
  for (const sp of slidePaths) {
    const relPath = sp.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')
    const r = rels(parseXml((await read(relPath)) ?? '<Relationships/>'))
    slideRels.push(r)
    const imgs = [...new Set(r.filter((x) => x.type.endsWith('/image')).map((x) => resolvePath(sp, x.target)))]
    slideImages.push(imgs)
    const hashes = new Set<string>()
    for (const path of imgs) {
      if (!hashOf.has(path)) {
        const bytes = await zip.file(path)?.async('arraybuffer')
        if (!bytes) continue
        const digest = await crypto.subtle.digest('SHA-1', bytes)
        hashOf.set(path, [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''))
      }
      hashes.add(hashOf.get(path)!)
    }
    for (const h of hashes) usage.set(h, (usage.get(h) ?? 0) + 1)
  }
  const repeated = (p: string) => (usage.get(hashOf.get(p) ?? '') ?? 0) >= Math.max(3, slidePaths.length * 0.3)
  const seen = new Set<string>()

  const parts: string[] = []
  const images: ExtractedImage[] = []
  let skipped = 0
  for (const [i, sp] of slidePaths.entries()) {
    const doc = parseXml((await read(sp)) ?? '')
    let block = `--- Diapositive ${i + 1} ---\n${slideText(doc)}`

    const notesRel = slideRels[i].find((x) => x.type.endsWith('/notesSlide'))
    if (notesRel) {
      const notes = slideText(parseXml((await read(resolvePath(sp, notesRel.target))) ?? ''))
        .split('\n')
        .filter((l) => !/^\d+$/.test(l.trim()))
        .join('\n')
      if (notes.trim()) block += `\nNotes : ${notes}`
    }

    for (const path of slideImages[i]) {
      if (repeated(path) || seen.has(hashOf.get(path) ?? path)) continue
      seen.add(hashOf.get(path) ?? path)
      const entry = zip.file(path)
      if (!entry) continue
      if (!SUPPORTED.test(path)) {
        skipped++
        continue
      }
      const blob = await entry.async('blob')
      if (blob.size < MIN_BYTES) continue
      const prepared = await prepareImage(blob).catch(() => null)
      if (!prepared) continue
      const marker = `[[image:${images.length}]]`
      images.push({ blob: prepared, label: `diapositive ${i + 1}`, marker })
      block += `\n${marker}`
    }
    parts.push(block)
    onProgress?.((i + 1) / slidePaths.length)
  }
  return { text: parts.join('\n\n'), images, skipped }
}
