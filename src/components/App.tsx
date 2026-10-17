import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarRange, Flower2, LayoutDashboard, LogOut, Settings, type LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useNativeBackButton, useUpdateChecks } from '../lib/updates'
import { AuthScreen } from './AuthScreen'
import { UpdateNotices } from './UpdateNotices'
import { Logo } from './Logo'
import { Skeleton } from './ui'

const NAV: { to: '/' | '/weekly' | '/coach' | '/goals'; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Today', icon: LayoutDashboard },
  { to: '/weekly', label: 'Week', icon: CalendarRange },
  { to: '/coach', label: 'Saffron', icon: Flower2 },
  { to: '/goals', label: 'Settings', icon: Settings },
]

/**
 * App shell rendered by the root route around every page: gates on auth,
 * then provides the header, desktop nav and the mobile bottom tab bar.
 */
export function App({ children }: { children: ReactNode }) {
  useNativeBackButton()
  useUpdateChecks()
  return (
    <>
      <Shell>{children}</Shell>
      {/* Mounted in every auth state, so updates also reach signed-out users. */}
      <UpdateNotices />
    </>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.status === 'loading') return <BootScreen />
  if (auth.status === 'misconfigured') return <MissingConfig />
  if (auth.status === 'signed-out') return <AuthScreen />

  const name = (auth.user.user_metadata?.display_name as string | undefined) ?? auth.user.email ?? ''

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-page/85 pt-[var(--safe-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="size-8" />
            <span className="text-[17px] font-semibold tracking-tight">Platewise</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 rounded-xl bg-surface-2 p-1 sm:flex">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: true }}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-2 transition hover:text-ink"
                activeProps={{ className: 'bg-surface !text-ink shadow-sm' }}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <span className="hidden max-w-40 truncate text-sm text-muted md:block" title={auth.user.email}>
              {name}
            </span>
            <button type="button" onClick={auth.signOut} className="icon-btn" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-5 pb-28 sm:pt-8 sm:pb-16">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/90 pb-[var(--safe-bottom)] backdrop-blur-md sm:hidden"
      >
        <div className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted"
              activeProps={{ className: '!text-ink' }}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

function BootScreen() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pt-20" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-36" />
      <Skeleton className="h-60" />
    </div>
  )
}

function MissingConfig() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Connect Supabase to get started</h1>
        <p className="mt-2 text-sm text-ink-2">
          Copy <code className="rounded bg-surface-2 px-1">.env.example</code> to{' '}
          <code className="rounded bg-surface-2 px-1">.env</code>, fill in{' '}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart{' '}
          <code className="rounded bg-surface-2 px-1">npm run dev</code>.
        </p>
      </div>
    </main>
  )
}
