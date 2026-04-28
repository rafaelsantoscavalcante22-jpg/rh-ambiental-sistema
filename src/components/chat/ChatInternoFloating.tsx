import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import {
  chatCarregarConversas,
  chatCarregarMensagens,
  chatEnviarAnexo,
  chatEnviarTexto,
  chatGetOrCreateDirect,
  chatListarUsuariosAtivos,
  chatMarcarLida,
} from '../../lib/chat'
import { normalizarPresencaStatus } from '../../lib/presencaStatus'
import type { ChatConversaLista, ChatMensagem, ChatUsuarioLista } from '../../types/chat'
import { useChatFloat } from '../../contexts/ChatFloatContext'
import { usePresencaAoVivo } from '../../contexts/PresencaAoVivoContext'
import { ChatSidebarPanel } from './ChatSidebarPanel'
import { ChatThreadPanel } from './ChatThreadPanel'
import { RgChatLogo } from './RgChatLogo'
import { BRAND_LOGO_MARK } from '../../lib/brandLogo'

const CHAT_HEAD_THEME_STORAGE_KEY = 'rg-chat-head-theme'

export type ChatHeadThemeId = 'verde' | 'azul_escuro' | 'azul_claro' | 'rosa' | 'vermelho'

const CHAT_HEAD_THEMES: Record<ChatHeadThemeId, { label: string; gradient: string }> = {
  verde: {
    label: 'Verde',
    gradient: 'linear-gradient(180deg, #0f766e 0%, #0d9488 48%, #0f766e 100%)',
  },
  azul_escuro: {
    label: 'Azul escuro',
    gradient: 'linear-gradient(180deg, #1e3a8a 0%, #172554 48%, #1e3a8a 100%)',
  },
  azul_claro: {
    label: 'Azul claro',
    gradient: 'linear-gradient(180deg, #38bdf8 0%, #0ea5e9 48%, #0284c7 100%)',
  },
  rosa: {
    label: 'Rosa',
    gradient: 'linear-gradient(180deg, #f472b6 0%, #db2777 48%, #be185d 100%)',
  },
  vermelho: {
    label: 'Vermelho',
    gradient: 'linear-gradient(180deg, #ef4444 0%, #dc2626 48%, #b91c1c 100%)',
  },
}

const CHAT_HEAD_THEME_IDS = Object.keys(CHAT_HEAD_THEMES) as ChatHeadThemeId[]

function parseChatHeadTheme(raw: string | null): ChatHeadThemeId {
  if (raw && CHAT_HEAD_THEME_IDS.includes(raw as ChatHeadThemeId)) return raw as ChatHeadThemeId
  return 'verde'
}

type Props = {
  /** Total não lidas (sidebar do layout); reutilizado no FAB. */
  naoLidasBadge: number
}

