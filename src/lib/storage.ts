import { BUCKET, must, supabase } from './supabase'

export const STORAGE_PREFIX = 'storage:'
const cache = new Map<string, { url: string; exp: number }>()

// Les fichiers sont privés : on génère des liens temporaires à la demande
export async function signedUrl(path: string): Promise<string> {
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) throw new Error(error?.message ?? 'Fichier introuvable')
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 })
  return data.signedUrl
}

export async function resolveSrc(src: string) {
  return src.startsWith(STORAGE_PREFIX) ? signedUrl(src.slice(STORAGE_PREFIX.length)) : src
}

export async function uploadNoteFile(opts: { userId: string; spaceId: string; noteId: string; file: File }) {
  const { userId, spaceId, noteId, file } = opts
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
  const path = `${userId}/${spaceId}/notes/${noteId}/${crypto.randomUUID()}-${safe}`
  must(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined }))
  must(
    await supabase
      .from('files')
      .insert({ space_id: spaceId, note_id: noteId, path, name: file.name, mime: file.type || 'application/octet-stream', size: file.size }),
  )
  return path
}

export async function downloadBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(error?.message ?? 'Téléchargement impossible')
  return data
}
