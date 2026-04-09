/**
 * Erros transitórios do cliente Supabase (abort, Web Locks "steal", etc.).
 * Não devem bloquear a UI com alert nem ser tratados como falha definitiva.
 */
export function isBenignSupabaseFetchError(
  error: { message?: string; name?: string } | null | undefined
): boolean {
  if (!error) return false
  const msg = String(error.message ?? '')
  if (error.name === 'AbortError') return true
  if (msg.includes('AbortError')) return true
  if (msg.includes('Lock broken')) return true
  if (/aborted/i.test(msg)) return true
  return false
}
