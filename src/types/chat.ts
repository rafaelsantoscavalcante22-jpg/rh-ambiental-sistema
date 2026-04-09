export type ChatUsuarioLista = {
  id: string
  nome: string
  email: string
  cargo: string | null
  foto_url: string | null
  /** Presença escolhida no perfil (online | ausente | offline). */
  presenca_status?: string | null
}

export type ChatConversaLista = {
  id: string
  participant_low: string
  participant_high: string
  ultima_preview: string | null
  ultima_em: string | null
  ultima_remetente_id: string | null
  last_read_at: string | null
  outro_id: string
  unread: number
}

export type ChatMensagem = {
  id: string
  conversa_id: string
  remetente_id: string
  conteudo: string | null
  anexo_bucket: string | null
  anexo_path: string | null
  anexo_nome: string | null
  anexo_mime: string | null
  anexo_size: number | null
  created_at: string
}
