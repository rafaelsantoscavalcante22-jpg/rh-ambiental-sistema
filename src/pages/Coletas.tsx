import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

type StatusColeta =
  | 'Coleta criada'
  | 'Documentação emitida'
  | 'Documento entregue ao encarregado'
  | 'Aguardando saída'
  | 'Tara registrada'
  | 'Em rota / em coleta'
  | 'Coleta realizada'
  | 'Bruto registrado'
  | 'Peso líquido calculado'
  | 'Entregue ao operacional'
  | 'Lançado no controle de massa'
  | 'Finalizado'
  | 'Cancelado'

type Prioridade = 'Baixa' | 'Média' | 'Alta' | 'Urgente'

type Coleta = {
  id: string
  numero: string
  cliente: string
  dataAgendada: string
  tipoResiduo: string
  prioridade: Prioridade
  status: StatusColeta
  responsavelInterno: string
  encarregado: string
  motoristaEquipe: string
  endereco: string
  cidade: string
  observacoes: string
  tara: string
  bruto: string
  pesoLiquido: string
  documentacaoEmitida: boolean
  assinaturaNoLocal: boolean
  entregueOperacional: boolean
  controleMassa: boolean
  createdAt: string
}

type ColetaRow = {
  id: string
  numero: string
  cliente: string
  data_agendada: string
  tipo_residuo: string
  prioridade: string
  status: string
  responsavel_interno: string
  encarregado: string | null
  motorista_equipe: string | null
  endereco: string
  cidade: string
  observacoes: string | null
  tara: number | null
  bruto: number | null
  peso_liquido: number | null
  documentacao_emitida: boolean
  assinatura_no_local: boolean
  entregue_operacional: boolean
  controle_massa: boolean
  created_at: string
}

type ClienteOption = {
  id: string
  nome: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  tipo_residuo: string
}

type FormState = {
  numero: string
  cliente: string
  dataAgendada: string
  tipoResiduo: string
  prioridade: Prioridade
  status: StatusColeta
  responsavelInterno: string
  encarregado: string
  motoristaEquipe: string
  endereco: string
  cidade: string
  observacoes: string
  tara: string
  bruto: string
  documentacaoEmitida: boolean
  assinaturaNoLocal: boolean
  entregueOperacional: boolean
  controleMassa: boolean
}

const STATUS_OPTIONS: StatusColeta[] = [
  'Coleta criada',
  'Documentação emitida',
  'Documento entregue ao encarregado',
  'Aguardando saída',
  'Tara registrada',
  'Em rota / em coleta',
  'Coleta realizada',
  'Bruto registrado',
  'Peso líquido calculado',
  'Entregue ao operacional',
  'Lançado no controle de massa',
  'Finalizado',
  'Cancelado',
]

const FLUXO_STATUS: StatusColeta[] = [
  'Coleta criada',
  'Documentação emitida',
  'Documento entregue ao encarregado',
  'Aguardando saída',
  'Tara registrada',
  'Em rota / em coleta',
  'Coleta realizada',
  'Bruto registrado',
  'Peso líquido calculado',
  'Entregue ao operacional',
  'Lançado no controle de massa',
  'Finalizado',
]

const PRIORIDADE_OPTIONS: Prioridade[] = ['Baixa', 'Média', 'Alta', 'Urgente']

const initialFormState: FormState = {
  numero: '',
  cliente: '',
  dataAgendada: '',
  tipoResiduo: '',
  prioridade: 'Média',
  status: 'Coleta criada',
  responsavelInterno: '',
  encarregado: '',
  motoristaEquipe: '',
  endereco: '',
  cidade: '',
  observacoes: '',
  tara: '',
  bruto: '',
  documentacaoEmitida: false,
  assinaturaNoLocal: false,
  entregueOperacional: false,
  controleMassa: false,
}

function formatDate(date: string) {
  if (!date) return '-'

  const [year, month, day] = date.split('-')
  if (!year || !month || !day) return date

  return `${day}/${month}/${year}`
}

function formatPeso(value: string) {
  if (!value) return '-'

  const numero = Number(value)
  if (Number.isNaN(numero)) return '-'

  return `${numero.toLocaleString('pt-BR')} kg`
}

