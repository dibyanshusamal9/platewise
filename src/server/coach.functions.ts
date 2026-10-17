// Server function for Saffron, the AI coach. Safe to import from components:
// the build swaps the handler for a fetch stub in the client bundle.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireUser, withGeminiKey } from './middleware'
import { runCoachTurn } from './coach.server'
import { ImagesSchema, ThumbnailSchema, MAX_PHOTOS } from './schemas'

const CoachInput = z
  .object({
    text: z.string().trim().max(2000, 'Keep messages under 2,000 characters.'),
    images: ImagesSchema.default([]),
    thumbnails: z.array(ThumbnailSchema).max(MAX_PHOTOS).default([]),
    /** Date#getTimezoneOffset(): lets the coach reason in the person's local day. */
    tzOffsetMinutes: z.number().int().min(-840).max(840),
    /** Continue this chat; omitted = start a new one. */
    conversationId: z.uuid().optional(),
  })
  .refine((d) => d.text.length > 0 || d.images.length > 0, 'Type a message or add a photo.')

/** One turn of the conversation: saves both messages and returns them. */
export const sendCoachMessage = createServerFn({ method: 'POST' })
  .middleware([requireUser, withGeminiKey])
  .validator(CoachInput)
  .handler(async ({ data, context }) => runCoachTurn(context, context.geminiKey, data))
