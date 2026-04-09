import { supabase } from './supabase'

export type ResiduoCatalogo = {
  id: string
  codigo: string
  nome: string
  ativo: boolean
  grupo: string | null
}

export async function fetchResiduosCatalogo(): Promise<ResiduoCatalogo[]> {
  const { data, error } = await supabase
    .from('residuos')
    .select('id, codigo, nome, ativo, grupo')
    .order('sort_order', { ascending: true })

  if (error) {
    console.warn('[residuos] catálogo indisponível (migração aplicada?):', error.message)
    return []
  }

  return (data || []) as ResiduoCatalogo[]
}

export function mapResiduosPorId(rows: ResiduoCatalogo[]): Map<string, ResiduoCatalogo> {
  return new Map(rows.map((r) => [r.id, r]))
}
