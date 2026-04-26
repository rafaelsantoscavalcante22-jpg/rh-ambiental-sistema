import { useMemo, useState, type CSSProperties } from 'react'
import type { FaturamentoResumoViewRow } from '../../lib/faturamentoResumo'
import { coletaHistoricoFaturamentoEmitido } from '../../lib/faturamentoOperacionalFila'

const wrap: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '20px 22px',
  marginBottom: '20px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const th: CSSProperties = {
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#64748b',
  padding: '8px 10px',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
}

const td: CSSProperties = {
  padding: '10px',
  fontSize: '12px',
  color: '#334155',
  borderBottom: '1px solid #f1f5f9',
}

function fmtData(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtValor(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function inicioDia(isoDate: string): number {
  const d = new Date(isoDate + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function fimDiaInclusive(isoDate: string): number {
  const d = new Date(isoDate + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

type Props = {
  todasLinhas: FaturamentoResumoViewRow[]
}

export function FaturamentoHistoricoColetas({ todasLinhas }: Props) {
  const [busca, setBusca] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const historicoBase = useMemo(
    () => todasLinhas.filter((r) => coletaHistoricoFaturamentoEmitido(r)),
    [todasLinhas]
  )

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const tokens = q.split(/\s+/).filter(Boolean)
    const t0 = de ? inicioDia(de) : null
    const t1 = ate ? fimDiaInclusive(ate) : null
    return historicoBase.filter((r) => {
      const ref = `${r.numero} ${r.numero_coleta ?? ''} ${r.cliente_nome ?? ''}`.toLowerCase()
      if (tokens.length && !tokens.every((t) => ref.includes(t))) return false
      const refData = r.data_execucao || r.created_at
      if (!refData) return t0 == null && t1 == null
      const ts = new Date(refData).getTime()
      if (t0 != null && ts < t0) return false
      if (t1 != null && ts > t1) return false
      return true
    })
  }, [historicoBase, busca, de, ate])

  return (
    <div style={wrap}>
      <h2 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#475569' }}>Coletas faturadas</h2>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8', maxWidth: '820px', lineHeight: 1.5 }}>
        Consulta secundária: coletas já enviadas ao Financeiro. Filtre por período (data da coleta) ou busque por cliente / número.
        A coluna «Conferência» mostra quando o pacote operacional foi conferido, quando existir registo.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
            Busca
          </label>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente ou nº coleta"
            style={{
              width: '220px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
            De
          </label>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
            Até
          </label>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
        </div>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 'min(420px, 48vh)', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
          <thead>
            <tr>
              <th style={th}>Coleta</th>
              <th style={th}>Cliente</th>
              <th style={th}>MTR</th>
              <th style={th}>Resíduo</th>
              <th style={th}>Peso líq.</th>
              <th style={th}>Data coleta</th>
              <th style={th}>Conferência</th>
              <th style={th}>Situação</th>
              <th style={th}>Valor</th>
              <th style={th}>Ref. NF</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
                  Nenhum registro neste filtro.
                </td>
              </tr>
            ) : (
              filtradas.map((r) => (
                <tr key={`h-${r.coleta_id}`}>
                  <td style={{ ...td, fontWeight: 700 }}>{r.numero_coleta ?? r.numero}</td>
                  <td style={td}>{r.cliente_nome || '—'}</td>
                  <td style={td}>{r.mtr_numero || '—'}</td>
                  <td style={{ ...td, maxWidth: '160px' }}>{r.tipo_residuo || '—'}</td>
                  <td style={td}>
                    {r.peso_liquido != null
                      ? `${Number(r.peso_liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`
                      : '—'}
                  </td>
                  <td style={td}>{fmtData(r.data_execucao || r.data_agendada)}</td>
                  <td style={{ ...td, fontSize: '11px', color: '#64748b' }}>{fmtDataHora(r.conferencia_em)}</td>
                  <td style={td}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: '#dcfce7',
                        color: '#15803d',
                      }}
                    >
                      Faturado
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmtValor(r.faturamento_registro_valor ?? r.valor_coleta)}</td>
                  <td style={td}>{r.faturamento_referencia_nf || r.referencia_nf || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#94a3b8' }}>
        {filtradas.length} registro(s) no filtro.
      </p>
    </div>
  )
}
