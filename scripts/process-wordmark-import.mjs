/**
 * Lê `rg-ambiental-wordmark-import` (PNG/JPEG), remove fundo escuro neutro (preto/cinza)
 * e grava `rg-ambiental-wordmark.png` + `favicon-source.png` (RGBA).
 * Executar após substuir o import: node scripts/process-wordmark-import.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dir = join(__dirname, '..', 'public', 'assets', 'logo')
const importPath = join(dir, 'rg-ambiental-wordmark-import.png')

function alphaForRgb(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const spread = max - min
  // Cor saturada ou clara: mantém
  if (spread > 32) return 255
  if (max > 78) return 255
  // Verde / tinta da marca (incl. folha escura com dominância de G)
  const greenish = g >= max - 2 && g > r + 4 && g > b + 2
  if (greenish && max > 16) return 255
  // Fundo preto/cinza neutro (canais próximos)
  if (max < 26 && spread < 26) return 0
  if (max < 62 && spread < 24) {
    const k = max / 62
    const a = Math.round(k * k * 255)
    return a < 10 ? 0 : a
  }
  return 255
}

const input = readFileSync(importPath)
const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height, channels } = info
const out = Buffer.alloc(width * height * 4)

for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  const a = alphaForRgb(r, g, b)
  out[j] = r
  out[j + 1] = g
  out[j + 2] = b
  out[j + 3] = a
}

const pngBuf = await sharp(out, {
  raw: { width, height, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toBuffer()

const wordmarkOut = join(dir, 'rg-ambiental-wordmark.png')
const faviconSrcOut = join(dir, 'favicon-source.png')

await sharp(pngBuf).toFile(wordmarkOut)
await sharp(pngBuf).toFile(faviconSrcOut)

console.log(`Wordmark OK: ${width}×${height} → ${wordmarkOut}`)
console.log(`favicon-source atualizado → ${faviconSrcOut}`)
