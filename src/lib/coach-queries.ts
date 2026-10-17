import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Json, Tables } from './database.types'
import { ProposalSchema, parseStoredActions, type StoredAction } from './coach'
import { dayKey } from './nutrition'
import { getSupabase } from './supabase'
import { useUser } from './auth'
import { sendCoachMessage } from '../server/coach.functions'

export type ChatMessage = Tables<'chat_messages'>
export type ChatConversation = Tables<'chat_conversations'>
export type Memory = Tables<'user_memories'>

const keys = {
  chats: (userId: string) => ['chat', userId] as const,
  chat: (userId: string, conversationId: string | null) => ['chat', userId, conversationId] as const,
  conversations: (userId: string) => ['chat', userId, 'list'] as const,
  memories: (userId: string) => ['memories', userId] as const,
  meals: (userId: string) => ['meals', userId] as const,
  goals: (userId: string) => ['goals', userId] as const,
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

// ─── Which chat is open (remembered per account on this device) ─────────────

const OPEN_CHAT_KEY = 'platewise:open-chat:'

/** The open conversation id; null = a fresh "New chat" that doesn't exist until the first message. */
export function useOpenConversation(): [string | null, (id: string | null) => void] {
  const user = useUser()
  const [id, setId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(OPEN_CHAT_KEY + user.id)
    } catch {
      return null
    }
  })
  const set = useCallback(
    (next: string | null) => {
      setId(next)
      try {
        if (next) window.localStorage.setItem(OPEN_CHAT_KEY + user.id, next)
        else window.localStorage.removeItem(OPEN_CHAT_KEY + user.id)
      } catch {
        // Storage unavailable: the choice just isn't remembered after a reload.
      }
    },
    [user.id],
  )
  return [id, set]
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/** All chats, most recently active first. */
export function useConversations() {
  const user = useUser()
  return useQuery({
    queryKey: keys.conversations(user.id),
    queryFn: async (): Promise<ChatConversation[]> =>
      unwrap(
        await getSupabase().from('chat_conversations').select('*').order('updated_at', { ascending: false }).limit(100),
      ),
  })
}

/**
 * True when the database predates multiple chats (supabase/schema.sql not re-run yet).
 * The app then works as a single chat and hides New chat / Your chats.
 */
export function chatsUnavailable(conversations: { error: Error | null }) {
  return /could not find the table|chat_conversations|does not exist/i.test(conversations.error?.message ?? '')
}

/**
 * The latest 80 messages of one chat, oldest first. A new (null) chat has none.
 * `singleChat` (older database): all messages, no chat filter.
 */
export function useChatMessages(conversationId: string | null, singleChat = false) {
  const user = useUser()
  return useQuery({
    queryKey: [...keys.chat(user.id, conversationId), singleChat],
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!conversationId && !singleChat) return []
      const query = getSupabase().from('chat_messages').select('*')
      const scoped = singleChat ? query : query.eq('conversation_id', conversationId!)
      return unwrap(await scoped.order('created_at', { ascending: false }).limit(80)).reverse()
    },
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
    mutationFn: (input: {
      text: string
      photos: { base64: string; mimeType: 'image/jpeg'; thumbnail: string }[]
      conversationId: string | null
    }) =>
      sendCoachMessage({
        data: {
          text: input.text,
          images: input.photos.map(({ base64, mimeType }) => ({ base64, mimeType })),
          thumbnails: input.photos.map((p) => p.thumbnail),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          ...(input.conversationId && { conversationId: input.conversationId }),
        },
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.chats(user.id) }),
        queryClient.invalidateQueries({ queryKey: keys.memories(user.id) }),
      ]),
  })
}

/** Deletes a chat and its messages (memories are kept: they belong to you, not the chat). */
export function useDeleteConversation() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('chat_conversations').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.chats(user.id) }),
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
        // The server attaches the photo the meal came from (even if it was sent a few messages earlier).
        photoThumb = ('photo_thumb' in action && action.photo_thumb) || photoThumb
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
        queryClient.invalidateQueries({ queryKey: keys.chats(user.id) }),
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.chats(user.id) }),
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