function getStatusStyle(status: StatusColeta) {
  switch (status) {
    case 'Coleta criada':
    case 'Documentação emitida':
    case 'Documento entregue ao encarregado':
      return { backgroundColor: '#dbeafe', color: '#1d4ed8' }

    case 'Aguardando saída':
    case 'Tara registrada':
      return { backgroundColor: '#fef3c7', color: '#b45309' }

    case 'Em rota / em coleta':
    case 'Coleta realizada':
    case 'Bruto registrado':
    case 'Peso líquido calculado':
    case 'Entregue ao operacional':
    case 'Lançado no controle de massa':
      return { backgroundColor: '#ffedd5', color: '#c2410c' }

    case 'Finalizado':
      return { backgroundColor: '#dcfce7', color: '#15803d' }

    case 'Cancelado':
      return { backgroundColor: '#fee2e2', color: '#dc2626' }

    default:
      return { backgroundColor: '#e5e7eb', color: '#374151' }
  }
}

function getPrioridadeStyle(prioridade: Prioridade) {
  switch (prioridade) {
    case 'Baixa':
      return { backgroundColor: '#e5e7eb', color: '#374151' }
    case 'Média':
      return { backgroundColor: '#dbeafe', color: '#1d4ed8' }
    case 'Alta':
      return { backgroundColor: '#fef3c7', color: '#b45309' }
    case 'Urgente':
      return { backgroundColor: '#fee2e2', color: '#dc2626' }
    default:
      return { backgroundColor: '#e5e7eb', color: '#374151' }
  }
}

function calcularPesoLiquido(tara: string, bruto: string) {
  const taraNumero = Number(tara)
  const brutoNumero = Number(bruto)

  if (!tara || !bruto) return ''
  if (Number.isNaN(taraNumero) || Number.isNaN(brutoNumero)) return ''
  if (brutoNumero < taraNumero) return ''

  return String(brutoNumero - taraNumero)
}

function gerarNumeroColeta(coletas: Coleta[]) {
  const anoAtual = new Date().getFullYear()

  const maiorNumero = coletas.reduce((acc, coleta) => {
    const partes = coleta.numero.split('-')
    const ultimoTrecho = partes[partes.length - 1]
    const numero = Number(ultimoTrecho)

    if (Number.isNaN(numero)) return acc
    return numero > acc ? numero : acc
  }, 0)

  return `COL-${anoAtual}-${String(maiorNumero + 1).padStart(3, '0')}`
}

function mapRowToColeta(row: ColetaRow): Coleta {
  return {
    id: row.id,
    numero: row.numero,
    cliente: row.cliente,
    dataAgendada: row.data_agendada,
    tipoResiduo: row.tipo_residuo,
    prioridade: (row.prioridade as Prioridade) || 'Média',
    status: (row.status as StatusColeta) || 'Coleta criada',
    responsavelInterno: row.responsavel_interno,
    encarregado: row.encarregado || '',
    motoristaEquipe: row.motorista_equipe || '',
    endereco: row.endereco,
    cidade: row.cidade,
    observacoes: row.observacoes || '',
    tara: row.tara !== null ? String(row.tara) : '',
    bruto: row.bruto !== null ? String(row.bruto) : '',
    pesoLiquido: row.peso_liquido !== null ? String(row.peso_liquido) : '',
    documentacaoEmitida: row.documentacao_emitida,
    assinaturaNoLocal: row.assinatura_no_local,
    entregueOperacional: row.entregue_operacional,
    controleMassa: row.controle_massa,
    createdAt: row.created_at,
  }
}

function mapColetaToForm(coleta: Coleta): FormState {
  return {
    numero: coleta.numero,
    cliente: coleta.cliente,
    dataAgendada: coleta.dataAgendada,
    tipoResiduo: coleta.tipoResiduo,
    prioridade: coleta.prioridade,
    status: coleta.status,
    responsavelInterno: coleta.responsavelInterno,
    encarregado: coleta.encarregado,
    motoristaEquipe: coleta.motoristaEquipe,
    endereco: coleta.endereco,
    cidade: coleta.cidade,
    observacoes: coleta.observacoes,
    tara: coleta.tara,
    bruto: coleta.bruto,
    documentacaoEmitida: coleta.documentacaoEmitida,
    assinaturaNoLocal: coleta.assinaturaNoLocal,
    entregueOperacional: coleta.entregueOperacional,
    controleMassa: coleta.controleMassa,
  }
}

function getProximoStatus(statusAtual: StatusColeta): StatusColeta | null {
  if (statusAtual === 'Cancelado' || statusAtual === 'Finalizado') return null

  const indiceAtual = FLUXO_STATUS.indexOf(statusAtual)
  if (indiceAtual === -1) return null

  return FLUXO_STATUS[indiceAtual + 1] || null
}

