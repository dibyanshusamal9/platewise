import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MealType, TablesInsert, TablesUpdate } from './database.types'
import { addDays, dateFromKey, dayKey, type DailyGoal, type Meal } from './nutrition'
import { getSupabase } from './supabase'
import { useUser } from './auth'
import { estimateMeal, logMeal, logMealFromPhoto } from '../server/meals.functions'

/** Today's local date key; rolls over at midnight and when the tab wakes up. */
export function useTodayKey() {
  const [key, setKey] = useState(() => dayKey(new Date()))
  useEffect(() => {
    const refresh = () => setKey(dayKey(new Date()))
    const now = new Date()
    const msToMidnight = addDays(dateFromKey(dayKey(now)), 1).getTime() - now.getTime()
    const timer = setTimeout(refresh, msToMidnight + 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [key])
  return key
}

const keys = {
  goals: (userId: string) => ['goals', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  meals: (userId: string) => ['meals', userId] as const,
  mealsInRange: (userId: string, fromKey: string, toKey: string) => ['meals', userId, fromKey, toKey] as const,
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/** Every goal version, oldest first (it's a handful of rows per user). */
export function useGoals() {
  const user = useUser()
  return useQuery({
    queryKey: keys.goals(user.id),
    queryFn: async (): Promise<DailyGoal[]> =>
      unwrap(await getSupabase().from('daily_goals').select('*').order('effective_from', { ascending: true })),
  })
}

export function useProfile() {
  const user = useUser()
  return useQuery({
    queryKey: keys.profile(user.id),
    queryFn: async () => unwrap(await getSupabase().from('users').select('*').eq('id', user.id).maybeSingle()),
  })
}

/** Meals eaten from local midnight of `fromKey` up to (not including) local midnight after `toKey`. */
export function useMealsBetween(fromKey: string, toKey: string) {
  const user = useUser()
  return useQuery({
    queryKey: keys.mealsInRange(user.id, fromKey, toKey),
    queryFn: async (): Promise<Meal[]> =>
      unwrap(
        await getSupabase()
          .from('meals')
          .select('*')
          .gte('eaten_at', dateFromKey(fromKey).toISOString())
          .lt('eaten_at', addDays(dateFromKey(toKey), 1).toISOString())
          .order('eaten_at', { ascending: false }),
      ),
    placeholderData: (previous) => previous,
  })
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export function useLogMeal() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { description: string; mealType: MealType }) =>
      logMeal({ data: { ...input, eatenAt: new Date().toISOString() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.meals(user.id) }),
  })
}

/**
 * Scan from plate with 1–4 photos.
 *  - "together": all photos are one meal (plate + drink, or two angles) → one estimate
 *  - "separate": each photo is its own meal → one estimate per photo
 * Always resolves to the list of saved meals.
 */
export function useLogPhotoMeal() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      photos: { base64: string; mimeType: 'image/jpeg'; thumbnail: string }[]
      mode: 'together' | 'separate'
      note?: string
      mealType: MealType
    }): Promise<Meal[]> => {
      const eatenAt = new Date().toISOString()
      const send = (photos: typeof input.photos) =>
        logMealFromPhoto({
          data: {
            images: photos.map(({ base64, mimeType }) => ({ base64, mimeType })),
            thumbnail: photos[0].thumbnail,
            note: input.note,
            mealType: input.mealType,
            eatenAt,
          },
        })
      if (input.mode === 'together' || input.photos.length === 1) return [await send(input.photos)]
      // One at a time: friendlier to the free Gemini rate limit than firing all at once.
      const saved: Meal[] = []
      for (const photo of input.photos) saved.push(await send([photo]))
      return saved
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.meals(user.id) }),
  })
}

export function useEstimateMeal() {
  return useMutation({
    mutationFn: (description: string) => estimateMeal({ data: { description } }),
  })
}

export function useUpdateMeal() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'meals'> }) =>
      unwrap(await getSupabase().from('meals').update(patch).eq('id', id).select().single()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.meals(user.id) }),
  })
}

export function useDeleteMeal() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('meals').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    // Drop the row from every cached range immediately; refetch to reconcile.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.meals(user.id) })
      queryClient.setQueriesData<Meal[]>({ queryKey: keys.meals(user.id) }, (old) =>
        old?.filter((meal) => meal.id !== id),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.meals(user.id) }),
  })
}

export function useSaveGoals() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      goal,
      profile,
    }: {
      goal: Omit<TablesInsert<'daily_goals'>, 'user_id'> & { effective_from: string }
      profile?: TablesUpdate<'users'>
    }) => {
      const supabase = getSupabase()
      // One version per day: saving twice on the same day overwrites today's row.
      unwrap(
        await supabase
          .from('daily_goals')
          .upsert({ ...goal, user_id: user.id }, { onConflict: 'user_id,effective_from' })
          .select()
          .single(),
      )
      if (profile) unwrap(await supabase.from('users').update(profile).eq('id', user.id).select().single())
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.goals(user.id) }),
        queryClient.invalidateQueries({ queryKey: keys.profile(user.id) }),
      ]),
  })
}
