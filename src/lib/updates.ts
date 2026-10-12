import { useEffect, useState, useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'

/*
 * Two update channels, one store:
 *
 *  1. Web code: every deploy ships a new service worker. Phones download it in the
 *     background, then we offer "Reload". This covers the browser, the installed PWA
 *     and the Android app (which loads the deployed site).
 *  2. Native shell: the APK itself. The server reports the latest GitHub Release
 *     (/api/app-version). Older shells get an update dialog with release notes and an
 *     APK download. Shells below ANDROID_MIN_VERSION are blocked until they update.
 */

export interface NativeRelease {
  installed: string
  latest: string
  required: boolean
  updateUrl: string | null
  notes: string
  publishedAt: string | null
}

export interface UpdateState {
  /** A newer web build is downloaded and waiting. */
  webUpdateReady: boolean
  /** Set only when the installed Android shell is older than the latest release. */
  native: NativeRelease | null
  /** Outcome of the most recent check, for the "Check for updates" button. */
  check: 'idle' | 'checking' | 'up-to-date' | 'available' | 'error'
  /** True when the user asked for the check (so a skipped version is shown anyway). */
  manual: boolean
}

const initialState: UpdateState = { webUpdateReady: false, native: null, check: 'idle', manual: false }
let state = initialState
const listeners = new Set<() => void>()

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useUpdates(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => initialState,
  )
}

/**
 * Dev-only: open the app with `?simulate-android=1.0.0` to act as an Android shell of
 * that version, which lets you preview the update dialogs in a desktop browser.
 * Stripped from production builds.
 */
function simulatedAndroidVersion(): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('simulate-android')
    if (fromUrl) window.sessionStorage.setItem('simulate-android', fromUrl)
    return window.sessionStorage.getItem('simulate-android')
  } catch {
    return null
  }
}

export const isNativeApp = () => Capacitor.isNativePlatform() || simulatedAndroidVersion() !== null

async function installedShellVersion(): Promise<string> {
  return simulatedAndroidVersion() ?? (await NativeApp.getInfo()).version
}

/** Compares dotted versions numerically, ignoring a leading "v": "1.10.0" > "v1.9.2". */
export function compareVersions(a: string, b: string) {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

// ─── Web channel ────────────────────────────────────────────────────────────

let registration: ServiceWorkerRegistration | null = null
let waitingWorker: ServiceWorker | null = null

/** Activate the downloaded build. The page reloads on `controllerchange`. */
export function applyWebUpdate() {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
}

async function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  registration = await navigator.serviceWorker.register('/sw.js')
  const offer = (worker: ServiceWorker) => {
    waitingWorker = worker
    setState({ webUpdateReady: true })
  }
  // Only offer when an older version controls the page. The very first install isn't an "update".
  if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const worker = registration?.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker)
    })
  })
}

// ─── Native channel ─────────────────────────────────────────────────────────

interface AppVersionResponse {
  android: {
    latestVersion: string
    minVersion: string
    updateUrl: string | null
    notes: string
    publishedAt: string | null
  }
}

/** Returns whether the native shell is outdated; throws when the check itself fails. */
async function checkNative(): Promise<boolean> {
  if (!isNativeApp()) return false
  const [installed, res] = await Promise.all([installedShellVersion(), fetch('/api/app-version', { cache: 'no-store' })])
  if (!res.ok) throw new Error(`app-version ${res.status}`)
  const { android } = (await res.json()) as AppVersionResponse
  const outdated = compareVersions(installed, android.latestVersion) < 0
  setState({
    native: outdated
      ? {
          installed,
          latest: android.latestVersion,
          required: compareVersions(installed, android.minVersion) < 0,
          updateUrl: android.updateUrl,
          notes: android.notes,
          publishedAt: android.publishedAt,
        }
      : null,
  })
  return outdated
}

// ─── Checks ─────────────────────────────────────────────────────────────────

/** Check both channels. `manual` = the user tapped "Check for updates". */
export async function checkForUpdates({ manual = false } = {}) {
  setState({ check: 'checking', manual })
  try {
    const [nativeOutdated] = await Promise.all([
      checkNative(),
      registration?.update().catch(() => undefined),
    ])
    // Give a freshly found service worker a moment to finish installing before reporting.
    if (manual && registration?.installing) {
      await new Promise((r) => setTimeout(r, 1500))
    }
    setState({ check: nativeOutdated || state.webUpdateReady ? 'available' : 'up-to-date' })
  } catch {
    setState({ check: manual ? 'error' : 'idle' })
  }
}

/** Starts background checks: at launch, on resume or tab focus, and every 15 minutes. */
export function useUpdateChecks() {
  useEffect(() => {
    registerServiceWorker()
      .catch(() => undefined)
      .then(() => checkForUpdates())

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdates()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => checkForUpdates(), 15 * 60 * 1000)
    const resume = Capacitor.isNativePlatform() ? NativeApp.addListener('resume', () => checkForUpdates()) : null

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
      resume?.then((h) => h.remove())
    }
  }, [])
}

// ─── "Don't show again" for a specific release ──────────────────────────────

const SKIPPED_KEY = 'platewise:skipped-android-version'

export function getSkippedVersion(): string | null {
  try {
    return window.localStorage.getItem(SKIPPED_KEY)
  } catch {
    return null
  }
}

export function skipVersion(version: string) {
  try {
    window.localStorage.setItem(SKIPPED_KEY, version)
  } catch {
    // Storage unavailable: the dialog simply returns next launch.
  }
}

// ─── Misc native integration ────────────────────────────────────────────────

/** Android hardware back button: go back in history, or exit on the first screen. */
export function useNativeBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handle = NativeApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back()
      else NativeApp.exitApp()
    })
    return () => {
      handle.then((h) => h.remove())
    }
  }, [])
}

/** Web build label plus the shell version when running inside the Android app. */
export function useVersionLabel() {
  const [shell, setShell] = useState<string | null>(null)
  useEffect(() => {
    if (isNativeApp()) installedShellVersion().then(setShell, () => undefined)
  }, [])
  return { web: __APP_VERSION__, build: __BUILD_ID__, shell }
}
