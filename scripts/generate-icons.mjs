// Renders assets/icon.svg into every icon the PWA and the Android app need.
//   node scripts/generate-icons.mjs
// Then `npx @capacitor/assets generate --android` turns assets/*.png into launcher icons + splash.
import { mkdir, copyFile } from 'node:fs/promises'
import sharp from 'sharp'

const SRC = 'assets/icon.svg'
const BG = '#0b0b0b'
const render = (size) => sharp(SRC, { density: 384 }).resize(size, size).png()

await mkdir('public/icons', { recursive: true })

// PWA / browser
await render(192).toFile('public/icons/icon-192.png')
await render(512).toFile('public/icons/icon-512.png')
await render(180).toFile('public/icons/apple-touch-icon.png')
await copyFile(SRC, 'public/icons/icon.svg')

// Sources for @capacitor/assets (Android launcher icons + splash screens)
await render(1024).toFile('assets/icon-only.png')
await render(1024).toFile('assets/icon-foreground.png')
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile('assets/icon-background.png')
for (const [name, bg] of [['splash.png', '#f6f5f1'], ['splash-dark.png', '#0d0d0d']]) {
  const mark = await render(640).toBuffer()
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(`assets/${name}`)
}

console.log('Icons written to public/icons and assets/')
