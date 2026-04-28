import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { COLETAS_LIST_MAX_ROWS } from '../lib/coletasQueryLimits'
import {
  formatarEtapaParaUI,
  indiceEtapaFluxo,
  normalizarEtapaColeta,
  type EtapaFluxo,
} from '../lib/fluxoEtapas'
import { classificarPendenciasPorSetor, type PendenciaSetorKey } from '../lib/pendenciasSetor'

/** Paleta Tableau 10 (tons profissionais, boa distinção em relatórios) */
const TABLEAU10 = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc949',
  '#af7aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab',
]

const tableauTooltip: CSSProperties = {
  borderRadius: 6,
  border: '1px solid #dde3ea',
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
  fontSize: 12,
  padding: '8px 10px',
}

type DashboardRow = {
  id: string
  numero: string
  cliente: string
  cliente_id: string | null
  programacao_id: string | null
  mtr_id: string | null
  cidade: string
  tipo_residuo: string
  data_agendada: string
  etapa_operacional: string | null
  fluxo_status?: string | null
  liberado_financeiro: boolean | null
  valor_coleta: number | null
  status_pagamento: string | null
  data_vencimento: string | null
  peso_liquido: number | null
  created_at: string
}

type DashboardItem = {
  id: string
  numero: string
  cliente: string
  clienteId: string
  cidade: string
  tipoResiduo: string
  dataAgendada: string
  etapaCodigo: EtapaFluxo
  etapaOperacional: string
  programacaoId: string
  mtrId: string
  liberadoFinanceiro: boolean
  valorColeta: string
  statusPagamento: string
  dataVencimento: string
  pesoLiquido: string
  createdAt: string
}

