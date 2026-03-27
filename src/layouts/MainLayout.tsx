import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type MainLayoutProps = {
  children: React.ReactNode
}

type Notificacao = {
  id: number
  titulo: string
  descricao: string
  horario: string
  lida: boolean
}

type ThemeMode = 'light' | 'dark'

type UsuarioPerfil = {
  id: string
  nome: string
  email: string
  cargo: string
  status: string
}

function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation()

  const [dataHora, setDataHora] = useState('')
  const [abrirNotificacoes, setAbrirNotificacoes] = useState(false)
  const [tema, setTema] = useState<ThemeMode>('light')
  const [usuario, setUsuario] = useState<UsuarioPerfil | null>(null)
  const [carregandoUsuario, setCarregandoUsuario] = useState(true)

  const notificacoesRef = useRef<HTMLDivElement | null>(null)

  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([
    {
      id: 1,
      titulo: 'Nova coleta registrada',
      descricao: 'Uma nova coleta foi cadastrada no sistema.',
      horario: 'Hoje, 09:15',
      lida: false,
    },
    {
      id: 2,
      titulo: 'Cliente atualizado',
      descricao: 'Os dados de um cliente foram alterados.',
      horario: 'Hoje, 10:40',
      lida: false,
    },
    {
      id: 3,
      titulo: 'Operação estável',
      descricao: 'Sistema operando normalmente sem alertas.',
      horario: 'Hoje, 11:05',
      lida: true,
    },
  ])

  useEffect(() => {
    const temaSalvo = localStorage.getItem('rg-tema') as ThemeMode | null

    if (temaSalvo === 'light' || temaSalvo === 'dark') {
      setTema(temaSalvo)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('rg-tema', tema)
  }, [tema])

  useEffect(() => {
    const atualizarHora = () => {
      const agora = new Date()
      const formatado = agora.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      setDataHora(formatado)
    }

    atualizarHora()
    const intervalo = setInterval(atualizarHora, 1000)

    return () => clearInterval(intervalo)
  }, [])

  useEffect(() => {
    async function carregarUsuario() {
      setCarregandoUsuario(true)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.error('Erro ao buscar usuário autenticado:', userError?.message)
        setUsuario(null)
        setCarregandoUsuario(false)
        return
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Erro ao carregar perfil do usuário:', error.message)
      }

      if (data) {
        setUsuario(data)
      } else {
        const nomeFallback =
          user.user_metadata?.nome ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'Usuário'

        setUsuario({
          id: user.id,
          nome: nomeFallback,
          email: user.email || '',
          cargo: 'Usuário',
          status: 'ativo',
        })
      }

      setCarregandoUsuario(false)
    }

    carregarUsuario()
  }, [])

  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (
        notificacoesRef.current &&
        !notificacoesRef.current.contains(event.target as Node)
      ) {
        setAbrirNotificacoes(false)
      }
    }

    document.addEventListener('mousedown', handleClickFora)

    return () => {
      document.removeEventListener('mousedown', handleClickFora)
    }
  }, [])

  function toggleNotificacoes() {
    setAbrirNotificacoes(!abrirNotificacoes)
  }

  function marcarTodasComoLidas() {
    setNotificacoes((prev) =>
      prev.map((notificacao) => ({
        ...notificacao,
        lida: true,
      }))
    )
  }

  function marcarComoLida(id: number) {
    setNotificacoes((prev) =>
      prev.map((notificacao) =>
        notificacao.id === id ? { ...notificacao, lida: true } : notificacao
      )
    )
  }

  function alternarTema() {
    setTema((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      alert('Erro ao sair: ' + error.message)
      return
    }

    window.location.href = '/'
  }

  function obterIniciais(nome: string) {
    if (!nome) return 'RG'

    const partes = nome.trim().split(' ').filter(Boolean)

    if (partes.length === 0) return 'RG'
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()

    return `${partes[0][0]}${partes[1][0]}`.toUpperCase()
  }

  const cargoUsuario = carregandoUsuario ? 'Carregando perfil...' : usuario?.cargo || 'Usuário'
  const nomeUsuario = carregandoUsuario ? 'Carregando...' : usuario?.nome || 'Usuário'
  const iniciaisUsuario = obterIniciais(usuario?.nome || 'RG')

  const menuItemsBase = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Clientes', path: '/clientes' },
    { name: 'Coletas', path: '/coletas' },
    { name: 'MTR', path: '/mtr' },
    { name: 'Financeiro', path: '/financeiro' },
    { name: 'Rotas', path: '/rotas' },
    { name: 'Usuários', path: '/usuarios' },
  ]

  const menuItems = menuItemsBase.filter((item) => {
    if (!usuario?.cargo) return true

    if (usuario.cargo === 'Administrador') return true

    if (usuario.cargo === 'Financeiro') {
      return ['Dashboard', 'Financeiro', 'Clientes'].includes(item.name)
    }

    if (usuario.cargo === 'Operacional') {
      return ['Dashboard', 'Clientes', 'Coletas', 'MTR', 'Rotas'].includes(item.name)
    }

    if (usuario.cargo === 'Visualizador') {
      return ['Dashboard', 'Clientes'].includes(item.name)
    }

    return false
  })

  const notificacoesNaoLidas = notificacoes.filter((n) => !n.lida).length
  const isDark = tema === 'dark'

  const cores = {
    appBg: isDark ? '#0b1220' : '#f1f5f9',
    sidebarBg: '#020617',
    sidebarText: '#ffffff',
    menuText: isDark ? '#cbd5e1' : '#cbd5f5',
    menuHoverBg: isDark ? '#172033' : '#0f172a',
    menuActiveBg: 'linear-gradient(135deg, #22c55e, #16a34a)',
    menuActiveText: '#022c22',
    headerBg: isDark ? '#111827' : '#ffffff',
    headerBorder: isDark ? '#1f2937' : '#e5e7eb',
    titleText: isDark ? '#f8fafc' : '#0f172a',
    subtitleText: isDark ? '#94a3b8' : '#64748b',
    contentBg: isDark ? '#0b1220' : '#f1f5f9',
    cardBorder: isDark ? '#1f2937' : '#e5e7eb',
    notificationBtnBg: isDark ? '#0f172a' : '#f8fafc',
    notificationBtnBorder: isDark ? '#1f2937' : '#e2e8f0',
    notificationPanelBg: isDark ? '#111827' : '#ffffff',
    notificationTitle: isDark ? '#f8fafc' : '#0f172a',
    notificationText: isDark ? '#cbd5e1' : '#475569',
    notificationMuted: isDark ? '#94a3b8' : '#64748b',
    notificationItemUnread: isDark ? '#052e1a' : '#f0fdf4',
    notificationItemRead: isDark ? '#111827' : '#ffffff',
    separator: isDark ? '#1f2937' : '#f1f5f9',
    onlineBg: isDark ? '#14532d' : '#dcfce7',
    onlineText: isDark ? '#bbf7d0' : '#166534',
    avatarBg: '#22c55e',
    avatarText: '#ffffff',
    themeBtnBg: isDark ? '#0f172a' : '#f8fafc',
    themeBtnBorder: isDark ? '#1f2937' : '#e2e8f0',
    themeBtnText: isDark ? '#f8fafc' : '#0f172a',
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: cores.appBg,
        color: cores.titleText,
      }}
    >
      <aside
        style={{
          width: '240px',
          background: cores.sidebarBg,
          color: cores.sidebarText,
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <img
            src="/logo-rg.png"
            alt="RG Ambiental"
            style={{
              width: '200px',
              height: 'auto',
              filter: 'drop-shadow(0 0 6px rgba(34,197,94,0.3))',
            }}
          />
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path

            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  color: isActive ? cores.menuActiveText : cores.menuText,
                  background: isActive ? cores.menuActiveBg : 'transparent',
                  fontWeight: isActive ? '600' : '400',
                  transition: 'all 0.2s ease',
                }}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: '70px',
            background: cores.headerBg,
            borderBottom: `1px solid ${cores.headerBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 30px',
          }}
        >
          <div>
            <div style={{ fontSize: '14px', color: cores.subtitleText }}>
              Sistema RG Ambiental
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: cores.titleText,
              }}
            >
              Painel operacional
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <button
              onClick={alternarTema}
              style={{
                background: cores.themeBtnBg,
                border: `1px solid ${cores.themeBtnBorder}`,
                color: cores.themeBtnText,
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>

            <div
              style={{
                background: cores.onlineBg,
                color: cores.onlineText,
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              Online
            </div>

            <div style={{ fontSize: '13px', color: cores.notificationText }}>
              {dataHora}
            </div>

            <div style={{ position: 'relative' }} ref={notificacoesRef}>
              <button
                onClick={toggleNotificacoes}
                style={{
                  position: 'relative',
                  background: cores.notificationBtnBg,
                  border: `1px solid ${cores.notificationBtnBorder}`,
                  borderRadius: '10px',
                  width: '42px',
                  height: '42px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  color: cores.titleText,
                }}
              >
                🔔

                {notificacoesNaoLidas > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      minWidth: '20px',
                      height: '20px',
                      padding: '0 6px',
                      borderRadius: '999px',
                      background: '#16a34a',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {notificacoesNaoLidas}
                  </span>
                )}
              </button>

              {abrirNotificacoes && (
                <div
                  style={{
                    position: 'absolute',
                    top: '52px',
                    right: '0',
                    width: '360px',
                    background: cores.notificationPanelBg,
                    border: `1px solid ${cores.cardBorder}`,
                    borderRadius: '14px',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14)',
                    overflow: 'hidden',
                    zIndex: 50,
                  }}
                >
                  <div
                    style={{
                      padding: '16px',
                      borderBottom: `1px solid ${cores.cardBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: '700',
                          color: cores.notificationTitle,
                        }}
                      >
                        Notificações
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: cores.notificationMuted,
                          marginTop: '4px',
                        }}
                      >
                        {notificacoesNaoLidas} não lida(s)
                      </div>
                    </div>

                    <button
                      onClick={marcarTodasComoLidas}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#16a34a',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      Marcar todas
                    </button>
                  </div>

                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {notificacoes.length === 0 ? (
                      <div
                        style={{
                          padding: '20px',
                          fontSize: '14px',
                          color: cores.notificationMuted,
                          textAlign: 'center',
                        }}
                      >
                        Nenhuma notificação no momento.
                      </div>
                    ) : (
                      notificacoes.map((notificacao) => (
                        <button
                          key={notificacao.id}
                          onClick={() => marcarComoLida(notificacao.id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: notificacao.lida
                              ? cores.notificationItemRead
                              : cores.notificationItemUnread,
                            border: 'none',
                            borderBottom: `1px solid ${cores.separator}`,
                            padding: '14px 16px',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: '10px',
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: '14px',
                                  fontWeight: '700',
                                  color: cores.notificationTitle,
                                  marginBottom: '4px',
                                }}
                              >
                                {notificacao.titulo}
                              </div>

                              <div
                                style={{
                                  fontSize: '13px',
                                  color: cores.notificationText,
                                  lineHeight: '1.4',
                                }}
                              >
                                {notificacao.descricao}
                              </div>

                              <div
                                style={{
                                  fontSize: '12px',
                                  color: cores.notificationMuted,
                                  marginTop: '8px',
                                }}
                              >
                                {notificacao.horario}
                              </div>
                            </div>

                            {!notificacao.lida && (
                              <span
                                style={{
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '999px',
                                  background: '#16a34a',
                                  marginTop: '4px',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: cores.titleText,
                }}
              >
                {nomeUsuario}
              </div>
              <div style={{ fontSize: '12px', color: cores.subtitleText }}>
                {cargoUsuario}
              </div>
            </div>

            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: cores.avatarBg,
                color: cores.avatarText,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
              }}
            >
              {iniciaisUsuario}
            </div>

            <button
              onClick={handleLogout}
              style={{
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                padding: '10px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Sair
            </button>
          </div>
        </header>

        <main
          style={{
            flex: 1,
            padding: '30px',
            background: cores.contentBg,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout