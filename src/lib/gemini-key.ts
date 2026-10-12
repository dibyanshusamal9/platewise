import { useSyncExternalStore } from 'react'

/*
 * Bring-your-own-key: each person's Gemini API key lives only on their own device
 * (localStorage, scoped to their account). It travels to our server over HTTPS
 * with each meal request, is used for that one Gemini call and is never stored,
 * cached or logged there. Nothing about it is written to the database.
 */

const PREFIX = 'platewise:gemini-key:'
const listeners = new Set<() => void>()

/** Google AI Studio keys are opaque tokens; this only rejects obvious typos. */
export const GEMINI_KEY_PATTERN = /^[A-Za-z0-9_-]{20,200}$/

function emit() {
  listeners.forEach((l) => l())
}

export function readGeminiKey(userId: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + userId)
  } catch {
    return null
  }
}

export function saveGeminiKey(userId: string, key: string) {
  window.localStorage.setItem(PREFIX + userId, key.trim())
  emit()
}

export function clearGeminiKey(userId: string) {
  try {
    window.localStorage.removeItem(PREFIX + userId)
  } finally {
    emit()
  }
}

/** "••••  wXyZ" — enough to recognise a key without showing it. */
export function maskKey(key: string) {
  return `•••• ${key.slice(-4)}`
}

/** The current user's saved key; updates live, including from other tabs. */
export function useGeminiKey(userId: string): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      const onStorage = (e: StorageEvent) => {
        if (e.key === PREFIX + userId) listener()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
    () => readGeminiKey(userId),
    () => null,
  )
}
