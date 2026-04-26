import { useEffect, useState, type CSSProperties } from 'react'
import type { FinanceiroListaItem } from '../../lib/faturamentoResumo'
import { supabase } from '../../lib/supabase'

type BaixaHistoricoRow = {
  id: string
  valor: number
  data_baixa: string
  observacao: string | null
  created_at: string
  created_by: string | null
}

function formatDate(date: string) {
  if (!date) return '—'
  const [year, month, day] = date.split('-')
  if (!year || !month || !day) return date
  return `${day}/${month}/${year}`
}

function formatDateTime(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatPesoKg(value: string) {
  if (!value) return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('pt-BR')} kg`
}

const boxStyle: CSSProperties = {
  marginTop: '16px',
  padding: '16px',
  borderRadius: '14px',
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
}

const titStyle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: '15px',
  fontWeight: 800,
  color: '#0f172a',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '12px',
  fontSize: '13px',
  color: '#334155',
}

const labelStyle: CSSProperties = { fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }

type Props = {
  item: FinanceiroListaItem
  podeMutar: boolean
  observacaoEdit: string
  onChangeObservacao: (v: string) => void
  onMarcarPago: () => void
  onMarcarPendente: () => void
  onIrProgramacao: () => void
  onIrMtr: () => void
  onIrControleMassa: () => void
  onGuardar: () => void
  salvando: boolean
  onRegistrarBaixa?: (valor: string, observacao: string) => void
  registrandoBaixa?: boolean
  podeAlterarValorTravado?: boolean
}

export function FinanceiroConferenciaDetalhe({
  item,
  podeMutar,
  observacaoEdit,
  onChangeObservacao,
  onMarcarPago,
  onMarcarPendente,
  onIrProgramacao,
  onIrMtr,
  onIrControleMassa,
  onGuardar,
  salvando,
  onRegistrarBaixa,
  registrandoBaixa = false,
  podeAlterarValorTravado = false,
}: Props) {
  const ok = item.statusConferencia === 'PRONTO_PARA_FATURAR'
  const [baixaValor, setBaixaValor] = useState('')
  const [baixaObs, setBaixaObs] = useState('')
  const [baixasHistorico, setBaixasHistorico] = useState<BaixaHistoricoRow[]>([])
  const [carregandoHistoricoBaixas, setCarregandoHistoricoBaixas] = useState(false)

  const vTot = Number(item.valorColeta) || 0
  const vPago = Number(item.valorPago) || 0
  const saldo = Math.max(0, vTot - vPago)

  useEffect(() => {
    setBaixaValor('')
    setBaixaObs('')
  }, [item.id])

  useEffect(() => {
    const contaId = (item.contaReceberId || '').trim()
    if (!contaId) {
      setBaixasHistorico([])
      return
    }
    let cancelado = false
    setCarregandoHistoricoBaixas(true)
    void (async () => {
      const { data, error } = await supabase
        .from('contas_receber_baixas')
        .select('id, valor, data_baixa, observacao, created_at, created_by')
        .eq('conta_receber_id', contaId)
        .order('created_at', { ascending: false })

      if (cancelado) return
      if (error) {
        const msg = `${error.message}`.toLowerCase()
        if (!msg.includes('relation') && !msg.includes('does not exist')) {
          console.warn('Histórico de baixas:', error.message)
        }
        setBaixasHistorico([])
      } else {
        setBaixasHistorico((data || []) as BaixaHistoricoRow[])
      }
      setCarregandoHistoricoBaixas(false)
    })()
    return () => {
      cancelado = true
    }
  }, [item.contaReceberId, item.valorPago])

  return (
    <div style={boxStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <h3 style={titStyle}>Conferência do fluxo (até faturamento)</h3>
        <span
          style={{
            ...badgeStyle,
            background: ok ? '#dcfce7' : '#fee2e2',
            color: ok ? '#15803d' : '#b91c1c',
          }}
        >
          {ok ? 'Pronto para faturar' : 'Pendente'}
        </span>
      </div>
      {!ok && item.pendenciasResumo ? (
        <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: '#b45309' }}>
          Pendências: {item.pendenciasResumo}
        </p>
      ) : null}

      <div style={gridStyle}>
        <div>
          <span style={labelStyle}>Cliente / razão social</span>
          {item.cliente}
          {item.clienteRazaoSocial ? (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{item.clienteRazaoSocial}</div>
          ) : null}
        </div>
        <div>
          <span style={labelStyle}>Programação</span>
          {item.programacaoNumero || '—'}
          {item.dataProgramacao ? (
            <div style={{ fontSize: '12px', marginTop: '4px' }}>{formatDate(item.dataProgramacao)}</div>
          ) : null}
        </div>
        <div>
          <span style={labelStyle}>MTR</span>
          {item.mtrNumero || '—'}
        </div>
        <div>
          <span style={labelStyle}>Ticket / comprovante</span>
          {item.ticketComprovante || '—'}
        </div>
        <div>
          <span style={labelStyle}>Pesos (tara / bruto / líquido)</span>
          {formatPesoKg(item.pesoTara)} / {formatPesoKg(item.pesoBruto)} / {formatPesoKg(item.pesoLiquido)}
        </div>
        <div>
          <span style={labelStyle}>Motorista / placa</span>
          {item.motoristaSnap || '—'} · {item.placaSnap || '—'}
        </div>
        <div>
          <span style={labelStyle}>Execução (coleta)</span>
          {item.dataExecucao ? formatDate(item.dataExecucao) : '—'}
        </div>
        <div>
          <span style={labelStyle}>Fase do fluxo (oficial)</span>
          <div style={{ fontWeight: 800, color: '#0f766e' }}>{item.faseFluxoOficial}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            <span style={labelStyle}>Detalhe técnico</span> {item.etapaOperacional}
          </div>
        </div>
        <div>
          <span style={labelStyle}>Última aprovação diretoria</span>
          {item.ultimaAprovacaoDecisao || '—'}
          {item.ultimaAprovacaoObs ? (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{item.ultimaAprovacaoObs}</div>
          ) : null}
        </div>
        <div>
          <span style={labelStyle}>Conferência operacional (docs)</span>
          {item.conferenciaDocsOk === true ? 'OK' : item.conferenciaDocsOk === false ? 'Pendente' : '—'}
          {item.conferenciaObs ? (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{item.conferenciaObs}</div>
          ) : null}
        </div>
        <div>
          <span style={labelStyle}>Faturamento operacional (registo)</span>
          {item.faturamentoRegStatus || '—'} · ref. {item.referenciaConsolidada || '—'}
        </div>
        <div>
          <span style={labelStyle}>Envio de NF (conta a receber)</span>
          {item.nfEnviadaEm ? formatDateTime(item.nfEnviadaEm) : '—'}
          {item.nfEnvioObs ? (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{item.nfEnvioObs}</div>
          ) : null}
        </div>
        {vTot > 0 ? (
          <div>
            <span style={labelStyle}>Conta a receber (Fase 9)</span>
            <div style={{ fontWeight: 700 }}>
              Total {vTot.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · Pago{' '}
              {vPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · Saldo{' '}
              <span style={{ color: saldo > 0 ? '#b45309' : '#15803d' }}>
                {saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            {item.valorTravado ? (
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                Valor faturado travado.
                {podeAlterarValorTravado ? ' Como administrador, pode alterar o total na grelha.' : ''}
              </div>
            ) : null}
            {saldo > 0 && onRegistrarBaixa ? (
              <div
                style={{
                  marginTop: '10px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  alignItems: 'flex-end',
                }}
              >
                <div>
                  <span style={{ ...labelStyle, marginBottom: '4px' }}>Baixa parcial (R$)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={baixaValor}
                    onChange={(e) => setBaixaValor(e.target.value)}
                    disabled={!podeMutar || registrandoBaixa}
                    placeholder={`máx. ${saldo.toFixed(2)}`}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      width: '120px',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                  <span style={{ ...labelStyle, marginBottom: '4px' }}>Observação</span>
                  <input
                    type="text"
                    value={baixaObs}
                    onChange={(e) => setBaixaObs(e.target.value)}
                    disabled={!podeMutar || registrandoBaixa}
                    placeholder="opcional"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  type="button"
                  disabled={!podeMutar || registrandoBaixa}
                  onClick={() => onRegistrarBaixa(baixaValor, baixaObs)}
                  style={{
                    ...btnAcaoStyle,
                    background: '#e0f2fe',
                    color: '#075985',
                    borderColor: '#7dd3fc',
                    height: '38px',
                  }}
                >
                  {registrandoBaixa ? 'A registar…' : 'Registar baixa'}
                </button>
              </div>
            ) : null}
            {item.contaReceberId ? (
              <div style={{ marginTop: '14px' }}>
                <span style={{ ...labelStyle, marginBottom: '8px' }}>Histórico de baixas</span>
                {carregandoHistoricoBaixas ? (
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b' }}>A carregar…</p>
                ) : baixasHistorico.length === 0 ? (
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Nenhuma baixa registada nesta conta.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto', marginTop: '8px' }}>
                    <table
                      style={{
                        width: '100%',
                        minWidth: '520px',
                        borderCollapse: 'collapse',
                        fontSize: '13px',
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '8px 6px', color: '#64748b' }}>Data baixa</th>
                          <th style={{ padding: '8px 6px', color: '#64748b' }}>Valor</th>
                          <th style={{ padding: '8px 6px', color: '#64748b' }}>Observação</th>
                          <th style={{ padding: '8px 6px', color: '#64748b' }}>Registado em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {baixasHistorico.map((b) => (
                          <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 6px' }}>{formatDate(b.data_baixa)}</td>
                            <td style={{ padding: '8px 6px', fontWeight: 700 }}>
                              {Number(b.valor).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                            <td style={{ padding: '8px 6px', color: '#475569' }}>
                              {(b.observacao || '').trim() || '—'}
                            </td>
                            <td style={{ padding: '8px 6px', fontSize: '12px', color: '#64748b' }}>
                              {formatDateTime(b.created_at)}
                              {b.created_by ? (
                                <span title={b.created_by}>
                                  {' '}
                                  · {b.created_by.slice(0, 8)}…
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {item.programacaoObs || item.mtrObs ? (
        <div style={{ marginTop: '12px', fontSize: '13px', color: '#475569' }}>
          {item.programacaoObs ? (
            <div style={{ marginBottom: '8px' }}>
              <strong>Obs. programação:</strong> {item.programacaoObs}
            </div>
          ) : null}
          {item.mtrObs ? (
            <div>
              <strong>Obs. MTR:</strong> {item.mtrObs}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button type="button" onClick={onIrProgramacao} style={btnNavStyle}>
          Abrir programação
        </button>
        <button type="button" onClick={onIrMtr} style={btnNavStyle}>
          Abrir MTR
        </button>
        <button type="button" onClick={onIrControleMassa} style={btnNavStyle}>
          Controle de massa
        </button>
      </div>

      <div style={{ marginTop: '16px' }}>
        <span style={labelStyle}>Observações da coleta (gravadas no processo)</span>
        <textarea
          value={observacaoEdit}
          onChange={(e) => onChangeObservacao(e.target.value)}
          disabled={!podeMutar}
          rows={3}
          placeholder="Notas para o financeiro / operação…"
          style={{
            width: '100%',
            maxWidth: '640px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
            resize: 'vertical',
            boxSizing: 'border-box',
            opacity: podeMutar ? 1 : 0.65,
          }}
        />
      </div>

      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <button
          type="button"
          disabled={!podeMutar || salvando}
          onClick={onGuardar}
          style={{
            background: '#22c55e',
            color: '#052e16',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: podeMutar && !salvando ? 'pointer' : 'not-allowed',
            opacity: podeMutar && !salvando ? 1 : 0.55,
          }}
        >
          {salvando ? 'A guardar…' : 'Guardar (observações + cobrança)'}
        </button>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Pagamento:</span>
        <button
          type="button"
          disabled={!podeMutar}
          onClick={onMarcarPago}
          style={{ ...btnAcaoStyle, background: '#dcfce7', color: '#14532d', borderColor: '#86efac' }}
        >
          Marcar como Pago
        </button>
        <button
          type="button"
          disabled={!podeMutar}
          onClick={onMarcarPendente}
          style={{ ...btnAcaoStyle, background: '#fff7ed', color: '#9a3412', borderColor: '#fdba74' }}
        >
          Marcar como Pendente
        </button>
      </div>
    </div>
  )
}

const badgeStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 800,
}

const btnNavStyle: CSSProperties = {
  background: '#ffffff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const btnAcaoStyle: CSSProperties = {
  borderRadius: '10px',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  border: '1px solid',
}
