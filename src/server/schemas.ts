// Validation shared by the meal and coach server functions (client-safe: no server imports).
import { z } from 'zod'

/** Photos per request. The client downsizes each to ≤1280 px JPEG (~150–400 KB). */
export const MAX_PHOTOS = 4
/** ~1.5 MB of base64 per photo, ~4 MB per request: under Vercel's 4.5 MB body limit. */
const MAX_IMAGE_BASE64 = 2_000_000
const MAX_TOTAL_BASE64 = 4_000_000

export const ImageSchema = z.object({
  base64: z
    .string()
    .min(100, 'A photo is empty.')
    .max(MAX_IMAGE_BASE64, 'A photo is too large. Please try another.')
    .regex(/^[A-Za-z0-9+/]+=*$/, 'A photo could not be read.'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export const ImagesSchema = z
  .array(ImageSchema)
  .max(MAX_PHOTOS, `Up to ${MAX_PHOTOS} photos at a time.`)
  .refine((imgs) => imgs.reduce((n, i) => n + i.base64.length, 0) <= MAX_TOTAL_BASE64, 'Those photos are too large together. Try fewer.')

/** Tiny preview kept with a meal or chat message; mirrors the database check constraints. */
export const ThumbnailSchema = z
  .string()
  .max(60_000)
  .regex(/^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/)
