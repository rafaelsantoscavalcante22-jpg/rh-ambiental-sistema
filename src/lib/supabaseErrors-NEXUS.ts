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

/** PostgREST devolve objeto com `message`, nem sempre `instanceof Error`. */
export function mensagemErroSupabase(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const o = err as { message?: string; details?: string; hint?: string; code?: string }
    const parts = [o.message, o.details, o.hint].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  return fallback
}
