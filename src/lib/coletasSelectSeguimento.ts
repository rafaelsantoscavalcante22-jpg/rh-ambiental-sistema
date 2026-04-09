import { supabase } from './supabase'

/**
 * Lista de colunas para `coletas`: usamos `*` de propósito.
 * Um `.select('id,a,b,c')` com colunas que não existem no projeto Supabase remoto
 * devolve 400 (PGRST204 / schema cache) e quebra Controle de Massa e ticket.
 * O mapeamento nas páginas trata campos opcionais com `??`.
 */
export const COLETAS_SELECT_SEGUIMENTO = '*'

/**
 * Subconjunto de colunas para a lista densa do Controle de Massa (mapRowToColetaOpcao).
 * Reduz muito o payload vs `*` em milhares de linhas. Se falhar (schema), usa `*`.
 */
export const COLETAS_SELECT_CONTROLE_LISTA =
  'id, numero_coleta, numero, cliente, nome_cliente, tipo_residuo, residuo, placa, motorista, motorista_nome, status, status_processo, fluxo_status, etapa_operacional, peso_tara, peso_bruto, peso_liquido, mtr_id, programacao_id, cliente_id, created_at'

/**
 * Coletas — resumo para telas de seguimento (sem `*`): reduz payload em listas longas.
 */
export const COLETAS_SELECT_RESUMO_FLUXO =
  'id, numero_coleta, numero, cliente, nome_cliente, cidade, tipo_residuo, fluxo_status, etapa_operacional, mtr_id, programacao_id, cliente_id, placa, motorista, motorista_nome, peso_liquido, data_agendada, created_at'

/**
 * Dropdowns de fluxo (Aprovação, Faturamento, Conferência, etc.).
 * Tenta `COLETAS_SELECT_RESUMO_FLUXO`; se o PostgREST recusar (coluna inexistente no
 * projeto remoto — PGRST204), usa `*` como em `queryColetasListaFluxoControle`.
 */
export async function queryColetasListaResumoFluxo(limit: number) {
  const primary = await supabase
    .from('coletas')
    .select(COLETAS_SELECT_RESUMO_FLUXO)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!primary.error) return primary

  const byStar = await supabase
    .from('coletas')
    .select(COLETAS_SELECT_SEGUIMENTO)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!byStar.error) return byStar

  return supabase
    .from('coletas')
    .select(COLETAS_SELECT_SEGUIMENTO)
    .order('id', { ascending: false })
    .limit(limit)
}

/** MTR — vínculo com coleta (lista lateral / mapas). */
export const COLETAS_SELECT_MTR_VINCULO =
  'id, numero, cliente, etapa_operacional, fluxo_status, status_processo, mtr_id, programacao_id, motorista, motorista_nome, placa, tipo_residuo'

/**
 * Busca coletas ordenadas para o fluxo. Tenta `created_at`; se falhar (coluna inexistente), usa `id`.
 */
export async function queryColetasListaFluxo(limit = 500) {
  const primary = await supabase
    .from('coletas')
    .select(COLETAS_SELECT_SEGUIMENTO)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!primary.error) return primary

  return supabase
    .from('coletas')
    .select(COLETAS_SELECT_SEGUIMENTO)
    .order('id', { ascending: false })
    .limit(limit)
}

/**
 * Mesma ordem que `queryColetasListaFluxo`, mas com select enxuto para a lista do Controle de Massa.
 */
export async function queryColetasListaFluxoControle(limit: number) {
  const primary = await supabase
    .from('coletas')
    .select(COLETAS_SELECT_CONTROLE_LISTA)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!primary.error) return primary

  const byId = await supabase
    .from('coletas')
    .select(COLETAS_SELECT_CONTROLE_LISTA)
    .order('id', { ascending: false })
    .limit(limit)

  if (!byId.error) return byId

  return queryColetasListaFluxo(limit)
}
