import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { COLETAS_LIST_MAX_ROWS, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../lib/coletasQueryLimits'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { cargoPodeMutarFinanceiro } from '../lib/workflowPermissions'
import {
  COLETAS_OR_FINANCEIRO_QUERY,
  coletaVisivelListaFinanceiro,
  isVencidoFinanceiro,
} from '../lib/financeiroColetas'
import {
  formatarEtapaParaUI,
  normalizarEtapaColeta,
} from '../lib/fluxoEtapas'

type StatusPagamento = 'Pendente' | 'Parcial' | 'Pago'

type FinanceiroRow = {
  id: string
  numero: string
  cliente: string
  data_agendada: string
  tipo_residuo: string
  cidade: string
  etapa_operacional: string | null
  fluxo_status?: string | null
  observacoes?: string | null
  liberado_financeiro: boolean | null
  valor_coleta: number | null
  status_pagamento: string | null
  data_vencimento: string | null
  peso_liquido: number | null
  created_at: string
  mtr_id?: string | null
  programacao_id?: string | null
  cliente_id?: string | null
}

type FinanceiroItem = {
  id: string
  numero: string
  cliente: string
  dataAgendada: string
  tipoResiduo: string
  cidade: string
  etapaOperacional: string
  liberadoFinanceiro: boolean
  valorColeta: string
  statusPagamento: StatusPagamento | ''
  dataVencimento: string
  pesoLiquido: string
  createdAt: string
  mtrId: string
  programacaoId: string
  clienteId: string
}

const STATUS_OPTIONS: StatusPagamento[] = ['Pendente', 'Parcial', 'Pago']

function formatDate(date: string) {
  if (!date) return '-'

  const [year, month, day] = date.split('-')
  if (!year || !month || !day) return date

  return `${day}/${month}/${year}`
}

function formatCurrency(value: string) {
  if (!value) return 'R$ 0,00'

  const numero = Number(value)
  if (Number.isNaN(numero)) return 'R$ 0,00'

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatPeso(value: string) {
  if (!value) return '-'

  const numero = Number(value)
  if (Number.isNaN(numero)) return '-'

  return `${numero.toLocaleString('pt-BR')} kg`
}

function mapRow(row: FinanceiroRow): FinanceiroItem {
  const etapa = normalizarEtapaColeta({
    fluxo_status: row.fluxo_status,
    etapa_operacional: row.etapa_operacional,
  })
  return {
    id: row.id,
    numero: row.numero,
    cliente: row.cliente,
    dataAgendada: row.data_agendada,
    tipoResiduo: row.tipo_residuo,
    cidade: row.cidade,
    etapaOperacional: formatarEtapaParaUI(etapa),
    liberadoFinanceiro: row.liberado_financeiro ?? false,
    valorColeta: row.valor_coleta !== null ? String(row.valor_coleta) : '',
    statusPagamento:
      row.status_pagamento === 'Pendente' ||
      row.status_pagamento === 'Parcial' ||
      row.status_pagamento === 'Pago'
        ? row.status_pagamento
        : '',
    dataVencimento: row.data_vencimento || '',
    pesoLiquido: row.peso_liquido !== null ? String(row.peso_liquido) : '',
    createdAt: row.created_at,
    mtrId: row.mtr_id != null ? String(row.mtr_id) : '',
    programacaoId: row.programacao_id != null ? String(row.programacao_id) : '',
    clienteId: row.cliente_id != null ? String(row.cliente_id) : '',
  }
}

function resolverFinanceiroItem(
  itens: FinanceiroItem[],
  ids: {
    coleta: string | null
    mtr: string | null
    programacao: string | null
    cliente: string | null
  }
): FinanceiroItem | null {
  if (ids.coleta) {
    const x = itens.find((i) => i.id === ids.coleta)
    if (x) return x
  }
  if (ids.mtr) {
    const x = itens.find((i) => i.mtrId && i.mtrId === ids.mtr)
    if (x) return x
  }
  if (ids.programacao) {
    const x = itens.find((i) => i.programacaoId && i.programacaoId === ids.programacao)
    if (x) return x
  }
  if (ids.cliente) {
    const x = itens.find((i) => i.clienteId && i.clienteId === ids.cliente)
    if (x) return x
  }
  return null
}

function getStatusStyle(status: StatusPagamento | '') {
  switch (status) {
    case 'Pendente':
      return { backgroundColor: '#fef3c7', color: '#b45309' }
    case 'Parcial':
      return { backgroundColor: '#dbeafe', color: '#1d4ed8' }
    case 'Pago':
      return { backgroundColor: '#dcfce7', color: '#15803d' }
    default:
      return { backgroundColor: '#fee2e2', color: '#dc2626' }
  }
}

export default function Financeiro() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlColetaId = searchParams.get('coleta')
  const urlMtrId = searchParams.get('mtr')
  const urlProgramacaoId = searchParams.get('programacao')
  const urlClienteId = searchParams.get('cliente')
  const prevContextoScrollKeyRef = useRef<string>('')

  const [itens, setItens] = useState<FinanceiroItem[]>([])
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebouncedValue(busca, 350)
  const [somenteVencidos, setSomenteVencidos] = useState(false)
  const [pageTab, setPageTab] = useState(1)
  const [pageSizeTab, setPageSizeTab] = useState(DEFAULT_PAGE_SIZE)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [loading, setLoading] = useState(false)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [usuarioCargo, setUsuarioCargo] = useState<string | null>(null)

  const podeMutarFinanceiro = cargoPodeMutarFinanceiro(usuarioCargo)

  const temParametrosContexto = !!(
    urlColetaId ||
    urlMtrId ||
    urlProgramacaoId ||
    urlClienteId
  )

  const itemContextoResolvido = useMemo(
    () =>
      resolverFinanceiroItem(itens, {
        coleta: urlColetaId,
        mtr: urlMtrId,
        programacao: urlProgramacaoId,
        cliente: urlClienteId,
      }),
    [itens, urlColetaId, urlMtrId, urlProgramacaoId, urlClienteId]
  )

  function limparContextoUrl() {
    setSearchParams({}, { replace: true })
    prevContextoScrollKeyRef.current = ''
  }

  function montarParamsFluxo(item: FinanceiroItem) {
    const p = new URLSearchParams()
    p.set('coleta', item.id)
    if (item.mtrId) p.set('mtr', item.mtrId)
    if (item.programacaoId) p.set('programacao', item.programacaoId)
    if (item.clienteId) p.set('cliente', item.clienteId)
    return p
  }

  function irProgramacao(item: FinanceiroItem) {
    navigate(`/programacao?${montarParamsFluxo(item).toString()}`)
  }
  function irMtr(item: FinanceiroItem) {
    navigate(`/mtr?${montarParamsFluxo(item).toString()}`)
  }
  function irControleMassa(item: FinanceiroItem) {
    navigate(`/controle-massa?${montarParamsFluxo(item).toString()}`)
  }

  const carregarFinanceiro = useCallback(async () => {
    const { data, error } = await supabase
      .from('coletas')
      .select(
        'id, numero, cliente, cliente_id, data_agendada, tipo_residuo, cidade, etapa_operacional, fluxo_status, observacoes, liberado_financeiro, valor_coleta, status_pagamento, data_vencimento, peso_liquido, mtr_id, programacao_id, created_at'
      )
      .or(COLETAS_OR_FINANCEIRO_QUERY)
      .order('created_at', { ascending: false })
      .limit(COLETAS_LIST_MAX_ROWS)

    if (error) throw error

    const filtradas = ((data || []) as FinanceiroRow[]).filter((row) => coletaVisivelListaFinanceiro(row))

    setItens(filtradas.map(mapRow))
  }, [])

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      setErro('')
      await carregarFinanceiro()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar financeiro.')
    } finally {
      setLoading(false)
    }
  }, [carregarFinanceiro])

  useEffect(() => {
    void carregarDados()
  }, [carregarDados])

  useEffect(() => {
    async function carregarCargo() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUsuarioCargo(null)
        return
      }
      const { data } = await supabase
        .from('usuarios')
        .select('cargo')
        .eq('id', user.id)
        .maybeSingle()
      setUsuarioCargo(data?.cargo ?? null)
    }
    void carregarCargo()
  }, [])

  useEffect(() => {
    if (loading || !temParametrosContexto || !itemContextoResolvido) return

    const scrollKey = [urlColetaId, urlMtrId, urlProgramacaoId, urlClienteId].join('|')
    if (prevContextoScrollKeyRef.current === scrollKey) return
    prevContextoScrollKeyRef.current = scrollKey

    const id = itemContextoResolvido.id
    window.setTimeout(() => {
      document.getElementById(`fin-row-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 160)
  }, [
    loading,
    temParametrosContexto,
    itemContextoResolvido,
    urlColetaId,
    urlMtrId,
    urlProgramacaoId,
    urlClienteId,
  ])

  function handleCampo(
    id: string,
    campo: keyof Pick<FinanceiroItem, 'valorColeta' | 'statusPagamento' | 'dataVencimento'>,
    valor: string
  ) {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item))
    )
  }

  async function salvarItem(item: FinanceiroItem) {
    if (!podeMutarFinanceiro) {
      setErro('Seu perfil não pode alterar cobrança. Apenas financeiro ou administrador.')
      return
    }
    try {
      setErro('')
      setSucesso('')
      setSalvandoId(item.id)

      const payload = {
        valor_coleta: item.valorColeta ? Number(item.valorColeta) : null,
        status_pagamento: item.statusPagamento || null,
        data_vencimento: item.dataVencimento || null,
        ...(item.statusPagamento === 'Pago'
          ? {
              etapa_operacional: 'FINALIZADO',
              fluxo_status: 'FINALIZADO',
              status_processo: 'FINALIZADO',
              liberado_financeiro: true,
            }
          : {}),
      }

      const { error } = await supabase.from('coletas').update(payload).eq('id', item.id)

      if (error) throw error

      setSucesso(`Financeiro da coleta ${item.numero} atualizado com sucesso.`)
      await carregarFinanceiro()
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : 'Erro ao atualizar item financeiro.'
      )
    } finally {
      setSalvandoId(null)
    }
  }

  const itensAposBusca = useMemo(() => {
    const termo = buscaDebounced.trim().toLowerCase()

    if (!termo) return itens

    return itens.filter((item) => {
      return (
        item.numero.toLowerCase().includes(termo) ||
        item.cliente.toLowerCase().includes(termo) ||
        item.tipoResiduo.toLowerCase().includes(termo) ||
        item.cidade.toLowerCase().includes(termo) ||
        item.statusPagamento.toLowerCase().includes(termo)
      )
    })
  }, [buscaDebounced, itens])

  const itensFiltrados = useMemo(() => {
    if (!somenteVencidos) return itensAposBusca
    return itensAposBusca.filter((item) =>
      isVencidoFinanceiro(item.dataVencimento, item.statusPagamento)
    )
  }, [itensAposBusca, somenteVencidos])

  const itensPagina = useMemo(() => {
    const start = (pageTab - 1) * pageSizeTab
    return itensFiltrados.slice(start, start + pageSizeTab)
  }, [itensFiltrados, pageTab, pageSizeTab])

  const totalPaginasFin =
    itensFiltrados.length > 0 ? Math.max(1, Math.ceil(itensFiltrados.length / pageSizeTab)) : 1

  useEffect(() => {
    setPageTab(1)
  }, [buscaDebounced, pageSizeTab, somenteVencidos])

  useEffect(() => {
    if (pageTab > totalPaginasFin) setPageTab(totalPaginasFin)
  }, [pageTab, totalPaginasFin])

  const totalLiberadas = useMemo(() => itens.length, [itens])

  const totalSemValor = useMemo(
    () => itens.filter((item) => !item.valorColeta || Number(item.valorColeta) <= 0).length,
    [itens]
  )

  const totalSemVencimento = useMemo(
    () => itens.filter((item) => !item.dataVencimento).length,
    [itens]
  )

  const totalPago = useMemo(
    () => itens.filter((item) => item.statusPagamento === 'Pago').length,
    [itens]
  )

  const itensListaVencidos = useMemo(
    () =>
      itens.filter((item) => isVencidoFinanceiro(item.dataVencimento, item.statusPagamento)),
    [itens]
  )

  const totalVencidos = itensListaVencidos.length

  const valorTotalVencidos = useMemo(() => {
    return itensListaVencidos.reduce((acc, item) => {
      const valor = Number(item.valorColeta || 0)
      return acc + (Number.isNaN(valor) ? 0 : valor)
    }, 0)
  }, [itensListaVencidos])

  const valorTotal = useMemo(() => {
    return itens.reduce((acc, item) => {
      const valor = Number(item.valorColeta || 0)
      return acc + (Number.isNaN(valor) ? 0 : valor)
    }, 0)
  }, [itens])

  return (
    <MainLayout>
      <div className="page-shell">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', color: '#0f172a', fontWeight: 800 }}>
            Financeiro
          </h1>
          <p className="page-header__lead" style={{ margin: '6px 0 0' }}>
            Cobrança e pagamentos após o processo operacional (faturamento / liberação). Valor,
            vencimento e status de pagamento por coleta.
          </p>
          {usuarioCargo ? (
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
              Perfil: <span style={{ color: '#0f172a' }}>{usuarioCargo}</span>
              {!podeMutarFinanceiro ? ' · somente consulta' : ' · pode editar e salvar'}
            </p>
          ) : null}
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '16px 18px',
            borderRadius: '16px',
            minWidth: '260px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '6px' }}>
            Valor total informado
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a' }}>
            {valorTotal.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
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
          <div style={cardResumoTituloStyle}>Liberadas</div>
          <div style={cardResumoValorStyle}>{totalLiberadas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Sem valor</div>
          <div style={cardResumoValorStyle}>{totalSemValor}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Sem vencimento</div>
          <div style={cardResumoValorStyle}>{totalSemVencimento}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Pagas</div>
          <div style={cardResumoValorStyle}>{totalPago}</div>
        </div>

        <div
          style={{
            ...cardResumoStyle,
            borderLeft: '4px solid #dc2626',
            background: 'linear-gradient(180deg, #fffefe 0%, #ffffff 100%)',
          }}
        >
          <div style={cardResumoTituloStyle}>Vencidos</div>
          <div style={cardResumoValorStyle}>{totalVencidos}</div>
          <div
            style={{
              marginTop: '10px',
              fontSize: '15px',
              fontWeight: 700,
              color: '#b91c1c',
            }}
          >
            {valorTotalVencidos.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}{' '}
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
              (soma dos valores)
            </span>
          </div>
        </div>
      </div>

      {erro && <div style={erroStyle}>{erro}</div>}
      {sucesso && <div style={sucessoStyle}>{sucesso}</div>}

      {temParametrosContexto && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '14px 16px',
            borderRadius: '14px',
            marginBottom: '20px',
            fontSize: '14px',
            border: '1px solid',
            ...(itemContextoResolvido
              ? { background: '#f0fdf4', borderColor: '#bbf7d0' }
              : { background: '#fffbeb', borderColor: '#fcd34d' }),
          }}
        >
          <div style={{ flex: '1', minWidth: '220px' }}>
            <strong style={{ color: '#0f172a' }}>Veio de outra tela</strong>
            {itemContextoResolvido ? (
              <span style={{ color: '#475569' }}>
                {' '}
                · Coleta {itemContextoResolvido.numero} · {itemContextoResolvido.cliente} ·{' '}
                {itemContextoResolvido.etapaOperacional}
              </span>
            ) : (
              <span style={{ color: '#92400e' }}>
                {' '}
                · Nada nesta lista bate com o link (só entram coletas já liberadas para o financeiro).
              </span>
            )}
          </div>
          {itemContextoResolvido ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                style={botaoContextoNavStyle}
                onClick={() => irProgramacao(itemContextoResolvido)}
              >
                Programação
              </button>
              <button type="button" style={botaoContextoNavStyle} onClick={() => irMtr(itemContextoResolvido)}>
                MTR
              </button>
              <button
                type="button"
                style={botaoContextoNavStyle}
                onClick={() => irControleMassa(itemContextoResolvido)}
              >
                Controle de massa
              </button>
            </div>
          ) : null}
          <button type="button" style={botaoLimparContextoStyle} onClick={limparContextoUrl}>
            Limpar contexto
          </button>
        </div>
      )}

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
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: 800 }}>
              Cobrança
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Uma linha por coleta na lista de cobrança (etapa de faturamento/liberação ou dados de teste). Ajuste os
              campos e clique em Salvar.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Buscar número, cliente, cidade, resíduo..."
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              style={{ ...inputStyle, maxWidth: '380px' }}
            />

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <input
                type="checkbox"
                checked={somenteVencidos}
                onChange={(e) => setSomenteVencidos(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#dc2626' }}
              />
              Só vencidos
            </label>

            <button
              type="button"
              style={botaoSecundarioStyle}
              onClick={carregarDados}
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
                <th style={thStyle}>Nº</th>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Local</th>
                <th style={thStyle}>Peso</th>
                <th style={thStyle}>Valor</th>
                <th style={thStyle}>Venc.</th>
                <th style={thStyle}>Pagamento</th>
                <th style={thStyle}>Ação</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={emptyTdStyle}>
                    Carregando itens financeiros...
                  </td>
                </tr>
              ) : itensFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} style={emptyTdStyle}>
                    {itens.length === 0
                      ? 'Nenhuma coleta na lista de cobrança.'
                      : itensAposBusca.length === 0
                        ? 'Nenhum resultado para a busca.'
                        : somenteVencidos
                          ? 'Nenhuma coleta vencida com este filtro de busca.'
                          : 'Nenhuma coleta na lista de cobrança.'}
                  </td>
                </tr>
              ) : (
                itensPagina.map((item) => {
                  const vencido = isVencidoFinanceiro(item.dataVencimento, item.statusPagamento)
                  const semValor = !item.valorColeta || Number(item.valorColeta) <= 0
                  const semVencimento = !item.dataVencimento
                  const emDestaque =
                    !!itemContextoResolvido && item.id === itemContextoResolvido.id

                  return (
                    <tr
                      key={item.id}
                      id={`fin-row-${item.id}`}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        ...(emDestaque
                          ? { background: '#f0fdf4', outline: '2px solid #22c55e', outlineOffset: '-2px' }
                          : {}),
                      }}
                    >
                      <td style={tdStyle}>{item.numero}</td>
                      <td style={tdStyle}>{item.cliente}</td>
                      <td style={tdStyle}>{formatDate(item.dataAgendada)}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{item.cidade}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {item.tipoResiduo}
                        </div>
                      </td>
                      <td style={tdStyle}>{formatPeso(item.pesoLiquido)}</td>

                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={item.valorColeta}
                          onChange={(event) =>
                            handleCampo(item.id, 'valorColeta', event.target.value)
                          }
                          placeholder="Ex: 850"
                          disabled={!podeMutarFinanceiro}
                          style={{
                            ...inputTabelaStyle,
                            opacity: podeMutarFinanceiro ? 1 : 0.65,
                          }}
                        />
                        <div style={subInfoStyle}>{formatCurrency(item.valorColeta)}</div>
                      </td>

                      <td style={tdStyle}>
                        <input
                          type="date"
                          value={item.dataVencimento}
                          onChange={(event) =>
                            handleCampo(item.id, 'dataVencimento', event.target.value)
                          }
                          disabled={!podeMutarFinanceiro}
                          style={{
                            ...inputTabelaStyle,
                            opacity: podeMutarFinanceiro ? 1 : 0.65,
                          }}
                        />
                      </td>

                      <td style={tdStyle}>
                        <select
                          value={item.statusPagamento}
                          onChange={(event) =>
                            handleCampo(item.id, 'statusPagamento', event.target.value)
                          }
                          disabled={!podeMutarFinanceiro}
                          style={{
                            ...inputTabelaStyle,
                            opacity: podeMutarFinanceiro ? 1 : 0.65,
                          }}
                        >
                          <option value="">Selecione</option>
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        <div style={{ marginTop: '8px' }}>
                          <span
                            style={{
                              ...badgeBaseStyle,
                              ...getStatusStyle(item.statusPagamento),
                            }}
                          >
                            {item.statusPagamento || 'Sem status'}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                            marginTop: '8px',
                          }}
                        >
                          {semValor && <span style={alertaPendenteStyle}>Sem valor</span>}
                          {semVencimento && (
                            <span style={alertaPendenteStyle}>Sem vencimento</span>
                          )}
                          {vencido && <span style={alertaVencidoStyle}>Vencido</span>}
                          {!semValor && !semVencimento && !vencido && (
                            <span style={alertaOkStyle}>OK</span>
                          )}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={{
                            ...botaoSalvarStyle,
                            opacity: salvandoId === item.id || !podeMutarFinanceiro ? 0.55 : 1,
                            cursor:
                              salvandoId === item.id || !podeMutarFinanceiro
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                          title={
                            !podeMutarFinanceiro
                              ? 'Apenas financeiro ou administrador pode salvar.'
                              : undefined
                          }
                          onClick={() => void salvarItem(item)}
                          disabled={salvandoId === item.id || !podeMutarFinanceiro}
                        >
                          {salvandoId === item.id ? 'Salvando...' : 'Salvar'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && itensFiltrados.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              {itensFiltrados.length} coleta(s)
              {somenteVencidos ? ' vencida(s)' : ''}
              {buscaDebounced.trim() ? ' · busca ativa' : ''} · mostrando{' '}
              {(pageTab - 1) * pageSizeTab + 1}–{Math.min(pageTab * pageSizeTab, itensFiltrados.length)}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Por página
                <select
                  value={pageSizeTab}
                  onChange={(e) => setPageSizeTab(Number(e.target.value))}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
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
                disabled={pageTab <= 1}
                onClick={() => setPageTab((p) => Math.max(1, p - 1))}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: pageTab <= 1 ? '#f1f5f9' : '#ffffff',
                  cursor: pageTab <= 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                Anterior
              </button>
              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                Página {pageTab} / {totalPaginasFin}
              </span>
              <button
                type="button"
                disabled={pageTab >= totalPaginasFin}
                onClick={() => setPageTab((p) => Math.min(totalPaginasFin, p + 1))}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: pageTab >= totalPaginasFin ? '#f1f5f9' : '#ffffff',
                  cursor: pageTab >= totalPaginasFin ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                Seguinte
              </button>
            </div>
          </div>
        ) : null}
      </div>
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
  minWidth: '1180px',
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
  verticalAlign: 'top',
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

const inputTabelaStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
}

const subInfoStyle: CSSProperties = {
  marginTop: '6px',
  fontSize: '12px',
  color: '#64748b',
}

const botaoSalvarStyle: CSSProperties = {
  backgroundColor: '#22c55e',
  color: '#052e16',
  border: 'none',
  borderRadius: '10px',
  padding: '10px 14px',
  fontSize: '13px',
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

const botaoContextoNavStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#0f172a',
  border: '1px solid #86efac',
  borderRadius: '10px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoLimparContextoStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#64748b',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const alertaPendenteStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  backgroundColor: '#fef3c7',
  color: '#b45309',
}

const alertaVencidoStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  backgroundColor: '#fee2e2',
  color: '#dc2626',
}

const alertaOkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  backgroundColor: '#dcfce7',
  color: '#15803d',
}