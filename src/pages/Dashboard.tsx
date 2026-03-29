import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

type ColetaRow = {
  id: string
  numero: string
  cliente: string
  cidade: string
  status: string
  tipo_residuo: string
  peso_liquido: number | null
  data_agendada: string
  created_at: string
  valor_coleta?: number | null
  status_pagamento?: string | null
  data_vencimento?: string | null
}

type ClienteRow = {
  id: string
  nome: string
  cidade: string
  status: string
}

type StatusResumo = {
  nome: string
  quantidade: number
}

type CidadeResumo = {
  nome: string
  quantidade: number
}

function formatarData(data: string) {
  if (!data) return '-'

  const limpa = data.includes('T') ? data.split('T')[0] : data
  const [ano, mes, dia] = limpa.split('-')
  if (!ano || !mes || !dia) return data

  return `${dia}/${mes}/${ano}`
}

function formatarPeso(valor: number) {
  return `${valor.toLocaleString('pt-BR')} kg`
}

function formatarMoeda(valor?: number | null) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function getStatusStyle(status: string) {
  const valor = status.toLowerCase()

  if (
    valor === 'coleta criada' ||
    valor === 'documentação emitida' ||
    valor === 'documento entregue ao encarregado'
  ) {
    return {
      backgroundColor: '#dbeafe',
      color: '#1d4ed8',
    }
  }

  if (valor === 'aguardando saída' || valor === 'tara registrada') {
    return {
      backgroundColor: '#fef3c7',
      color: '#b45309',
    }
  }

  if (
    valor === 'em rota / em coleta' ||
    valor === 'coleta realizada' ||
    valor === 'bruto registrado' ||
    valor === 'peso líquido calculado' ||
    valor === 'entregue ao operacional' ||
    valor === 'lançado no controle de massa'
  ) {
    return {
      backgroundColor: '#ffedd5',
      color: '#c2410c',
    }
  }

  if (valor === 'finalizado') {
    return {
      backgroundColor: '#dcfce7',
      color: '#15803d',
    }
  }

  if (valor === 'cancelado') {
    return {
      backgroundColor: '#fee2e2',
      color: '#dc2626',
    }
  }

  return {
    backgroundColor: '#e5e7eb',
    color: '#374151',
  }
}

