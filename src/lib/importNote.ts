// Import de notes : Markdown (Notion, Obsidian), Word (.docx), HTML ou texte brut.
// Le contenu est converti au format de l'éditeur ; scripts et styles sont écartés.
import { generateJSON, generateText, type JSONContent } from '@tiptap/core'
import { buildExtensions } from '@/components/editor/extensions'

export const NOTE_IMPORT_ACCEPT = '.md,.markdown,.txt,.html,.htm,.docx'

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// Formules $…$ et $$…$$ vers les nœuds de formule de l'éditeur
export function mathToHtml(md: string) {
  return md
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => `\n<div data-type="block-math" data-latex="${escapeAttr(tex.trim())}"></div>\n`)
    .replace(/(^|[^\\$])\$([^\s$][^$\n]*?)\$/g, (_, pre: string, tex: string) => `${pre}<span data-type="inline-math" data-latex="${escapeAttr(tex)}"></span>`)
}

// Titre lisible depuis le nom du fichier (Notion ajoute un identifiant de 32 caractères)
export function titleFromFile(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 200) || 'Note importée'
}

async function fileToHtml(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser')
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
    return value
  }
  const text = await file.text()
  if (ext === 'html' || ext === 'htm') return new DOMParser().parseFromString(text, 'text/html').body.innerHTML
  if (ext === 'md' || ext === 'markdown') {
    const { marked } = await import('marked')
    return marked.parse(mathToHtml(text), { async: false }) as string
  }
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export async function fileToNote(file: File): Promise<{ title: string; content: JSONContent; content_text: string }> {
  const ext = buildExtensions(() => null)
  const html = await fileToHtml(file)
  const content = generateJSON(html, ext)
  // Le premier titre devient le titre de la note
  const first = content.content?.[0]
  let title = titleFromFile(file.name)
  if (first?.type === 'heading' && first.attrs?.level === 1) {
    title = (first.content ?? []).map((c) => c.text ?? '').join('').trim().slice(0, 200) || title
    content.content = content.content!.slice(1)
  }
  return { title, content, content_text: generateText(content, ext, { blockSeparator: '\n' }) }
}
