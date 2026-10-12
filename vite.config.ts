import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
// Unique per build. It is baked into sw.js, so every deploy changes the service
// worker's bytes. That byte change is how installed apps notice an update.
const BUILD_ID = new Date().toISOString().replace(/\D/g, '').slice(0, 14)

/** Files in public/ that the service worker should also keep for offline use. */
const STATIC_PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg']

function serviceWorker(): Plugin {
  return {
    name: 'platewise:service-worker',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'client',
    generateBundle(_, bundle) {
      const hashedAssets = Object.keys(bundle)
        .filter((file) => /\.(js|css|woff2?)$/.test(file))
        .map((file) => `/${file}`)
      const source = readFileSync('pwa/sw.template.js', 'utf8')
        .replace('__BUILD_ID__', JSON.stringify(BUILD_ID))
        .replace('__PRECACHE__', JSON.stringify([...STATIC_PRECACHE, ...hashedAssets]))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  server: { port: Number(process.env.PORT) || 3000 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    tailwindcss(),
    tanstackStart(), // must come before react()
    nitro(), // production server: `npm run build` → .output/ (Node by default; auto-detects Vercel, Netlify, …)
    viteReact(),
    serviceWorker(),
  ],
})
