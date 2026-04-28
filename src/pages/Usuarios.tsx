import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import MainLayout from '../layouts/MainLayout'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../lib/coletasQueryLimits'
import { limparSessionDraftKey, useCadastroFormDraft } from '../lib/useCadastroFormDraft'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import {
  formatarErroEdgeFunction,
  headersJwtSessao,
  obterSessaoParaEdgeFunctions,
} from '../lib/edgeFunctionErrors'
import { supabase } from '../lib/supabase'
import { cargoEhAdministrador } from '../lib/workflowPermissions'
import { ROTAS_SISTEMA, emailPodeDefinirPaginasPorUsuario } from '../lib/paginasSistema'

type Usuario = {
  id: string
  nome: string
  email: string
  cargo: string
  status: string
  created_at: string | null
  paginas_permitidas?: string[] | null
}

type FormState = {
  nome: string
  email: string
  senha: string
  cargo: string
}

type FormEdicaoState = {
  nome: string
  email: string
  cargo: string
  status: string
  novaSenha: string
}

const STATUS_DB = ['ativo', 'inativo', 'bloqueado'] as const

const CARGOS = [
  'Administrador',
  'Operacional',
  'Logística',
  'Balanceiro',
  'Diretoria',
  'Faturamento',
  'Financeiro',
  'Visualizador',
]

const estadoInicialFormulario: FormState = {
  nome: '',
  email: '',
  senha: '',
  cargo: 'Financeiro',
}

const estadoInicialEdicao = (): FormEdicaoState => ({
  nome: '',
  email: '',
  cargo: 'Financeiro',
  status: 'ativo',
  novaSenha: '',
})

const USUARIOS_CADASTRO_DRAFT_KEY = 'rg-ambiental-usuarios-cadastro-draft'

