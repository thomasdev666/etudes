export type ExtractedImage = { blob: Blob; label: string; marker: string }
export type Extracted = { text: string; images: ExtractedImage[]; skipped: number }

const MAX_SIDE = 1280

// Réduit l'image (envoi plus rapide, moins de quota IA) et la convertit en JPEG
export async function prepareImage(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', 0.85))
}
