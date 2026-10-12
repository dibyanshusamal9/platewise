import { createFileRoute } from '@tanstack/react-router'

/**
 * What the installed apps compare themselves against.
 *
 * Native shell versions come from the latest GitHub Release of ANDROID_RELEASES_REPO
 * (tag `v1.2.0` + an attached .apk), the same flow the CI workflow publishes.
 * Without a repo configured, ANDROID_LATEST_VERSION / ANDROID_UPDATE_URL are used.
 * ANDROID_MIN_VERSION forces anything older onto a blocking "Update required" screen.
 */
interface ReleaseInfo {
  latestVersion: string
  updateUrl: string | null
  notes: string
  publishedAt: string | null
}

const CACHE_MS = 10 * 60 * 1000 // unauthenticated GitHub API allows 60 requests/hour per IP
let cached: { at: number; repo: string; value: ReleaseInfo } | null = null

async function latestGithubRelease(repo: string): Promise<ReleaseInfo> {
  if (cached && cached.repo === repo && Date.now() - cached.at < CACHE_MS) return cached.value

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'platewise-update-check',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const release = (await res.json()) as {
    tag_name?: string
    body?: string | null
    html_url?: string
    published_at?: string
    assets?: { name: string; browser_download_url: string }[]
  }
  const apk = release.assets?.find((a) => a.name.toLowerCase().endsWith('.apk'))
  const value: ReleaseInfo = {
    latestVersion: (release.tag_name ?? '0.0.0').replace(/^v/i, ''),
    updateUrl: apk?.browser_download_url ?? release.html_url ?? null,
    notes: (release.body ?? '').slice(0, 4000),
    publishedAt: release.published_at ?? null,
  }
  cached = { at: Date.now(), repo, value }
  return value
}

function fromEnv(): ReleaseInfo {
  return {
    latestVersion: process.env.ANDROID_LATEST_VERSION || '1.0.0',
    updateUrl: process.env.ANDROID_UPDATE_URL || null,
    notes: '',
    publishedAt: null,
  }
}

export const Route = createFileRoute('/api/app-version')({
  server: {
    handlers: {
      GET: async () => {
        const repo = process.env.ANDROID_RELEASES_REPO?.trim()
        let release = fromEnv()
        if (repo) {
          try {
            release = await latestGithubRelease(repo)
          } catch (err) {
            // Stale-but-valid beats an error: fall back to the last good answer, then to env.
            console.error('[app-version] GitHub lookup failed', err)
            if (cached?.repo === repo) release = cached.value
          }
        }
        return Response.json(
          {
            web: { version: __APP_VERSION__, build: __BUILD_ID__ },
            android: { ...release, minVersion: process.env.ANDROID_MIN_VERSION || '0.0.0' },
          },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      },
    },
  },
})
