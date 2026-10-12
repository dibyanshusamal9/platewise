// Builds the tiny local bundle shipped inside the APK (mobile/www). The real app is
// loaded from CAP_SERVER_URL; these files are only the fallback screens.
//   node scripts/prepare-mobile.mjs   (run automatically by `npm run mobile:sync`)
import { mkdir, readFile, writeFile } from 'node:fs/promises'

try {
  process.loadEnvFile?.('.env')
} catch {
  // CI passes CAP_SERVER_URL through the environment instead.
}

const url = (process.env.CAP_SERVER_URL || 'http://10.0.2.2:3000').replace(/\/$/, '')
const release = process.argv.includes('--release')

if (release && !url.startsWith('https://')) {
  console.error(`✖ Release builds need an https CAP_SERVER_URL (got "${url}").`)
  process.exit(1)
}
if (!url.startsWith('https://')) {
  console.warn(`⚠ CAP_SERVER_URL is "${url}". Fine for the emulator, but not for a build you hand out.`)
}

await mkdir('mobile/www', { recursive: true })

const offline = (await readFile('public/offline.html', 'utf8')).replace('data-retry="/"', `data-retry="${url}/"`)
await writeFile('mobile/www/offline.html', offline)

// Capacitor requires an index.html. With server.url set it is never shown, but redirect just in case.
await writeFile(
  'mobile/www/index.html',
  `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${url}/"><title>Platewise</title>`,
)

console.log(`✔ mobile/www prepared for ${url}`)