function aplicarRegrasDeStatus(coleta: Coleta, novoStatus: StatusColeta) {
  const tara = coleta.tara
  const bruto = coleta.bruto
  const pesoLiquido = calcularPesoLiquido(tara, bruto)

  return {
    ...coleta,
    status: novoStatus,
    pesoLiquido: pesoLiquido || coleta.pesoLiquido,
    documentacaoEmitida:
      novoStatus === 'Documentação emitida' ||
      novoStatus === 'Documento entregue ao encarregado' ||
      novoStatus === 'Aguardando saída' ||
      novoStatus === 'Tara registrada' ||
      novoStatus === 'Em rota / em coleta' ||
      novoStatus === 'Coleta realizada' ||
      novoStatus === 'Bruto registrado' ||
      novoStatus === 'Peso líquido calculado' ||
      novoStatus === 'Entregue ao operacional' ||
      novoStatus === 'Lançado no controle de massa' ||
      novoStatus === 'Finalizado'
        ? true
        : coleta.documentacaoEmitida,
    assinaturaNoLocal:
      novoStatus === 'Coleta realizada' ||
      novoStatus === 'Bruto registrado' ||
      novoStatus === 'Peso líquido calculado' ||
      novoStatus === 'Entregue ao operacional' ||
      novoStatus === 'Lançado no controle de massa' ||
      novoStatus === 'Finalizado'
        ? true
        : coleta.assinaturaNoLocal,
    entregueOperacional:
      novoStatus === 'Entregue ao operacional' ||
      novoStatus === 'Lançado no controle de massa' ||
      novoStatus === 'Finalizado'
        ? true
        : coleta.entregueOperacional,
    controleMassa:
      novoStatus === 'Lançado no controle de massa' || novoStatus === 'Finalizado'
        ? true
        : coleta.controleMassa,
  }
}

function montarEnderecoCliente(cliente: ClienteOption) {
  const partes = [cliente.rua, cliente.numero, cliente.bairro].filter(Boolean)
  return partes.join(', ')
}

