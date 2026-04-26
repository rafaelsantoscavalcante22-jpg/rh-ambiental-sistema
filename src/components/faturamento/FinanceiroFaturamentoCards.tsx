import type { CSSProperties } from 'react'

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: '14px',
  marginBottom: '8px',
}

const card: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '14px',
  padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const label: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#64748b',
  marginBottom: '6px',
}

const value: CSSProperties = {
  fontSize: '22px',
  fontWeight: 800,
  color: '#0f172a',
  letterSpacing: '-0.02em',
}

const hint: CSSProperties = {
  marginTop: '8px',
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: 1.45,
}

type Props = {
  totalAFaturarFmt: string
  totalFaturadoPeriodoFmt: string
  totalPendenteCobrancaFmt: string
  qtdColetasPendentesFila: number
  periodoDe: string
  periodoAte: string
  onPeriodoDeChange: (v: string) => void
  onPeriodoAteChange: (v: string) => void
}

export function FinanceiroFaturamentoCards({
  totalAFaturarFmt,
  totalFaturadoPeriodoFmt,
  totalPendenteCobrancaFmt,
  qtdColetasPendentesFila,
  periodoDe,
  periodoAte,
  onPeriodoDeChange,
  onPeriodoAteChange,
}: Props) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: '12px',
          marginBottom: '14px',
          padding: '12px 14px',
          borderRadius: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>
          Período do total faturado
        </span>
        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
            De
          </label>
          <input
            type="date"
            value={periodoDe}
            onChange={(e) => onPeriodoDeChange(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
            Até
          </label>
          <input
            type="date"
            value={periodoAte}
            onChange={(e) => onPeriodoAteChange(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
            }}
          />
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '280px', lineHeight: 1.4 }}>
          Soma das coletas já faturadas, pela data da coleta no intervalo.
        </span>
      </div>

      <div style={grid}>
        <div style={{ ...card, borderTop: '3px solid #0d9488' }}>
          <div style={label}>Total a faturar (prontas)</div>
          <div style={value}>{totalAFaturarFmt}</div>
          <div style={hint}>
            Soma dos valores de referência na fila (quando existem). Coletas já pesadas e aptas a registar faturamento.
          </div>
        </div>
        <div style={{ ...card, borderTop: '3px solid #0ea5e9' }}>
          <div style={label}>Total faturado no período</div>
          <div style={value}>{totalFaturadoPeriodoFmt}</div>
          <div style={hint}>Coletas já enviadas ao Financeiro com data da coleta no período acima.</div>
        </div>
        <div style={{ ...card, borderTop: '3px solid #b45309' }}>
          <div style={label}>Em aberto na cobrança</div>
          <div style={value}>{totalPendenteCobrancaFmt}</div>
          <div style={hint}>
            Valores na lista de cobrança ainda não marcados como «Pago» (recebimento pendente).
          </div>
        </div>
        <div style={{ ...card, borderTop: '3px solid #64748b' }}>
          <div style={label}>Coletas na fila</div>
          <div style={value}>{qtdColetasPendentesFila}</div>
          <div style={hint}>Coletas com pesagem e fluxo válidos, ainda sem faturamento emitido ao Financeiro.</div>
        </div>
      </div>
    </div>
  )
}
