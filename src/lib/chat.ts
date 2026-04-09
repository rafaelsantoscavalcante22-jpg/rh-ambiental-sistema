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

/** Mesma ordem que PostgreSQL (`uuid < uuid`), para o par bater com `chat_conversas`. */
async function ordenarParUuidDb(me: string, outro: string): Promise<[string, string]> {
  const { data, error } = await supabase.rpc('chat_ordered_participant_pair', {
    p_a: me,
    p_b: outro,
  })
  if (error || data == null) return ordenarParUuid(me, outro)
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return ordenarParUuid(me, outro)
  const o = row as { participant_low?: string; participant_high?: string }
  if (!o.participant_low || !o.participant_high) return ordenarParUuid(me, outro)
  return [o.participant_low, o.participant_high]
}

function mensagemPrimeiraLinhaRpc(data: unknown): ChatMensagem {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') throw new Error('Resposta inválida do servidor ao enviar.')
  return row as ChatMensagem
}

function normalizarErroChat(e: unknown): Error {
  if (e instanceof Error && !(e as PostgrestError).code) return e
  if (e && typeof e === 'object' && 'message' in e) {
    const p = e as PostgrestError
    const m = [p.message, p.details].filter(Boolean).join(' — ')
    if (/row-level security|\b42501\b/i.test(m)) {
      return new Error(
        'Sem permissão para enviar. Recarregue a página ou aplique as migrações do chat no Supabase (chat_insert_mensagem).'
      )
    }
    if (m) return new Error(m)
  }
  if (e instanceof Error) return e
  return new Error('Falha ao enviar.')
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
      .select('id, nome, email, cargo, foto_url, presenca_status')
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

  const [low, high] = await ordenarParUuidDb(me, outroId)

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id
  if (!uid) throw new Error('Sessão inválida.')

  const { data: parts, error: e1 } = await supabase
    .from('chat_participantes')
    .select(
      `
      conversa_id,
      last_read_at,
      chat_conversas (
        id,
        participant_low,
        participant_high,
        ultima_preview,
        ultima_em,
        ultima_remetente_id
      )
    `
    )
    .eq('user_id', uid)

  if (e1) throw e1
  const rows = parts || []

  type ConvNested = {
    id: string
    participant_low: string
    participant_high: string
    ultima_preview: string | null
    ultima_em: string | null
    ultima_remetente_id: string | null
  }

  const list: ChatConversaLista[] = []
  for (const r of rows as {
    conversa_id: string
    last_read_at: string | null
    chat_conversas: ConvNested | ConvNested[] | null
  }[]) {
    const raw = r.chat_conversas
    const c = Array.isArray(raw) ? raw[0] : raw
    if (!c?.id) continue

    list.push({
      id: c.id,
      participant_low: c.participant_low,
      participant_high: c.participant_high,
      ultima_preview: c.ultima_preview,
      ultima_em: c.ultima_em,
      ultima_remetente_id: c.ultima_remetente_id,
      last_read_at: r.last_read_at,
      outro_id: outroParticipanteId(c, uid),
      unread: 0,
    })
  }

  const { data: unreadRows, error: e3 } = await supabase.rpc('chat_unread_by_conversa')
  const unreadMap = new Map<string, number>()
  if (!e3 && unreadRows) {
    for (const row of unreadRows as { conversa_id: string; unread: number }[]) {
      unreadMap.set(row.conversa_id, Number(row.unread))
    }
  } else if (e3 && !chatRpcIndisponivel(e3)) {
    throw e3
  }

  for (const item of list) {
    item.unread = unreadMap.get(item.id) ?? 0
  }

  list.sort((a, b) => {
    const ta = a.ultima_em ? new Date(a.ultima_em).getTime() : 0
    const tb = b.ultima_em ? new Date(b.ultima_em).getTime() : 0
    return tb - ta
  })

  if (uid !== meuId) console.warn('[chat] carregar conversas: JWT difere do meuId passado à função')

  return list
}

export async function chatMarcarLida(conversaId: string, meuId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id
  if (!uid) throw new Error('Sessão inválida.')

  const { error } = await supabase
    .from('chat_participantes')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversa_id', conversaId)
    .eq('user_id', uid)

  if (error) throw error
  if (uid !== meuId) console.warn('[chat] marcar lida: JWT difere do meuId')
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
  const trimmed = texto.trim()
  if (!trimmed) throw new Error('Mensagem vazia.')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id
  if (!uid) throw new Error('Sessão inválida.')
  if (uid !== meuId) console.warn('[chat] remetente: JWT difere do estado da UI')

  const rpc = await supabase.rpc('chat_insert_mensagem', {
    p_conversa_id: conversaId,
    p_conteudo: trimmed,
    p_anexo_bucket: null,
    p_anexo_path: null,
    p_anexo_nome: null,
    p_anexo_mime: null,
    p_anexo_size: null,
  })
  if (!rpc.error && rpc.data != null) {
    return mensagemPrimeiraLinhaRpc(rpc.data)
  }
  if (rpc.error && !chatRpcIndisponivel(rpc.error)) {
    throw normalizarErroChat(rpc.error)
  }

  const { data, error } = await supabase
    .from('chat_mensagens')
    .insert({
      conversa_id: conversaId,
      remetente_id: uid,
      conteudo: trimmed,
    })
    .select(
      'id, conversa_id, remetente_id, conteudo, anexo_bucket, anexo_path, anexo_nome, anexo_mime, anexo_size, created_at'
    )
    .single()

  if (error) throw normalizarErroChat(error)
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

  const conteudoLegenda =
    legendaOpcional && legendaOpcional.trim().length > 0 ? legendaOpcional.trim() : ''

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id
  if (!uid) throw new Error('Sessão inválida.')
  if (uid !== meuId) console.warn('[chat] remetente: JWT difere do estado da UI')

  const rpc = await supabase.rpc('chat_insert_mensagem', {
    p_conversa_id: conversaId,
    p_conteudo: conteudoLegenda || null,
    p_anexo_bucket: BUCKET,
    p_anexo_path: path,
    p_anexo_nome: ficheiro.name,
    p_anexo_mime: ficheiro.type || null,
    p_anexo_size: ficheiro.size,
  })
  if (!rpc.error && rpc.data != null) {
    return mensagemPrimeiraLinhaRpc(rpc.data)
  }
  if (rpc.error && !chatRpcIndisponivel(rpc.error)) {
    throw normalizarErroChat(rpc.error)
  }

  const conteudo = conteudoLegenda || 'Anexo enviado'

  const { data, error } = await supabase
    .from('chat_mensagens')
    .insert({
      conversa_id: conversaId,
      remetente_id: uid,
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

  if (error) throw normalizarErroChat(error)
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
