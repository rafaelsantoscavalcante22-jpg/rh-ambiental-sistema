import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import {
  primeiraRotaOperacionalPermitida,
  usuarioPodeAcessarRota,
  type UsuarioComPaginas,
} from '../lib/paginasSistema'
import { BRAND_WELCOME_LOGO } from '../lib/brandLogo'

type PerfilBemVindo = UsuarioComPaginas & { nome?: string | null }

export default function BemVindoNexus() {
  const [perfil, setPerfil] = useState<PerfilBemVindo | null>(null)
  const [logoSrc, setLogoSrc] = useState(BRAND_WELCOME_LOGO)

  useEffect(() => {
    let cancel = false
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancel) return
      const { data } = await supabase
        .from('usuarios')
        .select('nome, email, paginas_permitidas')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancel) setPerfil((data as PerfilBemVindo) || { email: user.email })
    })()
    return () => {
      cancel = true
    }
  }, [])

  const podeDashboard = useMemo(
    () => (perfil ? usuarioPodeAcessarRota(perfil, '/dashboard') : false),
    [perfil]
  )

  const proximaRota = useMemo(() => {
    if (!perfil) return null
    const p = primeiraRotaOperacionalPermitida(perfil)
    if (!p || p === '/dashboard') return null
    return p
  }, [perfil])

  const nomeExibir = (perfil?.nome || perfil?.email?.split('@')[0] || 'Utilizador').trim() || 'Utilizador'

  return (
    <MainLayout>
      <div className="welcome-nexus">
        <div className="welcome-nexus__glow" aria-hidden />
        <div className="welcome-nexus__grid" aria-hidden />

        <div className="welcome-nexus__inner">
          <div className="welcome-nexus__hero">
            <div className="welcome-nexus__logo-stack">
              <img
                className="welcome-nexus__logo-rg welcome-nexus__logo-rg--hero"
                src={logoSrc}
                alt="RG Ambiental"
                width={1024}
                height={152}
                decoding="async"
                fetchPriority="high"
                onError={() => setLogoSrc(BRAND_WELCOME_LOGO)}
              />
            </div>
          </div>

          <h1 className="welcome-nexus__title">
            <span className="welcome-nexus__title-welcome">Bem-vindo</span>,{' '}
            <span className="welcome-nexus__title-name">{nomeExibir}</span>
          </h1>
          <p className="welcome-nexus__lead">
            Centralização de dados, padronização do fluxo e automação de processos.
          </p>

          <div className="welcome-nexus__rule" aria-hidden />

          <div className="welcome-nexus__actions">
            {podeDashboard ? (
              <Link className="welcome-nexus__btn welcome-nexus__btn--primary" to="/dashboard">
                Acessar dashboard
              </Link>
            ) : null}
            {proximaRota ? (
              <Link className="welcome-nexus__btn welcome-nexus__btn--secondary" to={proximaRota}>
                Ir às minhas áreas
              </Link>
            ) : null}
            {!podeDashboard && !proximaRota ? (
              <span className="welcome-nexus__hint">
                Utilize o menu lateral para navegar nas áreas disponíveis para o seu perfil.
              </span>
            ) : null}
          </div>

          <p className="welcome-nexus__version" role="status">
            Versão do sistema: <strong>{import.meta.env.VITE_APP_VERSION}</strong>
          </p>

          <div className="welcome-nexus__nexus-footer">
            <div className="welcome-nexus__by-nexus">
              <span className="welcome-nexus__by-tiny">BY</span>
              <span className="welcome-nexus__nexus-name">NEXUS</span>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
