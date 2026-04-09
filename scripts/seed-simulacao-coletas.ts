/**
 * Simulação: insere 50 coletas distribuídas por TODAS as etapas do fluxo,
 * usando clientes já cadastrados. Cria programação + MTR + coleta por linha.
 *
 * Variáveis (ou arquivo .env na raiz do projeto com VITE_SUPABASE_URL + chave):
 *   SUPABASE_SERVICE_ROLE_KEY — recomendado (ignora RLS)
 *   VITE_SUPABASE_ANON_KEY — pode falhar em RLS nos inserts
 *
 * Execução:
 *   npm run seed:simulacao-coletas
 *
 * Chave service_role (recomendada): Supabase → Project Settings → API → service_role (secret).
 * Coloque no .env na raiz:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Coletas no banco exigem também: responsavel_interno, endereco; a partir de COLETA_REALIZADA,
 *   assinatura_coletada e assinatura_no_local (o script preenche).
 * Tentativas com apenas a anon key costumam falhar em RLS nas tabelas mtrs/coletas.
 * Se sobrarem programações sem coleta, rode no SQL Editor:
 *   supabase/cleanup_simulacao_SIM50_programacoes.sql
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
    // Colar do dashboard às vezes vem como <eyJ...> — inválido para a API
    if (v.startsWith('<') && v.endsWith('>') && v.length > 2) {
      v = v.slice(1, -1).trim()
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

carregarEnvArquivo()
import {
  ETAPAS_FLUXO_ORDER,
  indiceEtapaFluxo,
  type EtapaFluxo,
} from '../src/lib/fluxoEtapas'

const TOTAL = 50
const PREFIX = '[SIM-50]'

function montarPayloadBanco(novaEtapa: EtapaFluxo): Record<string, unknown> {
  switch (novaEtapa) {
    case 'PROGRAMACAO_CRIADA':
      return {
        fluxo_status: 'PROGRAMACAO_CRIADA',
        etapa_operacional: 'PROGRAMACAO_CRIADA',
        status_processo: 'AGUARDANDO_MTR',
        liberado_financeiro: false,
      }
    case 'QUADRO_ATUALIZADO':
      return {
        fluxo_status: 'QUADRO_ATUALIZADO',
        etapa_operacional: 'QUADRO_ATUALIZADO',
        status_processo: 'AGUARDANDO_MTR',
        liberado_financeiro: false,
      }
    case 'MTR_PREENCHIDA':
      return {
        fluxo_status: 'MTR_PREENCHIDA',
        etapa_operacional: 'MTR_PREENCHIDA',
        status_processo: 'MTR_EMITIDA',
        liberado_financeiro: false,
      }
    case 'MTR_ENTREGUE_LOGISTICA':
      return {
        fluxo_status: 'MTR_ENTREGUE_LOGISTICA',
        etapa_operacional: 'MTR_ENTREGUE_LOGISTICA',
        status_processo: 'MTR_EMITIDA',
        liberado_financeiro: false,
      }
    case 'LOGISTICA_DESIGNADA':
      return {
        fluxo_status: 'LOGISTICA_DESIGNADA',
        etapa_operacional: 'LOGISTICA_DESIGNADA',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'TARA_REGISTRADA':
      return {
        fluxo_status: 'TARA_REGISTRADA',
        etapa_operacional: 'TARA_REGISTRADA',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'COLETA_REALIZADA':
      return {
        fluxo_status: 'COLETA_REALIZADA',
        etapa_operacional: 'COLETA_REALIZADA',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'BRUTO_REGISTRADO':
      return {
        fluxo_status: 'BRUTO_REGISTRADO',
        etapa_operacional: 'BRUTO_REGISTRADO',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'CONTROLE_PESAGEM_LANCADO':
      return {
        fluxo_status: 'CONTROLE_PESAGEM_LANCADO',
        etapa_operacional: 'CONTROLE_PESAGEM_LANCADO',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'DOCUMENTOS_RECEBIDOS_OPERACIONAL':
      return {
        fluxo_status: 'DOCUMENTOS_RECEBIDOS_OPERACIONAL',
        etapa_operacional: 'DOCUMENTOS_RECEBIDOS_OPERACIONAL',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'TICKET_GERADO':
      return {
        fluxo_status: 'TICKET_GERADO',
        etapa_operacional: 'TICKET_GERADO',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'ENVIADO_APROVACAO':
      return {
        fluxo_status: 'ENVIADO_APROVACAO',
        etapa_operacional: 'ENVIADO_APROVACAO',
        status_processo: 'EM_CONFERENCIA',
        liberado_financeiro: false,
      }
    case 'APROVADO':
      return {
        fluxo_status: 'APROVADO',
        etapa_operacional: 'APROVADO',
        status_processo: 'APROVADO',
        liberado_financeiro: false,
        aprovado_diretoria: true,
      }
    case 'ARQUIVADO':
      return {
        fluxo_status: 'ARQUIVADO',
        etapa_operacional: 'ARQUIVADO',
        status_processo: 'APROVADO',
        liberado_financeiro: false,
        arquivado: true,
      }
    case 'FATURADO':
      return {
        fluxo_status: 'FATURADO',
        etapa_operacional: 'FATURADO',
        status_processo: 'FATURAMENTO',
        liberado_financeiro: false,
      }
    case 'ENVIADO_FINANCEIRO':
      return {
        fluxo_status: 'ENVIADO_FINANCEIRO',
        etapa_operacional: 'ENVIADO_FINANCEIRO',
        status_processo: 'FATURAMENTO',
        liberado_financeiro: true,
        enviado_financeiro: true,
      }
    case 'FINALIZADO':
      return {
        fluxo_status: 'FINALIZADO',
        etapa_operacional: 'FINALIZADO',
        status_processo: 'FINALIZADO',
        liberado_financeiro: true,
      }
    default:
      return {
        fluxo_status: 'PROGRAMACAO_CRIADA',
        etapa_operacional: 'PROGRAMACAO_CRIADA',
        status_processo: 'AGUARDANDO_MTR',
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
    out.motorista_nome = 'Motorista Simulação'
    out.motorista = 'Motorista Simulação'
    out.placa = 'SIM0A00'
  }

  if (i >= indiceEtapaFluxo('TARA_REGISTRADA')) {
    out.peso_tara = 12000
  }

  if (i >= indiceEtapaFluxo('BRUTO_REGISTRADO')) {
    out.peso_bruto = 18500
    out.peso_liquido = 6500
  }

  if (i >= indiceEtapaFluxo('TICKET_GERADO')) {
    out.ticket_numero = `TK-SIM-${String(seqIndex).padStart(3, '0')}`
  }

  if (etapa === 'ENVIADO_FINANCEIRO' || etapa === 'FINALIZADO') {
    out.valor_coleta = 8500 + (seqIndex % 50) * 10
    out.data_vencimento = dataAgendada
    out.status_pagamento = etapa === 'FINALIZADO' ? 'Pago' : 'Pendente'
  }

  /* Valores de teste em todas as linhas para a página Financeiro (demonstração). */
  if (out.valor_coleta == null) {
    out.valor_coleta = 1500 + (seqIndex % 200) * 25
  }
  if (out.data_vencimento == null) {
    out.data_vencimento = dataAgendada
  }
  if (out.status_pagamento == null || out.status_pagamento === '') {
    out.status_pagamento = 'Pendente'
  }

  return out
}

