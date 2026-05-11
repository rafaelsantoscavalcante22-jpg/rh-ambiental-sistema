import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { NEXUS_CARGOS_POR_ROTA } from './lib/nexusCargosPorRota'
import { usuarioPodeAcessarRota } from './lib/paginasSistema'
import { ChatFloatProvider } from './contexts/ChatFloatContext'
import { PerfilUsuarioProvider, type UsuarioPerfilApp } from './contexts/PerfilUsuarioContext'
import { PresencaAoVivoProvider } from './contexts/PresencaAoVivoContext'
import { PwaPremiumShell } from './components/pwa/PwaPremiumShell'

import Login from './pages/Login'
import { lazyWithRetry } from './lib/lazyWithRetry'

const BemVindoNexus = lazyWithRetry(() => import('./pages/BemVindoNexus'))
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'))
const Clientes = lazyWithRetry(() => import('./pages/Clientes'))
const PosVenda = lazyWithRetry(() => import('./pages/PosVenda'))
const Motoristas = lazyWithRetry(() => import('./pages/Motoristas'))
const RepresentantesRG = lazyWithRetry(() => import('./pages/RepresentantesRG'))
const Caminhoes = lazyWithRetry(() => import('./pages/Caminhoes'))
const Financeiro = lazyWithRetry(() => import('./pages/Financeiro'))
const FinanceiroContasReceber = lazyWithRetry(() => import('./pages/FinanceiroContasReceber'))
const FinanceiroContasPagar = lazyWithRetry(() => import('./pages/FinanceiroContasPagar'))
const EnvioNF = lazyWithRetry(() => import('./pages/EnvioNF'))
const Usuarios = lazyWithRetry(() => import('./pages/Usuarios'))
const ChecklistTransporte = lazyWithRetry(() => import('./pages/ChecklistTransporte'))
const ConferenciaTransporte = lazyWithRetry(() => import('./pages/ConferenciaTransporte'))
const TicketOperacional = lazyWithRetry(() => import('./pages/TicketOperacional'))
const AprovacaoDiretoria = lazyWithRetry(() => import('./pages/AprovacaoDiretoria'))
const FaturamentoOperacional = lazyWithRetry(() => import('./pages/FaturamentoOperacional'))
const FaturamentoRegrasPreco = lazyWithRetry(() => import('./pages/FaturamentoRegrasPreco'))
const Programacao = lazyWithRetry(() => import('./pages/Programacao'))
const MTR = lazyWithRetry(() => import('./pages/MTR'))
const ControleMassa = lazyWithRetry(() => import('./pages/ControleMassa'))
const ComprovantesDescarte = lazyWithRetry(() => import('./pages/ComprovantesDescarte'))
const ComprovanteDescarteForm = lazyWithRetry(() => import('./pages/ComprovanteDescarteForm'))
const Chat = lazyWithRetry(() => import('./pages/Chat'))

const routeSuspenseFallback = (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f1f5f9',
      color: '#334155',
      fontSize: '18px',
      fontWeight: 600,
    }}
  >
    Carregando página...
  </div>
)

type ProtectedRouteProps = {
  session: Session | null
  usuario: UsuarioPerfilApp | null
  carregandoUsuario: boolean
  allowedRoles: string[]
  /** Só sessão + perfil ativo; não valida cargo (página inicial Nexus para todos). */
  apenasAutenticado?: boolean
  children: React.ReactNode
}

function ProtectedRoute({
  session,
  usuario,
  carregandoUsuario,
  allowedRoles,
  apenasAutenticado,
  children,
}: ProtectedRouteProps) {
  const location = useLocation()

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (carregandoUsuario) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f1f5f9',
          color: '#334155',
          fontSize: '18px',
          fontWeight: 600,
        }}
      >
        Carregando permissões...
      </div>
    )
  }

  if (!usuario) {
    return <Navigate to="/" replace />
  }

  if (usuario.status !== 'ativo') {
    return <Navigate to="/" replace />
  }

  if (!apenasAutenticado && !allowedRoles.includes(usuario.cargo)) {
    return <Navigate to="/bem-vindo" replace />
  }

  if (!usuarioPodeAcessarRota(usuario, location.pathname)) {
    return <Navigate to="/bem-vindo" replace />
  }

  return <>{children}</>
}

/** Links antigos /coletas?… passam a abrir o hub operacional (Controle de Massa). */
function RedirectColetasParaControleMassa() {
  const { search, hash } = useLocation()
  return <Navigate to={`/controle-massa${search}${hash}`} replace />
}

