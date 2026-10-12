/**
 * Prepares a camera or gallery photo for "scan from plate":
 *  - the upload: longest side ≤ 1280 px, JPEG ~0.82. A 4–8 MB phone photo becomes
 *    roughly 150–400 KB, which is plenty for Gemini to read a plate.
 *  - the thumbnail: ≤ 160 px WebP (JPEG fallback), ~5–10 KB, stored with the meal.
 * EXIF rotation is applied, so portrait photos aren't sent sideways.
 */
export interface PreparedPhoto {
  base64: string
  mimeType: 'image/jpeg'
  thumbnail: string
  previewUrl: string
}

const UPLOAD_MAX_SIDE = 1280
const THUMB_MAX_SIDE = 160
const MAX_SOURCE_BYTES = 25 * 1024 * 1024

export class PhotoError extends Error {}

function drawScaled(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoError('Your browser could not process the photo.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new PhotoError('Could not compress the photo.'))), type, quality),
  )
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new PhotoError('Could not read the photo.'))
    reader.readAsDataURL(blob)
  })
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.type && !file.type.startsWith('image/')) throw new PhotoError('That file isn’t an image.')
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoError('That photo is too large (over 25 MB).')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Typically HEIC on browsers that can't decode it.
    throw new PhotoError('This photo format isn’t supported here. Try a JPEG or PNG, or take the photo in the app.')
  }

  try {
    const uploadBlob = await toBlob(drawScaled(bitmap, UPLOAD_MAX_SIDE), 'image/jpeg', 0.82)
    const thumbCanvas = drawScaled(bitmap, THUMB_MAX_SIDE)
    let thumbnail = thumbCanvas.toDataURL('image/webp', 0.7)
    // Browsers without WebP encoding silently return PNG; use JPEG instead.
    if (!thumbnail.startsWith('data:image/webp')) thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7)

    return {
      base64: await blobToBase64(uploadBlob),
      mimeType: 'image/jpeg',
      thumbnail,
      previewUrl: URL.createObjectURL(uploadBlob),
    }
  } finally {
    bitmap.close()
  }
}
