/**
 * Deploy de produção na Vercel sem prompt interativo.
 *
 * Requisitos:
 *   1) Uma vez no projeto: `npx vercel link` (gera `.vercel/project.json`, não commitar).
 *   2) No `.env` ou `.env.local` (gitignored): VERCEL_TOKEN — https://vercel.com/account/tokens
 *
 * Opcional no `.env` se não quiseres `link`: VERCEL_ORG_ID e VERCEL_PROJECT_ID
 * (Vercel → Project → Settings → General).
 *
 * Uso:
 *   npm run deploy:vercel
 *   npm run deploy:vercel:r   → build com sufixo R (Rafael) na versão do UI
 *   npm run deploy:vercel:v   → build com sufixo V (Vinicius)
 *
 * Ou: node scripts/deploy-vercel.mjs --author R
 * A Vercel recebe --build-env APP_VERSION_AUTHOR=… para o `vite build` remoto.
 */

import { existsSync, readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

/** @returns {'R' | 'V' | null} */
function parseAuthorArgv(argv) {
  const fromEnv = (process.env.DEPLOY_VERSION_AUTHOR ?? '').trim().toUpperCase()
  if (fromEnv === 'R' || fromEnv === 'V') return fromEnv

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--author' && argv[i + 1]) {
      const m = String(argv[i + 1]).trim().toUpperCase().slice(0, 1)
      if (m === 'R' || m === 'V') return m
    }
    if (a.startsWith('--author=')) {
      const m = a.slice('--author='.length).trim().toUpperCase().slice(0, 1)
      if (m === 'R' || m === 'V') return m
    }
  }
  return null
}

/**
 * @param {string} relPath
 * @param {{ override?: boolean }} opts override: valores neste ficheiro substituem os já definidos (útil para `.env.local`).
 */
function carregarEnvArquivo(relPath, opts = {}) {
  const { override = false } = opts
  const p = resolve(process.cwd(), relPath)
  if (!existsSync(p)) return
  const raw = readFileSync(p, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const k = trimmed.slice(0, eq).trim()
    let v = trimmed.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (override) {
      if (v) process.env[k] = v
    } else if (process.env[k] === undefined) {
      process.env[k] = v
    }
  }
}

carregarEnvArquivo('.env', { override: false })
carregarEnvArquivo('.env.local', { override: true })

if (!process.env.VERCEL_TOKEN?.trim()) {
  const root = process.cwd()
  const hasEnv = existsSync(resolve(root, '.env'))
  const hasLocal = existsSync(resolve(root, '.env.local'))
  const hint =
    hasEnv || hasLocal
      ? `Encontrado: ${[hasEnv && '.env', hasLocal && '.env.local'].filter(Boolean).join(', ')} — confirma que a linha está sem # no início e com valor preenchido.`
      : 'Não há .env nem .env.local nesta pasta. Copia .env.example para .env ou cria .env.local.'
  console.error(
    [
      'Falta VERCEL_TOKEN.',
      hint,
      'Cria um token em https://vercel.com/account/tokens e adiciona, por exemplo:',
      '  VERCEL_TOKEN=...',
      'Garante também que o projeto está ligado: npx vercel link',
    ].join('\n')
  )
  process.exit(1)
}

const author = parseAuthorArgv(process.argv)
const args = ['vercel', 'deploy', '--prod', '--yes']
if (author) {
  args.push('--build-env', `APP_VERSION_AUTHOR=${author}`)
  console.log(`Build remota: APP_VERSION_AUTHOR=${author} (versão no UI com sufixo ${author})\n`)
}

const r = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
})

process.exit(r.status === null ? 1 : r.status)
