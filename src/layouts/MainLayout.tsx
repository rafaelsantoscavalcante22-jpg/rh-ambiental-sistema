import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type MainLayoutProps = {
  children: ReactNode
}

type UsuarioLogado = {
  nome?: string | null
  email?: string | null
  cargo?: string | null
  foto_url?: string | null
}

type MenuItem = { label: string; path: string }

const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Visão geral',
    items: [{ label: 'Dashboard', path: '/dashboard' }],
  },
  {
    title: 'Cadastros',
    items: [{ label: 'Clientes', path: '/clientes' }],
  },
  {
    title: 'Fluxo operacional',
    items: [
      { label: 'Programação', path: '/programacao' },
      { label: 'MTR', path: '/mtr' },
      { label: 'Controle de Massa', path: '/controle-massa' },
    ],
  },
  {
    title: 'Seguimento da coleta',
    items: [
      { label: 'Conferência de transportes', path: '/conferencia-transporte' },
      { label: 'Aprovação', path: '/aprovacao' },
      { label: 'Faturamento', path: '/faturamento' },
    ],
  },
  {
    title: 'Financeiro',
    items: [{ label: 'Financeiro', path: '/financeiro' }],
  },
  {
    title: 'Sistema',
    items: [{ label: 'Usuários', path: '/usuarios' }],
  },
]

const allMenuItems = menuGroups.flatMap((g) => g.items)

/** Itens de menu cujo path pode ter sufixo (/mtr/:id, /controle-massa/:id) usam prefix match. */
const navLinkEndExact = (path: string) =>
  path !== '/mtr' && path !== '/controle-massa'

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
  return item?.label || 'Sistema RG Ambiental'
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

const SIDEBAR_SECTIONS_KEY = 'rg-sidebar-sections-open'

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

/** Grupo do menu que contém a rota atual (para abrir a secção ao navegar). */
function grupoTituloParaPathAtivo(pathname: string): string | null {
  const ordenados = [...menuGroups].flatMap((g) =>
    g.items.map((item) => ({ item, groupTitle: g.title }))
  )
  ordenados.sort((a, b) => b.item.path.length - a.item.path.length)

  const hit = ordenados.find(
    ({ item }) => pathname === item.path || pathname.startsWith(`${item.path}/`)
  )
  return hit?.groupTitle ?? null
}

export default function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null)
  const [logoCarregou, setLogoCarregou] = useState(true)
  const [fotoIndisponivel, setFotoIndisponivel] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const stored = lerSecoesSidebar()
    const init: Record<string, boolean> = {}
    for (const g of menuGroups) {
      init[g.title] = stored?.[g.title] ?? true
    }
    return init
  })

  useEffect(() => {
    const titulo = grupoTituloParaPathAtivo(location.pathname)
    if (!titulo) return
    setOpenSections((prev) => {
      if (prev[titulo] !== false) return prev
      const next = { ...prev, [titulo]: true }
      salvarSecoesSidebar(next)
      return next
    })
  }, [location.pathname])

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
        .select('nome, email, cargo, foto_url')
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        setUsuario(data)
      } else {
        setUsuario({
          nome: user.email || 'Usuário',
          email: user.email || '',
          cargo: '',
        })
      }
    }

    carregarUsuario()
  }, [])

  useEffect(() => {
    setFotoIndisponivel(false)
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

  return (
    <div className="layout-root">
      <aside className="layout-sidebar">
        <div className="layout-sidebar__brand">
          <div className="layout-sidebar__logo-row">
            {logoCarregou ? (
              <img
                className="layout-sidebar__logo-img"
                src="/logo-rg.png"
                alt="RG Ambiental"
                onError={() => setLogoCarregou(false)}
              />
            ) : (
              <span className="layout-sidebar__wordmark">RG Ambiental</span>
            )}
          </div>
          <div className="layout-sidebar__eyebrow">Painel operacional</div>
        </div>

        <div className="layout-sidebar__nav-wrap">
          <nav className="layout-sidebar__groups" aria-label="Navegação principal">
            {menuGroups.map((group) => {
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
                      {group.items.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={navLinkEndExact(item.path)}
                          className="sidebar-nav-link"
                        >
                          {item.label}
                        </NavLink>
                      ))}
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
            onClick={handleLogout}
            className="layout-sidebar-logout"
          >
            Sair da conta
          </button>
        </div>
      </aside>

      <div className="layout-main">
        <header className="layout-header">
          <div className="layout-header-left">
            <nav className="layout-breadcrumb" aria-label="Trilha de navegação">
              <Link to="/dashboard">Início</Link>
            </nav>
            <h1 className="layout-title">{tituloPagina}</h1>
            <p className="layout-tagline">RG Ambiental · Painel operacional</p>
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
            <div className="layout-pill layout-pill--success">Online</div>

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
              className="layout-avatar layout-avatar--interactive"
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
    </div>
  )
}