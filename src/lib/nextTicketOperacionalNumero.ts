import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Obtém o próximo número de ticket via RPC `next_ticket_operacional_numero`.
 * Se a RPC não existir (migração ainda não aplicada), devolve erro legível.
 */
export async function obterProximoNumeroTicketOperacional(
  supabase: SupabaseClient
): Promise<{ ok: true; numero: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('next_ticket_operacional_numero')
  if (error) {
    return {
      ok: false,
      message:
        error.message ||
        'Não foi possível obter o número do ticket. Aplique a migração `20260521180000_ticket_numero_seq_assinatura_motorista.sql` no Supabase.',
    }
  }
  const n = String(data ?? '').trim()
  if (!n) return { ok: false, message: 'Número de ticket vazio devolvido pelo servidor.' }
  return { ok: true, numero: n }
}
