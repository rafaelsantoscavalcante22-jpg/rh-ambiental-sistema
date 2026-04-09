/**
 * 20 casos de teste para percorrer o fluxo completo nas telas, a partir do estado
 * «após MTR»: Programação + MTR emitida + coleta em MTR_PREENCHIDA (pronta para Controle de Massa).
 *
 * Uso (após limpar dados operacionais):
 *   npx tsx scripts/reset-coletas-operacao.ts --yes
 *   npx tsx scripts/seed-fluxo-completo-20.ts
 *
 * Ou: npm run reset:e-seed-fluxo-20
 *
 * Requer: clientes cadastrados; VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  indiceEtapaFluxo,
  type EtapaFluxo,
} from '../src/lib/fluxoEtapas'

const TOTAL = 20
const PREFIX = '[FLUXO-20]'
/** Estado inicial único: após MTR, antes da pesagem no Controle de Massa. */
const ETAPA_INICIAL: EtapaFluxo = 'MTR_PREENCHIDA'

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

function montarPayloadBanco(novaEtapa: EtapaFluxo): Record<string, unknown> {
  switch (novaEtapa) {
    case 'MTR_PREENCHIDA':
      return {
        fluxo_status: 'MTR_PREENCHIDA',
        etapa_operacional: 'MTR_PREENCHIDA',
        status_processo: 'MTR_EMITIDA',
        liberado_financeiro: false,
      }
    default:
      return {
        fluxo_status: 'MTR_PREENCHIDA',
        etapa_operacional: 'MTR_PREENCHIDA',
        status_processo: 'MTR_EMITIDA',
        liberado_financeiro: false,
      }
  }
}

function camposOperacionais(
  etapa: EtapaFluxo,
  dataAgendada: string,
  seqIndex: number
): Record<string, unknown> {
  const i = indiceEtapaFluxo(etapa)
  const out: Record<string, unknown> = {
    data_agendada: dataAgendada,
    data_programada: dataAgendada,
  }

  if (i >= indiceEtapaFluxo('COLETA_REALIZADA')) {
    out.data_coleta = dataAgendada
  }

  if (i >= indiceEtapaFluxo('LOGISTICA_DESIGNADA')) {
    out.motorista_nome = 'Motorista Teste Fluxo'
    out.motorista = 'Motorista Teste Fluxo'
    out.placa = `FLX${String(seqIndex).padStart(2, '0')}X0`
  }

  if (i >= indiceEtapaFluxo('TARA_REGISTRADA')) {
    out.peso_tara = 12000
  }

  if (i >= indiceEtapaFluxo('BRUTO_REGISTRADO')) {
    out.peso_bruto = 18500
    out.peso_liquido = 6500
  }

  return out
}

function camposObrigatoriosBanco(etapa: EtapaFluxo): Record<string, unknown> {
  const i = indiceEtapaFluxo(etapa)
  const out: Record<string, unknown> = {
    responsavel_interno: `${PREFIX} Responsável`,
    endereco: 'Rua Teste Fluxo, 100',
  }
  if (i >= indiceEtapaFluxo('COLETA_REALIZADA')) {
    out.assinatura_coletada = true
    out.assinatura_no_local = true
  }
  return out
}

type ClienteRow = {
  id: string
  nome: string
  cidade: string | null
  tipo_residuo: string | null
}

function normalizarChaveSupabase(key: string): string {
  let k = key.trim()
  if (k.startsWith('<') && k.endsWith('>') && k.length > 2) {
    k = k.slice(1, -1).trim()
  }
  return k
}

