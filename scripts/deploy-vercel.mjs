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
 * Uso: npm run deploy:vercel
 */

import { existsSync, readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

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

const args = ['vercel', 'deploy', '--prod', '--yes']

const r = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
})

process.exit(r.status === null ? 1 : r.status)