export default function Dashboard() {
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [coletas, setColetas] = useState<ColetaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  async function carregarDashboard() {
    try {
      setLoading(true)
      setErro('')

      const [clientesResult, coletasResult] = await Promise.all([
        supabase.from('clientes').select('id, nome, cidade, status'),
        supabase
          .from('coletas')
          .select(
            'id, numero, cliente, cidade, status, tipo_residuo, peso_liquido, data_agendada, created_at, valor_coleta, status_pagamento, data_vencimento'
          )
          .order('created_at', { ascending: false }),
      ])

      if (clientesResult.error) {
        throw clientesResult.error
      }

      if (coletasResult.error) {
        throw coletasResult.error
      }

      setClientes((clientesResult.data || []) as ClienteRow[])
      setColetas((coletasResult.data || []) as ColetaRow[])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDashboard()
  }, [])

  const totalClientes = clientes.length
  const totalColetas = coletas.length

  const totalAgendadas = useMemo(() => {
    return coletas.filter((coleta) =>
      [
        'Coleta criada',
        'Documentação emitida',
        'Documento entregue ao encarregado',
        'Aguardando saída',
      ].includes(coleta.status)
    ).length
  }, [coletas])

  const totalEmAndamento = useMemo(() => {
    return coletas.filter((coleta) =>
      [
        'Tara registrada',
        'Em rota / em coleta',
        'Coleta realizada',
        'Bruto registrado',
        'Peso líquido calculado',
        'Entregue ao operacional',
        'Lançado no controle de massa',
      ].includes(coleta.status)
    ).length
  }, [coletas])

  const totalFinalizadas = useMemo(() => {
    return coletas.filter((coleta) => coleta.status === 'Finalizado').length
  }, [coletas])

  const pesoTotal = useMemo(() => {
    return coletas.reduce((total, coleta) => total + (coleta.peso_liquido || 0), 0)
  }, [coletas])

  const financeiroResumo = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    let totalVencido = 0
    let totalVenceHoje = 0
    let totalAVencer = 0

    coletas.forEach((coleta) => {
      const statusOperacional = String(coleta.status || '').toLowerCase()
      const statusPagamento = coleta.status_pagamento || 'Pendente'

      if (!statusOperacional.includes('final')) return
      if (statusPagamento === 'Pago' || statusPagamento === 'Cancelado') return
      if (!coleta.data_vencimento) return

      const vencimento = new Date(coleta.data_vencimento)
      vencimento.setHours(0, 0, 0, 0)

      const valor = Number(coleta.valor_coleta || 0)

      if (vencimento < hoje) totalVencido += valor
      else if (vencimento.getTime() === hoje.getTime()) totalVenceHoje += valor
      else totalAVencer += valor
    })

    return {
      totalVencido,
      totalVenceHoje,
      totalAVencer,
    }
  }, [coletas])

  const statusResumo = useMemo<StatusResumo[]>(() => {
    const mapa = new Map<string, number>()

    coletas.forEach((coleta) => {
      mapa.set(coleta.status, (mapa.get(coleta.status) || 0) + 1)
    })

    return Array.from(mapa.entries())
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }, [coletas])

  const cidadesResumo = useMemo<CidadeResumo[]>(() => {
    const mapa = new Map<string, number>()

    coletas.forEach((coleta) => {
      const cidade = coleta.cidade?.trim() || 'Não informada'
      mapa.set(cidade, (mapa.get(cidade) || 0) + 1)
    })

    return Array.from(mapa.entries())
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6)
  }, [coletas])

  const ultimasColetas = useMemo(() => {
    return coletas.slice(0, 6)
  }, [coletas])

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
          <h1 style={{ margin: 0, fontSize: '32px', color: '#0f172a' }}>Dashboard</h1>
          <p style={{ margin: '8px 0 0', color: '#475569', fontSize: '16px' }}>
            Visão geral operacional da RG Ambiental
          </p>
        </div>

        <button
          type="button"
          onClick={carregarDashboard}
          disabled={loading}
          style={botaoAtualizarStyle}
        >
          {loading ? 'Atualizando...' : 'Atualizar dashboard'}
        </button>
      </div>

      {erro && <div style={erroStyle}>{erro}</div>}

      <div style={alertaFinanceiroStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>
            🚨 Alerta Financeiro
          </h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>
            Situação atual das cobranças para acompanhamento rápido
          </p>
        </div>

        <div style={alertaFinanceiroGridStyle}>
          <div style={alertaCardStyle}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
              Vencido
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#dc2626' }}>
              {formatarMoeda(financeiroResumo.totalVencido)}
            </div>
          </div>

          <div style={alertaCardStyle}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
              Vence hoje
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#7c3aed' }}>
              {formatarMoeda(financeiroResumo.totalVenceHoje)}
            </div>
          </div>

          <div style={alertaCardStyle}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
              A vencer
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#2563eb' }}>
              {formatarMoeda(financeiroResumo.totalAVencer)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = '/financeiro'
            }}
            style={botaoFinanceiroStyle}
          >
            Ir para Financeiro →
          </button>
        </div>
      </div>

      <div style={gridCardsStyle}>
        <div style={cardResumoStyle}>
          <div style={cardTituloStyle}>Total de clientes</div>
          <div style={cardValorStyle}>{totalClientes}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardTituloStyle}>Total de coletas</div>
          <div style={cardValorStyle}>{totalColetas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardTituloStyle}>Agendadas</div>
          <div style={cardValorStyle}>{totalAgendadas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardTituloStyle}>Em andamento</div>
          <div style={cardValorStyle}>{totalEmAndamento}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardTituloStyle}>Finalizadas</div>
          <div style={cardValorStyle}>{totalFinalizadas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardTituloStyle}>Peso total coletado</div>
          <div style={cardValorStyle}>{formatarPeso(pesoTotal)}</div>
        </div>
      </div>

      <div style={gridBlocosStyle}>
        <div style={blocoStyle}>
          <h2 style={blocoTituloStyle}>Coletas por status</h2>

          {loading ? (
            <p style={textoSuaveStyle}>Carregando...</p>
          ) : statusResumo.length === 0 ? (
            <p style={textoSuaveStyle}>Nenhuma coleta cadastrada.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {statusResumo.map((item) => (
                <div key={item.nome} style={linhaResumoStyle}>
                  <span
                    style={{
                      ...badgeBaseStyle,
                      ...getStatusStyle(item.nome),
                    }}
                  >
                    {item.nome}
                  </span>

                  <strong style={{ color: '#0f172a' }}>{item.quantidade}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={blocoStyle}>
          <h2 style={blocoTituloStyle}>Coletas por cidade</h2>

          {loading ? (
            <p style={textoSuaveStyle}>Carregando...</p>
          ) : cidadesResumo.length === 0 ? (
            <p style={textoSuaveStyle}>Nenhuma coleta cadastrada.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {cidadesResumo.map((item) => (
                <div key={item.nome} style={linhaResumoStyle}>
                  <span style={{ color: '#334155', fontWeight: 600 }}>{item.nome}</span>
                  <strong style={{ color: '#0f172a' }}>{item.quantidade}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={blocoStyle}>
        <h2 style={blocoTituloStyle}>Últimas coletas</h2>

        {loading ? (
          <p style={textoSuaveStyle}>Carregando...</p>
        ) : ultimasColetas.length === 0 ? (
          <p style={textoSuaveStyle}>Nenhuma coleta cadastrada.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Número</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Cidade</th>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Resíduo</th>
                  <th style={thStyle}>Peso líquido</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>

              <tbody>
                {ultimasColetas.map((coleta) => (
                  <tr key={coleta.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={tdStyle}>{coleta.numero}</td>
                    <td style={tdStyle}>{coleta.cliente}</td>
                    <td style={tdStyle}>{coleta.cidade || '-'}</td>
                    <td style={tdStyle}>{formatarData(coleta.data_agendada)}</td>
                    <td style={tdStyle}>{coleta.tipo_residuo || '-'}</td>
                    <td style={tdStyle}>
                      {coleta.peso_liquido ? formatarPeso(coleta.peso_liquido) : '-'}
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

const alertaFinanceiroStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
  marginBottom: '24px',
}

const alertaFinanceiroGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginTop: '16px',
}

const alertaCardStyle: CSSProperties = {
  backgroundColor: '#f8fafc',
  borderRadius: '14px',
  padding: '16px',
  border: '1px solid #e2e8f0',
}

const botaoFinanceiroStyle: CSSProperties = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '14px',
  padding: '16px 18px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: '84px',
}

const gridCardsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginBottom: '24px',
}

const gridBlocosStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '16px',
  marginBottom: '24px',
}

const cardResumoStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
}

const cardTituloStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '14px',
  marginBottom: '8px',
}

const cardValorStyle: CSSProperties = {
  color: '#0f172a',
  fontSize: '30px',
  fontWeight: 800,
}

const blocoStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
}

const blocoTituloStyle: CSSProperties = {
  margin: '0 0 18px',
  fontSize: '20px',
  color: '#0f172a',
}

const linhaResumoStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 14px',
  borderRadius: '12px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
}

const textoSuaveStyle: CSSProperties = {
  color: '#64748b',
  margin: 0,
}

const erroStyle: CSSProperties = {
  marginBottom: '20px',
  padding: '14px 16px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  borderRadius: '12px',
}

const botaoAtualizarStyle: CSSProperties = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '980px',
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

const badgeBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}