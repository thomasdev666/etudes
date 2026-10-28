import type { JSONContent } from '@tiptap/react'
import { downloadBlob, STORAGE_PREFIX } from './storage'

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const safeFilename = (s: string) => (s.trim() || 'note').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)

// PDF : on imprime le rendu exact de l'éditeur (formules, tableaux, images)
// dans un cadre isolé ; le navigateur propose « Enregistrer en PDF ».
export async function printNoteAsPdf(title: string, renderedHtml: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('\n')
  doc.open()
  doc.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${styles}
    <style>
      @page { margin: 18mm; }
      html, body { background: #fff !important; color: #111827 !important; }
      body { font-family: 'Inter Variable', system-ui, sans-serif; }
      h1.doc-title { font-size: 26px; margin: 0 0 16px; }
      .prose-note { min-height: 0 !important; }
      .prose-note table, .prose-note img, .prose-note pre, .prose-note blockquote { break-inside: avoid; }
    </style></head>
    <body><h1 class="doc-title font-display">${escapeHtml(title)}</h1><div class="prose-note">${renderedHtml}</div></body></html>`)
  doc.close()
  doc.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'))
  await Promise.all(
    [...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))))),
  )
  await doc.fonts?.ready
  iframe.contentWindow!.focus()
  iframe.contentWindow!.print()
  setTimeout(() => iframe.remove(), 60_000)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// ------------------------------------------------------------------ DOCX

type Docx = typeof import('docx')

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob)
  const max = 600
  const scale = Math.min(1, max / bmp.width)
  return { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) }
}

export async function noteToDocx(title: string, json: JSONContent): Promise<Blob> {
  const d: Docx = await import('docx')
  let listInstance = 0

  function runs(nodes: JSONContent[] = [], extra: Record<string, unknown> = {}): (InstanceType<Docx['TextRun']> | InstanceType<Docx['ExternalHyperlink']>)[] {
    const out: (InstanceType<Docx['TextRun']> | InstanceType<Docx['ExternalHyperlink']>)[] = []
    for (const n of nodes) {
      if (n.type === 'hardBreak') {
        out.push(new d.TextRun({ text: '', break: 1 }))
        continue
      }
      if (n.type === 'inlineMath') {
        out.push(new d.TextRun({ text: String(n.attrs?.latex ?? ''), font: 'Cambria Math', italics: true }))
        continue
      }
      if (n.type !== 'text') continue
      const marks = new Set((n.marks ?? []).map((m) => m.type))
      const link = n.marks?.find((m) => m.type === 'link')?.attrs?.href as string | undefined
      const run = new d.TextRun({
        text: n.text ?? '',
        bold: marks.has('bold'),
        italics: marks.has('italic'),
        underline: marks.has('underline') || link ? {} : undefined,
        strike: marks.has('strike'),
        highlight: marks.has('highlight') ? 'yellow' : undefined,
        font: marks.has('code') ? 'Consolas' : undefined,
        color: link ? '4338CA' : undefined,
        ...extra,
      })
      out.push(link && !link.startsWith(STORAGE_PREFIX) ? new d.ExternalHyperlink({ link, children: [run] }) : run)
    }
    return out
  }

  type Block = InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>

  async function blocks(nodes: JSONContent[] = [], ctx: { list?: { ordered: boolean; level: number; instance: number }; quote?: boolean } = {}): Promise<Block[]> {
    const out: Block[] = []
    for (const n of nodes) {
      switch (n.type) {
        case 'paragraph': {
          const opts: Record<string, unknown> = { children: runs(n.content) }
          if (ctx.list) {
            if (ctx.list.ordered) opts.numbering = { reference: 'ordered', level: ctx.list.level, instance: ctx.list.instance }
            else opts.bullet = { level: ctx.list.level }
          }
          if (ctx.quote) opts.indent = { left: 400 }
          if (ctx.quote) opts.border = { left: { style: d.BorderStyle.SINGLE, size: 12, color: '4F46E5', space: 8 } }
          out.push(new d.Paragraph(opts))
          break
        }
        case 'heading': {
          const lvl = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][(n.attrs?.level ?? 1) - 1]
          out.push(new d.Paragraph({ heading: lvl, children: runs(n.content) }))
          break
        }
        case 'bulletList':
        case 'orderedList':
        case 'taskList': {
          const ordered = n.type === 'orderedList'
          const level = ctx.list ? ctx.list.level + 1 : 0
          const instance = ordered ? ++listInstance : 0
          for (const item of n.content ?? []) {
            const [first, ...rest] = item.content ?? []
            if (n.type === 'taskList' && first?.type === 'paragraph') {
              const box = item.attrs?.checked ? '☑ ' : '☐ '
              out.push(new d.Paragraph({ indent: { left: 360 * (level + 1) }, children: [new d.TextRun(box), ...runs(first.content)] }))
              out.push(...(await blocks(rest, { ...ctx, list: { ordered: false, level, instance } })))
            } else {
              out.push(...(await blocks(first ? [first] : [], { ...ctx, list: { ordered, level, instance } })))
              out.push(...(await blocks(rest, { ...ctx, list: { ordered, level, instance } })))
            }
          }
          break
        }
        case 'blockquote':
          out.push(...(await blocks(n.content, { ...ctx, quote: true })))
          break
        case 'codeBlock':
          for (const line of (n.content?.map((c) => c.text ?? '').join('') ?? '').split('\n'))
            out.push(new d.Paragraph({ shading: { type: d.ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' }, children: [new d.TextRun({ text: line, font: 'Consolas', size: 20 })] }))
          break
        case 'horizontalRule':
          out.push(new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'D1D5DB', space: 1 } }, children: [] }))
          break
        case 'blockMath':
          out.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ text: String(n.attrs?.latex ?? ''), font: 'Cambria Math', italics: true })] }))
          break
        case 'image': {
          const src = String(n.attrs?.src ?? '')
          try {
            const blob = src.startsWith(STORAGE_PREFIX) ? await downloadBlob(src.slice(STORAGE_PREFIX.length)) : await (await fetch(src)).blob()
            const size = await imageSize(blob)
            const type = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg'
            out.push(new d.Paragraph({ children: [new d.ImageRun({ type, data: await blob.arrayBuffer(), transformation: size })] }))
          } catch {
            out.push(new d.Paragraph({ children: [new d.TextRun({ text: '[image]', italics: true })] }))
          }
          break
        }
        case 'table': {
          const rows = []
          for (const row of n.content ?? []) {
            const cells = []
            for (const cell of row.content ?? []) {
              cells.push(
                new d.TableCell({
                  children: (await blocks(cell.content)) as InstanceType<Docx['Paragraph']>[],
                  shading: cell.type === 'tableHeader' ? { type: d.ShadingType.CLEAR, fill: 'EEF0F3', color: 'auto' } : undefined,
                  columnSpan: cell.attrs?.colspan ?? 1,
                  rowSpan: cell.attrs?.rowspan ?? 1,
                }),
              )
            }
            rows.push(new d.TableRow({ children: cells }))
          }
          out.push(new d.Table({ rows, width: { size: 100, type: d.WidthType.PERCENTAGE } }))
          out.push(new d.Paragraph({ children: [] }))
          break
        }
        default:
          if (n.content) out.push(...(await blocks(n.content, ctx)))
      }
    }
    return out
  }

  const body = await blocks(json.content)
  const doc = new d.Document({
    creator: 'Études',
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [
        {
          reference: 'ordered',
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: [d.LevelFormat.DECIMAL, d.LevelFormat.LOWER_LETTER, d.LevelFormat.LOWER_ROMAN, d.LevelFormat.DECIMAL][level],
            text: `%${level + 1}.`,
            alignment: d.AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: [new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun(title)] }), ...body] }],
  })
  return d.Packer.toBlob(doc)
}
