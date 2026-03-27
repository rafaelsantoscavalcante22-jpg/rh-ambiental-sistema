import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  nome: string
  razao_social: string
  cnpj: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  responsavel_nome: string
  responsavel_telefone: string
  responsavel_email: string
  tipo_residuo: string
  classe_residuo: string
  unidade_medida: string
  frequencia_coleta: string
  numero_licenca: string
  validade_licenca: string
  status: string
  empresa: string
}

const estadoInicialFormulario = {
  nome: '',
  razao_social: '',
  cnpj: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  responsavel_nome: '',
  responsavel_telefone: '',
  responsavel_email: '',
  tipo_residuo: '',
  classe_residuo: '',
  unidade_medida: '',
  frequencia_coleta: '',
  numero_licenca: '',
  validade_licenca: '',
  status: 'Ativo',
}

function Clientes() {
  const [form, setForm] = useState(estadoInicialFormulario)
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [formularioAberto, setFormularioAberto] = useState(false)

  function somenteNumeros(valor: string) {
    return valor.replace(/\D/g, '')
  }

  function aplicarMascaraCnpj(valor: string) {
    const numeros = somenteNumeros(valor).slice(0, 14)

    return numeros
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }

  function aplicarMascaraTelefone(valor: string) {
    const numeros = somenteNumeros(valor).slice(0, 11)

    if (numeros.length <= 10) {
      return numeros
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
    }

    return numeros
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
  }

  function aplicarMascaraCep(valor: string) {
    const numeros = somenteNumeros(valor).slice(0, 8)
    return numeros.replace(/^(\d{5})(\d)/, '$1-$2')
  }

  function formatarDataBr(dataIso: string) {
    if (!dataIso) return ''

    const partes = dataIso.split('-')
    if (partes.length !== 3) return dataIso

    const [ano, mes, dia] = partes
    return `${dia}/${mes}/${ano}`
  }

  async function buscarClientes() {
    setCarregando(true)

    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true })

    setCarregando(false)

    if (error) {
      console.error('Erro ao buscar clientes:', error.message)
      alert('Erro ao buscar clientes: ' + error.message)
      return
    }

    setClientes(data || [])
  }

  function atualizarCampo(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target

    let valorTratado = value

    if (name === 'cnpj') {
      valorTratado = aplicarMascaraCnpj(value)
    }

    if (name === 'responsavel_telefone') {
      valorTratado = aplicarMascaraTelefone(value)
    }

    if (name === 'cep') {
      valorTratado = aplicarMascaraCep(value)
    }

    setForm((prev) => ({
      ...prev,
      [name]: valorTratado,
    }))
  }

  async function buscarEnderecoPorCep() {
    const cepLimpo = somenteNumeros(form.cep)

    if (cepLimpo.length !== 8) return

    try {
      setBuscandoCep(true)

      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const dados = await resposta.json()

      setBuscandoCep(false)

      if (dados.erro) {
        alert('CEP não encontrado.')
        return
      }

      setForm((prev) => ({
        ...prev,
        rua: dados.logradouro || prev.rua,
        bairro: dados.bairro || prev.bairro,
        cidade: dados.localidade || prev.cidade,
        estado: dados.uf || prev.estado,
        complemento: dados.complemento || prev.complemento,
      }))
    } catch (error) {
      setBuscandoCep(false)
      console.error('Erro ao buscar CEP:', error)
      alert('Não foi possível buscar o endereço pelo CEP.')
    }
  }

  function validarFormulario() {
    if (!form.nome.trim()) {
      alert('Preencha o nome fantasia.')
      return false
    }

    if (!form.razao_social.trim()) {
      alert('Preencha a razão social.')
      return false
    }

    if (!form.cnpj.trim() || somenteNumeros(form.cnpj).length !== 14) {
      alert('Preencha um CNPJ válido com 14 números.')
      return false
    }

    const telefoneLimpo = somenteNumeros(form.responsavel_telefone)
    if (form.responsavel_telefone.trim() && telefoneLimpo.length < 10) {
      alert('Preencha um telefone válido do responsável.')
      return false
    }

    if (
      form.responsavel_email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.responsavel_email.trim())
    ) {
      alert('Preencha um e-mail válido do responsável.')
      return false
    }

    return true
  }

  async function adicionarOuAtualizarCliente() {
    if (!validarFormulario()) return

    setSalvando(true)

    const payload = {
      nome: form.nome.trim(),
      empresa: form.razao_social.trim(),
      razao_social: form.razao_social.trim(),
      cnpj: form.cnpj.trim(),
      cep: form.cep.trim(),
      rua: form.rua.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim(),
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      estado: form.estado.trim(),
      responsavel_nome: form.responsavel_nome.trim(),
      responsavel_telefone: form.responsavel_telefone.trim(),
      responsavel_email: form.responsavel_email.trim(),
      tipo_residuo: form.tipo_residuo.trim(),
      classe_residuo: form.classe_residuo.trim(),
      unidade_medida: form.unidade_medida.trim(),
      frequencia_coleta: form.frequencia_coleta.trim(),
      numero_licenca: form.numero_licenca.trim(),
      validade_licenca: form.validade_licenca,
      status: form.status.trim(),
    }

    if (editandoId) {
      const { error } = await supabase
        .from('clientes')
        .update(payload)
        .eq('id', editandoId)

      setSalvando(false)

      if (error) {
        console.error('Erro ao editar cliente:', error.message)
        alert('Erro ao editar cliente: ' + error.message)
        return
      }

      setMensagem('Cliente atualizado com sucesso.')
      setEditandoId(null)
    } else {
      const { error } = await supabase.from('clientes').insert([payload])

      setSalvando(false)

      if (error) {
        console.error('Erro ao adicionar cliente:', error.message)
        alert('Erro ao salvar cliente: ' + error.message)
        return
      }

      setMensagem('Cliente adicionado com sucesso.')
    }

    setForm(estadoInicialFormulario)
    setFormularioAberto(false)
    buscarClientes()
  }

  function editarCliente(cliente: Cliente) {
    setForm({
      nome: cliente.nome || '',
      razao_social: cliente.razao_social || cliente.empresa || '',
      cnpj: aplicarMascaraCnpj(cliente.cnpj || ''),
      cep: cliente.cep || '',
      rua: cliente.rua || '',
      numero: cliente.numero || '',
      complemento: cliente.complemento || '',
      bairro: cliente.bairro || '',
      cidade: cliente.cidade || '',
      estado: cliente.estado || '',
      responsavel_nome: cliente.responsavel_nome || '',
      responsavel_telefone: aplicarMascaraTelefone(cliente.responsavel_telefone || ''),
      responsavel_email: cliente.responsavel_email || '',
      tipo_residuo: cliente.tipo_residuo || '',
      classe_residuo: cliente.classe_residuo || '',
      unidade_medida: cliente.unidade_medida || '',
      frequencia_coleta: cliente.frequencia_coleta || '',
      numero_licenca: cliente.numero_licenca || '',
      validade_licenca: cliente.validade_licenca || '',
      status: cliente.status || 'Ativo',
    })

    setEditandoId(cliente.id)
    setFormularioAberto(true)
    setMensagem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removerCliente(id: string) {
    const confirmado = window.confirm('Tem certeza que deseja remover este cliente?')

    if (!confirmado) return

    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erro ao remover cliente:', error.message)
      alert('Erro ao remover cliente: ' + error.message)
      return
    }

    setMensagem('Cliente removido com sucesso.')
    buscarClientes()
  }

  function cancelarEdicao() {
    setForm(estadoInicialFormulario)
    setEditandoId(null)
    setFormularioAberto(false)
    setMensagem('')
  }

  function abrirNovoFormulario() {
    setForm(estadoInicialFormulario)
    setEditandoId(null)
    setFormularioAberto((prev) => !prev)
    setMensagem('')
  }

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    if (!termo) return clientes

    return clientes.filter((cliente) => {
      return (
        (cliente.nome || '').toLowerCase().includes(termo) ||
        (cliente.razao_social || '').toLowerCase().includes(termo) ||
        (cliente.cnpj || '').toLowerCase().includes(termo) ||
        (cliente.cidade || '').toLowerCase().includes(termo) ||
        (cliente.tipo_residuo || '').toLowerCase().includes(termo) ||
        (cliente.status || '').toLowerCase().includes(termo)
      )
    })
  }, [busca, clientes])

  useEffect(() => {
    buscarClientes()
  }, [])

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
          <h1 style={{ margin: 0, fontSize: '32px' }}>Clientes</h1>
          <p style={{ margin: '8px 0 0', color: '#555' }}>
            Cadastro completo para operação e pré-preenchimento de MTR
          </p>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
            minWidth: '220px',
          }}
        >
          <div style={{ fontSize: '14px', color: '#666' }}>Total de clientes</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '6px' }}>
            {clientes.length}
          </div>
        </div>
      </div>

      {mensagem && (
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
          {mensagem}
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
          <h2 style={{ margin: 0, fontSize: '20px' }}>Lista de clientes</h2>

          <input
            placeholder="Buscar por nome, razão social, CNPJ, cidade, resíduo ou status"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ ...inputStyle, maxWidth: '420px' }}
          />
        </div>

        {carregando ? (
          <p style={{ color: '#666' }}>Carregando clientes...</p>
        ) : clientesFiltrados.length === 0 ? (
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
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Razão social</th>
                  <th style={thStyle}>CNPJ</th>
                  <th style={thStyle}>Cidade</th>
                  <th style={thStyle}>Resíduo</th>
                  <th style={thStyle}>Classe</th>
                  <th style={thStyle}>Licença válida até</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {clientesFiltrados.map((cliente) => (
                  <tr key={cliente.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>{cliente.nome}</td>
                    <td style={tdStyle}>{cliente.razao_social}</td>
                    <td style={tdStyle}>{aplicarMascaraCnpj(cliente.cnpj || '')}</td>
                    <td style={tdStyle}>{cliente.cidade}</td>
                    <td style={tdStyle}>{cliente.tipo_residuo}</td>
                    <td style={tdStyle}>{cliente.classe_residuo}</td>
                    <td style={tdStyle}>{formatarDataBr(cliente.validade_licenca)}</td>
                    <td style={tdStyle}>{cliente.status}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => editarCliente(cliente)}
                          style={editButtonStyle}
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => removerCliente(cliente.id)}
                          style={deleteButtonStyle}
                        >
                          Remover
                        </button>
                      </div>
                    </td>
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
          onClick={abrirNovoFormulario}
          style={{
            width: '100%',
            border: 'none',
            background: editandoId ? '#dcfce7' : '#f8fafc',
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
          <span>{editandoId ? 'Editando cliente' : 'Novo cliente'}</span>
          <span style={{ fontSize: '22px', color: '#64748b' }}>
            {formularioAberto ? '−' : '+'}
          </span>
        </button>

        {formularioAberto && (
          <div style={{ padding: '20px', borderTop: '1px solid #e5e7eb' }}>
            <div style={sectionTitleStyle}>Dados básicos</div>
            <div style={grid4Style}>
              <input
                name="nome"
                placeholder="Nome fantasia"
                value={form.nome}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="razao_social"
                placeholder="Razão social"
                value={form.razao_social}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="cnpj"
                placeholder="CNPJ"
                value={form.cnpj}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <select
                name="status"
                value={form.status}
                onChange={atualizarCampo}
                style={inputStyle}
              >
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
                <option value="Bloqueado">Bloqueado</option>
              </select>
            </div>

            <div style={sectionTitleStyle}>Endereço</div>
            <div style={grid4Style}>
              <div style={{ position: 'relative' }}>
                <input
                  name="cep"
                  placeholder="CEP"
                  value={form.cep}
                  onChange={atualizarCampo}
                  onBlur={buscarEnderecoPorCep}
                  style={inputStyle}
                />
                {buscandoCep && (
                  <span
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '12px',
                      color: '#64748b',
                    }}
                  >
                    Buscando...
                  </span>
                )}
              </div>

              <input
                name="rua"
                placeholder="Rua"
                value={form.rua}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="numero"
                placeholder="Número"
                value={form.numero}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="complemento"
                placeholder="Complemento"
                value={form.complemento}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="bairro"
                placeholder="Bairro"
                value={form.bairro}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="cidade"
                placeholder="Cidade"
                value={form.cidade}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="estado"
                placeholder="Estado"
                value={form.estado}
                onChange={atualizarCampo}
                style={inputStyle}
              />
            </div>

            <div style={sectionTitleStyle}>Responsável</div>
            <div style={grid3Style}>
              <input
                name="responsavel_nome"
                placeholder="Nome do responsável"
                value={form.responsavel_nome}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="responsavel_telefone"
                placeholder="Telefone"
                value={form.responsavel_telefone}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="responsavel_email"
                placeholder="E-mail"
                value={form.responsavel_email}
                onChange={atualizarCampo}
                style={inputStyle}
              />
            </div>

            <div style={sectionTitleStyle}>Resíduo e operação</div>
            <div style={grid4Style}>
              <input
                name="tipo_residuo"
                placeholder="Tipo de resíduo"
                value={form.tipo_residuo}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <select
                name="classe_residuo"
                value={form.classe_residuo}
                onChange={atualizarCampo}
                style={inputStyle}
              >
                <option value="">Classe do resíduo</option>
                <option value="Classe I">Classe I</option>
                <option value="Classe II">Classe II</option>
              </select>
              <select
                name="unidade_medida"
                value={form.unidade_medida}
                onChange={atualizarCampo}
                style={inputStyle}
              >
                <option value="">Unidade de medida</option>
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="m³">m³</option>
                <option value="litros">litros</option>
              </select>
              <input
                name="frequencia_coleta"
                placeholder="Frequência de coleta"
                value={form.frequencia_coleta}
                onChange={atualizarCampo}
                style={inputStyle}
              />
            </div>

            <div style={sectionTitleStyle}>Dados para MTR</div>
            <div style={grid3Style}>
              <input
                name="numero_licenca"
                placeholder="Número da licença ambiental"
                value={form.numero_licenca}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="validade_licenca"
                type="date"
                value={form.validade_licenca}
                onChange={atualizarCampo}
                style={inputStyle}
              />
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
                onClick={adicionarOuAtualizarCliente}
                disabled={salvando}
                style={primaryButtonStyle}
              >
                {salvando
                  ? 'Salvando...'
                  : editandoId
                    ? 'Salvar edição'
                    : 'Adicionar cliente'}
              </button>

              <button onClick={cancelarEdicao} style={secondaryButtonStyle}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

const sectionTitleStyle = {
  marginTop: '20px',
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

const grid3Style = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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

const primaryButtonStyle = {
  backgroundColor: '#2563eb',
  color: '#fff',
  border: 'none',
  padding: '10px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
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

const editButtonStyle = {
  backgroundColor: '#16a34a',
  color: '#fff',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
}

const deleteButtonStyle = {
  backgroundColor: '#dc2626',
  color: '#fff',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
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

export default Clientes