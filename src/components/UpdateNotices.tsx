import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, CloudOff, Download, RefreshCw } from 'lucide-react'
import {
  applyWebUpdate,
  checkForUpdates,
  getSkippedVersion,
  isNativeApp,
  skipVersion,
  useUpdates,
  useVersionLabel,
  type NativeRelease,
} from '../lib/updates'
import { Logo } from './Logo'
import { Spinner } from './ui'

/** Global update UI, mounted once by the app shell (in every auth state). */
export function UpdateNotices() {
  const { webUpdateReady, native, manual } = useUpdates()
  const [closedFor, setClosedFor] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<string | null>(null)
  useEffect(() => setSkipped(getSkippedVersion()), [native?.latest])

  if (native?.required) return <RequiredUpdateScreen release={native} />

  // Auto checks respect "Don't show again"; a manual check always shows the result.
  const showDialog = native && closedFor !== native.latest && (manual || skipped !== native.latest)

  return (
    <>
      {webUpdateReady && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+var(--safe-bottom))] z-30 flex justify-center px-4 sm:bottom-6"
          role="status"
        >
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-page shadow-xl">
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            <p className="flex-1 text-sm">A new version of Platewise is ready.</p>
            <button
              type="button"
              onClick={applyWebUpdate}
              className="rounded-lg bg-page px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:opacity-90"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {showDialog && (
        <NativeUpdateDialog
          release={native}
          onClose={() => setClosedFor(native.latest)}
          onSkip={() => {
            skipVersion(native.latest)
            setSkipped(native.latest)
          }}
        />
      )}
    </>
  )
}

function NativeUpdateDialog({
  release,
  onClose,
  onSkip,
}: {
  release: NativeRelease
  onClose: () => void
  onSkip: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        className="card relative m-3 mb-[calc(0.75rem+var(--safe-bottom))] w-full max-w-md p-5 shadow-2xl"
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-energy-track text-energy">
          <Download className="size-5" aria-hidden />
        </div>
        <h2 id="update-title" className="mt-4 text-lg font-semibold tracking-tight">
          Update available
        </h2>
        <p className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-[13px] text-ink-2">
          <span>v{release.installed}</span>
          <ArrowRight className="size-3.5" aria-hidden />
          <span className="font-semibold text-ink">v{release.latest}</span>
        </p>

        {release.notes && (
          <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-line p-3">
            <ReleaseNotes text={release.notes} />
          </div>
        )}

        <div className="mt-5 grid gap-2">
          {release.updateUrl && (
            <a href={release.updateUrl} target="_blank" rel="noreferrer" className="btn-primary w-full" onClick={onClose}>
              <Download className="size-4" aria-hidden />
              Download update
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Later
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                onSkip()
                onClose()
              }}
            >
              Don’t show again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RequiredUpdateScreen({ release }: { release: NativeRelease }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-page px-6">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto size-12" />
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Update required</h1>
        <p className="mt-2 text-sm text-ink-2">
          Version {release.installed} is no longer supported. Install version {release.latest} to keep logging meals.
          Your data is safe in your account.
        </p>
        {release.updateUrl ? (
          <a href={release.updateUrl} target="_blank" rel="noreferrer" className="btn-primary mt-6 w-full">
            <Download className="size-4" aria-hidden />
            Download v{release.latest}
          </a>
        ) : (
          <p className="mt-6 text-sm text-muted">Ask your administrator for the latest app.</p>
        )}
      </div>
    </div>
  )
}

/**
 * Minimal, injection-safe rendering of GitHub release notes: headings, bullets and
 * paragraphs as plain text nodes. No HTML from the release body is ever interpreted.
 */
function ReleaseNotes({ text }: { text: string }) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim().replace(/^>\s?/, '')) // blockquotes → plain text
    .filter((l) => l && !/^(-{3,}|\*{3,})$/.test(l)) // drop horizontal rules
  const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-ink-2">
      {lines.map((line, i) => {
        if (/^#{1,6}\s/.test(line)) {
          return (
            <p key={i} className="pt-1 font-semibold text-ink">
              {clean(line.replace(/^#+\s*/, ''))}
            </p>
          )
        }
        if (/^[-*•]\s/.test(line)) {
          return (
            <p key={i} className="flex gap-2">
              <span aria-hidden className="text-energy">•</span>
              <span>{clean(line.replace(/^[-*•]\s*/, ''))}</span>
            </p>
          )
        }
        return <p key={i}>{clean(line)}</p>
      })}
    </div>
  )
}

/** Settings card: current versions and a manual "Check for updates" button. */
export function AppUpdatesCard() {
  const { check, webUpdateReady, native } = useUpdates()
  const { web, build, shell } = useVersionLabel()
  const inApp = isNativeApp()

  return (
    <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <h2 className="text-[15px] font-semibold">App updates</h2>
        <p className="mt-1 text-[13px] text-muted">
          {inApp ? <>Android app v{shell ?? '…'} · </> : null}
          Web v{web} <span className="num">(build {build})</span>
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-[13px]" role="status">
          {check === 'checking' && <span className="text-muted">Checking…</span>}
          {check === 'up-to-date' && (
            <span className="inline-flex items-center gap-1.5 text-good">
              <CheckCircle2 className="size-4" aria-hidden /> You’re on the latest version
            </span>
          )}
          {check === 'available' && (
            <span className="text-ink-2">
              {native ? `Version ${native.latest} is available.` : webUpdateReady ? 'A new web version is ready.' : ''}
            </span>
          )}
          {check === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-critical">
              <CloudOff className="size-4" aria-hidden /> Couldn’t check. Try again later.
            </span>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {webUpdateReady && (
          <button type="button" className="btn-primary" onClick={applyWebUpdate}>
            Reload now
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={check === 'checking'}
          onClick={() => checkForUpdates({ manual: true })}
        >
          {check === 'checking' ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
          Check for updates
        </button>
      </div>
    </section>
  )
}
