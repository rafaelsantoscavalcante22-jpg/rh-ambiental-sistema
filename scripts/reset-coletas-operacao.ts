/**
 * Apaga todos os dados de teste / operacionais do sistema.
 * Mantém: clientes, usuarios (tabela public.usuarios) e contas em auth (não alteradas).
 *
 * Remove: programações (e coleta_id), controle_massa, checklist_transporte, tickets_operacionais,
 * conferencia_operacional, aprovacoes_diretoria, faturamento_registros, coletas, mtrs.
 *
 * Uso:
 *   npx tsx scripts/reset-coletas-operacao.ts --yes
 *   npm run reset:dados-teste
 *
 * Variáveis: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (recomendado)
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

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
    if (v.startsWith('<') && v.endsWith('>') && v.length > 2) {
      v = v.slice(1, -1).trim()
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

carregarEnvArquivo()

async function deleteAllRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
  idColumn = 'id'
) {
  for (;;) {
    const { data, error } = await supabase.from(table).select(idColumn).limit(400)
    if (error) {
      console.error(`Erro ao listar ${table}:`, error.message)
      throw error
    }
    const rows = data as { id?: string }[]
    if (!rows?.length) break
    const ids = rows.map((r) => r[idColumn as keyof typeof r]).filter(Boolean) as string[]
    const { error: delErr } = await supabase.from(table).delete().in(idColumn, ids)
    if (delErr) {
      console.error(`Erro ao apagar ${table}:`, delErr.message)
      throw delErr
    }
    console.log(`  … ${table}: −${ids.length} (lote)`)
  }
}

async function main() {
  const yes = process.argv.includes('--yes') || process.argv.includes('-y')
  if (!yes) {
    console.error('Confirme com: npx tsx scripts/reset-coletas-operacao.ts --yes')
    process.exit(1)
  }

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim()

  if (!url || !key) {
    console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  console.log('A apagar dados de teste (mantém clientes e usuários)…\n')

  const { error: errNull } = await supabase
    .from('programacoes')
    .update({ coleta_id: null })
    .not('coleta_id', 'is', null)
  if (errNull) {
    console.warn('Aviso ao limpar coleta_id em programações:', errNull.message)
  }

  const tabelasFluxoColeta = [
    'controle_massa',
    'checklist_transporte',
    'tickets_operacionais',
    'conferencia_operacional',
    'aprovacoes_diretoria',
    'faturamento_registros',
  ] as const

  for (const t of tabelasFluxoColeta) {
    try {
      await deleteAllRows(supabase, t)
    } catch {
      console.log(`  (${t}: ignorar se não existir)`)
    }
  }

  await deleteAllRows(supabase, 'coletas')
  await deleteAllRows(supabase, 'mtrs')
  await deleteAllRows(supabase, 'programacoes')

  console.log('\nConcluído. Clientes e utilizadores (tabela usuarios) foram preservados.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
