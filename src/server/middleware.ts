// Auth + bring-your-own-key middleware shared by every server function that needs it.
// Safe to import from client code: the build keeps only the .client() halves there.
import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { getSupabase } from '../lib/supabase'
import { GEMINI_KEY_PATTERN, normalizeGeminiKey, readGeminiKey } from '../lib/gemini-key'
import { createUserScopedSupabase } from './supabase.server'
import { GEMINI_KEY_MESSAGES, GeminiKeyError } from './nutrition-ai.server'

/**
 * Forwards the browser's Supabase access token and verifies it on the server.
 * Every server function below is a public HTTP endpoint, so this check (not the
 * UI) is what keeps them from being used by anonymous callers.
 */
export const requireUser = createMiddleware({ type: 'function' })
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

/**
 * Sends the signed-in user's own Gemini key (kept on their device) with the request.
 * The server uses it for this request only and never stores or logs it.
 */
export const withGeminiKey = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const { data } = await getSupabase().auth.getSession()
    const key = data.session ? readGeminiKey(data.session.user.id) : null
    return next({ headers: key ? { 'X-Gemini-Key': key } : {} })
  })
  .server(async ({ next }) => {
    const geminiKey = normalizeGeminiKey(getRequestHeader('x-gemini-key') ?? '')
    if (!geminiKey) throw new GeminiKeyError(GEMINI_KEY_MESSAGES.missing)
    if (!GEMINI_KEY_PATTERN.test(geminiKey)) throw new GeminiKeyError(GEMINI_KEY_MESSAGES.invalid)
    return next({ context: { geminiKey } })
  })
