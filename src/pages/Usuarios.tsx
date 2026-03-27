import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

type Usuario = {
  id: string
  nome: string
  email: string
  cargo: string
  status: string
  created_at: string | null
}

type FormState = {
  nome: string
  email: string
  senha: string
  cargo: string
}

const CARGOS = [
  'Administrador',
  'Operacional',
  'Financeiro',
  'Visualizador',
]

const estadoInicialFormulario: FormState = {
  nome: '',
  email: '',
  senha: '',
  cargo: 'Financeiro',
}

function formatarData(data: string | null) {
  if (!data) return '-'

  const d = new Date(data)

  if (Number.isNaN(d.getTime())) return '-'

  return d.toLocaleString('pt-BR')
}

function normalizarStatus(status: string) {
  const valor = String(status || '').toLowerCase()

  if (valor === 'ativo') return 'Ativo'
  if (valor === 'inativo') return 'Inativo'
  if (valor === 'bloqueado') return 'Bloqueado'

  return status || '-'
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loadingLista, setLoadingLista] = useState(false)
  const [loadingCriacao, setLoadingCriacao] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [formularioAberto, setFormularioAberto] = useState(false)

  const [form, setForm] = useState<FormState>(estadoInicialFormulario)
  const [busca, setBusca] = useState('')

  const totalUsuarios = useMemo(() => usuarios.length, [usuarios])

  const totalAtivos = useMemo(() => {
    return usuarios.filter((u) => String(u.status).toLowerCase() === 'ativo').length
  }, [usuarios])

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    if (!termo) return usuarios

    return usuarios.filter((usuario) => {
      return (
        (usuario.nome || '').toLowerCase().includes(termo) ||
        (usuario.email || '').toLowerCase().includes(termo) ||
        (usuario.cargo || '').toLowerCase().includes(termo) ||
        (usuario.status || '').toLowerCase().includes(termo)
      )
    })
  }, [busca, usuarios])

  async function carregarUsuarios() {
    try {
      setLoadingLista(true)
      setErro('')

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, cargo, status, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setUsuarios((data || []) as Usuario[])
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar usuários.')
    } finally {
      setLoadingLista(false)
    }
  }

  useEffect(() => {
    carregarUsuarios()
  }, [])

  async function extrairErroDaEdgeFunction(error: unknown) {
    if (error instanceof FunctionsHttpError) {
      try {
        const response = error.context
        const payload = await response.json()

        if (payload?.error) return String(payload.error)
        if (payload?.details) return String(payload.details)
        if (payload?.message) return String(payload.message)

        return `Edge Function retornou HTTP ${response.status}.`
      } catch {
        return 'A Edge Function retornou erro, mas não foi possível ler a resposta.'
      }
    }

    if (error instanceof FunctionsRelayError) {
      return `Erro de relay da Edge Function: ${error.message}`
    }

    if (error instanceof FunctionsFetchError) {
      return `Erro de conexão ao chamar a Edge Function: ${error.message}`
    }

    if (error instanceof Error) {
      return error.message
    }

    return 'Erro desconhecido ao criar usuário.'
  }

  async function criarUsuario(e: FormEvent) {
    e.preventDefault()

    setErro('')
    setSucesso('')

    const nome = form.nome.trim()
    const email = form.email.trim().toLowerCase()
    const senha = form.senha.trim()
    const cargo = form.cargo.trim()

    if (!nome) {
      setErro('Informe o nome.')
      return
    }

    if (!email) {
      setErro('Informe o e-mail.')
      return
    }

    if (!senha) {
      setErro('Informe a senha.')
      return
    }

    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setLoadingCriacao(true)

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!session?.access_token) {
        throw new Error('Sessão expirada. Faça login novamente.')
      }

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          nome,
          email,
          senha,
          cargo,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (error) {
        throw error
      }

      if (data?.error) {
        throw new Error(String(data.error))
      }

      setSucesso(data?.message || 'Usuário criado com sucesso.')
      setForm(estadoInicialFormulario)
      setFormularioAberto(false)

      await carregarUsuarios()
    } catch (err) {
      const mensagem = await extrairErroDaEdgeFunction(err)
      setErro(mensagem)
    } finally {
      setLoadingCriacao(false)
    }
  }

  function abrirFormulario() {
    setErro('')
    setSucesso('')
    setForm(estadoInicialFormulario)
    setFormularioAberto((prev) => !prev)
  }

  function atualizarCampo(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  return (
    <MainLayout>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '32px' }}>Usuários</h1>
          <p style={{ margin: '8px 0 0', color: '#555' }}>
            Gerencie usuários, cargos e acesso ao sistema RG Ambiental
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '16px',
            alignItems: 'stretch',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '16px 20px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
              minWidth: '180px',
            }}
          >
            <div style={{ fontSize: '14px', color: '#666' }}>Total de usuários</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '6px' }}>
              {totalUsuarios}
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              padding: '16px 20px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
              minWidth: '180px',
            }}
          >
            <div style={{ fontSize: '14px', color: '#666' }}>Usuários ativos</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '6px' }}>
              {totalAtivos}
            </div>
          </div>
        </div>
      </div>

      {erro && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {erro}
        </div>
      )}

      {sucesso && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#e8f5e9',
            color: '#2e7d32',
            border: '1px solid #c8e6c9',
            borderRadius: '8px',
          }}
        >
          {sucesso}
        </div>
      )}

      <div
        style={{
          background: '#fff',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px' }}>Lista de usuários</h2>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <input
              placeholder="Buscar por nome, e-mail, cargo ou status"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ ...inputStyle, maxWidth: '360px' }}
            />

            <button
              onClick={carregarUsuarios}
              disabled={loadingLista}
              style={secondaryButtonStyle}
            >
              {loadingLista ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        {loadingLista ? (
          <p style={{ color: '#666' }}>Carregando usuários...</p>
        ) : usuariosFiltrados.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: '#666',
              border: '1px dashed #ccc',
              borderRadius: '10px',
              backgroundColor: '#fafafa',
            }}
          >
            Nenhum usuário encontrado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>E-mail</th>
                  <th style={thStyle}>Cargo</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Criado em</th>
                </tr>
              </thead>

              <tbody>
                {usuariosFiltrados.map((usuario) => (
                  <tr key={usuario.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{usuario.nome}</td>
                    <td style={tdStyle}>{usuario.email}</td>
                    <td style={tdStyle}>{usuario.cargo}</td>
                    <td style={tdStyle}>{normalizarStatus(usuario.status)}</td>
                    <td style={tdStyle}>{formatarData(usuario.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={abrirFormulario}
          style={{
            width: '100%',
            border: 'none',
            background: '#f8fafc',
            padding: '18px 20px',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 700,
            fontSize: '18px',
            color: '#0f172a',
          }}
        >
          <span>Novo usuário</span>
          <span style={{ fontSize: '22px', color: '#64748b' }}>
            {formularioAberto ? '−' : '+'}
          </span>
        </button>

        {formularioAberto && (
          <div style={{ padding: '20px', borderTop: '1px solid #e5e7eb' }}>
            <form onSubmit={criarUsuario}>
              <div style={sectionTitleStyle}>Dados de acesso</div>

              <div style={grid4Style}>
                <input
                  name="nome"
                  placeholder="Nome completo"
                  value={form.nome}
                  onChange={atualizarCampo}
                  style={inputStyle}
                />

                <input
                  name="email"
                  type="email"
                  placeholder="E-mail"
                  value={form.email}
                  onChange={atualizarCampo}
                  style={inputStyle}
                />

                <input
                  name="senha"
                  type="password"
                  placeholder="Senha"
                  value={form.senha}
                  onChange={atualizarCampo}
                  style={inputStyle}
                />

                <select
                  name="cargo"
                  value={form.cargo}
                  onChange={atualizarCampo}
                  style={inputStyle}
                >
                  {CARGOS.map((cargo) => (
                    <option key={cargo} value={cargo}>
                      {cargo}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginTop: '24px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="submit"
                  disabled={loadingCriacao}
                  style={successButtonStyle}
                >
                  {loadingCriacao ? 'Criando usuário...' : 'Criar usuário'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormularioAberto(false)
                    setForm(estadoInicialFormulario)
                    setErro('')
                    setSucesso('')
                  }}
                  style={secondaryButtonStyle}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

const sectionTitleStyle = {
  marginTop: '0',
  marginBottom: '12px',
  fontSize: '16px',
  fontWeight: 700,
  color: '#334155',
}

const grid4Style = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d0d7de',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box' as const,
  backgroundColor: '#fff',
}

const secondaryButtonStyle = {
  backgroundColor: '#e5e7eb',
  color: '#111827',
  border: 'none',
  padding: '10px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
}

const successButtonStyle = {
  backgroundColor: '#22c55e',
  color: '#052e16',
  border: 'none',
  padding: '10px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
}

const thStyle = {
  textAlign: 'left' as const,
  padding: '12px',
  borderBottom: '1px solid #ddd',
  fontSize: '14px',
}

const tdStyle = {
  padding: '12px',
  fontSize: '14px',
}
