/**
 * Insere 5 coletas prontas para a fila de Faturamento (teste local).
 *
 * Critérios (alinhados a `coletaNaFilaFaturamento` + `vw_faturamento_resumo`):
 * - peso_liquido > 0, etapa APROVADO (após controle de massa, antes do Financeiro)
 * - aprovação da diretoria = aprovado
 * - ticket_numero na coleta, valor_coleta > 0, MTR vinculada
 * - sem registro de faturamento emitido
 *
 * Uso:
 *   npx tsx scripts/seed-5-coletas-fila-faturamento.ts
 *
 * Ou: npm run seed:5-fila-faturamento
 *
 * Requer: pelo menos um cliente; VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { indiceEtapaFluxo, type EtapaFluxo } from '../src/lib/fluxoEtapas'

const TOTAL = 5
const PREFIX = '[FAT-TEST-5]'
const ETAPA: EtapaFluxo = 'APROVADO'

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
    fluxo_status: ETAPA,
    etapa_operacional: ETAPA,
    status_processo: ETAPA,
    liberado_financeiro: false,
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
    out.motorista_nome = 'Motorista Fila Faturamento'
    out.motorista = 'Motorista Fila Faturamento'
    out.placa = `FF${String(seqIndex + 1).padStart(2, '0')}K0`
  }

  if (i >= indiceEtapaFluxo('TARA_REGISTRADA')) {
    out.peso_tara = 11000
  }

  if (i >= indiceEtapaFluxo('BRUTO_REGISTRADO')) {
    out.peso_bruto = 17200
    out.peso_liquido = 5200 + seqIndex * 50
  }

  if (i >= indiceEtapaFluxo('TICKET_GERADO')) {
    out.ticket_numero = `TK-${PREFIX}-${seqIndex + 1}`
  }

  out.valor_coleta = 3200 + (seqIndex + 1) * 150
  out.data_vencimento = dataAgendada
  out.status_pagamento = 'Pendente'

  return out
}

function camposObrigatoriosBanco(): Record<string, unknown> {
  return {
    responsavel_interno: `${PREFIX} Responsável`,
    endereco: 'Endereço teste fila faturamento',
    assinatura_coletada: true,
    assinatura_no_local: true,
  }
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
      'Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (recomendado) no .env.'
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

  let baseNumero = 99001
  if (maxRow && typeof (maxRow as { numero_coleta?: number }).numero_coleta === 'number') {
    const n = (maxRow as { numero_coleta: number }).numero_coleta
    if (!Number.isNaN(n) && n >= baseNumero) baseNumero = n + 1
  }

  const hoje = new Date()
  const y = hoje.getFullYear()
  const m = String(hoje.getMonth() + 1).padStart(2, '0')
  const day = String(hoje.getDate()).padStart(2, '0')
  const dataAgendada = `${y}-${m}-${day}`

  const criadas: { id: string; numero_coleta: number }[] = []
  let fail = 0

  for (let k = 0; k < TOTAL; k++) {
    const cliente = lista[k % lista.length]
    const numeroProg = `${PREFIX}-P${String(k + 1).padStart(2, '0')}`
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
          observacoes: `${PREFIX} Programação ${k + 1}/${TOTAL} — fila faturamento`,
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
          numero: `MTR-${PREFIX}-${numeroColeta}`,
          programacao_id: programacaoId,
          cliente: cliente.nome,
          gerador: cliente.nome,
          endereco: 'Rua teste fila faturamento',
          cidade: cliente.cidade || 'São Paulo',
          tipo_residuo: cliente.tipo_residuo || 'Resíduos classe II',
          quantidade: 10,
          unidade: 't',
          destinador: 'Destino teste RG',
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
      observacoes: `${PREFIX} Coleta ${k + 1}/${TOTAL} — etapa ${ETAPA}, pronta para Faturamento.`,
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

    // Alguns projetos Supabase têm trigger/default que sobrescreve `fluxo_status` no INSERT — reforçar após gravar.
    const { error: eFluxo } = await supabase
      .from('coletas')
      .update({
        fluxo_status: ETAPA,
        etapa_operacional: ETAPA,
        status_processo: ETAPA,
      })
      .eq('id', coletaId)
    if (eFluxo) {
      console.error(`[${k + 1}] sync fluxo pós-insert:`, eFluxo.message)
      await supabase.from('coletas').delete().eq('id', coletaId)
      await supabase.from('mtrs').delete().eq('id', mtrId)
      await supabase.from('programacoes').delete().eq('id', programacaoId)
      fail++
      continue
    }

    const { error: eApr } = await supabase.from('aprovacoes_diretoria').insert([
      {
        coleta_id: coletaId,
        decisao: 'aprovado',
        observacoes: `${PREFIX} Aprovação automática (seed teste).`,
      },
    ])

    if (eApr) {
      console.error(`[${k + 1}] aprovação:`, eApr.message)
      await supabase.from('coletas').delete().eq('id', coletaId)
      await supabase.from('mtrs').delete().eq('id', mtrId)
      await supabase.from('programacoes').delete().eq('id', programacaoId)
      fail++
      continue
    }

    criadas.push({ id: coletaId, numero_coleta: numeroColeta })
    console.log(`✓ ${k + 1}/${TOTAL} coleta #${numeroColeta} · ${numeroProg} · id ${coletaId}`)
  }

  console.log(`\nConcluído: ${criadas.length} coletas na fila de faturamento, ${fail} falhas.`)
  if (criadas.length) {
    console.log('\nAbra /faturamento e clique em «Atualizar dados». Para remover depois, filtre por observações contendo:')
    console.log(`   ${PREFIX}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