function formatDate(date: string) {
  if (!date) return '-'

  const [year, month, day] = date.split('-')
  if (!year || !month || !day) return date

  return `${day}/${month}/${year}`
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
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

function getEtapaStyleCanonico(etapa: EtapaFluxo) {
  const i = indiceEtapaFluxo(etapa)
  if (i <= 3) return { backgroundColor: '#dbeafe', color: '#1d4ed8' }
  if (i >= 4 && i <= 7) return { backgroundColor: '#ffedd5', color: '#c2410c' }
  if (i === 8) return { backgroundColor: '#ede9fe', color: '#6d28d9' }
  if (i >= 16) return { backgroundColor: '#dcfce7', color: '#15803d' }
  return { backgroundColor: '#e5e7eb', color: '#374151' }
}

function isVencido(dataVencimento: string, statusPagamento: string) {
  if (!dataVencimento) return false
  if (statusPagamento === 'Pago') return false

  const hoje = new Date()
  const vencimento = new Date(`${dataVencimento}T23:59:59`)
  return vencimento < hoje
}

function mapRow(row: DashboardRow): DashboardItem {
  const etapa = normalizarEtapaColeta({
    fluxo_status: row.fluxo_status,
    etapa_operacional: row.etapa_operacional,
  })
  return {
    id: row.id,
    numero: row.numero,
    cliente: row.cliente,
    clienteId: row.cliente_id ?? '',
    cidade: row.cidade,
    tipoResiduo: row.tipo_residuo,
    dataAgendada: row.data_agendada,
    etapaCodigo: etapa,
    etapaOperacional: formatarEtapaParaUI(etapa),
    programacaoId: row.programacao_id ?? '',
    mtrId: row.mtr_id ?? '',
    liberadoFinanceiro: row.liberado_financeiro ?? false,
    valorColeta: row.valor_coleta !== null ? String(row.valor_coleta) : '',
    statusPagamento: row.status_pagamento || '',
    dataVencimento: row.data_vencimento || '',
    pesoLiquido: row.peso_liquido !== null ? String(row.peso_liquido) : '',
    createdAt: row.created_at,
  }
}

export default function DashboardLegacy() {
  const navigate = useNavigate()
  const [itens, setItens] = useState<DashboardItem[]>([])
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [tabPendencias, setTabPendencias] = useState<PendenciaSetorKey>('faturamento')

  const carregarDashboard = useCallback(async () => {
    const { data, error } = await supabase
      .from('coletas')
      .select(
        'id, numero, cliente, cliente_id, programacao_id, mtr_id, cidade, tipo_residuo, data_agendada, etapa_operacional, fluxo_status, liberado_financeiro, valor_coleta, status_pagamento, data_vencimento, peso_liquido, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(COLETAS_LIST_MAX_ROWS)

    if (error) throw error

    setItens(((data || []) as DashboardRow[]).map(mapRow))
  }, [])

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      setErro('')
      await carregarDashboard()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar dashboard.')
    } finally {
      setLoading(false)
    }
  }, [carregarDashboard])

  useEffect(() => {
    void carregarDados()
  }, [carregarDados])

  const totalColetas = useMemo(() => itens.length, [itens])

  const totalLiberadasFinanceiro = useMemo(
    () => itens.filter((item) => item.liberadoFinanceiro).length,
    [itens]
  )

  const totalSemValor = useMemo(
    () =>
      itens.filter(
        (item) => item.liberadoFinanceiro && (!item.valorColeta || Number(item.valorColeta) <= 0)
      ).length,
    [itens]
  )

  const totalSemVencimento = useMemo(
    () => itens.filter((item) => item.liberadoFinanceiro && !item.dataVencimento).length,
    [itens]
  )

  const totalVencidas = useMemo(
    () =>
      itens.filter(
        (item) =>
          item.liberadoFinanceiro && isVencido(item.dataVencimento, item.statusPagamento)
      ).length,
    [itens]
  )

  const valorPendente = useMemo(() => {
    return itens.reduce((acc, item) => {
      if (!item.liberadoFinanceiro) return acc
      if (item.statusPagamento === 'Pago') return acc

      const valor = Number(item.valorColeta || 0)
      return acc + (Number.isNaN(valor) ? 0 : valor)
    }, 0)
  }, [itens])

  const ultimasColetas = useMemo(() => itens.slice(0, 8), [itens])

  const alertasFinanceiros = useMemo(() => {
    return itens
      .filter((item) => item.liberadoFinanceiro)
      .filter((item) => {
        const semValor = !item.valorColeta || Number(item.valorColeta) <= 0
        const semVencimento = !item.dataVencimento
        const vencido = isVencido(item.dataVencimento, item.statusPagamento)
        return semValor || semVencimento || vencido
      })
      .slice(0, 8)
  }, [itens])

  function montarParams(item: DashboardItem) {
    const p = new URLSearchParams()
    if (item.id) p.set('coleta', item.id)
    if (item.mtrId) p.set('mtr', item.mtrId)
    if (item.programacaoId) p.set('programacao', item.programacaoId)
    if (item.clienteId) p.set('cliente', item.clienteId)
    return p
  }

  const pendencias = useMemo(() => {
    return classificarPendenciasPorSetor(
      itens.map((i) => ({
        id: i.id,
        numero: i.numero,
        cliente: i.cliente,
        clienteId: i.clienteId,
        programacaoId: i.programacaoId,
        mtrId: i.mtrId,
        etapaCodigo: i.etapaCodigo,
        dataAgendada: i.dataAgendada,
        createdAt: i.createdAt,
        pesoLiquido: i.pesoLiquido,
        liberadoFinanceiro: i.liberadoFinanceiro,
        statusPagamento: i.statusPagamento,
        dataVencimento: i.dataVencimento,
      }))
    )
  }, [itens])

  const pendenciasAtuais = pendencias[tabPendencias].slice(0, 10)

  const seriePorDataAgendada = useMemo(() => {
    const dias = 30
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const inicio = new Date(hoje)
    inicio.setDate(inicio.getDate() - (dias - 1))

    const porDia = new Map<string, number>()
    const cursor = new Date(inicio)
    while (cursor <= hoje) {
      porDia.set(cursor.toISOString().slice(0, 10), 0)
      cursor.setDate(cursor.getDate() + 1)
    }

    for (const item of itens) {
      const d = item.dataAgendada?.trim()
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      if (porDia.has(d)) {
        porDia.set(d, (porDia.get(d) || 0) + 1)
      }
    }

    return Array.from(porDia.entries()).map(([dataIso, coletas]) => {
      const [, m, day] = dataIso.split('-')
      return {
        dataIso,
        label: `${day}/${m}`,
        coletas,
      }
    })
  }, [itens])

  const coletasPorEtapa = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of itens) {
      const k = item.etapaOperacional || '—'
      map.set(k, (map.get(k) || 0) + 1)
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 6)
    const rest = sorted.slice(6).reduce((acc, [, n]) => acc + n, 0)
    const rows = top.map(([nome, valor]) => ({ nome, valor }))
    if (rest > 0) {
      rows.push({ nome: 'Outras etapas', valor: rest })
    }
    return rows
  }, [itens])

  const statusPagamentoChart = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of itens) {
      if (!item.liberadoFinanceiro) continue
      const raw = item.statusPagamento?.trim()
      const k = raw || 'Sem status'
      map.set(k, (map.get(k) || 0) + 1)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [itens])

  const coletasPorTipoResiduo = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of itens) {
      const k = item.tipoResiduo?.trim() || 'Não informado'
      map.set(k, (map.get(k) || 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tipo, qtd]) => ({ tipo, qtd }))
  }, [itens])

  const financeiroPagoVsPendente = useMemo(() => {
    let pago = 0
    let pendente = 0
    for (const item of itens) {
      if (!item.liberadoFinanceiro) continue
      const v = Number(item.valorColeta || 0)
      if (Number.isNaN(v) || v <= 0) continue
      if (item.statusPagamento === 'Pago') pago += v
      else pendente += v
    }
    return [
      { nome: 'Pago', valor: pago },
      { nome: 'A receber', valor: pendente },
    ]
  }, [itens])

  const alturaChartEtapas = useMemo(
    () => Math.min(200, 40 + Math.max(1, coletasPorEtapa.length) * 24),
    [coletasPorEtapa.length]
  )

  const alturaChartPagamento = useMemo(
    () =>
      statusPagamentoChart.length === 0
        ? 72
        : Math.min(168, 36 + statusPagamentoChart.length * 28),
    [statusPagamentoChart.length]
  )

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
            Indicadores e resumo operacional
          </h1>
          <p className="page-header__lead" style={{ margin: '6px 0 0' }}>
            Resumo operacional e financeiro. O fluxo principal é{' '}
            <strong>Programação → MTR → Controle de Massa</strong> (pesagem e ticket no mesmo ecrã); em
            seguida aprovação e faturamento.
          </p>
        </div>

        <button
          type="button"
          style={botaoSecundarioStyle}
          onClick={() => void carregarDados()}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {erro && <div style={erroStyle}>{erro}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Coletas</div>
          <div style={cardResumoValorStyle}>{totalColetas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Liberadas p/ financeiro</div>
          <div style={cardResumoValorStyle}>{totalLiberadasFinanceiro}</div>
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
          <div style={cardResumoTituloStyle}>Vencidas</div>
          <div style={cardResumoValorStyle}>{totalVencidas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>A receber (estim.)</div>
          <div style={{ ...cardResumoValorStyle, fontSize: '22px' }}>
            {formatCurrency(valorPendente)}
          </div>
        </div>
      </div>

      <div style={alertaTopoStyle}>
        <div style={{ fontWeight: 800, marginBottom: '6px', color: '#7c2d12', fontSize: '14px' }}>
          Atenção no financeiro
        </div>
        <div style={{ color: '#9a3412', lineHeight: 1.45, fontSize: '14px' }}>
          <strong>{totalSemValor}</strong> sem valor · <strong>{totalSemVencimento}</strong> sem
          vencimento · <strong>{totalVencidas}</strong> vencidas.
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2
          style={{
            margin: '0 0 2px',
            fontSize: '15px',
            color: '#334155',
            fontWeight: 700,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Pendências por setor
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>
          Filas operacionais orientadas por ação · baseadas na etapa canónica do fluxo.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
          {(
            [
              ['operacional', 'Operacional'],
              ['logistica', 'Logística'],
              ['massa', 'Controle de massa'],
              ['faturamento', 'Faturamento'],
              ['financeiro', 'Financeiro'],
            ] as Array<[PendenciaSetorKey, string]>
          ).map(([k, label]) => {
            const ativo = tabPendencias === k
            const qtd = pendencias[k].length
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTabPendencias(k)}
                style={{
                  textAlign: 'left',
                  background: ativo ? '#0f172a' : '#ffffff',
                  color: ativo ? '#ffffff' : '#0f172a',
                  border: ativo ? '1px solid #0f172a' : '1px solid #e5e7eb',
                  borderRadius: 14,
                  padding: '12px 12px',
                  cursor: 'pointer',
                  boxShadow: ativo ? '0 6px 18px rgba(15, 23, 42, 0.14)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, opacity: ativo ? 0.95 : 0.7 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{qtd}</div>
              </button>
            )
          })}
        </div>

        <div style={{ ...vizCardShellStyle, padding: '14px 14px' }}>
          {pendenciasAtuais.length === 0 ? (
            <div style={vizEmptyStyle}>Nenhuma pendência neste setor com os dados atuais.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendenciasAtuais.map((p) => {
                const q = montarParams(p as unknown as DashboardItem).toString()
                const destino =
                  p.destino === 'financeiro'
                    ? `/financeiro?${q}`
                    : p.destino === 'controle-massa'
                      ? `/controle-massa?${q}`
                      : p.destino === 'faturamento'
                        ? `/faturamento?${q}`
                        : p.destino === 'mtr'
                          ? `/mtr?${q}`
                          : `/programacao?${q}`
                const badgeBg = p.highlight === 'critico' ? '#fee2e2' : p.highlight === 'atencao' ? '#ffedd5' : '#f1f5f9'
                const badgeFg = p.highlight === 'critico' ? '#991b1b' : p.highlight === 'atencao' ? '#9a3412' : '#475569'
                return (
                  <div
                    key={`${p.setor}-${p.id}`}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 14,
                      padding: '12px 12px',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 900, color: '#0f172a' }}>Coleta {p.numero}</div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: badgeBg,
                            color: badgeFg,
                            border: '1px solid rgba(15, 23, 42, 0.08)',
                          }}
                        >
                          {p.titulo}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>{p.cliente}</div>
                      {p.detalhe ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', lineHeight: 1.35 }}>{p.detalhe}</div>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                        {p.etapaCodigo ? formatarEtapaParaUI(p.etapaCodigo) : '—'}
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(destino)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid #cbd5e1',
                          background: '#0f172a',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2
          style={{
            margin: '0 0 2px',
            fontSize: '15px',
            color: '#334155',
            fontWeight: 700,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Indicadores
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>
          Layout compacto (estilo BI): série de 30 dias, distribuição por etapa e visão financeira.
        </p>

        <div className="dashboard-analytics">
          <div className="dashboard-analytics__span-2" style={vizCardShellStyle}>
            <div style={vizCardHeaderRuleStyle}>
              <span style={vizCardTitleStyle}>Coletas agendadas por dia</span>
              <span style={vizCardHintStyle}>Janela: últimos 30 dias · linha = total no dia</span>
            </div>
            <div style={{ width: '100%', height: 188 }}>
              {itens.length === 0 && !loading ? (
                <div style={vizEmptyStyle}>Sem coletas na base.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={seriePorDataAgendada}
                    margin={{ top: 2, right: 6, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#eceff1" vertical={false} strokeDasharray="0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      interval={5}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      height={22}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      width={26}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      contentStyle={tableauTooltip}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload as { dataIso?: string } | undefined
                        return row?.dataIso ? formatDate(row.dataIso) : String(label)
                      }}
                      formatter={(value) => [`${value ?? 0}`, 'Coletas']}
                    />
                    <Line
                      type="monotone"
                      dataKey="coletas"
                      stroke={TABLEAU10[0]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0, fill: TABLEAU10[0] }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div style={vizCardShellStyle}>
            <div style={vizCardHeaderRuleStyle}>
              <span style={vizCardTitleStyle}>Etapa do fluxo</span>
              <span style={vizCardHintStyle}>Top 6 + outras</span>
            </div>
            <div style={{ width: '100%', height: alturaChartEtapas }}>
              {coletasPorEtapa.length === 0 ? (
                <div style={vizEmptyStyle}>Sem etapas.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={coletasPorEtapa}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                    barCategoryGap={4}
                  >
                    <CartesianGrid stroke="#f1f5f9" horizontal={false} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={108}
                      tick={{ fontSize: 10, fill: '#475569' }}
                      tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 14)}…` : v)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(78, 121, 167, 0.06)' }}
                      contentStyle={tableauTooltip}
                      formatter={(v) => [`${v ?? 0}`, 'Coletas']}
                    />
                    <Bar dataKey="valor" radius={[0, 3, 3, 0]} barSize={14}>
                      {coletasPorEtapa.map((_, i) => (
                        <Cell key={`e-${i}`} fill={TABLEAU10[i % TABLEAU10.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div style={vizCardShellStyle}>
            <div style={vizCardHeaderRuleStyle}>
              <span style={vizCardTitleStyle}>Status de pagamento</span>
              <span style={vizCardHintStyle}>Coletas liberadas ao financeiro</span>
            </div>
            <div style={{ width: '100%', height: alturaChartPagamento }}>
              {statusPagamentoChart.length === 0 ? (
                <div style={vizEmptyStyle}>
                  Nenhuma coleta liberada — o gráfico aparece quando houver liberações.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statusPagamentoChart}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                    barCategoryGap={6}
                  >
                    <CartesianGrid stroke="#f1f5f9" horizontal={false} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={92}
                      tick={{ fontSize: 10, fill: '#475569' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tableauTooltip} formatter={(v) => [`${v ?? 0}`, '']} />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={14}>
                      {statusPagamentoChart.map((_, i) => (
                        <Cell key={`p-${i}`} fill={TABLEAU10[(i + 2) % TABLEAU10.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div style={vizCardShellStyle}>
            <div style={vizCardHeaderRuleStyle}>
              <span style={vizCardTitleStyle}>Tipos de resíduo</span>
              <span style={vizCardHintStyle}>Top 8 · barras verticais</span>
            </div>
            <div style={{ width: '100%', height: 212 }}>
              {coletasPorTipoResiduo.length === 0 ? (
                <div style={vizEmptyStyle}>Sem tipos cadastrados.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={coletasPorTipoResiduo} margin={{ top: 4, right: 4, left: -18, bottom: 2 }}>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="tipo"
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={54}
                      tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 10)}…` : v)}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      width={22}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tableauTooltip} formatter={(v) => [`${v ?? 0}`, 'Qtd.']} />
                    <Bar dataKey="qtd" fill={TABLEAU10[3]} radius={[2, 2, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div style={vizCardShellStyle}>
            <div style={vizCardHeaderRuleStyle}>
              <span style={vizCardTitleStyle}>Valores (liberadas)</span>
              <span style={vizCardHintStyle}>Pago × a receber</span>
            </div>
            <div style={{ width: '100%', height: 168 }}>
              {financeiroPagoVsPendente.every((r) => r.valor === 0) ? (
                <div style={vizEmptyStyle}>
                  Sem valores nas coletas liberadas — preencha no financeiro.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={financeiroPagoVsPendente}
                    margin={{ top: 6, right: 6, left: -14, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={(v: number) =>
                        v >= 1000
                          ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
                          : `${v}`
                      }
                      width={36}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tableauTooltip}
                      formatter={(v) => [formatCurrency(Number(v ?? 0)), '']}
                    />
                    <Bar dataKey="valor" radius={[3, 3, 0, 0]} maxBarSize={56}>
                      {financeiroPagoVsPendente.map((row, index) => (
                        <Cell
                          key={row.nome}
                          fill={index === 0 ? TABLEAU10[4] : TABLEAU10[1]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <div style={cardPrincipalStyle}>
          <h2 style={tituloCardStyle}>Últimas coletas</h2>
          <p style={{ margin: '-8px 0 14px', fontSize: '13px', color: '#64748b' }}>
            Entradas recentes no sistema.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Nº</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Etapa</th>
                  <th style={thStyle}>Peso</th>
                </tr>
              </thead>
              <tbody>
                {ultimasColetas.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={emptyTdStyle}>
                      Nenhuma coleta encontrada.
                    </td>
                  </tr>
                ) : (
                  ultimasColetas.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={tdStyle}>{item.numero}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{item.cliente}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {item.cidade}
                        </div>
                      </td>
                      <td style={tdStyle}>{formatDate(item.dataAgendada)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeBaseStyle,
                            ...getEtapaStyleCanonico(item.etapaCodigo),
                          }}
                        >
                          {item.etapaOperacional}
                        </span>
                      </td>
                      <td style={tdStyle}>{formatPeso(item.pesoLiquido)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardPrincipalStyle}>
          <h2 style={tituloCardStyle}>Pendências financeiras</h2>
          <p style={{ margin: '-8px 0 14px', fontSize: '13px', color: '#64748b' }}>
            Coletas já liberadas que ainda precisam de valor, vencimento ou estão atrasadas.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alertasFinanceiros.length === 0 ? (
              <div style={alertaOkBoxStyle}>Nenhuma pendência financeira crítica no momento.</div>
            ) : (
              alertasFinanceiros.map((item) => {
                const semValor = !item.valorColeta || Number(item.valorColeta) <= 0
                const semVencimento = !item.dataVencimento
                const vencido = isVencido(item.dataVencimento, item.statusPagamento)

                return (
                  <div key={item.id} style={pendenciaBoxStyle}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{item.numero}</div>
                      <div style={{ color: '#475569', fontSize: '13px' }}>{item.cliente}</div>
                    </div>

                    <div style={{ color: '#475569', fontSize: '13px', marginBottom: '10px' }}>
                      {item.cidade} • {item.tipoResiduo} • {formatDate(item.dataAgendada)}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {semValor && <span style={alertaPendenteStyle}>Sem valor</span>}
                      {semVencimento && (
                        <span style={alertaPendenteStyle}>Sem vencimento</span>
                      )}
                      {vencido && <span style={alertaVencidoStyle}>Vencida</span>}
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/financeiro?${(() => {
                            const p = new URLSearchParams()
                            p.set('coleta', item.id)
                            if (item.mtrId) p.set('mtr', item.mtrId)
                            if (item.programacaoId) p.set('programacao', item.programacaoId)
                            if (item.clienteId) p.set('cliente', item.clienteId)
                            return p.toString()
                          })()}`)
                        }
                        style={{
                          marginLeft: 'auto',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          color: '#0f172a',
                        }}
                      >
                        Abrir no financeiro
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      </div>
    </MainLayout>
  )
}

const vizCardShellStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 4,
  padding: '10px 12px 8px',
  border: '1px solid #e0e4e8',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  minWidth: 0,
}

const vizCardHeaderRuleStyle: CSSProperties = {
  borderBottom: '1px solid #eceff1',
  paddingBottom: 8,
  marginBottom: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const vizCardTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#1e293b',
  letterSpacing: '-0.01em',
}

const vizCardHintStyle: CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  fontWeight: 500,
}

const vizEmptyStyle: CSSProperties = {
  height: '100%',
  minHeight: 64,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 500,
  padding: '12px 10px',
  textAlign: 'center',
  lineHeight: 1.45,
  border: '1px dashed #e5e7eb',
  borderRadius: 4,
  background: '#fafbfc',
}

const cardResumoStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '14px',
  padding: '14px 16px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
}

const cardResumoTituloStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '14px',
  marginBottom: '8px',
}

const cardResumoValorStyle: CSSProperties = {
  color: '#0f172a',
  fontSize: '26px',
  fontWeight: 800,
}

const cardPrincipalStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
  marginBottom: '24px',
}

const tituloCardStyle: CSSProperties = {
  margin: '0 0 4px',
  fontSize: '18px',
  color: '#0f172a',
  fontWeight: 800,
}

const erroStyle: CSSProperties = {
  marginBottom: '20px',
  padding: '14px 16px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  borderRadius: '12px',
}

const alertaTopoStyle: CSSProperties = {
  marginBottom: '24px',
  padding: '16px 18px',
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  color: '#9a3412',
  borderRadius: '14px',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '520px',
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

const pendenciaBoxStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '14px',
  backgroundColor: '#f8fafc',
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

const alertaOkBoxStyle: CSSProperties = {
  border: '1px solid #bbf7d0',
  borderRadius: '12px',
  padding: '14px',
  backgroundColor: '#ecfdf5',
  color: '#15803d',
  fontWeight: 700,
}