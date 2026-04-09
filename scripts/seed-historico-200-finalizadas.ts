/**
 * Histórico de teste: 200 coletas com fluxo completo até o fim (Financeiro concluído —
 * etapa FINALIZADO, liberado_financeiro, valor e pagamento «Pago»), datas de referência
 * distribuídas nos últimos 90 dias.
 *
 * Cria por linha: programação + MTR + coleta + registo de faturamento «emitido».
 *
 * Uso:
 *   npx tsx scripts/seed-historico-200-finalizadas.ts
 *
 * Ou: npm run seed:historico-200-finalizadas
 *
 * Requer: pelo menos um cliente cadastrado; VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { indiceEtapaFluxo, type EtapaFluxo } from '../src/lib/fluxoEtapas'

const TOTAL = 200
const PREFIX = '[HIST-200]'
const ETAPA: EtapaFluxo = 'FINALIZADO'

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

function montarPayloadBanco(): Record<string, unknown> {
  return {
    fluxo_status: 'FINALIZADO',
    etapa_operacional: 'FINALIZADO',
    status_processo: 'FINALIZADO',
    liberado_financeiro: true,
  }
}

function camposOperacionais(dataAgendada: string, seqIndex: number): Record<string, unknown> {
  const i = indiceEtapaFluxo(ETAPA)
  const out: Record<string, unknown> = {
    data_agendada: dataAgendada,
    data_programada: dataAgendada,
  }

  if (i >= indiceEtapaFluxo('COLETA_REALIZADA')) {
    out.data_coleta = dataAgendada
  }

  if (i >= indiceEtapaFluxo('LOGISTICA_DESIGNADA')) {
    out.motorista_nome = 'Motorista Histórico Teste'
    out.motorista = 'Motorista Histórico Teste'
    out.placa = `HT${String(seqIndex % 100).padStart(2, '0')}R0`
  }

  if (i >= indiceEtapaFluxo('TARA_REGISTRADA')) {
    out.peso_tara = 12000
  }

  if (i >= indiceEtapaFluxo('BRUTO_REGISTRADO')) {
    out.peso_bruto = 18500
    out.peso_liquido = 6500 + (seqIndex % 40) * 25
  }

  if (i >= indiceEtapaFluxo('TICKET_GERADO')) {
    out.ticket_numero = `TK-HIST-${String(seqIndex).padStart(3, '0')}`
  }

  const valorBase = 2500 + (seqIndex % 120) * 75
  out.valor_coleta = valorBase
  out.data_vencimento = dataAgendada
  out.status_pagamento = 'Pago'

  return out
}

function camposObrigatoriosBanco(): Record<string, unknown> {
  return {
    responsavel_interno: `${PREFIX} Responsável`,
    endereco: 'Rua Histórico Teste, 200',
    assinatura_coletada: true,
    assinatura_no_local: true,
  }
}

/** Dia de referência (data agendada) uniforme entre o 1.º e o 90.º dia do período. */
function dataAgendadaParaIndice(k: number): string {
  const hoje = new Date()
  hoje.setHours(12, 0, 0, 0)
  const inicio = new Date(hoje)
  inicio.setDate(inicio.getDate() - 89)

  const offset =
    TOTAL <= 1 ? 0 : Math.min(89, Math.floor((k / (TOTAL - 1)) * 89))
  const d = new Date(inicio)
  d.setDate(d.getDate() + offset)

  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    console.error(
      'Use o JWT anon ou service_role (eyJ...) do Supabase → Project Settings → API.'
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

  let baseNumero = 93000
  if (maxRow && typeof (maxRow as { numero_coleta?: number }).numero_coleta === 'number') {
    const n = (maxRow as { numero_coleta: number }).numero_coleta
    if (!Number.isNaN(n) && n >= baseNumero) baseNumero = n + 1
  }

  let ok = 0
  let fail = 0

  for (let k = 0; k < TOTAL; k++) {
    const cliente = lista[k % lista.length]
    const dataAgendada = dataAgendadaParaIndice(k)
    const numeroProg = `${PREFIX}-${String(k + 1).padStart(4, '0')}`
    const numeroColeta = baseNumero + k
    const valorColeta = 2500 + (k % 120) * 75

    const { data: prog, error: eProg } = await supabase
      .from('programacoes')
      .insert([
        {
          cliente_id: cliente.id,
          cliente: cliente.nome,
          data_programada: dataAgendada,
          tipo_caminhao: 'Truck',
          tipo_servico: 'Coleta',
          observacoes: `${PREFIX} Histórico 90d — caso ${k + 1}`,
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
          numero: `MTR-HIST-${numeroColeta}`,
          programacao_id: programacaoId,
          cliente: cliente.nome,
          gerador: cliente.nome,
          endereco: 'Rua Histórico Teste, 200',
          cidade: cliente.cidade || 'São Paulo',
          tipo_residuo: cliente.tipo_residuo || 'Resíduos classe II',
          quantidade: 12,
          unidade: 't',
          destinador: 'Destino Teste RG',
          transportador: 'RG Ambiental',
          data_emissao: dataAgendada,
          observacoes: `${PREFIX} MTR ${k + 1}`,
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

    const createdAt = `${dataAgendada}T14:30:00.000Z`

    const row: Record<string, unknown> = {
      ...montarPayloadBanco(),
      ...camposOperacionais(dataAgendada, k),
      ...camposObrigatoriosBanco(),
      cliente_id: cliente.id,
      cliente: cliente.nome,
      cidade: cliente.cidade || 'São Paulo',
      tipo_residuo: cliente.tipo_residuo || 'Resíduos classe II',
      programacao_id: programacaoId,
      mtr_id: mtrId,
      numero: String(numeroColeta),
      numero_coleta: numeroColeta,
      observacoes: `${PREFIX} Coleta ${k + 1}/${TOTAL} — ${ETAPA} (últimos 90 dias, teste).`,
      created_at: createdAt,
    }

    const { data: col, error: eCol } = await supabase.from('coletas').insert([row]).select('id').single()

    if (eCol || !col) {
      console.error(`[${k + 1}] coleta:`, eCol?.message)
      await supabase.from('mtrs').delete().eq('id', mtrId)
      await supabase.from('programacoes').delete().eq('id', programacaoId)
      fail++
      continue
    }

    const coletaId = col.id as string

    await supabase.from('programacoes').update({ coleta_id: coletaId }).eq('id', programacaoId)

    const { error: eFat } = await supabase.from('faturamento_registros').insert([
      {
        coleta_id: coletaId,
        valor: valorColeta,
        referencia_nf: `NF-HIST-${numeroColeta}`,
        status: 'emitido',
        updated_at: createdAt,
      },
    ])

    if (eFat) {
      console.warn(`[${k + 1}] faturamento_registros (coleta criada):`, eFat.message)
    }

    ok++
    if ((k + 1) % 40 === 0 || k === 0) {
      console.log(`… ${k + 1}/${TOTAL} (última: #${numeroColeta} · ${dataAgendada} · ${ETAPA})`)
    }
  }

  console.log(`\nConcluído: ${ok} coletas inseridas (${fail} falhas).`)
  console.log(
    `Período de datas de referência: últimos 90 dias · etapa ${ETAPA} · pagamento Pago · faturamento emitido.\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
