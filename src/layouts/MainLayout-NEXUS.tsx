import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  type PresencaStatus,
  etiquetaPresenca,
  normalizarPresencaStatus,
} from '../lib/presencaStatus'
import { chatTotalMensagensNaoLidas } from '../lib/chat-NEXUS'
import { ROTAS_SISTEMA, usuarioPodeAcessarRota } from '../lib/paginasSistema'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { ChatInternoFloating } from '../components/chat/ChatInternoFloating'
import SuporteTecnicoFloat from '../components/SuporteTecnicoFloat'
import { BRAND_LOGO_MARK } from '../lib/brandLogo'

type MainLayoutProps = {
  children: ReactNode
}

type UsuarioLogado = {
  nome?: string | null
  email?: string | null
  cargo?: string | null
  foto_url?: string | null
  presenca_status?: string | null
  paginas_permitidas?: string[] | null
}

type MenuLeaf = { label: string; path: string }

/** Item com subitens (ex.: Faturamento → Envio de NF). */
type MenuBranch = { label: string; path: string; children: MenuLeaf[] }

type MenuItem = MenuLeaf | MenuBranch

function isMenuBranch(item: MenuItem): item is MenuBranch {
  return 'children' in item && Array.isArray((item as MenuBranch).children)
}

function flattenMenuLeaves(items: MenuItem[]): MenuLeaf[] {
  const out: MenuLeaf[] = []
  for (const item of items) {
    if (isMenuBranch(item)) {
      out.push({ label: item.label, path: item.path })
      out.push(...item.children)
    } else {
      out.push(item)
    }
  }
  return out
}

const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Visão geral',
    items: [
      { label: 'Bem-vindo', path: '/bem-vindo' },
      { label: 'Dashboard', path: '/dashboard' },
    ],
  },
  {
    title: 'Cadastros',
    items: [
      { label: 'Clientes', path: '/clientes' },
      { label: 'Motoristas', path: '/motoristas' },
      { label: 'Caminhões', path: '/caminhoes' },
    ],
  },
  {
    title: 'Fluxo operacional',
    items: [
      { label: 'Programação', path: '/programacao' },
      { label: 'MTR', path: '/mtr' },
      { label: 'Pesagem e Ticket', path: '/controle-massa' },
      { label: 'Comprovante de Descarte', path: '/comprovantes-descarte' },
      { label: 'Conferência de transportes', path: '/conferencia-transporte' },
    ],
  },
  {
    title: 'Faturamento',
    items: [
      {
        label: 'Faturamento',
        path: '/faturamento',
        children: [
          { label: 'Regras de preço', path: '/faturamento/regras-preco' },
          { label: 'Envio de NF', path: '/envio-nf' },
        ],
      },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      {
        label: 'Financeiro',
        path: '/financeiro',
        children: [{ label: 'Contas a receber', path: '/financeiro/contas-receber' }],
      },
    ],
  },
  {
    title: 'Pós-venda',
    items: [{ label: 'Pós-venda', path: '/pos-venda' }],
  },
  {
    title: 'Sistema',
    items: [{ label: 'Usuários', path: '/usuarios' }],
  },
]

const allMenuItems = menuGroups.flatMap((g) => flattenMenuLeaves(g.items))

/** Itens de menu cujo path pode ter sufixo (/mtr/:id, /controle-massa/:id) usam prefix match. */
const navLinkEndExact = (path: string) =>
  path !== '/mtr' && path !== '/controle-massa' && path !== '/comprovantes-descarte'

function formatarDataHora(date: Date) {
  const data = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return { data, hora }
}

/** Relógio isolado: atualizar a cada segundo não re-renderiza o layout inteiro nem a página. */
function CabecalhoDataHora() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const { data, hora } = useMemo(() => formatarDataHora(agora), [agora])
  return (
    <div className="layout-header-datetime">
      {data}, {hora}
    </div>
  )
}

