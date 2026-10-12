import { useSyncExternalStore } from 'react'

/*
 * Bring-your-own-key: each person's Gemini API key lives only on their own device
 * (localStorage, scoped to their account). It travels to our server over HTTPS
 * with each meal request, is used for that one Gemini call and is never stored,
 * cached or logged there. Nothing about it is written to the database.
 */

const PREFIX = 'platewise:gemini-key:'
const listeners = new Set<() => void>()

/**
 * Keys from AI Studio are opaque: older ones look like "AIza…", and ones created
 * since May 2026 are auth keys like "AQ.…". Accept any visible ASCII so future
 * formats work too; Google does the real check when the key is saved.
 */
export const GEMINI_KEY_PATTERN = /^[\x21-\x7E]{20,512}$/

/** Removes what phones add when copying: spaces, line breaks, invisible zero-width characters, wrapping quotes. */
export function normalizeGeminiKey(raw: string): string {
  return raw
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/^["'\x60\u201C\u201D\u2018\u2019]+|["'\x60\u201C\u201D\u2018\u2019]+$/g, '')
}

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
  window.localStorage.setItem(PREFIX + userId, normalizeGeminiKey(key))
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
