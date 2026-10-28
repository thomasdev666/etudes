import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { resolveSrc } from '@/lib/storage'

export function ImageView({ node, selected }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? '')
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    resolveSrc(src)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [src])

  return (
    <NodeViewWrapper as="figure" className="my-3">
      {failed ? (
        <div className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Image indisponible</div>
      ) : url ? (
        <img src={url} alt={node.attrs.alt ?? ''} className={selected ? 'ProseMirror-selectednode' : undefined} draggable={false} />
      ) : (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      )}
    </NodeViewWrapper>
  )
}
