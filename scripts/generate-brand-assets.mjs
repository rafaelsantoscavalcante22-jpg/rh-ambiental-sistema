/**
 * - Favicon (aba do browser): `favicon-source.png` — logótipo horizontal RG Ambiental.
 * - PWA / Apple touch / ícone app: recorte Rg do `rg-ambiental-wordmark.png` em círculo navy.
 * Executar: npm run build:brand
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import toIco from 'to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dir = join(root, 'public', 'assets', 'logo')
const wordmarkPath = join(dir, 'rg-ambiental-wordmark.png')
const faviconSourcePath = join(dir, 'favicon-source.png')

const NAVY = { r: 18, g: 30, b: 38 }

const faviconSrcBuf = readFileSync(faviconSourcePath)

/**
 * Favicon quadrado: marca horizontal centrada (legível na aba).
 */
async function writeTabFavicon(size, outPath) {
  const pad = Math.max(1, Math.round(size * 0.06))
  const inner = size - pad * 2
  const fg = await sharp(faviconSrcBuf)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...NAVY, alpha: 1 },
    },
  })
    .composite([{ input: fg, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

await writeTabFavicon(16, join(dir, 'favicon-16x16.png'))
await writeTabFavicon(32, join(dir, 'favicon-32x32.png'))

const icoBuf = await toIco([
  readFileSync(join(dir, 'favicon-16x16.png')),
  readFileSync(join(dir, 'favicon-32x32.png')),
])
writeFileSync(join(dir, 'favicon.ico'), icoBuf)

const fav32 = readFileSync(join(dir, 'favicon-32x32.png'))
const faviconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" role="img" aria-label="RG Ambiental">
  <image width="32" height="32" xlink:href="data:image/png;base64,${fav32.toString('base64')}"/>
</svg>
`
writeFileSync(join(dir, 'favicon.svg'), faviconSvg)

/** --- PWA / Apple: sigla Rg em círculo (wordmark) --- */
async function buildRgMarkBuffer() {
  const wm = readFileSync(wordmarkPath)
  const meta = await sharp(wm).metadata()
  const w = meta.width ?? 1024
  const h = meta.height ?? 145
  const cropW = Math.min(Math.round(w * 0.42), 480)
  return sharp(wm)
    .extract({ left: 0, top: 0, width: cropW, height: h })
    .ensureAlpha()
    .png()
    .toBuffer()
}

const srcBuf = await buildRgMarkBuffer()

async function writeRoundRgIcon(size, outPath) {
  const svgBuf = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="rgb(${NAVY.r},${NAVY.g},${NAVY.b})"/>
    </svg>`
  )
  const inner = Math.max(8, Math.round(size * 0.66))
  const fg = await sharp(srcBuf)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer()

  await sharp(svgBuf)
    .composite([{ input: fg, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

const pwaOut = [
  ['apple-touch-icon.png', 180],
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
]

for (const [name, size] of pwaOut) {
  await writeRoundRgIcon(size, join(dir, name))
}

await writeRoundRgIcon(512, join(dir, 'rg-ambiental-icon-square.png'))

const maskInner = Math.round(512 * 0.72)
const maskFg = await sharp(srcBuf)
  .resize(maskInner, maskInner, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .ensureAlpha()
  .png()
  .toBuffer()

const circle512 = Buffer.from(
  `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <circle cx="256" cy="256" r="256" fill="rgb(${NAVY.r},${NAVY.g},${NAVY.b})"/>
  </svg>`
)
await sharp(circle512)
  .composite([{ input: maskFg, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(join(dir, 'pwa-maskable-512.png'))

console.log('Brand: favicon ← favicon-source.png | PWA ← wordmark (Rg)')
