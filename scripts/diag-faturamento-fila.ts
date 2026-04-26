/**
 * Diagnóstico: coletas [FAT-TEST-5] na base vs vista vs critério da fila (igual ao app).
 *
 *   npx tsx scripts/diag-faturamento-fila.ts
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY se existir (vê tudo); senão VITE_SUPABASE_ANON_KEY (sujeito a RLS).
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  coletaConferenciaProntaParaFaturar,
  coletaNaFilaFaturamento,
} from '../src/lib/faturamentoOperacionalFila'
import type { FaturamentoResumoViewRow } from '../src/lib/faturamentoResumo'
import { fetchVwFaturamentoResumoPaginated } from '../src/lib/faturamentoResumoFetch'

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

function maskUrl(u: string) {
  try {
    const x = new URL(u)
    return `${x.protocol}//${x.host}/…`
  } catch {
    return '(url inválida)'
  }
}

async function main() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anon = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
  const key = service || anon
  const modo = service ? 'service_role' : 'anon'

  if (!url || !key) {
    console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou VITE_SUPABASE_ANON_KEY no .env')
    process.exit(1)
  }

  console.log('Projeto:', maskUrl(url))
  console.log('Chave:', modo, '\n')

  const supabase = createClient(url, key)

  const { count: nColetas, error: e1 } = await supabase
    .from('coletas')
    .select('id', { count: 'exact', head: true })
    .ilike('observacoes', '%[FAT-TEST-5]%')

  if (e1) console.error('Erro count coletas FAT-TEST:', e1.message)
  else console.log('Coletas com observações [FAT-TEST-5]:', nColetas ?? '—')

  const { data: amostra, error: e2 } = await supabase
    .from('coletas')
    .select('id, numero_coleta, fluxo_status, etapa_operacional, peso_liquido, valor_coleta, ticket_numero, mtr_id')
    .ilike('observacoes', '%[FAT-TEST-5]%')
    .order('numero_coleta', { ascending: false })
    .limit(8)

  if (e2) console.error('Erro select coletas:', e2.message)
  else console.log('Amostra coletas (tabela):', JSON.stringify(amostra, null, 2))

  const { data: rawView, error: e3 } = await supabase
    .from('vw_faturamento_resumo')
    .select('coleta_id, numero_coleta, fluxo_status, etapa_operacional, status_conferencia, pendencias_resumo, faturamento_registro_status, peso_liquido, valor_coleta, coleta_observacoes')
    .ilike('coleta_observacoes', '%[FAT-TEST-5]%')
    .limit(20)

  if (e3) {
    console.error('\nErro vw_faturamento_resumo (filtro observações):', e3.message)
    console.error('Código:', e3.code, e3.details)
  } else {
    console.log('\nLinhas na VIEW (coleta_observacoes [FAT-TEST-5]):', rawView?.length ?? 0)
    for (const r of rawView || []) {
      const row = r as FaturamentoResumoViewRow
      const fila = coletaNaFilaFaturamento(row)
      const pronto = coletaConferenciaProntaParaFaturar(row)
      console.log(
        `  #${row.numero_coleta} fila=${fila} pronto_vista=${pronto} etapa=${row.etapa_operacional}/${row.fluxo_status} reg=${row.faturamento_registro_status ?? 'null'} pend=${(row.pendencias_resumo || '—').slice(0, 80)}`
      )
    }
  }

  console.log('\n--- Mesmo fluxo do app (fetch paginado) ---')
  const { data: merged, error: e4 } = await fetchVwFaturamentoResumoPaginated(supabase)
  if (e4) {
    console.error('fetchVwFaturamentoResumoPaginated:', e4.message)
    process.exit(1)
  }
  const fat = merged.filter((r) => (r.coleta_observacoes || '').includes('[FAT-TEST-5]'))
  const filaApp = merged.filter((r) => coletaNaFilaFaturamento(r))
  console.log('Total linhas após merge:', merged.length)
  console.log('Linhas FAT-TEST no merge:', fat.length)
  console.log('Linhas na fila (critério app):', filaApp.length)
  if (fat.length && !fat.some((r) => coletaNaFilaFaturamento(r))) {
    console.log('\nMotivo provável (primeira linha FAT-TEST):')
    const x = fat[0]
    console.log(JSON.stringify(x, null, 2))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