export function ChatInternoFloating({ naoLidasBadge }: Props) {
  const { open, setOpen, pendingUserId, clearPendingUserId } = useChatFloat()
  const { isOnline } = usePresencaAoVivo()

  const [meuId, setMeuId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [tab, setTab] = useState<'conversas' | 'pessoas'>('conversas')
  const [busca, setBusca] = useState('')

  const [usuarios, setUsuarios] = useState<ChatUsuarioLista[]>([])
  const [conversas, setConversas] = useState<ChatConversaLista[]>([])
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [atualizandoPessoasTab, setAtualizandoPessoasTab] = useState(false)

  const [conversaId, setConversaId] = useState<string | null>(null)
  const [outroIdPainel, setOutroIdPainel] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [abrindoComPessoa, setAbrindoComPessoa] = useState(false)

  const [temaCabecalho, setTemaCabecalho] = useState<ChatHeadThemeId>(() =>
    typeof window !== 'undefined' ? parseChatHeadTheme(localStorage.getItem(CHAT_HEAD_THEME_STORAGE_KEY)) : 'verde'
  )
  const [menuTemaAberto, setMenuTemaAberto] = useState(false)
  const menuTemaRef = useRef<HTMLDivElement | null>(null)

  const aplicarTemaCabecalho = useCallback((id: ChatHeadThemeId) => {
    setTemaCabecalho(id)
    setMenuTemaAberto(false)
    try {
      localStorage.setItem(CHAT_HEAD_THEME_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!menuTemaAberto) return
    const onDown = (e: MouseEvent) => {
      if (menuTemaRef.current && !menuTemaRef.current.contains(e.target as Node)) {
        setMenuTemaAberto(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuTemaAberto])

  const channelThreadRef = useRef<RealtimeChannel | null>(null)
  const channelListRef = useRef<RealtimeChannel | null>(null)
  const conversaIdRef = useRef<string | null>(null)
  const meuIdRef = useRef<string | null>(null)
  useEffect(() => {
    conversaIdRef.current = conversaId
  }, [conversaId])

  useEffect(() => {
    meuIdRef.current = meuId
  }, [meuId])

  const recarregarConversas = useCallback(async () => {
    const uid = meuIdRef.current
    if (!uid) return
    try {
      const list = await chatCarregarConversas(uid)
      setConversas(list)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    let cancel = false
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancel) return
      setMeuId(user.id)
    })()
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!meuId || !open) return
    let cancel = false
    void (async () => {
      setCarregandoLista(true)
      setErro('')
      try {
        const [u, c] = await Promise.all([chatListarUsuariosAtivos(meuId), chatCarregarConversas(meuId)])
        if (cancel) return
        setUsuarios(u)
        setConversas(c)
      } catch (e) {
        if (!cancel) {
          setErro(e instanceof Error ? e.message : 'Erro ao carregar o chat.')
        }
      } finally {
        if (!cancel) setCarregandoLista(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [meuId, open])

  const usuariosPorId = useMemo(() => {
    const m = new Map<string, ChatUsuarioLista>()
    for (const u of usuarios) m.set(u.id, u)
    return m
  }, [usuarios])

  const usuariosFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return usuarios
    return usuarios.filter((u) => {
      const nome = (u.nome || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      const cargo = (u.cargo || '').toLowerCase()
      return nome.includes(t) || email.includes(t) || cargo.includes(t)
    })
  }, [usuarios, busca])

  const handleTab = useCallback(
    (t: 'conversas' | 'pessoas') => {
      setTab(t)
      if (t !== 'pessoas' || !meuId) return
      setAtualizandoPessoasTab(true)
      setErro('')
      void chatListarUsuariosAtivos(meuId)
        .then(setUsuarios)
        .catch((e) => {
          setErro(e instanceof Error ? e.message : 'Erro ao carregar a lista de pessoas.')
        })
        .finally(() => setAtualizandoPessoasTab(false))
    },
    [meuId]
  )

  const carregandoPainelLateral =
    tab === 'conversas' ? carregandoLista : carregandoLista || atualizandoPessoasTab

  const conversasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return conversas
    return conversas.filter((c) => {
      const u = usuariosPorId.get(c.outro_id)
      const nome = (u?.nome || u?.email || '').toLowerCase()
      return nome.includes(t)
    })
  }, [conversas, busca, usuariosPorId])

  useEffect(() => {
    if (!meuId || !open) return

    const ch = supabase
      .channel('chat-float-usuarios-presenca')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'usuarios' },
        (payload) => {
          const row = payload.new as { id?: string; presenca_status?: string | null }
          if (!row?.id) return
          setUsuarios((prev) =>
            prev.map((u) =>
              u.id === row.id ? { ...u, presenca_status: row.presenca_status ?? u.presenca_status } : u
            )
          )
        }
      )
      .subscribe()

    return () => {
      void ch.unsubscribe()
    }
  }, [meuId, open])

  useEffect(() => {
    if (!meuId || !open) return

    const ch = supabase
      .channel('chat-float-mensagens-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensagens' },
        () => {
          void recarregarConversas()
        }
      )
      .subscribe()

    channelListRef.current = ch
    return () => {
      void ch.unsubscribe()
      channelListRef.current = null
    }
  }, [meuId, open, recarregarConversas])

  useEffect(() => {
    void channelThreadRef.current?.unsubscribe()
    channelThreadRef.current = null

    if (!conversaId || !open) {
      queueMicrotask(() => setMensagens([]))
      return
    }

    let cancel = false
    void (async () => {
      try {
        const list = await chatCarregarMensagens(conversaId)
        if (!cancel) setMensagens(list)
        const uid = meuIdRef.current
        if (uid) await chatMarcarLida(conversaId, uid)
        if (!cancel) void recarregarConversas()
      } catch (e) {
        console.error(e)
      }
    })()

    const ch = supabase
      .channel(`chat-float-thread-${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_mensagens',
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const row = payload.new as ChatMensagem
          setMensagens((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev
            return [...prev, row]
          })
          const uid = meuIdRef.current
          if (uid && conversaIdRef.current === conversaId) {
            void chatMarcarLida(conversaId, uid)
            void recarregarConversas()
          }
        }
      )
      .subscribe()

    channelThreadRef.current = ch

    return () => {
      cancel = true
      void ch.unsubscribe()
      channelThreadRef.current = null
    }
  }, [conversaId, open, recarregarConversas])

  const abrirConversa = useCallback((id: string, opts?: { outroId?: string }) => {
    setConversaId(id)
    setOutroIdPainel(opts?.outroId ?? null)
    setTab('conversas')
  }, [])

  const iniciarComUsuario = useCallback(
    async (outroId: string) => {
      if (!meuId) {
        setErro('Sessão ainda não está pronta. Aguarde um instante e tente de novo.')
        return
      }
      setErro('')
      setAbrindoComPessoa(true)
      try {
        const id = await chatGetOrCreateDirect(outroId)
        await recarregarConversas()
        abrirConversa(id, { outroId })
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível abrir a conversa.')
      } finally {
        setAbrindoComPessoa(false)
      }
    },
    [meuId, recarregarConversas, abrirConversa]
  )

  useEffect(() => {
    if (!open || !meuId || !pendingUserId) return
    if (pendingUserId === meuId) {
      clearPendingUserId()
      return
    }
    const uid = pendingUserId
    clearPendingUserId()
    queueMicrotask(() => {
      void iniciarComUsuario(uid)
    })
  }, [open, meuId, pendingUserId, clearPendingUserId, iniciarComUsuario])

  const conversaNaLista = conversaId ? conversas.find((c) => c.id === conversaId) : undefined
  const outroIdEfectivo = conversaNaLista?.outro_id ?? outroIdPainel ?? null
  const outroMeta = outroIdEfectivo ? usuariosPorId.get(outroIdEfectivo) : undefined
  const outroNome = outroMeta?.nome || outroMeta?.email || 'Conversa'
  const prefOutro = normalizarPresencaStatus(outroMeta?.presenca_status)
  const presencaOutro = !isOnline(outroIdEfectivo) || prefOutro === 'offline' ? 'offline' : prefOutro
  const mostrarThread = Boolean(conversaId && outroIdEfectivo)

  useEffect(() => {
    if (!conversaId || !outroIdPainel) return
    if (conversas.some((c) => c.id === conversaId)) {
      queueMicrotask(() => setOutroIdPainel(null))
    }
  }, [conversaId, conversas, outroIdPainel])

  async function handleEnviarTexto(t: string) {
    if (!conversaId || !meuId) return
    setEnviando(true)
    setErro('')
    try {
      const m = await chatEnviarTexto(conversaId, meuId, t)
      setMensagens((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]))
      await recarregarConversas()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar.')
      throw e
    } finally {
      setEnviando(false)
    }
  }

  async function handleEnviarFicheiro(f: File, legenda: string) {
    if (!conversaId || !meuId) return
    setEnviando(true)
    setErro('')
    try {
      const m = await chatEnviarAnexo(conversaId, meuId, f, legenda)
      setMensagens((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]))
      await recarregarConversas()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar anexo.')
      throw e
    } finally {
      setEnviando(false)
    }
  }

  const fechar = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menuTemaAberto) {
        setMenuTemaAberto(false)
        return
      }
      fechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, fechar, menuTemaAberto])

  const painel = (
    <div className="chat-float-layer">
      {!open ? (
        <button
          type="button"
          className="chat-float-fab"
          title="RG CHAT — abrir conversas"
          aria-label={
            naoLidasBadge > 0
              ? `RG CHAT — ${naoLidasBadge} mensagens não lidas`
              : 'RG CHAT — abrir chat interno'
          }
          aria-expanded={false}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {naoLidasBadge > 0 ? (
            <span className="chat-float-fab__badge" aria-hidden>
              {naoLidasBadge > 99 ? '99+' : naoLidasBadge}
            </span>
          ) : null}
          <RgChatLogo className="chat-float-fab__logo" />
        </button>
      ) : (
        <div className="chat-float-open">
          <div className="chat-float-backdrop" aria-hidden onClick={fechar} />
          <div className="chat-float-sheet" role="dialog" aria-label="CHAT INTERNO">
            <header
              className="chat-float-sheet__head"
              style={{ background: CHAT_HEAD_THEMES[temaCabecalho].gradient }}
            >
              <h2 className="chat-float-sheet__title">CHAT INTERNO</h2>
              <div className="chat-float-sheet__head-logo-wrap">
                <img className="chat-float-sheet__head-logo" src={BRAND_LOGO_MARK} alt="RG Ambiental" decoding="async" />
              </div>
              <div className="chat-float-sheet__head-actions">
                <div className="chat-float-sheet__menu-wrap" ref={menuTemaRef}>
                  <button
                    type="button"
                    className="chat-float-sheet__menu-trigger"
                    aria-label="Cor do cabeçalho do chat"
                    aria-expanded={menuTemaAberto}
                    aria-haspopup="menu"
                    onClick={() => setMenuTemaAberto((v) => !v)}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="12" cy="6" r="1.85" />
                      <circle cx="12" cy="12" r="1.85" />
                      <circle cx="12" cy="18" r="1.85" />
                    </svg>
                  </button>
                  {menuTemaAberto ? (
                    <ul className="chat-float-sheet__theme-menu" role="menu">
                      {CHAT_HEAD_THEME_IDS.map((id) => (
                        <li key={id} role="none">
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={temaCabecalho === id}
                            className="chat-float-sheet__theme-option"
                            onClick={() => aplicarTemaCabecalho(id)}
                          >
                            <span
                              className="chat-float-sheet__theme-swatch"
                              style={{ background: CHAT_HEAD_THEMES[id].gradient }}
                              aria-hidden
                            />
                            {CHAT_HEAD_THEMES[id].label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <button type="button" className="chat-float-sheet__close" aria-label="Fechar chat" onClick={fechar}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>

            {erro ? <div className="chat-float-sheet__alert">{erro}</div> : null}

            <div className="chat-interno-shell chat-interno-shell--float">
              <ChatSidebarPanel
                meuId={meuId || ''}
                isOnline={isOnline}
                tab={tab}
                onTab={handleTab}
                busca={busca}
                onBusca={setBusca}
                conversas={conversasFiltradas}
                usuariosFiltrados={usuariosFiltrados}
                totalUsuariosAtivos={usuarios.length}
                usuariosPorId={usuariosPorId}
                conversaSelecionadaId={conversaId}
                onSelectConversa={(id) => abrirConversa(id)}
                onStartComUsuario={(id) => void iniciarComUsuario(id)}
                carregandoLista={carregandoPainelLateral || abrindoComPessoa}
              />

              {mostrarThread ? (
                <ChatThreadPanel
                  meuId={meuId || ''}
                  outroNome={outroNome}
                  outroFoto={outroMeta?.foto_url ?? null}
                  presencaOutro={presencaOutro}
                  mensagens={mensagens}
                  enviando={enviando}
                  onEnviarTexto={handleEnviarTexto}
                  onEnviarFicheiro={handleEnviarFicheiro}
                />
              ) : (
                <div className="chat-interno-empty-main">
                  <p>Seleccione uma conversa ou escolha uma pessoa para começar.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (typeof document === 'undefined') return null

  return createPortal(painel, document.body)
}
