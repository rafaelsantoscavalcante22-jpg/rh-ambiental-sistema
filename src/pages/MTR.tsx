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
  numero_licenca: string
  validade_licenca: string
  status: string
}

type MTR = {
  id: string
  cliente_id: string
  nome_cliente: string
  razao_social: string
  cnpj: string
  cidade: string
  tipo_residuo: string
  classe_residuo: string
  quantidade: string
  unidade_medida: string
  data_coleta: string
  destino_final: string
  status: string
  cep?: string
  rua?: string
  numero?: string
  complemento?: string
  bairro?: string
  estado?: string
  responsavel_nome?: string
  responsavel_telefone?: string
  responsavel_email?: string
  acondicionamento?: string
  transportador?: string
  motorista?: string
  veiculo?: string
  numero_licenca?: string
  validade_licenca?: string
  observacoes?: string
}

const estadoInicialFormulario = {
  cliente_id: '',
  nome_cliente: '',
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
  quantidade: '',
  unidade_medida: '',
  acondicionamento: '',
  data_coleta: '',
  transportador: '',
  motorista: '',
  veiculo: '',
  destino_final: '',
  numero_licenca: '',
  validade_licenca: '',
  observacoes: '',
  status: 'Rascunho',
}

function MTR() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [mtrs, setMtrs] = useState<MTR[]>([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(estadoInicialFormulario)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [carregandoClientes, setCarregandoClientes] = useState(false)
  const [carregandoMtrs, setCarregandoMtrs] = useState(false)
  const [salvando, setSalvando] = useState(false)
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

  function formatarDataBr(dataIso: string) {
    if (!dataIso) return ''

    const partes = dataIso.split('-')
    if (partes.length !== 3) return dataIso

    const [ano, mes, dia] = partes
    return `${dia}/${mes}/${ano}`
  }

  async function buscarClientes() {
    setCarregandoClientes(true)

    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('status', 'Ativo')
      .order('nome', { ascending: true })

    setCarregandoClientes(false)

    if (error) {
      console.error('Erro ao buscar clientes:', error.message)
      alert('Erro ao buscar clientes: ' + error.message)
      return
    }

    setClientes(data || [])
  }

  async function buscarMtrs() {
    setCarregandoMtrs(true)

    const { data, error } = await supabase
      .from('mtrs')
      .select('*')
      .order('created_at', { ascending: false })

    setCarregandoMtrs(false)

    if (error) {
      console.error('Erro ao buscar MTRs:', error.message)
      alert('Erro ao buscar MTRs: ' + error.message)
      return
    }

    setMtrs(data || [])
  }

  function atualizarCampo(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target

    let valorTratado = value

    if (name === 'cnpj') {
      valorTratado = aplicarMascaraCnpj(value)
    }

    if (name === 'responsavel_telefone') {
      valorTratado = aplicarMascaraTelefone(value)
    }

    setForm((prev) => ({
      ...prev,
      [name]: valorTratado,
    }))
  }

  function selecionarCliente(clienteId: string) {
    const cliente = clientes.find((item) => item.id === clienteId)

    if (!cliente) {
      setForm((prev) => ({
        ...prev,
        cliente_id: '',
      }))
      return
    }

    setForm((prev) => ({
      ...prev,
      cliente_id: cliente.id,
      nome_cliente: cliente.nome || '',
      razao_social: cliente.razao_social || '',
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
      numero_licenca: cliente.numero_licenca || '',
      validade_licenca: cliente.validade_licenca || '',
    }))
  }

  function validarFormulario() {
    if (!form.cliente_id) {
      alert('Selecione um cliente.')
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

    if (!form.tipo_residuo.trim()) {
      alert('Preencha o tipo de resíduo.')
      return false
    }

    if (!form.classe_residuo.trim()) {
      alert('Selecione a classe do resíduo.')
      return false
    }

    if (!form.quantidade.trim()) {
      alert('Preencha a quantidade.')
      return false
    }

    if (!form.unidade_medida.trim()) {
      alert('Selecione a unidade de medida.')
      return false
    }

    if (!form.data_coleta.trim()) {
      alert('Selecione a data da coleta.')
      return false
    }

    if (!form.destino_final.trim()) {
      alert('Preencha o destino final.')
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

  async function adicionarOuAtualizarMtr() {
    if (!validarFormulario()) return

    setSalvando(true)

    const payload = {
      cliente_id: form.cliente_id,
      nome_cliente: form.nome_cliente.trim(),
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
      quantidade: form.quantidade.trim(),
      unidade_medida: form.unidade_medida.trim(),
      acondicionamento: form.acondicionamento.trim(),
      data_coleta: form.data_coleta,
      transportador: form.transportador.trim(),
      motorista: form.motorista.trim(),
      veiculo: form.veiculo.trim(),
      destino_final: form.destino_final.trim(),
      numero_licenca: form.numero_licenca.trim(),
      validade_licenca: form.validade_licenca,
      observacoes: form.observacoes.trim(),
      status: form.status.trim(),
    }

    if (editandoId) {
      const { error } = await supabase
        .from('mtrs')
        .update(payload)
        .eq('id', editandoId)

      setSalvando(false)

      if (error) {
        console.error('Erro ao editar MTR:', error.message)
        alert('Erro ao editar MTR: ' + error.message)
        return
      }

      setMensagem('MTR atualizada com sucesso.')
      setEditandoId(null)
    } else {
      const { error } = await supabase.from('mtrs').insert([payload])

      setSalvando(false)

      if (error) {
        console.error('Erro ao salvar MTR:', error.message)
        alert('Erro ao salvar MTR: ' + error.message)
        return
      }

      setMensagem('MTR criada com sucesso.')
    }

    setForm(estadoInicialFormulario)
    setFormularioAberto(false)
    buscarMtrs()
  }

  function editarMtr(mtr: any) {
    setForm({
      cliente_id: mtr.cliente_id || '',
      nome_cliente: mtr.nome_cliente || '',
      razao_social: mtr.razao_social || '',
      cnpj: aplicarMascaraCnpj(mtr.cnpj || ''),
      cep: mtr.cep || '',
      rua: mtr.rua || '',
      numero: mtr.numero || '',
      complemento: mtr.complemento || '',
      bairro: mtr.bairro || '',
      cidade: mtr.cidade || '',
      estado: mtr.estado || '',
      responsavel_nome: mtr.responsavel_nome || '',
      responsavel_telefone: aplicarMascaraTelefone(mtr.responsavel_telefone || ''),
      responsavel_email: mtr.responsavel_email || '',
      tipo_residuo: mtr.tipo_residuo || '',
      classe_residuo: mtr.classe_residuo || '',
      quantidade: mtr.quantidade || '',
      unidade_medida: mtr.unidade_medida || '',
      acondicionamento: mtr.acondicionamento || '',
      data_coleta: mtr.data_coleta || '',
      transportador: mtr.transportador || '',
      motorista: mtr.motorista || '',
      veiculo: mtr.veiculo || '',
      destino_final: mtr.destino_final || '',
      numero_licenca: mtr.numero_licenca || '',
      validade_licenca: mtr.validade_licenca || '',
      observacoes: mtr.observacoes || '',
      status: mtr.status || 'Rascunho',
    })

    setEditandoId(mtr.id)
    setFormularioAberto(true)
    setMensagem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removerMtr(id: string) {
    const confirmado = window.confirm('Tem certeza que deseja remover esta MTR?')
    if (!confirmado) return

    const { error } = await supabase
      .from('mtrs')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erro ao remover MTR:', error.message)
      alert('Erro ao remover MTR: ' + error.message)
      return
    }

    setMensagem('MTR removida com sucesso.')
    buscarMtrs()
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

  const mtrsFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    if (!termo) return mtrs

    return mtrs.filter((mtr) => {
      return (
        (mtr.nome_cliente || '').toLowerCase().includes(termo) ||
        (mtr.razao_social || '').toLowerCase().includes(termo) ||
        (mtr.cnpj || '').toLowerCase().includes(termo) ||
        (mtr.tipo_residuo || '').toLowerCase().includes(termo) ||
        (mtr.cidade || '').toLowerCase().includes(termo) ||
        (mtr.status || '').toLowerCase().includes(termo)
      )
    })
  }, [busca, mtrs])

  useEffect(() => {
    buscarClientes()
    buscarMtrs()
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
          <h1 style={{ margin: 0, fontSize: '32px' }}>MTR</h1>
          <p style={{ margin: '8px 0 0', color: '#555' }}>
            Emissão com pré-preenchimento automático a partir do cadastro do cliente
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
          <div style={{ fontSize: '14px', color: '#666' }}>Total de MTRs</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '6px' }}>
            {mtrs.length}
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
          <h2 style={{ margin: 0, fontSize: '20px' }}>Lista de MTRs</h2>

          <input
            placeholder="Buscar por cliente, CNPJ, resíduo, cidade ou status"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ ...inputStyle, maxWidth: '360px' }}
          />
        </div>

        {carregandoMtrs ? (
          <p style={{ color: '#666' }}>Carregando MTRs...</p>
        ) : mtrsFiltradas.length === 0 ? (
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
            Nenhuma MTR encontrada.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>CNPJ</th>
                  <th style={thStyle}>Cidade</th>
                  <th style={thStyle}>Resíduo</th>
                  <th style={thStyle}>Classe</th>
                  <th style={thStyle}>Quantidade</th>
                  <th style={thStyle}>Data coleta</th>
                  <th style={thStyle}>Destino</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {mtrsFiltradas.map((mtr) => (
                  <tr key={mtr.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>{mtr.nome_cliente}</td>
                    <td style={tdStyle}>{aplicarMascaraCnpj(mtr.cnpj)}</td>
                    <td style={tdStyle}>{mtr.cidade}</td>
                    <td style={tdStyle}>{mtr.tipo_residuo}</td>
                    <td style={tdStyle}>{mtr.classe_residuo}</td>
                    <td style={tdStyle}>
                      {mtr.quantidade} {mtr.unidade_medida}
                    </td>
                    <td style={tdStyle}>{formatarDataBr(mtr.data_coleta)}</td>
                    <td style={tdStyle}>{mtr.destino_final}</td>
                    <td style={tdStyle}>{mtr.status}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => editarMtr(mtr)}
                          style={editButtonStyle}
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => removerMtr(mtr.id)}
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
          <span>{editandoId ? 'Editando MTR' : 'Nova MTR'}</span>
          <span style={{ fontSize: '22px', color: '#64748b' }}>
            {formularioAberto ? '−' : '+'}
          </span>
        </button>

        {formularioAberto && (
          <div style={{ padding: '20px', borderTop: '1px solid #e5e7eb' }}>
            <div style={sectionTitleStyle}>Seleção do cliente</div>
            <div style={grid3Style}>
              <select
                name="cliente_id"
                value={form.cliente_id}
                onChange={(e) => selecionarCliente(e.target.value)}
                style={inputStyle}
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome} - {cliente.cnpj}
                  </option>
                ))}
              </select>
            </div>

            <div style={sectionTitleStyle}>Dados do gerador</div>
            <div style={grid4Style}>
              <input
                name="nome_cliente"
                placeholder="Nome fantasia"
                value={form.nome_cliente}
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
              <input
                name="cep"
                placeholder="CEP"
                value={form.cep}
                onChange={atualizarCampo}
                style={inputStyle}
              />
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
              <input
                name="responsavel_nome"
                placeholder="Responsável"
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

            <div style={sectionTitleStyle}>Dados do resíduo</div>
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
              <input
                name="quantidade"
                placeholder="Quantidade"
                value={form.quantidade}
                onChange={atualizarCampo}
                style={inputStyle}
              />
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
                name="acondicionamento"
                placeholder="Acondicionamento"
                value={form.acondicionamento}
                onChange={atualizarCampo}
                style={inputStyle}
              />
            </div>

            <div style={sectionTitleStyle}>Dados operacionais</div>
            <div style={grid4Style}>
              <input
                name="data_coleta"
                type="date"
                value={form.data_coleta}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="transportador"
                placeholder="Transportador"
                value={form.transportador}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="motorista"
                placeholder="Motorista"
                value={form.motorista}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="veiculo"
                placeholder="Veículo"
                value={form.veiculo}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <input
                name="destino_final"
                placeholder="Destino final"
                value={form.destino_final}
                onChange={atualizarCampo}
                style={inputStyle}
              />
              <select
                name="status"
                value={form.status}
                onChange={atualizarCampo}
                style={inputStyle}
              >
                <option value="Rascunho">Rascunho</option>
                <option value="Emitida">Emitida</option>
                <option value="Concluída">Concluída</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>

            <div style={sectionTitleStyle}>Dados ambientais</div>
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
              <textarea
                name="observacoes"
                placeholder="Observações"
                value={form.observacoes}
                onChange={atualizarCampo}
                style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' as const }}
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
                onClick={adicionarOuAtualizarMtr}
                disabled={salvando}
                style={primaryButtonStyle}
              >
                {salvando
                  ? 'Salvando...'
                  : editandoId
                    ? 'Salvar edição'
                    : 'Adicionar MTR'}
              </button>

              <button onClick={cancelarEdicao} style={secondaryButtonStyle}>
                Cancelar
              </button>
            </div>

            {carregandoClientes && (
              <p style={{ marginTop: '16px', color: '#666' }}>Carregando clientes...</p>
            )}
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

export default MTR