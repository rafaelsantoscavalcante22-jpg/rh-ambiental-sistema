import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { FaturamentoResumoViewRow } from './faturamentoResumo'

const PAGE_SIZE = 1000
/** PostgREST costuma limitar a 1000 linhas por pedido; várias páginas evitam “perder” a fila de faturamento. */
const MAX_PAGES = 20

/** Opt-in: só aplica filtro se `VITE_FATURAMENTO_RESUMO_DESDE_DIAS` for um número positivo (reduz carga em bases enormes). */
function createdAtMinIsoOptIn(): string | null {
  const raw = String(import.meta.env.VITE_FATURAMENTO_RESUMO_DESDE_DIAS ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - Math.floor(n))
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export type FetchVwFaturamentoResumoPaginatedOpts = {
  /** Filtro PostgREST `.or(...)` — ex.: lista financeira (`COLETAS_OR_FINANCEIRO_QUERY`). */
  orFilter?: string
}

/** Erro PostgREST típico quando a view ainda não foi criada no projeto Supabase. */
export function isVwFaturamentoResumoMissingError(err: PostgrestError | { message?: string; code?: string }): boolean {
  const code = 'code' in err ? String(err.code ?? '') : ''
  const msg = String(err.message ?? '')
  if (code === 'PGRST205') return true
  if (!/vw_faturamento_resumo/i.test(msg)) return false
  return /schema cache|could not find|does not exist|relation /i.test(msg)
}

function mensagemCorrecaoViewFaturamento(): string {
  return (
    '\n\n▸ Como corrigir: no Supabase, abra SQL Editor, cole e execute o ficheiro do repositório:\n' +
    '   supabase/sql_editor_vw_faturamento_resumo.sql\n\n' +
    '   Em desenvolvimento (com DATABASE_URL ou SUPABASE_DB_PASSWORD + VITE_SUPABASE_URL no .env):\n' +
    '   npm run db:apply:faturamento-view\n\n' +
    '   Depois use «Tentar de novo» ou atualize a página.'
  )
}

/**
 * Carrega linhas da view `vw_faturamento_resumo` com paginação, para não ficar preso ao primeiro lote
 * quando há muitas coletas já finalizadas (ex.: seeds de histórico).
 */
export async function fetchVwFaturamentoResumoPaginated(
  supabase: SupabaseClient,
  opts?: FetchVwFaturamentoResumoPaginatedOpts
): Promise<{ data: FaturamentoResumoViewRow[]; error: Error | null }> {
  const byId = new Map<string, FaturamentoResumoViewRow>()
  const createdMin = createdAtMinIsoOptIn()
  const orFilter = (opts?.orFilter ?? '').trim()
  let exitDueToMaxPages = false

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const SEL =
      'coleta_id, numero, numero_coleta, cliente_id, cliente_nome, cliente_razao_social, cliente_margem_lucro_percentual, data_agendada, data_programacao, data_execucao, programacao_id, programacao_numero, programacao_observacoes, mtr_id, mtr_numero, mtr_observacoes, ticket_comprovante, peso_tara, peso_bruto, peso_liquido, motorista, placa, valor_coleta, status_pagamento, data_vencimento, referencia_nf, numero_nf_coleta, faturamento_referencia_nf, faturamento_registro_status, faturamento_registro_valor, confirmacao_recebimento, fluxo_status, etapa_operacional, status_processo, liberado_financeiro, coleta_observacoes, tipo_residuo, cidade, created_at, ultima_aprovacao_decisao, ultima_aprovacao_obs, ultima_aprovacao_em, conferencia_documentos_ok, conferencia_operacional_obs, conferencia_em, status_conferencia, pendencias_resumo, faturamento_sla_vencido, status_faturamento, conta_receber_nf_enviada_em, conta_receber_nf_envio_obs, conta_receber_valor_pago, conta_receber_valor_travado'

    let qb = supabase.from('vw_faturamento_resumo').select(SEL)
    if (createdMin) qb = qb.gte('created_at', createdMin)
    if (orFilter) qb = qb.or(orFilter)
    const { data, error } = await qb
      .order('created_at', { ascending: false })
      .order('coleta_id', { ascending: false })
      .range(from, to)

    if (error) {
      const base = error.message || 'Erro ao ler vw_faturamento_resumo.'
      const msg = isVwFaturamentoResumoMissingError(error) ? base + mensagemCorrecaoViewFaturamento() : base
      return { data: [], error: new Error(msg) }
    }

    const chunk = (data as FaturamentoResumoViewRow[]) || []
    if (chunk.length === 0) break

    for (const row of chunk) {
      byId.set(row.coleta_id, row)
    }

    if (chunk.length < PAGE_SIZE) break
    if (page === MAX_PAGES - 1) exitDueToMaxPages = true
  }

  if (exitDueToMaxPages) {
    console.warn(
      `[faturamentoResumoFetch] Limite de ${MAX_PAGES} páginas × ${PAGE_SIZE} linhas atingido; a lista pode estar truncada. ` +
        'Defina VITE_FATURAMENTO_RESUMO_DESDE_DIAS (opt-in) ou aumente MAX_PAGES se necessário.'
    )
  }

  const merged = [...byId.values()].sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (tb !== ta) return tb - ta
    return a.coleta_id < b.coleta_id ? 1 : a.coleta_id > b.coleta_id ? -1 : 0
  })

  return { data: merged, error: null }
}
