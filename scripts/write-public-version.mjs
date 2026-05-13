/**
 * Gera `public/version.json` a partir de `package.json` (antes do `vite build`).
 * O cliente compara com `import.meta.env.VITE_APP_VERSION` para avisar novo deploy.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0'
const dirPublic = resolve(root, 'public')
mkdirSync(dirPublic, { recursive: true })
const out = resolve(dirPublic, 'version.json')
writeFileSync(
  out,
  `${JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2)}\n`,
  'utf8'
)
console.log('[write-public-version]', version, '→', out)
