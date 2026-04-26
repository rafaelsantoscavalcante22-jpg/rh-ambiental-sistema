import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_CHUNK = 250

/**
 * Várias chamadas `.in(referencia_coleta_id, …)` em lotes — evita URL/payload gigante e timeouts.
 */
export async function fetchContasReceberByColetaIds<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  coletaIds: string[],
  select: string,
  chunkSize = DEFAULT_CHUNK
): Promise<Map<string, T>> {
  const map = new Map<string, T>()
  const uniq = [...new Set(coletaIds.map((id) => id.trim()).filter(Boolean))]
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const slice = uniq.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('contas_receber')
      .select(select)
      .in('referencia_coleta_id', slice)
    if (error) throw new Error(error.message)
    for (const r of (data || []) as unknown as T[]) {
      const ref = (r as { referencia_coleta_id?: string | null }).referencia_coleta_id
      if (ref) map.set(String(ref), r)
    }
  }
  return map
}
