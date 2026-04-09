import type { CSSProperties } from 'react'

/** Conteúdo só para impressão (portal em document.body). Estilos em index.css (.exec-print-report-root). */

export type ExecutivePrintReportProps = {
  geradoEmLabel: string
  periodoPresetLabel: string
  periodoIntervaloLabel: string
  filtrosLinhas: string[]
  resumoExecutivo: string
  concentracao?: string | null
  alertas: { msg: string }[]
  kpis: {
    receita: string
    coletasPeriodo: number
    ticketMedio: string
    vencidosValor: string
    vencidosQtd: number
    deltaReceita: string
    deltaColetas: string
    deltaTicket: string
    coletasHoje: number
    coletasMes: number
    coletasAno: number
    mtrsEmitidas: number
    clientesAtivos: number
    clientesCadastro: number
    finalizadas: number
    pendentes: number
    volumePeso: string
  }
  topReceita: { nome: string; valor: string }[]
  topFrequencia: { nome: string; qtd: number }[]
  topVolume: { nome: string; kg: string }[]
  distribuicaoEtapa: { nome: string; qtd: number }[]
  gargalos: {
    pendentes: number
    semMtr: number
    vencidosValor: string
    vencidosQtd: number
    taxaFinalPct: number
  }
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid #0f766e',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#0f172a',
}
const td: CSSProperties = {
  padding: '7px 10px',
  borderBottom: '1px solid #e2e8f0',
  fontSize: 12,
  color: '#334155',
}
const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#0f172a',
  margin: '20px 0 10px',
  paddingBottom: 6,
  borderBottom: '1px solid #cbd5e1',
}
const kvRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: '6px 0',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 12,
}
const kvLab: CSSProperties = { color: '#64748b', fontWeight: 600 }
const kvVal: CSSProperties = { color: '#0f172a', fontWeight: 700, textAlign: 'right' }

export function ExecutivePrintReportRoot(p: ExecutivePrintReportProps) {
  return (
    <div className="exec-print-report-root">
      <div className="exec-print-report__brand">RG Ambiental</div>
      <h1 className="exec-print-report__title">Relatório gerencial — Visão executiva</h1>
      <p className="exec-print-report__meta">
        Emitido em <strong>{p.geradoEmLabel}</strong>
      </p>

      <h2 style={sectionTitle}>Período e filtros</h2>
      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
        <p style={{ margin: '0 0 8px' }}>
          <strong>Período:</strong> {p.periodoPresetLabel}
          <br />
          <strong>Intervalo:</strong> {p.periodoIntervaloLabel}
        </p>
        {p.filtrosLinhas.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {p.filtrosLinhas.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0 }}>Nenhum filtro adicional (todos os registros no intervalo).</p>
        )}
      </div>

      <h2 style={sectionTitle}>Resumo executivo</h2>
      <p className="exec-print-report__insight">{p.resumoExecutivo}</p>
      {p.concentracao ? <p className="exec-print-report__insight-secondary">{p.concentracao}</p> : null}

      {p.alertas.length > 0 ? (
        <>
          <h2 style={sectionTitle}>Alertas</h2>
          <ul className="exec-print-report__alertas">
            {p.alertas.map((a, i) => (
              <li key={i}>{a.msg}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 style={sectionTitle}>Indicadores principais</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={kvRow}>
            <span style={kvLab}>Receita total</span>
            <span style={kvVal}>{p.kpis.receita}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Variação receita</span>
            <span style={kvVal}>{p.kpis.deltaReceita}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Coletas no período</span>
            <span style={kvVal}>{p.kpis.coletasPeriodo}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Variação coletas</span>
            <span style={kvVal}>{p.kpis.deltaColetas}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Ticket médio</span>
            <span style={kvVal}>{p.kpis.ticketMedio}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Variação ticket</span>
            <span style={kvVal}>{p.kpis.deltaTicket}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Valores vencidos</span>
            <span style={kvVal}>
              {p.kpis.vencidosValor} ({p.kpis.vencidosQtd} título(s))
            </span>
          </div>
        </div>
        <div>
          <div style={kvRow}>
            <span style={kvLab}>Coletas hoje</span>
            <span style={kvVal}>{p.kpis.coletasHoje}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Coletas no mês</span>
            <span style={kvVal}>{p.kpis.coletasMes}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Coletas no ano</span>
            <span style={kvVal}>{p.kpis.coletasAno}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>MTRs emitidas (período)</span>
            <span style={kvVal}>{p.kpis.mtrsEmitidas}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Clientes ativos</span>
            <span style={kvVal}>{p.kpis.clientesAtivos}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Clientes cadastro</span>
            <span style={kvVal}>{p.kpis.clientesCadastro}</span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Finalizadas / pendentes</span>
            <span style={kvVal}>
              {p.kpis.finalizadas} / {p.kpis.pendentes}
            </span>
          </div>
          <div style={kvRow}>
            <span style={kvLab}>Volume coletado</span>
            <span style={kvVal}>{p.kpis.volumePeso}</span>
          </div>
        </div>
      </div>

      <h2 style={sectionTitle}>Top clientes — receita</h2>
      <table className="exec-print-report__table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Cliente</th>
            <th style={{ ...th, textAlign: 'right' }}>Receita</th>
          </tr>
        </thead>
        <tbody>
          {p.topReceita.map((r, i) => (
            <tr key={i}>
              <td style={td}>{r.nome}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={sectionTitle}>Top clientes — frequência</h2>
      <table className="exec-print-report__table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Cliente</th>
            <th style={{ ...th, textAlign: 'right' }}>Coletas</th>
          </tr>
        </thead>
        <tbody>
          {p.topFrequencia.map((r, i) => (
            <tr key={i}>
              <td style={td}>{r.nome}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.qtd}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={sectionTitle}>Top clientes — volume (peso)</h2>
      <table className="exec-print-report__table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Cliente</th>
            <th style={{ ...th, textAlign: 'right' }}>Peso</th>
          </tr>
        </thead>
        <tbody>
          {p.topVolume.map((r, i) => (
            <tr key={i}>
              <td style={td}>{r.nome}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.kg}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={sectionTitle}>Distribuição por etapa do fluxo</h2>
      <table className="exec-print-report__table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Etapa</th>
            <th style={{ ...th, textAlign: 'right' }}>Coletas</th>
          </tr>
        </thead>
        <tbody>
          {p.distribuicaoEtapa.map((r, i) => (
            <tr key={i}>
              <td style={td}>{r.nome}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.qtd}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={sectionTitle}>Operação e gargalos</h2>
      <div style={{ fontSize: 12 }}>
        <div style={kvRow}>
          <span style={kvLab}>Coletas pendentes</span>
          <span style={kvVal}>{p.gargalos.pendentes}</span>
        </div>
        <div style={kvRow}>
          <span style={kvLab}>Coletas sem MTR (período)</span>
          <span style={kvVal}>{p.gargalos.semMtr}</span>
        </div>
        <div style={kvRow}>
          <span style={kvLab}>Valores vencidos</span>
          <span style={kvVal}>
            {p.gargalos.vencidosValor} ({p.gargalos.vencidosQtd})
          </span>
        </div>
        <div style={kvRow}>
          <span style={kvLab}>Taxa em fase final</span>
          <span style={kvVal}>{p.gargalos.taxaFinalPct}%</span>
        </div>
      </div>

      <p className="exec-print-report__footer">
        Documento gerado pelo painel executivo · os valores refletem o período e os filtros indicados acima.
      </p>
    </div>
  )
}