type UsuariosCadastroDraftPayload =
  | { modo: 'criar'; form: FormState }
  | {
      modo: 'editar'
      usuario: Pick<Usuario, 'id' | 'nome' | 'email' | 'cargo' | 'status' | 'created_at'>
      formEdicao: FormEdicaoState
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
  const [loadingEdicao, setLoadingEdicao] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [usuarioEmEdicao, setUsuarioEmEdicao] = useState<Usuario | null>(null)
  const [meuCargo, setMeuCargo] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(estadoInicialFormulario)
  const [formEdicao, setFormEdicao] = useState<FormEdicaoState>(estadoInicialEdicao)
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebouncedValue(busca, 280)
  const [paginaUsuarios, setPaginaUsuarios] = useState(0)
  const [itensPorPagina, setItensPorPagina] = useState(DEFAULT_PAGE_SIZE)

  const [meuEmail, setMeuEmail] = useState<string | null>(null)
  const [modalPaginasUsuario, setModalPaginasUsuario] = useState<Usuario | null>(null)
  const [modoPaginas, setModoPaginas] = useState<'cargo' | 'lista'>('cargo')
  const [rotasMarcadas, setRotasMarcadas] = useState<Set<string>>(() => new Set())
  const [salvandoPaginas, setSalvandoPaginas] = useState(false)

  const souAdministrador = cargoEhAdministrador(meuCargo)
  /** Rota já restrita a admin; enquanto o cargo carrega, permite a UI (Edge Function valida de novo). */
  const podeGerenciar = meuCargo === null || souAdministrador

  const podeDefinirPaginas = emailPodeDefinirPaginasPorUsuario(meuEmail)

  const cadastroPainelAberto = formularioAberto || usuarioEmEdicao != null

  const usuariosCadastroDraftData = useMemo((): UsuariosCadastroDraftPayload => {
    if (usuarioEmEdicao) {
      return {
        modo: 'editar',
        usuario: {
          id: usuarioEmEdicao.id,
          nome: usuarioEmEdicao.nome,
          email: usuarioEmEdicao.email,
          cargo: usuarioEmEdicao.cargo,
          status: usuarioEmEdicao.status,
          created_at: usuarioEmEdicao.created_at,
        },
        formEdicao,
      }
    }
    return { modo: 'criar', form }
  }, [usuarioEmEdicao, form, formEdicao])

  useCadastroFormDraft<UsuariosCadastroDraftPayload>({
    storageKey: USUARIOS_CADASTRO_DRAFT_KEY,
    open: cadastroPainelAberto,
    data: usuariosCadastroDraftData,
    onRestore: (d) => {
      if (d.modo === 'criar') {
        setForm(d.form)
        setFormularioAberto(true)
        setUsuarioEmEdicao(null)
        return
      }
      setUsuarioEmEdicao({
        ...d.usuario,
        paginas_permitidas: null,
      })
      setFormEdicao(d.formEdicao)
      setFormularioAberto(false)
    },
  })

  const totalUsuarios = useMemo(() => usuarios.length, [usuarios])

  const totalAtivos = useMemo(() => {
    return usuarios.filter((u) => String(u.status).toLowerCase() === 'ativo').length
  }, [usuarios])

  const usuariosFiltrados = useMemo(() => {
    const termo = buscaDebounced.trim().toLowerCase()

    if (!termo) return usuarios

    return usuarios.filter((usuario) => {
      return (
        (usuario.nome || '').toLowerCase().includes(termo) ||
        (usuario.email || '').toLowerCase().includes(termo) ||
        (usuario.cargo || '').toLowerCase().includes(termo) ||
        (usuario.status || '').toLowerCase().includes(termo)
      )
    })
  }, [buscaDebounced, usuarios])

  const totalFiltrados = usuariosFiltrados.length
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrados / itensPorPagina))
  const paginaSegura = Math.min(paginaUsuarios, totalPaginas - 1)
  const usuariosPagina = useMemo(() => {
    const ini = paginaSegura * itensPorPagina
    return usuariosFiltrados.slice(ini, ini + itensPorPagina)
  }, [usuariosFiltrados, paginaSegura, itensPorPagina])

  useEffect(() => {
    setPaginaUsuarios(0)
  }, [buscaDebounced, itensPorPagina, usuarios.length])

  useEffect(() => {
    setPaginaUsuarios((p) => Math.min(p, Math.max(0, totalPaginas - 1)))
  }, [totalPaginas])

  async function carregarUsuarios() {
    try {
      setLoadingLista(true)
      setErro('')

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, cargo, status, created_at, paginas_permitidas')
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

  useEffect(() => {
    async function carregarMeuCargo() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setMeuCargo(null)
        setMeuEmail(null)
        return
      }
      setMeuEmail((user.email || '').trim().toLowerCase() || null)
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      setMeuCargo(data?.cargo ?? null)
    }
    void carregarMeuCargo()
  }, [])

  function abrirModalPaginas(usuario: Usuario) {
    setErro('')
    setSucesso('')
    setModalPaginasUsuario(usuario)
    const pp = usuario.paginas_permitidas
    if (pp && pp.length > 0) {
      setModoPaginas('lista')
      setRotasMarcadas(new Set(pp))
    } else {
      setModoPaginas('cargo')
      setRotasMarcadas(new Set())
    }
  }

  function fecharModalPaginas() {
    setModalPaginasUsuario(null)
    setSalvandoPaginas(false)
  }

  function toggleRotaMarcada(path: string) {
    setRotasMarcadas((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function salvarPaginasUsuario() {
    if (!modalPaginasUsuario || !podeDefinirPaginas) return
    setErro('')
    setSucesso('')
    let paginas: string[] | null = null
    if (modoPaginas === 'lista') {
      paginas = Array.from(rotasMarcadas)
      if (paginas.length === 0) {
        setErro('Seleccione pelo menos uma página ou escolha «Apenas cargo».')
        return
      }
    }

    setSalvandoPaginas(true)
    try {
      const sessao = await obterSessaoParaEdgeFunctions(supabase)
      const { data, error } = await supabase.functions.invoke('admin-set-user-pages', {
        body: { userId: modalPaginasUsuario.id, paginas },
        headers: headersJwtSessao(sessao),
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))
      setSucesso(data?.message || 'Permissões de páginas guardadas.')
      fecharModalPaginas()
      await carregarUsuarios()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao guardar páginas.')
    } finally {
      setSalvandoPaginas(false)
    }
  }

  async function criarUsuario(e: FormEvent) {
    e.preventDefault()

    if (!podeGerenciar) {
      setErro('Apenas administradores podem criar usuários.')
      return
    }

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
      const sessao = await obterSessaoParaEdgeFunctions(supabase)

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          nome,
          email,
          senha,
          cargo,
        },
        headers: headersJwtSessao(sessao),
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
      limparSessionDraftKey(USUARIOS_CADASTRO_DRAFT_KEY)

      await carregarUsuarios()
    } catch (err) {
      const mensagem = await formatarErroEdgeFunction(err, 'criar')
      setErro(mensagem)
    } finally {
      setLoadingCriacao(false)
    }
  }

  function abrirFormulario() {
    setErro('')
    setSucesso('')
    setForm(estadoInicialFormulario)
    setFormularioAberto((prev) => {
      const abrir = !prev
      if (abrir) {
        setUsuarioEmEdicao(null)
      } else {
        limparSessionDraftKey(USUARIOS_CADASTRO_DRAFT_KEY)
      }
      return abrir
    })
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

  function atualizarCampoEdicao(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setFormEdicao((prev) => ({ ...prev, [name]: value }))
  }

  function abrirEdicao(usuario: Usuario) {
    setErro('')
    setSucesso('')
    setFormularioAberto(false)
    setUsuarioEmEdicao(usuario)
    const st = String(usuario.status || 'ativo').toLowerCase()
    setFormEdicao({
      nome: usuario.nome || '',
      email: usuario.email || '',
      cargo: usuario.cargo || 'Financeiro',
      status: (STATUS_DB as readonly string[]).includes(st) ? st : 'ativo',
      novaSenha: '',
    })
  }

  function fecharEdicao() {
    limparSessionDraftKey(USUARIOS_CADASTRO_DRAFT_KEY)
    setUsuarioEmEdicao(null)
    setFormEdicao(estadoInicialEdicao())
    setErro('')
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault()
    if (!usuarioEmEdicao || !podeGerenciar) return

    const nome = formEdicao.nome.trim()
    const email = formEdicao.email.trim().toLowerCase()
    const cargo = formEdicao.cargo.trim()
    const status = formEdicao.status.trim().toLowerCase()
    const novaSenha = formEdicao.novaSenha.trim()

    if (!nome) {
      setErro('Informe o nome.')
      return
    }
    if (!email) {
      setErro('Informe o e-mail.')
      return
    }
    if (novaSenha && novaSenha.length < 6) {
      setErro('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setLoadingEdicao(true)
    setErro('')
    setSucesso('')

    try {
      const sessao = await obterSessaoParaEdgeFunctions(supabase)

      const emailOriginal = (usuarioEmEdicao.email || '').toLowerCase()
      const emailMudou = email !== emailOriginal

      const body: Record<string, string> = {
        id: usuarioEmEdicao.id,
        nome,
        cargo,
        status,
      }
      if (emailMudou) body.email = email
      if (novaSenha) body.novaSenha = novaSenha

      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body,
        headers: headersJwtSessao(sessao),
      })

      if (error) throw error
      if (data?.error) throw new Error(String(data.error))

      setSucesso(data?.message || 'Usuário atualizado com sucesso.')
      fecharEdicao()
      await carregarUsuarios()
    } catch (err) {
      const mensagem = await formatarErroEdgeFunction(err, 'editar')
      setErro(mensagem)
    } finally {
      setLoadingEdicao(false)
    }
  }

  async function excluirUsuario(usuario: Usuario) {
    if (!podeGerenciar) return

    const ok = window.confirm(
      `Excluir permanentemente o usuário "${usuario.nome}" (${usuario.email})?\nEsta ação não pode ser desfeita.`
    )
    if (!ok) return

    setExcluindoId(usuario.id)
    setErro('')
    setSucesso('')

    try {
      const sessao = await obterSessaoParaEdgeFunctions(supabase)

      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { id: usuario.id },
        headers: headersJwtSessao(sessao),
      })

      if (error) throw error
      if (data?.error) throw new Error(String(data.error))

      setSucesso(data?.message || 'Usuário excluído com sucesso.')
      if (usuarioEmEdicao?.id === usuario.id) fecharEdicao()
      await carregarUsuarios()
    } catch (err) {
      const mensagem = await formatarErroEdgeFunction(err, 'excluir')
      setErro(mensagem)
    } finally {
      setExcluindoId(null)
    }
  }

  return (
    <MainLayout>
      <div className="page-shell">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
            Acessos, perfis e permissões
          </h1>
          <p className="page-header__lead" style={{ margin: '6px 0 0' }}>
            Quem acessa o sistema e com qual perfil (cargo). Criar, editar e excluir é permitido apenas
            para o cargo <strong>Administrador</strong>.
            {podeDefinirPaginas ? (
              <>
                {' '}
                Contas autorizadas podem <strong>restringir o acesso por páginas</strong> por utilizador
                (lista abaixo «Páginas»).
              </>
            ) : null}
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
          {podeGerenciar ? (
            <button
              type="button"
              onClick={abrirFormulario}
              style={botaoNovoUsuarioTopoStyle}
              title={formularioAberto ? 'Fechar formulário' : 'Cadastrar novo usuário'}
            >
              {formularioAberto ? 'Fechar cadastro' : '+ Novo usuário'}
            </button>
          ) : null}

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

      {formularioAberto && podeGerenciar ? (
        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
            marginBottom: '24px',
            border: '1px solid #bbf7d0',
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
            Novo usuário
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#64748b' }}>
            Preencha nome, e-mail, senha e cargo. O acesso é criado no Supabase Auth e na tabela de usuários.
          </p>

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
                  limparSessionDraftKey(USUARIOS_CADASTRO_DRAFT_KEY)
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
      ) : null}

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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
            Lista de usuários
          </h2>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <input
              placeholder="Nome, e-mail, cargo ou status"
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
        ) : totalFiltrados === 0 ? (
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1040px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>E-mail</th>
                  <th style={thStyle}>Cargo</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Páginas</th>
                  <th style={thStyle}>Criado em</th>
                  {podeGerenciar ? <th style={{ ...thStyle, width: '260px' }}>Ações</th> : null}
                </tr>
              </thead>

              <tbody>
                {usuariosPagina.map((usuario) => (
                  <tr key={usuario.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{usuario.nome}</td>
                    <td style={tdStyle}>{usuario.email}</td>
                    <td style={tdStyle}>{usuario.cargo}</td>
                    <td style={tdStyle}>{normalizarStatus(usuario.status)}</td>
                    <td style={{ ...tdStyle, fontSize: '13px', color: '#475569' }}>
                      {usuario.paginas_permitidas && usuario.paginas_permitidas.length > 0 ? (
                        <span title={usuario.paginas_permitidas.join(', ')}>
                          {usuario.paginas_permitidas.length} rota
                          {usuario.paginas_permitidas.length === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span title="Só regras do cargo">Cargo</span>
                      )}
                    </td>
                    <td style={tdStyle}>{formatarData(usuario.created_at)}</td>
                    {podeGerenciar ? (
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => abrirEdicao(usuario)}
                            style={actionEditStyle}
                            disabled={!!excluindoId || loadingEdicao}
                          >
                            Editar
                          </button>
                          {podeDefinirPaginas ? (
                            <button
                              type="button"
                              onClick={() => abrirModalPaginas(usuario)}
                              style={actionPaginasStyle}
                              disabled={!!excluindoId || loadingEdicao || salvandoPaginas}
                              title="Definir quais páginas do sistema este utilizador pode abrir"
                            >
                              Páginas
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void excluirUsuario(usuario)}
                            style={actionDeleteStyle}
                            disabled={excluindoId === usuario.id || loadingEdicao}
                          >
                            {excluindoId === usuario.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #e8ecf1',
              }}
            >
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                {totalFiltrados === 0
                  ? '0 registos'
                  : `${paginaSegura * itensPorPagina + 1}–${Math.min(
                      (paginaSegura + 1) * itensPorPagina,
                      totalFiltrados
                    )} de ${totalFiltrados}`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Por página
                  <select
                    value={itensPorPagina}
                    onChange={(e) => setItensPorPagina(Number(e.target.value))}
                    style={{ ...inputStyle, maxWidth: '100px', padding: '6px 10px' }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={paginaSegura <= 0}
                  onClick={() => setPaginaUsuarios((p) => Math.max(0, p - 1))}
                  style={secondaryButtonStyle}
                >
                  Anterior
                </button>
                <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                  Página {paginaSegura + 1} / {totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={paginaSegura >= totalPaginas - 1}
                  onClick={() => setPaginaUsuarios((p) => Math.min(totalPaginas - 1, p + 1))}
                  style={secondaryButtonStyle}
                >
                  Seguinte
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {usuarioEmEdicao && podeGerenciar ? (
        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
            marginBottom: '24px',
            border: '1px solid #bfdbfe',
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
            Editar usuário
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#64748b' }}>
            Altere nome, e-mail, cargo ou status. Informe uma nova senha apenas se quiser redefinir.
          </p>

          <form onSubmit={salvarEdicao}>
            <div style={grid4Style}>
              <div>
                <label style={labelMiniStyle}>Nome</label>
                <input
                  name="nome"
                  placeholder="Nome completo"
                  value={formEdicao.nome}
                  onChange={atualizarCampoEdicao}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelMiniStyle}>E-mail</label>
                <input
                  name="email"
                  type="email"
                  placeholder="E-mail"
                  value={formEdicao.email}
                  onChange={atualizarCampoEdicao}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelMiniStyle}>Nova senha (opcional)</label>
                <input
                  name="novaSenha"
                  type="password"
                  placeholder="Deixe em branco para manter"
                  value={formEdicao.novaSenha}
                  onChange={atualizarCampoEdicao}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label style={labelMiniStyle}>Cargo</label>
                <select
                  name="cargo"
                  value={formEdicao.cargo}
                  onChange={atualizarCampoEdicao}
                  style={inputStyle}
                >
                  {CARGOS.map((cargo) => (
                    <option key={cargo} value={cargo}>
                      {cargo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelMiniStyle}>Status</label>
                <select
                  name="status"
                  value={formEdicao.status}
                  onChange={atualizarCampoEdicao}
                  style={inputStyle}
                >
                  {STATUS_DB.map((s) => (
                    <option key={s} value={s}>
                      {normalizarStatus(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: '20px',
                flexWrap: 'wrap',
              }}
            >
              <button type="submit" disabled={loadingEdicao} style={successButtonStyle}>
                {loadingEdicao ? 'Salvando...' : 'Salvar alterações'}
              </button>
              <button type="button" onClick={fecharEdicao} style={secondaryButtonStyle} disabled={loadingEdicao}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modalPaginasUsuario && podeDefinirPaginas ? (
        <div
          style={modalPaginasBackdropStyle}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) fecharModalPaginas()
          }}
        >
          <div style={modalPaginasPanelStyle} role="dialog" aria-labelledby="modal-paginas-titulo">
            <h2 id="modal-paginas-titulo" style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800 }}>
              Páginas permitidas
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#64748b' }}>
              <strong>{modalPaginasUsuario.nome}</strong> ({modalPaginasUsuario.email})
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="modoPaginas"
                  checked={modoPaginas === 'cargo'}
                  onChange={() => setModoPaginas('cargo')}
                />
                <span>
                  <strong>Apenas cargo</strong> — sem lista extra; vale a regra normal do perfil nas rotas.
                </span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                  marginTop: '10px',
                }}
              >
                <input
                  type="radio"
                  name="modoPaginas"
                  checked={modoPaginas === 'lista'}
                  onChange={() => setModoPaginas('lista')}
                />
                <span>
                  <strong>Lista de páginas</strong> — o utilizador só abre as rotas marcadas (além de estar
                  ativo e com cargo permitido na rota).
                </span>
              </label>
            </div>

            {modoPaginas === 'lista' ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '8px',
                  maxHeight: 'min(52vh, 420px)',
                  overflowY: 'auto',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                }}
              >
                {ROTAS_SISTEMA.map((r) => (
                  <label
                    key={r.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rotasMarcadas.has(r.path)}
                      onChange={() => toggleRotaMarcada(r.path)}
                    />
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.label}</span>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>{r.path}</span>
                  </label>
                ))}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void salvarPaginasUsuario()}
                disabled={salvandoPaginas}
                style={successButtonStyle}
              >
                {salvandoPaginas ? 'A guardar…' : 'Guardar'}
              </button>
              <button type="button" onClick={fecharModalPaginas} disabled={salvandoPaginas} style={secondaryButtonStyle}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

const botaoNovoUsuarioTopoStyle: CSSProperties = {
  alignSelf: 'center',
  backgroundColor: '#22c55e',
  color: '#052e16',
  border: 'none',
  padding: '12px 22px',
  borderRadius: '12px',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '15px',
  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.35)',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  whiteSpace: 'nowrap',
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

const labelMiniStyle: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: '#475569',
  marginBottom: '6px',
}

const actionEditStyle: CSSProperties = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '13px',
}

const actionDeleteStyle: CSSProperties = {
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  border: '1px solid #fecaca',
  padding: '8px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '13px',
}

const actionPaginasStyle: CSSProperties = {
  backgroundColor: '#f0fdf4',
  color: '#166534',
  border: '1px solid #bbf7d0',
  padding: '8px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '13px',
}

const modalPaginasBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  zIndex: 10040,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
}

const modalPaginasPanelStyle: CSSProperties = {
  background: '#fff',
  borderRadius: '14px',
  padding: '22px',
  maxWidth: '720px',
  width: '100%',
  boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
  border: '1px solid #e2e8f0',
}
