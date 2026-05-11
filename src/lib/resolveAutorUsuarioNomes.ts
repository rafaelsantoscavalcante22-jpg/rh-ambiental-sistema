import type { SupabaseClient } from '@supabase/supabase-js'
import { chunkArray } from './chunkArray'

/** Resolve nome (ou e-mail) em `public.usuarios` para preencher auditoria quando só há `criado_por_user_id`. */
export async function montarMapNomeExibicaoPorUsuarioId(
  supabase: SupabaseClient,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (!uniq.length) return out

  for (const chunk of chunkArray(uniq, 120)) {
    const { data, error } = await supabase.from('usuarios').select('id, nome, email').in('id', chunk)
    if (error) {
      console.warn('[resolveAutorUsuarioNomes]', error.message)
      continue
    }
    for (const row of data || []) {
      const u = row as { id: string; nome?: string | null; email?: string | null }
      const label = String(u.nome ?? '').trim() || String(u.email ?? '').trim()
      if (label) out.set(u.id, label)
    }
  }
  return out
}
