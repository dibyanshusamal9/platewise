// Server functions (type-safe RPC). Safe to import from components: the build
// swaps the handlers for fetch stubs in the client bundle.
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase'
import { createUserScopedSupabase } from './supabase.server'
import { estimateNutrition } from './nutrition-ai.server'
import { saveMeal } from './meals.server'

/**
 * Forwards the browser's Supabase access token and verifies it on the server.
 * Every server function below is a public HTTP endpoint, so this check — not the
 * UI — is what keeps the Gemini key from being used by anonymous callers.
 */
const requireUser = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const { data } = await getSupabase().auth.getSession()
    const token = data.session?.access_token
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} })
  })
  .server(async ({ next }) => {
    const header = getRequestHeader('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new Error('You need to be signed in to do that.')

    const supabase = createUserScopedSupabase(token)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) throw new Error('Your session has expired. Please sign in again.')

    setResponseHeader('Cache-Control', 'no-store')
    return next({ context: { supabase, userId: data.user.id } })
  })

const description = z
  .string()
  .trim()
  .min(2, 'Describe what you ate.')
  .max(500, 'Keep it under 500 characters.')

const mealType = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
const eatenAt = z.iso.datetime({ offset: true }).optional()

const LogMealInput = z.object({ description, mealType, eatenAt })

// ~1.5 MB of base64. The client downsizes photos to ≤1280 px JPEG (~150–400 KB) first.
const MAX_IMAGE_BASE64 = 2_000_000

const LogPhotoInput = z.object({
  imageBase64: z
    .string()
    .min(100, 'The photo is empty.')
    .max(MAX_IMAGE_BASE64, 'That photo is too large. Please try another.')
    .regex(/^[A-Za-z0-9+/]+=*$/, 'The photo could not be read.'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  // Tiny preview kept with the meal; mirrors the meals_photo_thumb_check constraint.
  thumbnail: z
    .string()
    .max(60_000)
    .regex(/^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/)
    .optional(),
  mealType,
  eatenAt,
})

/** Text in → Gemini estimate → validated → saved. Returns the stored row. */
export const logMeal = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(LogMealInput)
  .handler(async ({ data, context }) => {
    const estimate = await estimateNutrition(data.description)
    return saveMeal(context, { ...data, inputType: 'text' }, estimate)
  })

/**
 * Scan from plate: photo (+ optional note) → Gemini vision → saved meal.
 * The full photo is used only for the estimate and is never stored.
 */
export const logMealFromPhoto = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(LogPhotoInput)
  .handler(async ({ data, context }) => {
    const estimate = await estimateNutrition({
      kind: 'photo',
      imageBase64: data.imageBase64,
      mimeType: data.mimeType,
      note: data.note,
    })
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
  .middleware([requireUser])
  .validator(z.object({ description }))
  .handler(async ({ data }) => estimateNutrition(data.description))
