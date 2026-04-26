import type { CSSProperties } from 'react'

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '14px',
  marginBottom: '22px',
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
  marginTop: '6px',
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: 1.4,
}

type Props = {
  qtdProntoConferencia: number
  valorSomaProntoConferencia: string
  qtdPodeEmitir: number
  valorEstimadoEmitir: string
  qtdEmitidasFinanceiro: number
  valorEmitidas: string
  qtdPendenteConferencia: number
}

export function FaturamentoResumoCards({
  qtdProntoConferencia,
  valorSomaProntoConferencia,
  qtdPodeEmitir,
  valorEstimadoEmitir,
  qtdEmitidasFinanceiro,
  valorEmitidas,
  qtdPendenteConferencia,
}: Props) {
  return (
    <div style={grid}>
      <div style={{ ...card, borderTop: '3px solid #0d9488' }}>
        <div style={label}>Pronto para faturar (vista)</div>
        <div style={value}>{qtdProntoConferencia}</div>
        <div style={{ ...hint, marginTop: '8px', fontWeight: 700, color: '#0f172a' }}>{valorSomaProntoConferencia}</div>
        <div style={hint}>
          Mesma regra do filtro «Pronto para faturar» no Financeiro (conferência concluída na vista consolidada).
        </div>
      </div>
      <div style={{ ...card, borderTop: '3px solid #14b8a6' }}>
        <div style={label}>Pode emitir agora</div>
        <div style={value}>{qtdPodeEmitir}</div>
        <div style={{ ...hint, marginTop: '8px', fontWeight: 700, color: '#0f172a' }}>{valorEstimadoEmitir}</div>
        <div style={hint}>
          Fila operacional: pesagem com peso líquido, etapa após controle de massa, aprovação e ainda sem emissão ao Financeiro.
        </div>
      </div>
      <div style={{ ...card, borderTop: '3px solid #0ea5e9' }}>
        <div style={label}>Já no Financeiro</div>
        <div style={value}>{qtdEmitidasFinanceiro}</div>
        <div style={{ ...hint, marginTop: '8px', fontWeight: 700, color: '#0f172a' }}>{valorEmitidas}</div>
        <div style={hint}>Coletas com registro emitido ou etapa já enviada ao Financeiro (histórico abaixo).</div>
      </div>
      <div style={{ ...card, borderTop: '3px solid #94a3b8' }}>
        <div style={label}>Conferência pendente (vista)</div>
        <div style={value}>{qtdPendenteConferencia}</div>
        <div style={hint}>
          Conferência ainda incompleta na mesma vista; o resumo do que falta aparece na coluna Pendências da tabela e no Financeiro.
        </div>
      </div>
    </div>
  )
}
