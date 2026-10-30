// Traduction de l'interface à l'affichage : chaque texte d'interface en français est
// remplacé par son équivalent anglais, d'après un dictionnaire. Les contenus de l'utilisateur
// (notes, cours, cartes, noms de matières) ne figurent pas au dictionnaire et restent intacts.
// Les zones marquées translate="no" (éditeur, contenus) ne sont jamais parcourues.

type Pattern = { re: RegExp; order: number[]; to: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export function compile(dict: Record<string, string>) {
  const exact = new Map<string, string>()
  const patterns: Pattern[] = []
  for (const [fr, en] of Object.entries(dict)) {
    const key = norm(fr)
    if (!/\{\d\}/.test(key)) {
      exact.set(key, en)
      continue
    }
    const order: number[] = []
    const source = key
      .split(/(\{\d\})/)
      .map((part) => {
        const m = part.match(/^\{(\d)\}$/)
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        order.push(Number(m[1]))
        return '(.*?)'
      })
      .join('')
    patterns.push({ re: new RegExp(`^${source}$`), order, to: en })
  }
  // Les motifs les plus longs (plus précis) d'abord
  patterns.sort((a, b) => b.re.source.length - a.re.source.length)
  return { exact, patterns }
}

export type Compiled = ReturnType<typeof compile>

export function translateText(text: string, c: Compiled): string | null {
  const key = norm(text)
  if (!key || !/[A-Za-zÀ-ÿ]/.test(key)) return null
  const direct = c.exact.get(key)
  let out: string | null = direct ?? null
  if (out === null) {
    for (const p of c.patterns) {
      const m = key.match(p.re)
      if (!m) continue
      const values: string[] = []
      p.order.forEach((slot, i) => (values[slot] = m[i + 1]))
      // Les valeurs insérées (noms, nombres) peuvent elles-mêmes être des textes d'interface
      out = p.to.replace(/\{(\d)\}/g, (_, d: string) => {
        const v = values[Number(d)] ?? ''
        return c.exact.get(norm(v)) ?? v
      })
      break
    }
  }
  if (out === null) return null
  // Garde les espaces autour du texte d'origine (« Étape » + « 2 »)
  const lead = text.match(/^\s*/)![0]
  const trail = text.match(/\s*$/)![0]
  return lead + out + trail
}

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt']

// Texte : jamais dans les zones de contenu, de code ou de saisie
function skip(node: Node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return !el || !!el.closest('[translate="no"], [contenteditable="true"], script, style, textarea, code, pre')
}
// Attributs (placeholder, aria-label…) : seulement hors des zones de contenu
const skipAttrs = (el: Element) => !!el.closest('[translate="no"], [contenteditable="true"]')

function translateNode(node: Node, c: Compiled, a: Compiled) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (skip(node)) return
    const t = translateText(node.nodeValue ?? '', c)
    if (t !== null && t !== node.nodeValue) node.nodeValue = t
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as Element
  if (skipAttrs(el)) return
  for (const attr of ATTRS) {
    const v = el.getAttribute(attr)
    if (v) {
      const t = translateText(v, a)
      if (t !== null && t !== v) el.setAttribute(attr, t)
    }
  }
  if (el.tagName === 'INPUT' && ['button', 'submit'].includes((el as HTMLInputElement).type)) {
    const t = translateText((el as HTMLInputElement).value, c)
    if (t) (el as HTMLInputElement).value = t
  }
  el.childNodes.forEach((n) => translateNode(n, c, a))
}

// attrDict : exemples de saisie, appliqués seulement aux attributs (placeholder…)
export function startTranslator(dict: Record<string, string>, attrDict: Record<string, string> = {}, root: Node = document.body) {
  const c = compile(dict)
  const a = compile({ ...dict, ...attrDict })
  translateNode(root, c, a)
  const titleEl = document.querySelector('title')
  const fixTitle = () => {
    const t = translateText(document.title, c)
    if (t && t !== document.title) document.title = t
  }
  fixTitle()
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateNode(r.target, c, a)
      else if (r.type === 'attributes') translateNode(r.target, c, a)
      else r.addedNodes.forEach((n) => translateNode(n, c, a))
    }
  })
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  if (titleEl) new MutationObserver(fixTitle).observe(titleEl, { childList: true, characterData: true, subtree: true })
  return { compiled: c, stop: () => obs.disconnect() }
}
