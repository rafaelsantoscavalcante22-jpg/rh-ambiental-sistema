import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

const DICA_DEPLOY = `Se o projeto usa Edge Functions, publique-as no Supabase (na pasta do projeto, com CLI logado):
npx supabase functions deploy admin-create-user
npx supabase functions deploy admin-update-user
npx supabase functions deploy admin-delete-user
npx supabase functions deploy send-nf-email

Confira também se VITE_SUPABASE_URL no .env aponta para o mesmo projeto do dashboard.`

/**
 * Sessão com JWT para chamadas autenticadas (tenta refresh se necessário).
 */
export async function obterSessaoParaEdgeFunctions(supabase: SupabaseClient) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) throw error

  if (session?.access_token) {
    return session
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()

  if (refreshError) throw refreshError

  if (!refreshed.session?.access_token) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  return refreshed.session
}

/**
 * Headers para `functions.invoke`: o fetch interno do supabase-js usa a anon key como Bearer
 * se não houver JWT na sessão no instante da chamada — o gateway então responde "Invalid JWT".
 * Sempre envie o access_token obtido após {@link obterSessaoParaEdgeFunctions}.
 */
export function headersJwtSessao(session: Session): { Authorization: string } {
  const token = session.access_token
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }
  return { Authorization: `Bearer ${token}` }
}

/**
 * Converte erros do supabase.functions.invoke em mensagem legível + dicas.
 */
export async function formatarErroEdgeFunction(
  error: unknown,
  contexto: 'criar' | 'editar' | 'excluir' | 'carregar' | 'enviar_nf'
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const response = error.context
      const payload = await response.json()

      let texto = ''
      if (payload?.error) texto = String(payload.error)
      else if (payload?.details) texto = String(payload.details)
      else if (payload?.message) texto = String(payload.message)
      else texto = `A Edge Function retornou HTTP ${response.status}.`

      if (/invalid jwt/i.test(texto)) {
        texto +=
          '\n\nSe você usa a chave publishable (sb_publishable_…) no .env, faça logout e login de novo. ' +
          'Ou use a chave anon legada (JWT eyJ…) em VITE_SUPABASE_ANON_KEY, conforme Project Settings → API.'
      }
      return texto
    } catch {
      return 'A Edge Function retornou erro, mas não foi possível ler a resposta.'
    }
  }

  if (error instanceof FunctionsRelayError) {
    return `Erro de relay da Edge Function: ${error.message}`
  }

  if (error instanceof FunctionsFetchError) {
    return (
      `Não foi possível contactar a Edge Function (${contexto}). ` +
      `Causas comuns: função ainda não publicada no projeto, URL do Supabase incorreta no .env, ou rede/firewall bloqueando.\n\n` +
      DICA_DEPLOY
    )
  }

  if (error instanceof Error) {
    const msg = error.message || ''
    if (/failed to fetch|network|load failed/i.test(msg)) {
      return (
        `Falha de rede ao chamar a Edge Function (${contexto}).\n\n` + DICA_DEPLOY
      )
    }
    if (/invalid jwt/i.test(msg)) {
      return (
        `${msg}\n\n` +
        `Se você usa a chave publishable (sb_publishable_…) no .env, faça logout e login de novo. ` +
        `Ou use a chave anon legada (JWT eyJ…) em VITE_SUPABASE_ANON_KEY, conforme Project Settings → API.`
      )
    }
    return msg
  }

  const verbo =
    contexto === 'enviar_nf'
      ? 'enviar e-mail de NF'
      : `${contexto} usuário`
  return `Erro desconhecido ao ${verbo}.`
}
