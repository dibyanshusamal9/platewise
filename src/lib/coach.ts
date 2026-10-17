// Saffron, the in-app AI nutrition coach: shared types and validation.
// Client-safe (no server imports): the server validates Gemini's proposals with
// these schemas, and the app re-validates before applying anything.
import { z } from 'zod'

export const COACH_NAME = 'Saffron'

/** Limits mirror the CHECK constraints in supabase/schema.sql. */
const kcal = z.coerce.number().min(0).max(10000).transform(Math.round)
const grams = z.coerce.number().min(0).max(1000).transform((n) => Math.round(n * 10) / 10)
const mealType = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])

export const CoachItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  portion: z.string().trim().max(120).default(''),
  Calories: kcal,
  Protein: grams,
  Carbs: grams,
  Fats: grams,
})

/** Add a new meal to the log. */
export const LogMealActionSchema = z.object({
  type: z.literal('log_meal'),
  label: z.string().trim().min(1).max(80),
  meal_name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(2).max(500),
  meal_type: mealType,
  calories: kcal,
  protein: grams,
  carbs: grams,
  fat: grams,
  items: z.array(CoachItemSchema).max(20).default([]),
  /** ISO time it was eaten; omitted = now. Must be within the last 7 days. */
  eaten_at: z.iso.datetime({ offset: true }).optional(),
})

/** Correct an existing meal (only meals from the last 7 days that the coach was shown). */
export const UpdateMealActionSchema = z.object({
  type: z.literal('update_meal'),
  label: z.string().trim().min(1).max(80),
  meal_id: z.uuid(),
  meal_name: z.string().trim().min(1).max(80).optional(),
  meal_type: mealType.optional(),
  calories: kcal.optional(),
  protein: grams.optional(),
  carbs: grams.optional(),
  fat: grams.optional(),
})

/** Change daily targets (applies to the whole weekly report). */
export const UpdateTargetsActionSchema = z.object({
  type: z.literal('update_targets'),
  label: z.string().trim().min(1).max(80),
  tdee_kcal: z.coerce.number().int().min(1000).max(6000),
  calorie_target_kcal: z.coerce.number().int().min(800).max(6000),
  protein_g: z.coerce.number().int().min(0).max(500),
  carbs_g: z.coerce.number().int().min(0).max(1000),
  fat_g: z.coerce.number().int().min(0).max(400),
})

export const ProposalSchema = z.discriminatedUnion('type', [
  LogMealActionSchema,
  UpdateMealActionSchema,
  UpdateTargetsActionSchema,
])
export type Proposal = z.infer<typeof ProposalSchema>

export type ActionStatus = 'proposed' | 'applied' | 'dismissed'

/**
 * The real meal an update_meal proposal points at, captured by the server from the
 * database. The card shows THIS (not the AI's label), so a wrong id is visible before Apply.
 */
export interface MealSnapshot {
  meal_name: string
  eaten_at: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** What is stored in chat_messages.actions. */
export type StoredAction =
  | (Proposal & {
      id: string
      status: ActionStatus
      applied_meal_id?: string
      /** update_meal: the real meal it points at. */
      target?: MealSnapshot
      /** log_meal: thumbnail of the photo this meal came from, saved with the meal. */
      photo_thumb?: string
    })
  | { id: string; type: 'remembered' | 'forgot'; content: string; status: 'applied' }

export function parseStoredActions(value: unknown): StoredAction[] {
  return Array.isArray(value) ? (value as StoredAction[]) : []
}

export const SUGGESTED_PROMPTS = [
  'Plan my dinner so I hit my protein target',
  'Make me a one-day Indian meal plan for my calorie target',
  'How big should my rice portion be at lunch?',
  'What can I snack on that’s under 200 kcal?',
]
