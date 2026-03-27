import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import Coletas from './pages/Coletas'
import MTR from './pages/MTR'
import Financeiro from './pages/Financeiro'
import Rotas from './pages/Rotas'
import Usuarios from './pages/Usuarios'

type UsuarioPerfil = {
  id: string
  nome: string
  email: string
  cargo: string
  status: string
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
        .select('*')
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
                    'Financeiro',
                    'Visualizador',
                  ]}
                >
                  <Clientes />
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
                  allowedRoles={['Administrador', 'Operacional']}
                >
                  <Coletas />
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
                  allowedRoles={['Administrador', 'Operacional']}
                >
                  <MTR />
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
                  allowedRoles={['Administrador', 'Financeiro']}
                >
                  <Financeiro />
                </ProtectedRoute>
              }
            />

            <Route
              path="/rotas"
              element={
                <ProtectedRoute
                  session={session}
                  usuario={usuario}
                  carregandoUsuario={carregandoUsuario}
                  allowedRoles={['Administrador', 'Operacional']}
                >
                  <Rotas />
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

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App