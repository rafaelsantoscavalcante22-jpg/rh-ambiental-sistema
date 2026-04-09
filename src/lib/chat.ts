import { supabase } from './supabase'
import type { ChatConversaLista, ChatMensagem, ChatUsuarioLista } from '../types/chat'
import type { PostgrestError } from '@supabase/supabase-js'

const BUCKET = 'chat-anexos'

/** RPC inexistente no PostgREST (migração não aplicada) ou 404. */
function chatRpcIndisponivel(err: PostgrestError | null): boolean {
  if (!err) return false
  const msg = `${err.message || ''} ${err.details || ''}`.toLowerCase()
  if (err.code === 'PGRST202' || err.code === '42883') return true
  if (msg.includes('404') || msg.includes('not found') || msg.includes('could not find')) return true
  return false
}

function ordenarParUuid(me: string, outro: string): [string, string] {
  return outro < me ? [outro, me] : [me, outro]
}

export function outroParticipanteId(
  conversa: { participant_low: string; participant_high: string },
  meuId: string
): string {
  return conversa.participant_low === meuId ? conversa.participant_high : conversa.participant_low
}

export function sanitizarNomeFicheiro(nome: string): string {
  return nome.replace(/[^\w.\-()\s\u00C0-\u024F]/gi, '_').slice(0, 180) || 'ficheiro'
}

const USUARIOS_CHAT_PAGE = 1000
const USUARIOS_CHAT_MAX_PAGES = 100

/**
 * Todos os utilizadores com status ativo (exceto o próprio), em páginas — sem teto artificial de 400 linhas.
 */
export async function chatListarUsuariosAtivos(meuId: string): Promise<ChatUsuarioLista[]> {
  const out: ChatUsuarioLista[] = []

  for (let page = 0; page < USUARIOS_CHAT_MAX_PAGES; page++) {
    const from = page * USUARIOS_CHAT_PAGE
    const to = from + USUARIOS_CHAT_PAGE - 1

    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome, email, cargo, foto_url')
      .eq('status', 'ativo')
      .neq('id', meuId)
      .order('nome', { ascending: true, nullsFirst: false })
      .range(from, to)

    if (error) throw error

    const rows = (data || []) as ChatUsuarioLista[]
    out.push(...rows)
    if (rows.length < USUARIOS_CHAT_PAGE) break
  }

  return out
}

export async function chatGetOrCreateDirect(outroId: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const me = user?.id
  if (!me) throw new Error('Sessão inválida.')
  if (outroId === me) throw new Error('Seleção inválida.')

  const rpc = await supabase.rpc('chat_get_or_create_direct', { p_outro: outroId })
  if (!rpc.error && rpc.data) return rpc.data as string

  if (!chatRpcIndisponivel(rpc.error)) {
    throw rpc.error
  }

  const { data: peer, error: peerErr } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', outroId)
    .maybeSingle()
  if (peerErr) throw peerErr
  if (!peer) throw new Error('Utilizador não encontrado ou inativo.')

  const [low, high] = ordenarParUuid(me, outroId)

  const found = await supabase
    .from('chat_conversas')
    .select('id')
    .eq('participant_low', low)
    .eq('participant_high', high)
    .maybeSingle()
  if (found.error) throw found.error
  if (found.data?.id) return found.data.id as string

  const ins = await supabase
    .from('chat_conversas')
    .insert({ tipo: 'direct', participant_low: low, participant_high: high })
    .select('id')
    .single()

  if (!ins.error && ins.data?.id) return ins.data.id as string

  const dup =
    ins.error &&
    (ins.error.code === '23505' ||
      /duplicate|unique/i.test(`${ins.error.message || ''} ${ins.error.details || ''}`))
  if (dup) {
    const again = await supabase
      .from('chat_conversas')
      .select('id')
      .eq('participant_low', low)
      .eq('participant_high', high)
      .maybeSingle()
    if (again.error) throw again.error
    if (again.data?.id) return again.data.id as string
  }

  throw ins.error ?? rpc.error ?? new Error('Não foi possível abrir a conversa.')
}

