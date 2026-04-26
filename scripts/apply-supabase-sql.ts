/**
 * Executa um ficheiro .sql no Postgres do projeto Supabase (DDL / migrações).
 *
 * Requer uma destas opções no .env na raiz:
 *   DATABASE_URL=postgresql://postgres:SENHA@db.PROJECT_REF.supabase.co:5432/postgres
 *   ou
 *   SUPABASE_DB_PASSWORD=...  (junto com VITE_SUPABASE_URL já existente)
 *
 * A senha da base de dados está em: Supabase Dashboard → Project Settings → Database → Database password.
 *
 * Uso:
 *   npx tsx scripts/apply-supabase-sql.ts supabase/migrations/20260413120000_clientes_enderecos_email_nf.sql
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { Client } from 'pg'

function carregarEnvArquivo() {
  const p = resolve(process.cwd(), '.env')
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
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function montarDatabaseUrl(): string | null {
  const direct = process.env.DATABASE_URL?.trim()
  if (direct) return direct

  const pass = process.env.SUPABASE_DB_PASSWORD?.trim()
  const viteUrl = process.env.VITE_SUPABASE_URL?.trim()
  if (!pass || !viteUrl) return null

  const u = new URL(viteUrl)
  const host = u.hostname
  const ref = host.replace('.supabase.co', '')
  if (!ref || host === ref) {
    console.error('VITE_SUPABASE_URL inválido (esperado *.supabase.co).')
    process.exit(1)
  }

  const encoded = encodeURIComponent(pass)
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`
}

async function main() {
  carregarEnvArquivo()

  const fileArg = process.argv[2]
  if (!fileArg) {
    console.error('Uso: npx tsx scripts/apply-supabase-sql.ts <caminho-para-ficheiro.sql>')
    process.exit(1)
  }

  const sqlPath = resolve(process.cwd(), fileArg)
  if (!existsSync(sqlPath)) {
    console.error('Ficheiro não encontrado:', sqlPath)
    process.exit(1)
  }

  const databaseUrl = montarDatabaseUrl()
  if (!databaseUrl) {
    console.error(
      [
        'Defina DATABASE_URL (URI completa) ou SUPABASE_DB_PASSWORD + VITE_SUPABASE_URL no .env.',
        'Obtenha a senha em: Supabase → Project Settings → Database → Database password.',
      ].join('\n')
    )
    process.exit(1)
  }

  const sql = readFileSync(sqlPath, 'utf8')

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(sql)
    console.log('SQL aplicado com sucesso:', fileArg)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
