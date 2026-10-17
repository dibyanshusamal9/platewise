// Server functions (type-safe RPC). Safe to import from components: the build
// swaps the handlers for fetch stubs in the client bundle.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { GEMINI_KEY_PATTERN, normalizeGeminiKey } from '../lib/gemini-key'
import { estimateNutrition, verifyGeminiKey } from './nutrition-ai.server'
import { requireUser, withGeminiKey } from './middleware'
import { saveMeal } from './meals.server'
import { ImagesSchema, ThumbnailSchema } from './schemas'

const description = z
  .string()
  .trim()
  .min(2, 'Describe what you ate.')
  .max(500, 'Keep it under 500 characters.')

const mealType = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
const eatenAt = z.iso.datetime({ offset: true }).optional()

const LogMealInput = z.object({ description, mealType, eatenAt })

// ~1.5 MB of base64. The client downsizes photos to ≤1280 px JPEG (~150–400 KB) first.
const LogPhotoInput = z.object({
  /** 1–4 photos of ONE meal (e.g. plate + drink, or two angles). */
  images: ImagesSchema.min(1, 'Add a photo.'),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  thumbnail: ThumbnailSchema.optional(),
  mealType,
  eatenAt,
})

/** Text in → Gemini estimate → validated → saved. Returns the stored row. */
export const logMeal = createServerFn({ method: 'POST' })
  .middleware([requireUser, withGeminiKey])
  .validator(LogMealInput)
  .handler(async ({ data, context }) => {
    const estimate = await estimateNutrition(data.description, context.geminiKey)
    return saveMeal(context, { ...data, inputType: 'text' }, estimate)
  })

/**
 * Scan from plate: photo (+ optional note) → Gemini vision → saved meal.
 * The full photo is used only for the estimate and is never stored.
 */
export const logMealFromPhoto = createServerFn({ method: 'POST' })
  .middleware([requireUser, withGeminiKey])
  .validator(LogPhotoInput)
  .handler(async ({ data, context }) => {
    const estimate = await estimateNutrition({ kind: 'photo', images: data.images, note: data.note }, context.geminiKey)
    // What the person said beats our summary; otherwise list what Gemini saw, so the
    // timeline and the editor's "Re-estimate" button have real text to work with.
    const seen = estimate.items.map((i) => (i.portion ? `${i.name} (${i.portion})` : i.name)).join(', ')
    const description = (data.note || seen || estimate.mealName).slice(0, 500).padEnd(2, '.')
    return saveMeal(
      context,
      { description, mealType: data.mealType, eatenAt: data.eatenAt, inputType: 'photo', photoThumb: data.thumbnail },
      estimate,
    )
  })

/** Estimate only (no save) — used by the editor's "Re-estimate" button. */
export const estimateMeal = createServerFn({ method: 'POST' })
  .middleware([requireUser, withGeminiKey])
  .validator(z.object({ description }))
  .handler(async ({ data, context }) => estimateNutrition(data.description, context.geminiKey))

/**
 * Checks a key before the user saves it. Requires sign-in so the endpoint can't be
 * used anonymously to test stolen keys. The key is checked and then forgotten.
 */
export const checkGeminiKey = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(
    z.object({
      apiKey: z.string().transform(normalizeGeminiKey).pipe(z.string().regex(GEMINI_KEY_PATTERN, 'That doesn’t look like a Gemini API key.')),
    }),
  )
  .handler(async ({ data }) => verifyGeminiKey(data.apiKey))
