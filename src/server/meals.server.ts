// Server-only helpers for the meal server functions. Kept out of meals.functions.ts
// because module-level code there is also bundled for the client.
import type { MealType } from '../lib/database.types'
import type { NutritionEstimate } from './nutrition-ai.server'
import type { createUserScopedSupabase } from './supabase.server'

export interface AuthedContext {
  supabase: ReturnType<typeof createUserScopedSupabase>
  userId: string
}

/** Insert an AI-estimated meal as the signed-in user (RLS applies) and return the row. */
export async function saveMeal(
  context: AuthedContext,
  fields: {
    description: string
    mealType: MealType
    eatenAt?: string
    inputType: 'text' | 'photo'
    photoThumb?: string
  },
  estimate: NutritionEstimate,
) {
  const { data: meal, error } = await context.supabase
    .from('meals')
    .insert({
      user_id: context.userId,
      description: fields.description,
      meal_type: fields.mealType,
      eaten_at: fields.eatenAt ?? new Date().toISOString(),
      input_type: fields.inputType,
      photo_thumb: fields.photoThumb ?? null,
      meal_name: estimate.mealName,
      calories: estimate.calories,
      protein_g: estimate.protein,
      carbs_g: estimate.carbs,
      fat_g: estimate.fat,
      items: estimate.items,
      confidence: estimate.confidence,
      ai_notes: estimate.notes || null,
      ai_model: estimate.model,
      source: 'ai',
    })
    .select()
    .single()

  if (error) {
    console.error('[saveMeal] insert failed', error)
    throw new Error('The estimate worked, but saving the meal failed. Please try again.')
  }
  return meal
}
