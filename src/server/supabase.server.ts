import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

/**
 * A Supabase client that acts *as the signed-in user*: their JWT rides along on
 * every request, so Row Level Security applies exactly as it does in the browser.
 * No service-role key is needed anywhere in this app.
 */
export function createUserScopedSupabase(accessToken: string) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set.')
  }
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
