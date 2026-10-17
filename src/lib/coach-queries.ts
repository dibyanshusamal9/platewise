import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Json, Tables } from './database.types'
import { ProposalSchema, parseStoredActions, type StoredAction } from './coach'
import { dayKey } from './nutrition'
import { getSupabase } from './supabase'
import { useUser } from './auth'
import { sendCoachMessage } from '../server/coach.functions'

export type ChatMessage = Tables<'chat_messages'>
export type Memory = Tables<'user_memories'>

const keys = {
  chat: (userId: string) => ['chat', userId] as const,
  memories: (userId: string) => ['memories', userId] as const,
  meals: (userId: string) => ['meals', userId] as const,
  goals: (userId: string) => ['goals', userId] as const,
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/** The latest 80 messages, oldest first. */
export function useChatMessages() {
  const user = useUser()
  return useQuery({
    queryKey: keys.chat(user.id),
    queryFn: async (): Promise<ChatMessage[]> =>
      unwrap(
        await getSupabase().from('chat_messages').select('*').order('created_at', { ascending: false }).limit(80),
      ).reverse(),
  })
}

export function useMemories() {
  const user = useUser()
  return useQuery({
    queryKey: keys.memories(user.id),
    queryFn: async (): Promise<Memory[]> =>
      unwrap(await getSupabase().from('user_memories').select('*').order('created_at', { ascending: true })),
  })
}

// ─── Conversation ───────────────────────────────────────────────────────────

export function useSendCoachMessage() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { text: string; photos: { base64: string; mimeType: 'image/jpeg'; thumbnail: string }[] }) =>
      sendCoachMessage({
        data: {
          text: input.text,
          images: input.photos.map(({ base64, mimeType }) => ({ base64, mimeType })),
          thumbnails: input.photos.map((p) => p.thumbnail),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        },
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.chat(user.id) }),
        queryClient.invalidateQueries({ queryKey: keys.memories(user.id) }),
      ]),
  })
}

export function useClearChat() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().from('chat_messages').delete().eq('user_id', user.id)
      if (error) throw new Error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.chat(user.id) }),
  })
}

async function setActionStatus(message: ChatMessage, actionId: string, patch: Partial<StoredAction>) {
  const actions = parseStoredActions(message.actions).map((a) => (a.id === actionId ? ({ ...a, ...patch } as StoredAction) : a))
  unwrap(
    await getSupabase()
      .from('chat_messages')
      .update({ actions: actions as unknown as Json })
      .eq('id', message.id)
      .select()
      .single(),
  )
}

/**
 * Carries out one of Saffron's proposals after the person taps Apply. The proposal
 * is validated again here, and every write goes through RLS as the signed-in user.
 */
export function useApplyCoachAction() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      message,
      action,
      photoThumb,
    }: {
      message: ChatMessage
      action: StoredAction
      /** First photo of the question this answer is about, kept with a logged meal. */
      photoThumb?: string
    }) => {
      const proposal = ProposalSchema.parse(action)
      const supabase = getSupabase()
      let appliedMealId: string | undefined

      if (proposal.type === 'log_meal') {
        const { data: meal, error } = await supabase
            .from('meals')
            .insert({
              user_id: user.id,
              description: proposal.description,
              meal_name: proposal.meal_name,
              meal_type: proposal.meal_type,
              eaten_at: proposal.eaten_at ?? new Date().toISOString(),
              calories: proposal.calories,
              protein_g: proposal.protein,
              carbs_g: proposal.carbs,
              fat_g: proposal.fat,
              items: proposal.items as unknown as Json,
              confidence: 'medium',
              ai_notes: 'Logged from a conversation with Saffron.',
              ai_model: message.model ?? 'saffron',
              source: 'ai',
              input_type: photoThumb ? 'photo' : 'text',
              photo_thumb: photoThumb ?? null,
            })
            .select('id')
            .single()
        if (error || !meal) throw new Error(error?.message ?? 'Could not log that meal.')
        appliedMealId = meal.id
      } else if (proposal.type === 'update_meal') {
        const patch = {
          ...(proposal.meal_name !== undefined && { meal_name: proposal.meal_name }),
          ...(proposal.meal_type !== undefined && { meal_type: proposal.meal_type }),
          ...(proposal.calories !== undefined && { calories: proposal.calories }),
          ...(proposal.protein !== undefined && { protein_g: proposal.protein }),
          ...(proposal.carbs !== undefined && { carbs_g: proposal.carbs }),
          ...(proposal.fat !== undefined && { fat_g: proposal.fat }),
          source: 'edited' as const,
        }
        const updated = unwrap(await supabase.from('meals').update(patch).eq('id', proposal.meal_id).select())
        if (!updated.length) throw new Error('That meal no longer exists.')
        appliedMealId = proposal.meal_id
      } else {
        unwrap(
          await supabase
            .from('daily_goals')
            .upsert(
              {
                user_id: user.id,
                effective_from: dayKey(new Date()),
                tdee_kcal: proposal.tdee_kcal,
                calorie_target_kcal: proposal.calorie_target_kcal,
                protein_g: proposal.protein_g,
                carbs_g: proposal.carbs_g,
                fat_g: proposal.fat_g,
              },
              { onConflict: 'user_id,effective_from' },
            )
            .select()
            .single(),
        )
      }

      await setActionStatus(message, action.id, { status: 'applied', ...(appliedMealId && { applied_meal_id: appliedMealId }) })
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.chat(user.id) }),
        queryClient.invalidateQueries({ queryKey: keys.meals(user.id) }),
        queryClient.invalidateQueries({ queryKey: keys.goals(user.id) }),
      ]),
  })
}

export function useDismissCoachAction() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ message, actionId }: { message: ChatMessage; actionId: string }) =>
      setActionStatus(message, actionId, { status: 'dismissed' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.chat(user.id) }),
  })
}

// ─── Memory ─────────────────────────────────────────────────────────────────

export function useAddMemory() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) =>
      unwrap(await getSupabase().from('user_memories').insert({ user_id: user.id, content: content.trim() }).select().single()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.memories(user.id) }),
  })
}

export function useDeleteMemory() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('user_memories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.memories(user.id) })
      queryClient.setQueryData<Memory[]>(keys.memories(user.id), (old) => old?.filter((m) => m.id !== id))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.memories(user.id) }),
  })
}