/** Obrigatórios no banco: responsável + assinatura antes de COLETA_REALIZADA em diante. */
function camposObrigatoriosBanco(etapa: EtapaFluxo): Record<string, unknown> {
  const i = indiceEtapaFluxo(etapa)
  const out: Record<string, unknown> = {
    responsavel_interno: `${PREFIX} Simulação`,
    endereco: 'Rua Simulação, 100',
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

/** Remove `<` `>` comuns ao copiar a secret do dashboard. */
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
      'Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (recomendado) ou chave anon.'
    )
    process.exit(1)
  }

  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    console.error(
      'Chave em formato sb_publishable / sb_secret não é aceita pelo @supabase/supabase-js.\n' +
        'No Supabase → Project Settings → API, use o JWT "anon" / "service_role" (string longa começando com eyJ).'
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
    console.error('Cadastre ao menos um cliente antes de rodar a simulação.')
    process.exit(1)
  }

  const { data: maxRow } = await supabase
    .from('coletas')
    .select('numero_coleta')
    .order('numero_coleta', { ascending: false })
    .limit(1)
    .maybeSingle()

  let baseNumero = 90000
  if (maxRow && typeof (maxRow as { numero_coleta?: number }).numero_coleta === 'number') {
    const n = (maxRow as { numero_coleta: number }).numero_coleta
    if (!Number.isNaN(n) && n >= baseNumero) baseNumero = n + 1
  }

  const nEtapas = ETAPAS_FLUXO_ORDER.length
  let ok = 0
  let fail = 0

  for (let k = 0; k < TOTAL; k++) {
    const etapa = ETAPAS_FLUXO_ORDER[k % nEtapas] as EtapaFluxo
    const cliente = lista[k % lista.length]
    const dataAgendada = `2026-04-${String((k % 28) + 1).padStart(2, '0')}`
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
          observacoes: `${PREFIX} Simulação fluxo`,
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
          numero: `MTR-${numeroColeta}`,
          programacao_id: programacaoId,
          cliente: cliente.nome,
          gerador: cliente.nome,
          endereco: 'Rua Simulação, 100',
          cidade: cliente.cidade || 'São Paulo',
          tipo_residuo: cliente.tipo_residuo || 'Resíduos classe II',
          quantidade: 12,
          unidade: 't',
          destinador: 'Destino Sim RG',
          transportador: 'RG Ambiental',
          data_emissao: dataAgendada,
          observacoes: `${PREFIX} Simulação`,
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
      observacoes: `${PREFIX} Etapa ${etapa} — simulação de fluxo completo.`,
    }

    const { data: col, error: eCol } = await supabase.from('coletas').insert([row]).select('id').single()

    if (eCol || !col) {
      console.error(`[${k + 1}] coleta (${etapa}):`, eCol?.message)
      await supabase.from('mtrs').delete().eq('id', mtrId)
      await supabase.from('programacoes').delete().eq('id', programacaoId)
      fail++
      continue
    }

    await supabase.from('programacoes').update({ coleta_id: col.id }).eq('id', programacaoId)

    ok++
    console.log(`✓ ${k + 1}/${TOTAL} coleta #${numeroColeta} → ${etapa}`)
  }

  console.log(`\nConcluído: ${ok} inseridas, ${fail} falhas.`)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      '\nSe houve falhas por permissão (RLS), use SUPABASE_SERVICE_ROLE_KEY no ambiente e execute de novo.'
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
