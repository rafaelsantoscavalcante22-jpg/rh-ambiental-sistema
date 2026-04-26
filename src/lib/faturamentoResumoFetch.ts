import type { SupabaseClient } from '@supabase/supabase-js'
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

    let qb = supabase.from('vw_faturamento_resumo').select('*')
    if (createdMin) qb = qb.gte('created_at', createdMin)
    if (orFilter) qb = qb.or(orFilter)
    const { data, error } = await qb
      .order('created_at', { ascending: false })
      .order('coleta_id', { ascending: false })
      .range(from, to)

    if (error) {
      return { data: [], error: new Error(error.message) }
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
