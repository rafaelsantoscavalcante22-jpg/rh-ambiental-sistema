import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

import Login from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const ChecklistTransporte = lazy(() => import('./pages/ChecklistTransporte'))
const ConferenciaTransporte = lazy(() => import('./pages/ConferenciaTransporte'))
const TicketOperacional = lazy(() => import('./pages/TicketOperacional'))
const AprovacaoDiretoria = lazy(() => import('./pages/AprovacaoDiretoria'))
const FaturamentoOperacional = lazy(() => import('./pages/FaturamentoOperacional'))
const Programacao = lazy(() => import('./pages/Programacao'))
const MTR = lazy(() => import('./pages/MTR'))
const ControleMassa = lazy(() => import('./pages/ControleMassa'))
const Chat = lazy(() => import('./pages/Chat'))

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

type UsuarioPerfil = {
  id: string
  nome: string
  email: string
  cargo: string
  status: string
  foto_url?: string | null
}

type ProtectedRouteProps = {
  session: Session | null
  usuario: UsuarioPerfil | null
  carregandoUsuario: boolean
  allowedRoles: string[]
  children: React.ReactNode
}

function ProtectedRoute({
  session,
  usuario,
  carregandoUsuario,
  allowedRoles,
  children,
}: ProtectedRouteProps) {
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

  if (!allowedRoles.includes(usuario.cargo)) {
    return <Navigate to="/dashboard" replace />
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

/**
 * Mesmos perfis do Dashboard: o menu «Seguimento da coleta» deve abrir para todos.
 * Quem pode editar em cada etapa continua definido em workflowPermissions / UI.
 */
const ROLES_SEGUIMENTO_COLETA = [
  'Administrador',
  'Operacional',
  'Logística',
  'Balanceiro',
  'Diretoria',
  'Faturamento',
  'Financeiro',
  'Visualizador',
] as const

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [usuario, setUsuario] = useState<UsuarioPerfil | null>(null)
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
        .select('id, nome, email, cargo, status, foto_url')
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
    <BrowserRouter>
      <Suspense fallback={routeSuspenseFallback}>
      <Routes>
        {!session ? (
          <>
            <Route path="/" element={<Login />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={[
                    'Administrador',
                    'Operacional',
                    'Logística',
                    'Balanceiro',
                    'Diretoria',
                    'Faturamento',
                    'Financeiro',
                    'Visualizador',
                  ]}
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
                  allowedRoles={[
                    'Administrador',
                    'Operacional',
                    'Logística',
                    'Balanceiro',
                    'Diretoria',
                    'Faturamento',
                    'Financeiro',
                    'Visualizador',
                  ]}
                >
                  <Clientes />
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
                  allowedRoles={['Administrador', 'Operacional', 'Visualizador']}
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
                  allowedRoles={[
                    'Administrador',
                    'Operacional',
                    'Logística',
                    'Balanceiro',
                    'Diretoria',
                    'Faturamento',
                    'Financeiro',
                    'Visualizador',
                  ]}
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
                  allowedRoles={['Administrador', 'Operacional', 'Visualizador']}
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
                  allowedRoles={['Administrador', 'Operacional', 'Visualizador']}
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
                  allowedRoles={['Administrador', 'Operacional', 'Logística', 'Balanceiro', 'Visualizador']}
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
                  allowedRoles={['Administrador', 'Operacional', 'Logística', 'Balanceiro', 'Visualizador']}
                >
                  <ControleMassa />
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
                  allowedRoles={[...ROLES_SEGUIMENTO_COLETA]}
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
                  allowedRoles={[...ROLES_SEGUIMENTO_COLETA]}
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
                  allowedRoles={[...ROLES_SEGUIMENTO_COLETA]}
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
                  allowedRoles={[...ROLES_SEGUIMENTO_COLETA]}
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
                  allowedRoles={[...ROLES_SEGUIMENTO_COLETA]}
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
                  allowedRoles={[...ROLES_SEGUIMENTO_COLETA]}
                >
                  <FaturamentoOperacional />
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
                  allowedRoles={['Administrador', 'Financeiro', 'Faturamento', 'Visualizador']}
                >
                  <Financeiro />
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
                  allowedRoles={['Administrador']}
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
                  allowedRoles={[
                    'Administrador',
                    'Operacional',
                    'Logística',
                    'Balanceiro',
                    'Diretoria',
                    'Faturamento',
                    'Financeiro',
                    'Visualizador',
                  ]}
                >
                  <Chat />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App