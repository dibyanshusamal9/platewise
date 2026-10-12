import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase, isSupabaseConfigured } from './supabase'

type AuthState =
  | { status: 'loading' }
  | { status: 'misconfigured' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; user: User }

type AuthContextValue = AuthState & { signOut: () => Promise<void> }

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Supabase keeps the session in localStorage, which only exists in the browser,
 * so SSR always renders the 'loading' state and the real state resolves after
 * hydration. Identical first renders on both sides mean no hydration mismatch.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ status: 'misconfigured' })
      return
    }
    const supabase = getSupabase()
    const apply = (session: Session | null) =>
      setState(session ? { status: 'signed-in', session, user: session.user } : { status: 'signed-out' })

    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') queryClient.clear()
      apply(session)
    })
    return () => subscription.subscription.unsubscribe()
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signOut: async () => {
        await getSupabase().auth.signOut()
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For components that only render behind the auth gate. */
export function useUser(): User {
  const auth = useAuth()
  if (auth.status !== 'signed-in') throw new Error('useUser called while signed out')
  return auth.user
}
