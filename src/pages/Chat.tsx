import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import {
  chatCarregarConversas,
  chatCarregarMensagens,
  chatEnviarAnexo,
  chatEnviarTexto,
  chatGetOrCreateDirect,
  chatListarUsuariosAtivos,
  chatMarcarLida,
} from '../lib/chat'
import { normalizarPresencaStatus } from '../lib/presencaStatus'
import type { ChatConversaLista, ChatMensagem, ChatUsuarioLista } from '../types/chat'
import { ChatSidebarPanel } from '../components/chat/ChatSidebarPanel'
import { ChatThreadPanel } from '../components/chat/ChatThreadPanel'

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [meuId, setMeuId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [tab, setTab] = useState<'conversas' | 'pessoas'>('conversas')
  const [busca, setBusca] = useState('')

  const [usuarios, setUsuarios] = useState<ChatUsuarioLista[]>([])
  const [conversas, setConversas] = useState<ChatConversaLista[]>([])
  const [carregandoLista, setCarregandoLista] = useState(true)
  /** Ao abrir o separador «Pessoas», volta a puxar a lista completa do servidor. */
  const [atualizandoPessoasTab, setAtualizandoPessoasTab] = useState(false)

  const [conversaId, setConversaId] = useState<string | null>(null)
  /** Quando a conversa ainda não entrou em `conversas` (ex.: recarregar falhou em silêncio), mantém o interlocutor. */
  const [outroIdPainel, setOutroIdPainel] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [abrindoComPessoa, setAbrindoComPessoa] = useState(false)

  const channelThreadRef = useRef<RealtimeChannel | null>(null)
  const channelListRef = useRef<RealtimeChannel | null>(null)
  const conversaIdRef = useRef<string | null>(null)
  const meuIdRef = useRef<string | null>(null)
  const lastOpenParamRef = useRef<string | null>(null)

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
    if (!meuId) return
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
  }, [meuId])

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
    if (!meuId) return

    const ch = supabase
      .channel('chat-usuarios-presenca')
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
  }, [meuId])

  useEffect(() => {
    if (!meuId) return

    const ch = supabase
      .channel('chat-mensagens-global')
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
  }, [meuId, recarregarConversas])

  useEffect(() => {
    void channelThreadRef.current?.unsubscribe()
    channelThreadRef.current = null

    if (!conversaId) {
      setMensagens([])
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
      .channel(`chat-thread-${conversaId}`)
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
  }, [conversaId, recarregarConversas])

  const abrirConversa = useCallback(
    (id: string, opts?: { outroId?: string }) => {
      setConversaId(id)
      setOutroIdPainel(opts?.outroId ?? null)
      setTab('conversas')
      setSearchParams({}, { replace: true })
    },
    [setSearchParams]
  )

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
        lastOpenParamRef.current = null
        setErro(e instanceof Error ? e.message : 'Não foi possível abrir a conversa.')
      } finally {
        setAbrindoComPessoa(false)
      }
    },
    [meuId, recarregarConversas, abrirConversa]
  )

  useEffect(() => {
    const uid = searchParams.get('u')
    if (!uid) {
      lastOpenParamRef.current = null
      return
    }
    if (!meuId || uid === meuId) return
    if (lastOpenParamRef.current === uid) return
    lastOpenParamRef.current = uid
    void iniciarComUsuario(uid)
  }, [searchParams, meuId, iniciarComUsuario])

  const conversaNaLista = conversaId ? conversas.find((c) => c.id === conversaId) : undefined
  const outroIdEfectivo = conversaNaLista?.outro_id ?? outroIdPainel ?? null
  const outroMeta = outroIdEfectivo ? usuariosPorId.get(outroIdEfectivo) : undefined
  const outroNome = outroMeta?.nome || outroMeta?.email || 'Conversa'
  const presencaOutro = normalizarPresencaStatus(outroMeta?.presenca_status)
  const mostrarThread = Boolean(conversaId && outroIdEfectivo)

  useEffect(() => {
    if (!conversaId || !outroIdPainel) return
    if (conversas.some((c) => c.id === conversaId)) setOutroIdPainel(null)
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

  return (
    <MainLayout>
      <div className="page-shell chat-interno-page">
        <div className="chat-interno-head">
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>Chat Interno</h1>
          <p className="page-header__lead" style={{ margin: '6px 0 0' }}>
            Conversas privadas entre utilizadores autenticados, com anexos e actualização em tempo real.
          </p>
        </div>

        {erro ? <div className="chat-interno-alert">{erro}</div> : null}

        <div className="chat-interno-shell">
          <ChatSidebarPanel
            meuId={meuId || ''}
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
    </MainLayout>
  )
}
