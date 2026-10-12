/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json version, injected at build time. */
declare const __APP_VERSION__: string
/** Timestamp id of this build; changes on every deploy. */
declare const __BUILD_ID__: string

declare namespace NodeJS {
  interface ProcessEnv {
    readonly GEMINI_MODEL?: string
    /** GitHub repo ("owner/name") whose latest Release holds the newest APK. */
    readonly ANDROID_RELEASES_REPO?: string
    /** Optional token, needed only if that repo is private. */
    readonly GITHUB_TOKEN?: string
    /** Lowest Android app version still allowed to run (older shells must update). */
    readonly ANDROID_MIN_VERSION?: string
    /** Newest published Android app version (older shells get an optional prompt). */
    readonly ANDROID_LATEST_VERSION?: string
    /** Where users download the new APK or Play Store listing. */
    readonly ANDROID_UPDATE_URL?: string
  }
}
