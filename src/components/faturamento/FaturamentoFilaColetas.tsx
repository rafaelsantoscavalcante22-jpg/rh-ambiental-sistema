import type { CSSProperties } from 'react'
import type { FaturamentoResumoViewRow } from '../../lib/faturamentoResumo'
import { rotuloConferenciaResumo, statusFaturamentoUi } from '../../lib/faturamentoOperacionalFila'

const wrap: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '20px 22px',
  marginBottom: '20px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
}

const th: CSSProperties = {
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#64748b',
  padding: '10px 12px',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
}

const td: CSSProperties = {
  padding: '12px',
  fontSize: '13px',
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle',
}

type Props = {
  linhas: FaturamentoResumoViewRow[]
  carregando: boolean
  onFaturar: (coletaId: string) => void
  titulo?: string
  subtitulo?: string
  mensagemVazia?: string
  rotuloBotao?: string
}

function fmtData(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function fmtPeso(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`
}

function fmtValor(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n)) || Number(n) <= 0) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function textoPendencias(resumo: string | null | undefined, max = 56) {
  const t = (resumo ?? '').trim()
  if (!t) return '—'
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function FaturamentoFilaColetas({
  linhas,
  carregando,
  onFaturar,
  titulo = 'Fila para emissão ao Financeiro',
  subtitulo = 'Critérios: peso líquido registado, etapa após o controle de massa, aprovação e ainda sem faturamento emitido ao Financeiro. A conferência na vista ajuda a validar o pacote antes de registar o valor.',
  mensagemVazia = 'Nenhuma coleta pronta para faturamento.',
  rotuloBotao = 'Faturar',
}: Props) {
  return (
    <div style={{ ...wrap, borderTop: '4px solid #0d9488' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{titulo}</h2>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b', maxWidth: '900px', lineHeight: 1.55 }}>
            {subtitulo}
          </p>
        </div>
      </div>

      {carregando ? (
        <p style={{ color: '#64748b', fontSize: '14px' }}>Carregando dados…</p>
      ) : linhas.length === 0 ? (
        <div
          style={{
            padding: '28px 20px',
            textAlign: 'center',
            borderRadius: '12px',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            color: '#64748b',
            fontSize: '14px',
          }}
        >
          {mensagemVazia}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1020px' }}>
            <thead>
              <tr>
                <th style={th}>Coleta</th>
                <th style={th}>Cliente</th>
                <th style={th}>MTR</th>
                <th style={th}>Resíduo</th>
                <th style={th}>Peso líq.</th>
                <th style={th}>Data</th>
                <th style={th}>Valor (ref.)</th>
                <th style={th}>Conferência</th>
                <th style={th}>Faturamento</th>
                <th style={{ ...th, maxWidth: '240px' }}>Pendências</th>
                <th style={{ ...th, textAlign: 'center' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.coleta_id} style={{ background: '#fafefd' }}>
                  <td style={{ ...td, fontWeight: 800, color: '#0f766e' }}>{r.numero_coleta ?? r.numero}</td>
                  <td style={td}>{r.cliente_nome || '—'}</td>
                  <td style={td}>{r.mtr_numero || '—'}</td>
                  <td style={{ ...td, maxWidth: '200px' }}>{r.tipo_residuo || '—'}</td>
                  <td style={td}>{fmtPeso(r.peso_liquido)}</td>
                  <td style={td}>{fmtData(r.data_execucao || r.data_agendada)}</td>
                  <td style={td}>{fmtValor(r.valor_coleta ?? r.faturamento_registro_valor)}</td>
                  <td style={{ ...td, fontWeight: 700, color: r.status_conferencia === 'PRONTO_PARA_FATURAR' ? '#0f766e' : '#b45309' }}>
                    {rotuloConferenciaResumo(r)}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: statusFaturamentoUi(r) === 'Faturado' ? '#dcfce7' : '#fef3c7',
                        color: statusFaturamentoUi(r) === 'Faturado' ? '#15803d' : '#b45309',
                      }}
                    >
                      {statusFaturamentoUi(r)}
                    </span>
                  </td>
                  <td style={{ ...td, maxWidth: '240px', fontSize: '12px', color: '#64748b' }} title={r.pendencias_resumo ?? ''}>
                    {textoPendencias(r.pendencias_resumo)}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onFaturar(r.coleta_id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: '#0d9488',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rotuloBotao}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