export default function Coletas() {
  const [coletas, setColetas] = useState<Coleta[]>([])
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [busca, setBusca] = useState('')
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [loading, setLoading] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    ...initialFormState,
    numero: gerarNumeroColeta([]),
  })

  const totalColetas = useMemo(() => coletas.length, [coletas])

  const totalAgendadas = useMemo(() => {
    return coletas.filter(
      (coleta) =>
        coleta.status === 'Coleta criada' ||
        coleta.status === 'Documentação emitida' ||
        coleta.status === 'Documento entregue ao encarregado' ||
        coleta.status === 'Aguardando saída'
    ).length
  }, [coletas])

  const totalEmAndamento = useMemo(() => {
    return coletas.filter(
      (coleta) =>
        coleta.status === 'Tara registrada' ||
        coleta.status === 'Em rota / em coleta' ||
        coleta.status === 'Coleta realizada' ||
        coleta.status === 'Bruto registrado' ||
        coleta.status === 'Peso líquido calculado' ||
        coleta.status === 'Entregue ao operacional' ||
        coleta.status === 'Lançado no controle de massa'
    ).length
  }, [coletas])

  const totalFinalizadas = useMemo(() => {
    return coletas.filter((coleta) => coleta.status === 'Finalizado').length
  }, [coletas])

  const coletasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    if (!termo) return coletas

    return coletas.filter((coleta) => {
      return (
        coleta.numero.toLowerCase().includes(termo) ||
        coleta.cliente.toLowerCase().includes(termo) ||
        coleta.tipoResiduo.toLowerCase().includes(termo) ||
        coleta.status.toLowerCase().includes(termo) ||
        coleta.prioridade.toLowerCase().includes(termo) ||
        coleta.cidade.toLowerCase().includes(termo) ||
        coleta.responsavelInterno.toLowerCase().includes(termo)
      )
    })
  }, [busca, coletas])

  async function carregarClientes() {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, rua, numero, bairro, cidade, tipo_residuo')
      .order('nome', { ascending: true })

    if (error) {
      throw error
    }

    setClientes((data || []) as ClienteOption[])
  }

  async function carregarColetas() {
    const { data, error } = await supabase
      .from('coletas')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const lista = ((data || []) as ColetaRow[]).map(mapRowToColeta)
    setColetas(lista)

    if (!editandoId) {
      setForm((prev) => ({
        ...prev,
        numero: gerarNumeroColeta(lista),
      }))
    }
  }

  async function carregarDadosIniciais() {
    try {
      setLoading(true)
      setErro('')

      await Promise.all([carregarColetas(), carregarClientes()])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDadosIniciais()
  }, [])

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = event.target

    if (type === 'checkbox') {
      const checked = (event.target as HTMLInputElement).checked

      setForm((prev) => ({
        ...prev,
        [name]: checked,
      }))

      return
    }

    if (name === 'cliente') {
      const clienteSelecionado = clientes.find((cliente) => cliente.nome === value)

      if (clienteSelecionado) {
        setForm((prev) => ({
          ...prev,
          cliente: clienteSelecionado.nome,
          cidade: clienteSelecionado.cidade || prev.cidade,
          endereco: montarEnderecoCliente(clienteSelecionado) || prev.endereco,
          tipoResiduo: prev.tipoResiduo || clienteSelecionado.tipo_residuo || '',
        }))
        return
      }
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  function resetForm(listaAtual: Coleta[] = coletas) {
    setForm({
      ...initialFormState,
      numero: gerarNumeroColeta(listaAtual),
    })
    setEditandoId(null)
  }

  function handleAbrirFormulario() {
    setErro('')
    setSucesso('')

    if (formularioAberto && editandoId) {
      resetForm()
      setFormularioAberto(false)
      return
    }

    if (formularioAberto && !editandoId) {
      setFormularioAberto(false)
      return
    }

    resetForm()
    setFormularioAberto(true)
  }

  function iniciarEdicao(coleta: Coleta) {
    setErro('')
    setSucesso('')
    setEditandoId(coleta.id)
    setForm(mapColetaToForm(coleta))
    setFormularioAberto(true)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    resetForm()
    setErro('')
    setSucesso('')
    setFormularioAberto(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro('')
    setSucesso('')

    if (!form.numero.trim()) {
      setErro('Informe o número da coleta.')
      return
    }

    if (!form.cliente.trim()) {
      setErro('Selecione o cliente.')
      return
    }

    if (!form.dataAgendada) {
      setErro('Informe a data agendada.')
      return
    }

    if (!form.tipoResiduo.trim()) {
      setErro('Informe o tipo de resíduo.')
      return
    }

    if (!form.responsavelInterno.trim()) {
      setErro('Informe o responsável interno.')
      return
    }

    if (!form.endereco.trim()) {
      setErro('Informe o endereço.')
      return
    }

    if (!form.cidade.trim()) {
      setErro('Informe a cidade.')
      return
    }

    const pesoLiquidoCalculado = calcularPesoLiquido(form.tara, form.bruto)

    try {
      setSalvando(true)

      const payload = {
        numero: form.numero.trim(),
        cliente: form.cliente.trim(),
        data_agendada: form.dataAgendada,
        tipo_residuo: form.tipoResiduo.trim(),
        prioridade: form.prioridade,
        status: form.status,
        responsavel_interno: form.responsavelInterno.trim(),
        encarregado: form.encarregado.trim() || null,
        motorista_equipe: form.motoristaEquipe.trim() || null,
        endereco: form.endereco.trim(),
        cidade: form.cidade.trim(),
        observacoes: form.observacoes.trim() || null,
        tara: form.tara ? Number(form.tara) : null,
        bruto: form.bruto ? Number(form.bruto) : null,
        peso_liquido: pesoLiquidoCalculado ? Number(pesoLiquidoCalculado) : null,
        documentacao_emitida: form.documentacaoEmitida,
        assinatura_no_local: form.assinaturaNoLocal,
        entregue_operacional: form.entregueOperacional,
        controle_massa: form.controleMassa,
      }

      if (editandoId) {
        const { error } = await supabase
          .from('coletas')
          .update(payload)
          .eq('id', editandoId)

        if (error) throw error

        setSucesso('Coleta atualizada com sucesso.')
      } else {
        const { error } = await supabase.from('coletas').insert(payload)

        if (error) throw error

        setSucesso('Coleta cadastrada com sucesso.')
      }

      await carregarColetas()
      resetForm()
      setFormularioAberto(false)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar coleta.')
    } finally {
      setSalvando(false)
    }
  }

  async function avancarStatusColeta(coleta: Coleta) {
    const proximoStatus = getProximoStatus(coleta.status)

    if (!proximoStatus) return

    const coletaAtualizada = aplicarRegrasDeStatus(coleta, proximoStatus)

    try {
      setErro('')
      setSucesso('')
      setStatusLoadingId(coleta.id)

      const { error } = await supabase
        .from('coletas')
        .update({
          status: coletaAtualizada.status,
          peso_liquido: coletaAtualizada.pesoLiquido
            ? Number(coletaAtualizada.pesoLiquido)
            : null,
          documentacao_emitida: coletaAtualizada.documentacaoEmitida,
          assinatura_no_local: coletaAtualizada.assinaturaNoLocal,
          entregue_operacional: coletaAtualizada.entregueOperacional,
          controle_massa: coletaAtualizada.controleMassa,
        })
        .eq('id', coleta.id)

      if (error) throw error

      if (editandoId === coleta.id) {
        setForm((prev) => ({
          ...prev,
          status: coletaAtualizada.status,
          documentacaoEmitida: coletaAtualizada.documentacaoEmitida,
          assinaturaNoLocal: coletaAtualizada.assinaturaNoLocal,
          entregueOperacional: coletaAtualizada.entregueOperacional,
          controleMassa: coletaAtualizada.controleMassa,
        }))
      }

      setSucesso(`Status da coleta ${coleta.numero} atualizado para "${proximoStatus}".`)
      await carregarColetas()
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : 'Erro ao avançar status da coleta.'
      )
    } finally {
      setStatusLoadingId(null)
    }
  }

  async function removerColeta(id: string) {
    const confirmar = window.confirm('Deseja realmente remover esta coleta?')
    if (!confirmar) return

    try {
      setErro('')
      setSucesso('')

      const { error } = await supabase.from('coletas').delete().eq('id', id)

      if (error) throw error

      if (editandoId === id) {
        resetForm()
        setFormularioAberto(false)
      }

      setSucesso('Coleta removida com sucesso.')
      await carregarColetas()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao remover coleta.')
    }
  }

  return (
    <MainLayout>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', color: '#0f172a' }}>Coletas</h1>
          <p style={{ margin: '8px 0 0', color: '#475569', fontSize: '16px' }}>
            Controle operacional completo das coletas da RG Ambiental
          </p>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '16px 18px',
            borderRadius: '16px',
            minWidth: '220px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '6px' }}>
            Total de coletas
          </div>
          <div style={{ fontSize: '36px', fontWeight: 800, color: '#0f172a' }}>
            {totalColetas}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Agendadas</div>
          <div style={cardResumoValorStyle}>{totalAgendadas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Em andamento</div>
          <div style={cardResumoValorStyle}>{totalEmAndamento}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Finalizadas</div>
          <div style={cardResumoValorStyle}>{totalFinalizadas}</div>
        </div>
      </div>

      {erro && <div style={erroStyle}>{erro}</div>}
      {sucesso && <div style={sucessoStyle}>{sucesso}</div>}

      <div style={cardPrincipalStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '18px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Lista de coletas</h2>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Buscar por número, cliente, status, prioridade, cidade ou responsável"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              style={{ ...inputStyle, maxWidth: '420px' }}
            />

            <button
              type="button"
              style={botaoSecundarioStyle}
              onClick={carregarDadosIniciais}
              disabled={loading}
            >
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Número</th>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Prioridade</th>
                <th style={thStyle}>Resíduo</th>
                <th style={thStyle}>Cidade</th>
                <th style={thStyle}>Peso líquido</th>
                <th style={thStyle}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={emptyTdStyle}>
                    Carregando coletas...
                  </td>
                </tr>
              ) : coletasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={9} style={emptyTdStyle}>
                    Nenhuma coleta encontrada.
                  </td>
                </tr>
              ) : (
                coletasFiltradas.map((coleta) => {
                  const proximoStatus = getProximoStatus(coleta.status)
                  const carregandoStatus = statusLoadingId === coleta.id

                  return (
                    <tr key={coleta.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={tdStyle}>{coleta.numero}</td>
                      <td style={tdStyle}>{coleta.cliente}</td>
                      <td style={tdStyle}>{formatDate(coleta.dataAgendada)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeBaseStyle,
                            ...getStatusStyle(coleta.status),
                          }}
                        >
                          {coleta.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeBaseStyle,
                            ...getPrioridadeStyle(coleta.prioridade),
                          }}
                        >
                          {coleta.prioridade}
                        </span>
                      </td>
                      <td style={tdStyle}>{coleta.tipoResiduo}</td>
                      <td style={tdStyle}>{coleta.cidade}</td>
                      <td style={tdStyle}>{formatPeso(coleta.pesoLiquido)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            style={botaoEditarStyle}
                            onClick={() => iniciarEdicao(coleta)}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            style={{
                              ...botaoAvancarStyle,
                              opacity: proximoStatus ? 1 : 0.6,
                              cursor: proximoStatus ? 'pointer' : 'not-allowed',
                            }}
                            onClick={() => {
                              if (proximoStatus) {
                                avancarStatusColeta(coleta)
                              }
                            }}
                            disabled={!proximoStatus || carregandoStatus}
                            title={
                              proximoStatus
                                ? `Avançar para: ${proximoStatus}`
                                : 'Essa coleta não pode avançar mais'
                            }
                          >
                            {carregandoStatus
                              ? 'Avançando...'
                              : proximoStatus
                              ? 'Avançar status'
                              : 'Sem próxima etapa'}
                          </button>

                          <button
                            type="button"
                            style={botaoRemoverStyle}
                            onClick={() => removerColeta(coleta.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardPrincipalStyle}>
        <button type="button" style={headerExpansivelStyle} onClick={handleAbrirFormulario}>
          <span>{editandoId ? 'Editar coleta' : 'Novo cadastro de coleta'}</span>
          <span style={{ fontSize: '24px', color: '#64748b' }}>
            {formularioAberto ? '−' : '+'}
          </span>
        </button>

        {formularioAberto && (
          <div style={{ paddingTop: '24px' }}>
            {editandoId && (
              <div
                style={{
                  marginBottom: '18px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  fontWeight: 600,
                }}
              >
                Você está editando a coleta <strong>{form.numero}</strong>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <h3 style={sectionTitleStyle}>Dados principais</h3>

              <div style={grid4Style}>
                <div>
                  <label style={labelStyle}>Número da coleta</label>
                  <input
                    name="numero"
                    value={form.numero}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Ex: COL-2026-004"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Cliente</label>
                  <select
                    name="cliente"
                    value={form.cliente}
                    onChange={handleInputChange}
                    style={inputStyle}
                  >
                    <option value="">Selecione um cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.nome}>
                        {cliente.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Data agendada</label>
                  <input
                    type="date"
                    name="dataAgendada"
                    value={form.dataAgendada}
                    onChange={handleInputChange}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Tipo de resíduo</label>
                  <input
                    name="tipoResiduo"
                    value={form.tipoResiduo}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Ex: Fossa, plástico, industrial"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Prioridade</label>
                  <select
                    name="prioridade"
                    value={form.prioridade}
                    onChange={handleInputChange}
                    style={inputStyle}
                  >
                    {PRIORIDADE_OPTIONS.map((prioridade) => (
                      <option key={prioridade} value={prioridade}>
                        {prioridade}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleInputChange}
                    style={inputStyle}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Responsável interno</label>
                  <input
                    name="responsavelInterno"
                    value={form.responsavelInterno}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Ex: Rafaela / Rosi"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Encarregado</label>
                  <input
                    name="encarregado"
                    value={form.encarregado}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Ex: Heberson"
                  />
                </div>
              </div>

              <h3 style={sectionTitleStyle}>Local da coleta</h3>

              <div style={grid2Style}>
                <div>
                  <label style={labelStyle}>Endereço</label>
                  <input
                    name="endereco"
                    value={form.endereco}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Endereço da coleta"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Cidade</label>
                  <input
                    name="cidade"
                    value={form.cidade}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Cidade"
                  />
                </div>
              </div>

              <h3 style={sectionTitleStyle}>Execução operacional</h3>

              <div style={grid4Style}>
                <div>
                  <label style={labelStyle}>Motorista / equipe</label>
                  <input
                    name="motoristaEquipe"
                    value={form.motoristaEquipe}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Equipe responsável"
                  />
                </div>

                <div>
                  <label style={labelStyle}>TARA (kg)</label>
                  <input
                    type="number"
                    name="tara"
                    value={form.tara}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Peso do caminhão vazio"
                  />
                </div>

                <div>
                  <label style={labelStyle}>BRUTO (kg)</label>
                  <input
                    type="number"
                    name="bruto"
                    value={form.bruto}
                    onChange={handleInputChange}
                    style={inputStyle}
                    placeholder="Peso do caminhão cheio"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Peso líquido</label>
                  <input
                    value={calcularPesoLiquido(form.tara, form.bruto)}
                    style={{ ...inputStyle, backgroundColor: '#f8fafc' }}
                    placeholder="Calculado automaticamente"
                    readOnly
                  />
                </div>
              </div>

              <h3 style={sectionTitleStyle}>Controle documental</h3>

              <div style={checkboxGridStyle}>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    name="documentacaoEmitida"
                    checked={form.documentacaoEmitida}
                    onChange={handleInputChange}
                  />
                  Documentação emitida
                </label>

                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    name="assinaturaNoLocal"
                    checked={form.assinaturaNoLocal}
                    onChange={handleInputChange}
                  />
                  Assinatura no local
                </label>

                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    name="entregueOperacional"
                    checked={form.entregueOperacional}
                    onChange={handleInputChange}
                  />
                  Entregue ao operacional
                </label>

                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    name="controleMassa"
                    checked={form.controleMassa}
                    onChange={handleInputChange}
                  />
                  Lançado no controle de massa
                </label>
              </div>

              <h3 style={sectionTitleStyle}>Observações</h3>

              <div>
                <label style={labelStyle}>Observações gerais</label>
                <textarea
                  name="observacoes"
                  value={form.observacoes}
                  onChange={handleInputChange}
                  style={textareaStyle}
                  placeholder="Detalhes importantes da coleta"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '24px' }}>
                <button type="submit" style={botaoSalvarStyle} disabled={salvando}>
                  {salvando
                    ? editandoId
                      ? 'Salvando alterações...'
                      : 'Salvando...'
                    : editandoId
                    ? 'Salvar alterações'
                    : 'Salvar coleta'}
                </button>

                <button
                  type="button"
                  style={botaoSecundarioStyle}
                  onClick={() => {
                    if (editandoId) {
                      cancelarEdicao()
                    } else {
                      resetForm()
                      setErro('')
                      setSucesso('')
                    }
                  }}
                >
                  {editandoId ? 'Cancelar edição' : 'Limpar formulário'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

const cardResumoStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
}

const cardResumoTituloStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '14px',
  marginBottom: '8px',
}

const cardResumoValorStyle: CSSProperties = {
  color: '#0f172a',
  fontSize: '30px',
  fontWeight: 800,
}

const cardPrincipalStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
  marginBottom: '24px',
}

const erroStyle: CSSProperties = {
  marginBottom: '20px',
  padding: '14px 16px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  borderRadius: '12px',
}

const sucessoStyle: CSSProperties = {
  marginBottom: '20px',
  padding: '14px 16px',
  backgroundColor: '#ecfdf5',
  border: '1px solid #bbf7d0',
  color: '#15803d',
  borderRadius: '12px',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1320px',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '14px 12px',
  fontSize: '14px',
  color: '#475569',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
}

const tdStyle: CSSProperties = {
  padding: '14px 12px',
  fontSize: '14px',
  color: '#0f172a',
  verticalAlign: 'middle',
}

const emptyTdStyle: CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  color: '#64748b',
  fontSize: '14px',
}

const badgeBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const botaoEditarStyle: CSSProperties = {
  backgroundColor: '#22c55e',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoAvancarStyle: CSSProperties = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoRemoverStyle: CSSProperties = {
  backgroundColor: '#ef4444',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoSalvarStyle: CSSProperties = {
  backgroundColor: '#22c55e',
  color: '#052e16',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  fontSize: '14px',
  fontWeight: 800,
  cursor: 'pointer',
}

const botaoSecundarioStyle: CSSProperties = {
  backgroundColor: '#e5e7eb',
  color: '#111827',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const headerExpansivelStyle: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  padding: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  color: '#0f172a',
  fontSize: '22px',
  fontWeight: 800,
}

const sectionTitleStyle: CSSProperties = {
  marginTop: '28px',
  marginBottom: '14px',
  color: '#0f172a',
  fontSize: '18px',
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '8px',
  color: '#334155',
  fontSize: '14px',
  fontWeight: 600,
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  fontSize: '14px',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '110px',
  resize: 'vertical',
}

const grid4Style: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
}

const grid2Style: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '16px',
}

const checkboxGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
}

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '12px 14px',
  fontSize: '14px',
  color: '#334155',
}