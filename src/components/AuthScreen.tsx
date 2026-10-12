import { useState, type FormEvent } from 'react'
import { MailCheck } from 'lucide-react'
import { getSupabase } from '../lib/supabase'
import { ErrorNote, Spinner } from './ui'
import { Logo } from './Logo'

type Mode = 'sign-in' | 'sign-up'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkInbox, setCheckInbox] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const supabase = getSupabase()
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() || undefined } },
        })
        if (error) throw error
        // With "Confirm email" enabled, Supabase returns a user but no session yet.
        if (!data.session) setCheckInbox(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-11" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Platewise</h1>
          <p className="mt-1 text-sm text-muted">Describe what you ate. We’ll do the math.</p>
        </div>

        {checkInbox ? (
          <div className="card p-6 text-center">
            <MailCheck className="mx-auto size-8 text-energy" aria-hidden />
            <p className="mt-3 font-semibold">Check your inbox</p>
            <p className="mt-1 text-sm text-ink-2">
              We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Open it, then sign in.
            </p>
            <button
              type="button"
              className="btn-secondary mt-5 w-full"
              onClick={() => {
                setCheckInbox(false)
                setMode('sign-in')
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
              {(['sign-in', 'sign-up'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m)
                    setError(null)
                  }}
                  className={`rounded-lg py-2 text-sm font-medium transition ${
                    mode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {m === 'sign-in' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            {mode === 'sign-up' && (
              <div>
                <label htmlFor="name" className="label">
                  Name <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="field" />
              </div>
            )}
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
              />
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <button type="submit" className="btn-primary w-full" disabled={pending}>
              {pending && <Spinner />}
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