/** A página «Conferência» operacional foi integrada ao fluxo via Controle de Massa / outras etapas. */
function RedirectConferenciaOperacionalParaControleMassa() {
  const { search } = useLocation()
  return <Navigate to={`/controle-massa${search}`} replace />
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [usuario, setUsuario] = useState<UsuarioPerfilApp | null>(null)
  const [carregandoUsuario, setCarregandoUsuario] = useState(true)

  useEffect(() => {
    async function carregarSessao() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setSession(session)
    }

    carregarSessao()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sessionAtual) => {
      setSession(sessionAtual)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    async function carregarUsuario() {
      if (!session) {
        setUsuario(null)
        setCarregandoUsuario(false)
        return
      }

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
        .select('id, nome, email, cargo, status, foto_url, paginas_permitidas')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Erro ao carregar perfil do usuário:', error.message)
        setUsuario(null)
        setCarregandoUsuario(false)
        return
      }

      if (!data) {
        setUsuario(null)
        setCarregandoUsuario(false)
        return
      }

      setUsuario(data)
      setCarregandoUsuario(false)
    }

    carregarUsuario()
  }, [session])

  if (session === undefined) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f1f5f9',
          color: '#334155',
          fontSize: '18px',
          fontWeight: 600,
        }}
      >
        Carregando sistema...
      </div>
    )
  }

  return (
    <PerfilUsuarioProvider value={{ usuario, carregandoUsuario }}>
      <BrowserRouter>
        <PwaPremiumShell />
        <ChatFloatProvider>
          <PresencaAoVivoProvider>
            <Suspense fallback={routeSuspenseFallback}>
              <Routes>
        {!session ? (
          <>
            <Route path="/" element={<Login />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Navigate to="/bem-vindo" replace />} />

            <Route
              path="/bem-vindo"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[]}
                  apenasAutenticado
                >
                  <BemVindoNexus />
                </ProtectedRoute>
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/dashboard']]}
                >
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/clientes"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/clientes']]}
                >
                  <Clientes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/pos-venda"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/pos-venda']]}
                >
                  <PosVenda />
                </ProtectedRoute>
              }
            />

            <Route
              path="/motoristas"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/motoristas']]}
                >
                  <Motoristas />
                </ProtectedRoute>
              }
            />

            <Route
              path="/representantes-rg"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/representantes-rg']]}
                >
                  <RepresentantesRG />
                </ProtectedRoute>
              }
            />

            <Route
              path="/caminhoes"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/caminhoes']]}
                >
                  <Caminhoes />
                </ProtectedRoute>
              }
            />

            <Route
              path="/programacao"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/programacao']]}
                >
                  <Programacao />
                </ProtectedRoute>
              }
            />

            <Route
              path="/coletas"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/controle-massa']]}
                >
                  <RedirectColetasParaControleMassa />
                </ProtectedRoute>
              }
            />

            <Route
              path="/mtr"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/mtr']]}
                >
                  <MTR />
                </ProtectedRoute>
              }
            />

            <Route
              path="/mtr/:coletaId"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/mtr']]}
                >
                  <MTR />
                </ProtectedRoute>
              }
            />

            <Route
              path="/controle-massa"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/controle-massa']]}
                >
                  <ControleMassa />
                </ProtectedRoute>
              }
            />

            <Route
              path="/controle-massa/:coletaId"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/controle-massa']]}
                >
                  <ControleMassa />
                </ProtectedRoute>
              }
            />

            <Route
              path="/comprovantes-descarte"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/comprovantes-descarte']]}
                >
                  <ComprovantesDescarte />
                </ProtectedRoute>
              }
            />

            <Route
              path="/comprovantes-descarte/novo"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/comprovantes-descarte']]}
                >
                  <ComprovanteDescarteForm />
                </ProtectedRoute>
              }
            />

            <Route
              path="/comprovantes-descarte/:id/editar"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/comprovantes-descarte']]}
                >
                  <ComprovanteDescarteForm />
                </ProtectedRoute>
              }
            />

            <Route
              path="/comprovantes-descarte/:id"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/comprovantes-descarte']]}
                >
                  <ComprovanteDescarteForm />
                </ProtectedRoute>
              }
            />

            <Route
              path="/checklist-transporte"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/checklist-transporte']]}
                >
                  <ChecklistTransporte />
                </ProtectedRoute>
              }
            />

            <Route
              path="/conferencia-transporte"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/conferencia-transporte']]}
                >
                  <ConferenciaTransporte />
                </ProtectedRoute>
              }
            />

            <Route
              path="/conferencia-operacional"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/controle-massa']]}
                >
                  <RedirectConferenciaOperacionalParaControleMassa />
                </ProtectedRoute>
              }
            />

            <Route
              path="/ticket-operacional"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/ticket-operacional']]}
                >
                  <TicketOperacional />
                </ProtectedRoute>
              }
            />

            <Route
              path="/aprovacao"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/aprovacao']]}
                >
                  <AprovacaoDiretoria />
                </ProtectedRoute>
              }
            />

            <Route
              path="/faturamento"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/faturamento']]}
                >
                  <FaturamentoOperacional />
                </ProtectedRoute>
              }
            />

            <Route
              path="/faturamento/regras-preco"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/faturamento/regras-preco']]}
                >
                  <FaturamentoRegrasPreco />
                </ProtectedRoute>
              }
            />

            <Route
              path="/financeiro"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/financeiro']]}
                >
                  <Financeiro />
                </ProtectedRoute>
              }
            />

            <Route
              path="/financeiro/contas-receber"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/financeiro/contas-receber']]}
                >
                  <FinanceiroContasReceber />
                </ProtectedRoute>
              }
            />

            <Route
              path="/financeiro/contas-pagar"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/financeiro/contas-pagar']]}
                >
                  <FinanceiroContasPagar />
                </ProtectedRoute>
              }
            />

            <Route
              path="/envio-nf"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/envio-nf']]}
                >
                  <EnvioNF />
                </ProtectedRoute>
              }
            />

            <Route
              path="/usuarios"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/usuarios']]}
                >
                  <Usuarios />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chat"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[...NEXUS_CARGOS_POR_ROTA['/chat']]}
                >
                  <Chat />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/bem-vindo" replace />} />
          </>
        )}
              </Routes>
            </Suspense>
          </PresencaAoVivoProvider>
        </ChatFloatProvider>
    </BrowserRouter>
    </PerfilUsuarioProvider>
  )
}

export default App