async function main() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const keyRaw =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY
  const key = keyRaw ? normalizarChaveSupabase(keyRaw) : ''

  if (!url || !key) {
    console.error(
      'Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (recomendado).'
    )
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const { data: clientes, error: errClientes } = await supabase
    .from('clientes')
    .select('id, nome, cidade, tipo_residuo')
    .order('nome', { ascending: true })

  if (errClientes) {
    console.error('Erro ao ler clientes:', errClientes.message)
    process.exit(1)
  }

  const lista = (clientes || []) as ClienteRow[]
  if (lista.length === 0) {
    console.error('Cadastre ao menos um cliente antes do seed.')
    process.exit(1)
  }

  const { data: maxRow } = await supabase
    .from('coletas')
    .select('numero_coleta')
    .order('numero_coleta', { ascending: false })
    .limit(1)
    .maybeSingle()

  let baseNumero = 92000
  if (maxRow && typeof (maxRow as { numero_coleta?: number }).numero_coleta === 'number') {
    const n = (maxRow as { numero_coleta: number }).numero_coleta
    if (!Number.isNaN(n) && n >= baseNumero) baseNumero = n + 1
  }

  let ok = 0
  let fail = 0
  const etapa = ETAPA_INICIAL

  for (let k = 0; k < TOTAL; k++) {
    const cliente = lista[k % lista.length]
    const dataAgendada = `2026-05-${String((k % 28) + 1).padStart(2, '0')}`
    const numeroProg = `${PREFIX}-${String(k + 1).padStart(3, '0')}`
    const numeroColeta = baseNumero + k

    const { data: prog, error: eProg } = await supabase
      .from('programacoes')
      .insert([
        {
          cliente_id: cliente.id,
          cliente: cliente.nome,
          data_programada: dataAgendada,
          tipo_caminhao: 'Truck',
          tipo_servico: 'Coleta',
          observacoes: `${PREFIX} Caso ${k + 1} — fluxo completo (teste)`,
          coleta_fixa: false,
          periodicidade: null,
          status_programacao: 'EM_COLETA',
          numero: numeroProg,
        },
      ])
      .select('id')
      .single()

    if (eProg || !prog) {
      console.error(`[${k + 1}] programação:`, eProg?.message || 'sem id')
      fail++
      continue
    }

    const programacaoId = prog.id as string

    const { data: mtrRow, error: eMtr } = await supabase
      .from('mtrs')
      .insert([
        {
          numero: `MTR-FLUXO-${numeroColeta}`,
          programacao_id: programacaoId,
          cliente: cliente.nome,
          gerador: cliente.nome,
          endereco: 'Rua Teste Fluxo, 100',
          cidade: cliente.cidade || 'São Paulo',
          tipo_residuo: cliente.tipo_residuo || 'Resíduos classe II',
          quantidade: 12,
          unidade: 't',
          destinador: 'Destino Teste RG',
          transportador: 'RG Ambiental',
          data_emissao: dataAgendada,
          observacoes: `${PREFIX} MTR caso ${k + 1}`,
          status: 'Emitido',
        },
      ])
      .select('id')
      .single()

    if (eMtr || !mtrRow) {
      console.error(`[${k + 1}] mtr:`, eMtr?.message || 'sem id')
      await supabase.from('programacoes').delete().eq('id', programacaoId)
      fail++
      continue
    }

    const mtrId = mtrRow.id as string

    const row: Record<string, unknown> = {
      ...montarPayloadBanco(etapa),
      ...camposOperacionais(etapa, dataAgendada, k),
      ...camposObrigatoriosBanco(etapa),
      cliente_id: cliente.id,
      cliente: cliente.nome,
      cidade: cliente.cidade || 'São Paulo',
      tipo_residuo: cliente.tipo_residuo || 'Resíduos classe II',
      programacao_id: programacaoId,
      mtr_id: mtrId,
      numero: String(numeroColeta),
      numero_coleta: numeroColeta,
      observacoes: `${PREFIX} Caso ${k + 1}/${TOTAL} — início em ${etapa} (pesagem em Controle de Massa).`,
    }

    const { data: col, error: eCol } = await supabase.from('coletas').insert([row]).select('id').single()

    if (eCol || !col) {
      console.error(`[${k + 1}] coleta:`, eCol?.message)
      await supabase.from('mtrs').delete().eq('id', mtrId)
      await supabase.from('programacoes').delete().eq('id', programacaoId)
      fail++
      continue
    }

    await supabase.from('programacoes').update({ coleta_id: col.id }).eq('id', programacaoId)

    ok++
    console.log(
      `✓ ${k + 1}/${TOTAL} coleta #${numeroColeta} · ${numeroProg} · MTR-FLUXO-${numeroColeta} → ${etapa}`
    )
  }

  console.log(`\nConcluído: ${ok} inseridas, ${fail} falhas.`)
  console.log(
    '\nPróximos passos no sistema: Programação → MTR → Controle de Massa (pesagem) → Checklist (se aplicável) →'
  )
  console.log('Conferência → Ticket → Aprovação → Faturamento → Financeiro.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
