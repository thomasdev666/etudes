import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Mathematics from '@tiptap/extension-mathematics'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { ReactNodeViewRenderer, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { STORAGE_PREFIX } from '@/lib/storage'
import { ImageView } from './ImageView'
import { Callout, Diagram } from './visuals'

const StorageImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})

export function buildExtensions(getEditor: () => Editor | null) {
  const editMath = (kind: 'inline' | 'block') => (node: { attrs: { latex?: string } }, pos: number) => {
    const latex = prompt('Formule LaTeX', node.attrs.latex ?? '')
    const editor = getEditor()
    if (latex === null || !editor) return
    const chain = editor.chain().setNodeSelection(pos)
    if (kind === 'inline') chain.updateInlineMath({ latex, pos }).focus().run()
    else chain.updateBlockMath({ latex, pos }).focus().run()
  }

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ['storage'],
        isAllowedUri: (url, ctx) => url.startsWith(STORAGE_PREFIX) || ctx.defaultValidate(url),
      },
    }),
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    StorageImage.configure({ allowBase64: false }),
    Diagram,
    Callout,
    Mathematics.configure({
      inlineOptions: { onClick: editMath('inline') },
      blockOptions: { onClick: editMath('block') },
      katexOptions: { throwOnError: false },
    }),
    Placeholder.configure({ placeholder: 'Commence à écrire… (tape « # » pour un titre, « - » pour une liste)' }),
  ]
}