function obterTituloDaPagina(pathname: string) {
  const ordenados = [...allMenuItems].sort((a, b) => b.path.length - a.path.length)
  const item = ordenados.find(
    (menu) => pathname === menu.path || pathname.startsWith(`${menu.path}/`)
  )
  if (item?.label) return item.label

  const extra = [...ROTAS_SISTEMA].sort((a, b) => b.path.length - a.path.length)
  const sec = extra.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`))
  return sec?.label ?? 'Sistema RG Ambiental'
}

function obterIniciais(nome?: string | null, email?: string | null) {
  const base = (nome || email || 'RG').trim()

  if (!base) return 'RG'

  const partes = base.split(' ').filter(Boolean)

  if (partes.length >= 2) {
    return `${partes[0][0]}${partes[1][0]}`.toUpperCase()
  }

  return base.slice(0, 2).toUpperCase()
}

/** v2: padrão recolhido; chave nova para não herdar estado antigo “tudo aberto”. */
const SIDEBAR_SECTIONS_KEY = 'rg-sidebar-sections-open-v2'

function lerSecoesSidebar(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_SECTIONS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, boolean>
  } catch {
    /* ignore */
  }
  return null
}

function salvarSecoesSidebar(next: Record<string, boolean>) {
  try {
    localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

function filtrarItemMenuPorPaginas(item: MenuItem, u: UsuarioLogado | null): MenuItem | null {
  if (!u) return item
  if (!isMenuBranch(item)) {
    return usuarioPodeAcessarRota(u, item.path) ? item : null
  }
  const ch = item.children.filter((c) => usuarioPodeAcessarRota(u, c.path))
  const parentOk = usuarioPodeAcessarRota(u, item.path)
  if (!parentOk && ch.length === 0) return null
  return { ...item, children: ch }
}

/** Grupo do menu que contém a rota atual (para abrir a secção ao navegar). */
function grupoTituloParaPathAtivo(
  pathname: string,
  groups: { title: string; items: MenuItem[] }[]
): string | null {
  const flat: { item: MenuLeaf; groupTitle: string }[] = []
  for (const g of groups) {
    for (const raw of g.items) {
      if (isMenuBranch(raw)) {
        flat.push({ item: { label: raw.label, path: raw.path }, groupTitle: g.title })
        for (const child of raw.children) {
          flat.push({ item: child, groupTitle: g.title })
        }
      } else {
        flat.push({ item: raw, groupTitle: g.title })
      }
    }
  }
  flat.sort((a, b) => b.item.path.length - a.item.path.length)

  const hit = flat.find(
    ({ item }) => pathname === item.path || pathname.startsWith(`${item.path}/`)
  )
  return hit?.groupTitle ?? null
}

export default function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const pathnameDebounced = useDebouncedValue(location.pathname, 400)

  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null)
  const [presenca, setPresenca] = useState<PresencaStatus>('online')
  const [gravandoPresenca, setGravandoPresenca] = useState(false)
  /** Só há linha em `public.usuarios` para gravar presença. */
  const [temPerfilUsuarios, setTemPerfilUsuarios] = useState(false)
  const [logoCarregou, setLogoCarregou] = useState(true)
  const [fotoIndisponivel, setFotoIndisponivel] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const stored = lerSecoesSidebar()
    const init: Record<string, boolean> = {}
    for (const g of menuGroups) {
      init[g.title] = stored?.[g.title] ?? false
    }
    return init
  })

  const [chatNaoLidas, setChatNaoLidas] = useState(0)
  const [suporteAberto, setSuporteAberto] = useState(false)
  const suportePanelId = useId()

  const atualizarBadgeChat = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setChatNaoLidas(0)
      return
    }
    try {
      const n = await chatTotalMensagensNaoLidas()
      setChatNaoLidas(n)
    } catch {
      setChatNaoLidas(0)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void atualizarBadgeChat()
    })
  }, [pathnameDebounced, atualizarBadgeChat])

  useEffect(() => {
    let cancel = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancel) return

      const ch = supabase.channel('layout-chat-nao-lidas')
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensagens' },
        () => {
          if (!cancel) void atualizarBadgeChat()
        }
      )
      if (user?.id) {
        ch.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_participantes',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            if (!cancel) void atualizarBadgeChat()
          }
        )
      }
      if (cancel) {
        void ch.unsubscribe()
        return
      }
      ch.subscribe()
      channel = ch
    })()

    const intervalo = window.setInterval(() => {
      if (!cancel) void atualizarBadgeChat()
    }, 30000)

    const onFocus = () => {
      if (!cancel) void atualizarBadgeChat()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible' && !cancel) void atualizarBadgeChat()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancel = true
      void channel?.unsubscribe()
      window.clearInterval(intervalo)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [atualizarBadgeChat])

  function alternarSecaoSidebar(titulo: string) {
    setOpenSections((prev) => {
      const aberto = prev[titulo] !== false
      const next = { ...prev, [titulo]: !aberto }
      salvarSecoesSidebar(next)
      return next
    })
  }

  useEffect(() => {
    async function carregarUsuario() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setUsuario(null)
        return
      }

      const { data } = await supabase
        .from('usuarios')
        .select('nome, email, cargo, foto_url, presenca_status, paginas_permitidas')
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        setUsuario(data)
        setTemPerfilUsuarios(true)
        const p = normalizarPresencaStatus(data.presenca_status)
        setPresenca(p)
      } else {
        setTemPerfilUsuarios(false)
        setUsuario({
          nome: user.email || 'Usuário',
          email: user.email || '',
          cargo: '',
        })
        setPresenca('online')
      }
    }

    carregarUsuario()
  }, [])

  async function handlePresencaChange(nextRaw: string) {
    const next = normalizarPresencaStatus(nextRaw)
    if (next === presenca) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const anterior = presenca
    setPresenca(next)
    setGravandoPresenca(true)

    const { error } = await supabase
      .from('usuarios')
      .update({ presenca_status: next })
      .eq('id', user.id)

    setGravandoPresenca(false)

    if (error) {
      console.error(error)
      setPresenca(anterior)
      window.alert('Não foi possível guardar o estado de presença. Tente de novo.')
      return
    }

    setUsuario((prev) => (prev ? { ...prev, presenca_status: next } : prev))
  }

  useEffect(() => {
    queueMicrotask(() => setFotoIndisponivel(false))
  }, [usuario?.foto_url])

  async function handleEscolherFoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      window.alert('Escolha um ficheiro de imagem (JPEG, PNG, WebP ou GIF).')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      window.alert('A imagem deve ter no máximo 5 MB.')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    setEnviandoFoto(true)

    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const extSeguro =
        ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
      const path = `${user.id}/avatar.${extSeguro}`

      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      })

      if (uploadError) {
        console.error(uploadError)
        window.alert(
          'Não foi possível enviar a foto. Aplique a migração do bucket avatars no Supabase ou tente novamente.'
        )
        return
      }

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = publicData.publicUrl

      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ foto_url: publicUrl })
        .eq('id', user.id)

      if (updateError) {
        console.error(updateError)
        window.alert(
          'A foto foi enviada, mas falhou ao gravar o endereço no perfil. Verifique as políticas RLS em usuarios.'
        )
        return
      }

      setUsuario((prev) => {
        if (prev) {
          return { ...prev, foto_url: publicUrl }
        }
        return {
          nome: user.email || 'Usuário',
          email: user.email || '',
          cargo: '',
          foto_url: publicUrl,
        }
      })
      setFotoIndisponivel(false)
    } finally {
      setEnviandoFoto(false)
    }
  }

  async function handleLogout() {
    try {
      if ('caches' in globalThis) {
        const keys = await caches.keys()
        await Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith('rg-') ||
                k.startsWith('workbox-') ||
                k.toLowerCase().includes('supabase'),
            )
            .map((k) => caches.delete(k)),
        )
      }
    } catch {
      /* ignorar falhas de Cache API */
    }
    await supabase.auth.signOut()
    navigate('/')
  }

  const tituloPagina = useMemo(
    () => obterTituloDaPagina(location.pathname),
    [location.pathname]
  )

  const iniciais = useMemo(
    () => obterIniciais(usuario?.nome, usuario?.email),
    [usuario]
  )

  const menuGroupsVisiveis = useMemo(() => {
    const u = usuario
    if (!u) return menuGroups
    return menuGroups
      .map((g) => ({
        ...g,
        items: g.items
          .map((it) => filtrarItemMenuPorPaginas(it, u))
          .filter(Boolean) as MenuItem[],
      }))
      .filter((g) => g.items.length > 0)
  }, [usuario])

  useEffect(() => {
    const titulo = grupoTituloParaPathAtivo(location.pathname, menuGroupsVisiveis)
    if (!titulo) return
    queueMicrotask(() => {
      setOpenSections((prev) => {
        const next: Record<string, boolean> = {}
        for (const g of menuGroups) {
          next[g.title] = g.title === titulo
        }
        const unchanged = menuGroups.every((g) => prev[g.title] === next[g.title])
        if (unchanged) return prev
        salvarSecoesSidebar(next)
        return next
      })
    })
  }, [location.pathname, menuGroupsVisiveis])

  return (
    <div className="layout-root">
      <aside className="layout-sidebar">
        <div className="layout-sidebar__brand">
          <div className="layout-sidebar__logo-row">
            <Link
              to="/bem-vindo"
              className="layout-sidebar__logo-link"
              aria-label="Ir para a página inicial"
            >
              {logoCarregou ? (
                <img
                  className="layout-sidebar__logo-img"
                  src={BRAND_LOGO_MARK}
                  alt="RG Ambiental"
                  onError={() => setLogoCarregou(false)}
                />
              ) : (
                <span className="layout-sidebar__wordmark">RG Ambiental</span>
              )}
            </Link>
          </div>
        </div>

        <div className="layout-sidebar__nav-wrap">
          <nav className="layout-sidebar__groups" aria-label="Navegação principal">
            {menuGroupsVisiveis.map((group) => {
              const secaoAberta = openSections[group.title] !== false
              return (
                <div key={group.title} className="layout-sidebar__group">
                  <button
                    type="button"
                    className="layout-sidebar__group-toggle"
                    aria-expanded={secaoAberta}
                    onClick={() => alternarSecaoSidebar(group.title)}
                  >
                    <span className="layout-sidebar__group-label-bar" aria-hidden />
                    <span className="layout-sidebar__group-title">{group.title}</span>
                    <span className="layout-sidebar__group-chevron" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  {secaoAberta ? (
                    <div className="layout-sidebar__group-items">
                      {group.items.map((item) =>
                        isMenuBranch(item) && item.children.length > 0 ? (
                          <div key={item.path} className="layout-sidebar__nav-branch">
                            <NavLink
                              to={item.path}
                              end={navLinkEndExact(item.path)}
                              className="sidebar-nav-link"
                            >
                              <span className="sidebar-nav-link__label">{item.label}</span>
                            </NavLink>
                            <div className="layout-sidebar__nav-branch-children">
                              {item.children.map((child) => (
                                <NavLink
                                  key={child.path}
                                  to={child.path}
                                  end={navLinkEndExact(child.path)}
                                  className="sidebar-nav-link sidebar-nav-link--nested"
                                >
                                  <span className="sidebar-nav-link__label">{child.label}</span>
                                </NavLink>
                              ))}
                            </div>
                          </div>
                        ) : isMenuBranch(item) && item.children.length === 0 ? (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            end={navLinkEndExact(item.path)}
                            className="sidebar-nav-link"
                          >
                            <span className="sidebar-nav-link__label">{item.label}</span>
                          </NavLink>
                        ) : (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            end={navLinkEndExact(item.path)}
                            className="sidebar-nav-link"
                          >
                            <span className="sidebar-nav-link__label">{item.label}</span>
                          </NavLink>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </nav>
        </div>

        <div className="layout-sidebar__footer">
          <button
            type="button"
            className="layout-sidebar-suporte"
            aria-expanded={suporteAberto}
            aria-controls={suportePanelId}
            title="Suporte técnico"
            onClick={() => {
              setSuporteAberto((v) => !v)
            }}
          >
            <span className="layout-sidebar-suporte__icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.2 12.3c0 .8-.2 1.5-.5 2.2-.3.6-.7 1.2-1.2 1.6-.5.5-1.1.9-1.8 1.1-.7.3-1.4.4-2.2.4-.8 0-1.5-.1-2.2-.4-.7-.3-1.3-.6-1.8-1.1s-.9-1-1.2-1.6c-.3-.7-.5-1.4-.5-2.2" />
                <path d="M15 13a3 3 0 1 0-6 0" />
                <path d="M12 19v3" />
                <path d="M8 22h8" />
                <path d="M4.9 4.9C6.8 3 9.3 2 12 2s5.2 1 7.1 2.9L12 12 4.9 4.9z" />
              </svg>
            </span>
            Suporte técnico
          </button>
          <p
            className="layout-sidebar-version"
            aria-label={`Versão do sistema ${import.meta.env.VITE_APP_VERSION}`}
          >
            v{import.meta.env.VITE_APP_VERSION}
          </p>
        </div>
      </aside>

      <div className="layout-main">
        <header className="layout-header">
          <div className="layout-header-left">
            <nav className="layout-breadcrumb" aria-label="Trilha de navegação">
              <Link to="/bem-vindo">Início</Link>
            </nav>
            <h1 className="layout-title">{tituloPagina}</h1>
            <p className="layout-tagline">RG Ambiental</p>
          </div>

          <div className="layout-header-search">
            <div className="layout-search-wrap">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"
                />
              </svg>
              <input
                type="search"
                className="layout-search-input"
                placeholder="Buscar no sistema..."
                aria-label="Buscar no sistema"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="layout-header-actions">
            <select
              className={`layout-presenca-select layout-presenca-select--${presenca}`}
              value={presenca}
              disabled={gravandoPresenca || !temPerfilUsuarios}
              onChange={(e) => void handlePresencaChange(e.target.value)}
              aria-label="O seu estado de presença"
              title={etiquetaPresenca(presenca)}
            >
              <option value="online">{etiquetaPresenca('online')}</option>
              <option value="ausente">{etiquetaPresenca('ausente')}</option>
              <option value="offline">{etiquetaPresenca('offline')}</option>
            </select>

            <CabecalhoDataHora />

            <div className="layout-user-block">
              <div className="layout-user-name">
                {usuario?.nome || usuario?.email || 'Usuário'}
              </div>
              <div className="layout-user-role">{usuario?.cargo || 'Administrador'}</div>
            </div>

            <input
              ref={inputFotoRef}
              type="file"
              className="layout-avatar-file-input"
              accept="image/jpeg,image/png,image/webp,image/gif"
              aria-hidden
              tabIndex={-1}
              onChange={handleEscolherFoto}
            />
            <button
              type="button"
              className={`layout-avatar layout-avatar--interactive layout-avatar--presenca-${presenca}`}
              disabled={enviandoFoto}
              title="Alterar foto de perfil"
              aria-label="Alterar foto de perfil"
              onClick={() => inputFotoRef.current?.click()}
            >
              {usuario?.foto_url && !fotoIndisponivel ? (
                <img
                  src={usuario.foto_url}
                  alt=""
                  className="layout-avatar__img"
                  onError={() => setFotoIndisponivel(true)}
                />
              ) : (
                <span className="layout-avatar__initials">{iniciais}</span>
              )}
            </button>

            <button type="button" onClick={handleLogout} className="layout-btn-sair">
              Sair
            </button>
          </div>
        </header>

        <main className="layout-main-scroll">
          <div className="layout-main-scroll-inner">{children}</div>
        </main>
      </div>

      <SuporteTecnicoFloat
        open={suporteAberto}
        onOpenChange={setSuporteAberto}
        panelId={suportePanelId}
      />

      <ChatInternoFloating naoLidasBadge={chatNaoLidas} />
    </div>
  )
}