export async function chatCarregarConversas(meuId: string): Promise<ChatConversaLista[]> {
  const { data: parts, error: e1 } = await supabase
    .from('chat_participantes')
    .select('conversa_id, last_read_at')
    .eq('user_id', meuId)

  if (e1) throw e1
  const rows = parts || []
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.conversa_id)
  const lastReadMap = new Map(rows.map((r) => [r.conversa_id, r.last_read_at]))

  const { data: convs, error: e2 } = await supabase
    .from('chat_conversas')
    .select('id, participant_low, participant_high, ultima_preview, ultima_em, ultima_remetente_id')
    .in('id', ids)

  if (e2) throw e2

  const { data: unreadRows, error: e3 } = await supabase.rpc('chat_unread_by_conversa')
  const unreadMap = new Map<string, number>()
  if (!e3 && unreadRows) {
    for (const r of unreadRows as { conversa_id: string; unread: number }[]) {
      unreadMap.set(r.conversa_id, Number(r.unread))
    }
  } else if (e3 && !chatRpcIndisponivel(e3)) {
    throw e3
  }

  const list = (convs || []).map((c) => ({
    id: c.id,
    participant_low: c.participant_low,
    participant_high: c.participant_high,
    ultima_preview: c.ultima_preview,
    ultima_em: c.ultima_em,
    ultima_remetente_id: c.ultima_remetente_id,
    last_read_at: lastReadMap.get(c.id) ?? null,
    outro_id: outroParticipanteId(c as { participant_low: string; participant_high: string }, meuId),
    unread: unreadMap.get(c.id) ?? 0,
  }))

  list.sort((a, b) => {
    const ta = a.ultima_em ? new Date(a.ultima_em).getTime() : 0
    const tb = b.ultima_em ? new Date(b.ultima_em).getTime() : 0
    return tb - ta
  })

  return list
}

export async function chatMarcarLida(conversaId: string, meuId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_participantes')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversa_id', conversaId)
    .eq('user_id', meuId)

  if (error) throw error
}

export async function chatCarregarMensagens(conversaId: string, limite = 80): Promise<ChatMensagem[]> {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .select(
      'id, conversa_id, remetente_id, conteudo, anexo_bucket, anexo_path, anexo_nome, anexo_mime, anexo_size, created_at'
    )
    .eq('conversa_id', conversaId)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw error
  const arr = (data || []) as ChatMensagem[]
  return arr.slice().reverse()
}

export async function chatEnviarTexto(
  conversaId: string,
  meuId: string,
  texto: string
): Promise<ChatMensagem> {
  const { data, error } = await supabase
    .from('chat_mensagens')
    .insert({
      conversa_id: conversaId,
      remetente_id: meuId,
      conteudo: texto.trim(),
    })
    .select(
      'id, conversa_id, remetente_id, conteudo, anexo_bucket, anexo_path, anexo_nome, anexo_mime, anexo_size, created_at'
    )
    .single()

  if (error) throw error
  return data as ChatMensagem
}

export async function chatEnviarAnexo(
  conversaId: string,
  meuId: string,
  ficheiro: File,
  legendaOpcional?: string
): Promise<ChatMensagem> {
  const path = `${conversaId}/${crypto.randomUUID()}_${sanitizarNomeFicheiro(ficheiro.name)}`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, ficheiro, {
    cacheControl: '3600',
    upsert: false,
    contentType: ficheiro.type || undefined,
  })
  if (upErr) throw upErr

  const conteudo =
    legendaOpcional && legendaOpcional.trim().length > 0 ? legendaOpcional.trim() : 'Anexo enviado'

  const { data, error } = await supabase
    .from('chat_mensagens')
    .insert({
      conversa_id: conversaId,
      remetente_id: meuId,
      conteudo,
      anexo_bucket: BUCKET,
      anexo_path: path,
      anexo_nome: ficheiro.name,
      anexo_mime: ficheiro.type || null,
      anexo_size: ficheiro.size,
    })
    .select(
      'id, conversa_id, remetente_id, conteudo, anexo_bucket, anexo_path, anexo_nome, anexo_mime, anexo_size, created_at'
    )
    .single()

  if (error) throw error
  return data as ChatMensagem
}

export async function chatUrlAssinadaAnexo(path: string, segundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, segundos)
  if (error) {
    console.error(error)
    return null
  }
  return data?.signedUrl ?? null
}

export function formatarPreviewLista(
  ultima: string | null,
  ultimaRemetente: string | null,
  meuId: string
): string {
  if (!ultima) return 'Sem mensagens'
  const prefix = ultimaRemetente && ultimaRemetente === meuId ? 'Você: ' : ''
  return `${prefix}${ultima}`
}

export function formatarHoraCurta(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
