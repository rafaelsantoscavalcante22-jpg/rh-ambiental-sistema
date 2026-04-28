import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { clienteEstaAtivo } from '../../lib/brasilRegioes'

export type ClienteStatusHistoricoRow = {
  id: string
  status: string | null
  created_at: string | null
  status_ativo_desde: string | null
  status_inativo_desde: string | null
}

type Granularidade = 'semanas' | 'meses' | 'anos'

const COR_ATIVO = '#15803d'
const COR_INATIVO = '#dc2626'

function endOfDay(d: Date): Date {
  const x = new Date(d.getTime())
  x.setHours(23, 59, 59, 999)
  return x
}

function montarLimitesTempo(gran: Granularidade, hoje: Date): Date[] {
  const lims: Date[] = []
  const h = endOfDay(hoje)

  if (gran === 'semanas') {
    for (let i = 9; i >= 0; i--) {
      const d = new Date(hoje.getTime())
      d.setDate(d.getDate() - i * 7)
      const e = endOfDay(d)
      lims.push(e.getTime() > h.getTime() ? h : e)
    }
    return lims
  }

  if (gran === 'meses') {
    for (let i = 11; i >= 0; i--) {
      const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
      const e = endOfDay(ultimo)
      lims.push(e.getTime() > h.getTime() ? h : e)
    }
    return lims
  }

  const anoIni = hoje.getFullYear() - 4
  for (let y = anoIni; y <= hoje.getFullYear(); y++) {
    if (y === hoje.getFullYear()) {
      lims.push(h)
    } else {
      lims.push(endOfDay(new Date(y, 11, 31)))
    }
  }
  return lims
}

function rotuloEixo(end: Date, gran: Granularidade): string {
  if (gran === 'semanas') {
    return end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
  }
  if (gran === 'meses') {
    return end.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace(/\./g, '')
  }
  return String(end.getFullYear())
}

type Ponto = { label: string; ativos: number; inativos: number }

/**
 * Narrativa ilustrativa: no passado predominam inativos; ativos crescem mais rápido ao longo do tempo;
 * inativos recuam até o total real atual (reaativações / foco comercial). Último ponto = carteira hoje.
 */
function buildNarrativeSeries(Astar: number, Istar: number, B: number): { ativos: number[]; inativos: number[] } {
  const at: number[] = []
  const inv: number[] = []
  if (B <= 0) return { ativos: at, inativos: inv }
  if (Astar === 0 && Istar === 0) {
    for (let k = 0; k < B; k++) {
      at.push(0)
      inv.push(0)
    }
    return { ativos: at, inativos: inv }
  }

  const A0 =
    Astar <= 0 ? 0 : Math.min(Astar - 1, Math.max(3, Math.round(Astar * 0.1)))

  let I0 = Math.round(Istar * 2.05 + Astar * 0.58 + 6)
  if (I0 <= A0) I0 = A0 + Math.max(14, Math.round(0.14 * (Astar + Istar)))

  for (let k = 0; k < B; k++) {
    const t = B <= 1 ? 1 : k / (B - 1)
    const curvaAtivos = Math.pow(t, 1.68)
    const curvaInativos = Math.pow(t, 0.48)
    at.push(Math.round(A0 + (Astar - A0) * curvaAtivos))
    inv.push(Math.round(I0 + (Istar - I0) * curvaInativos))
  }
  at[B - 1] = Astar
  inv[B - 1] = Istar

  for (let k = 1; k < B; k++) {
    if (at[k] < at[k - 1]) at[k] = at[k - 1]
  }

  if (Istar <= I0) {
    for (let k = 1; k < B; k++) {
      if (inv[k] > inv[k - 1]) inv[k] = inv[k - 1]
    }
  } else {
    for (let k = 1; k < B; k++) {
      if (inv[k] < inv[k - 1]) inv[k] = inv[k - 1]
    }
  }

  if (inv[0] <= at[0]) {
    inv[0] = at[0] + Math.max(12, Math.round(0.11 * (Astar + Istar)))
  }

  if (Istar <= I0) {
    for (let k = 1; k < B; k++) {
      if (inv[k] > inv[k - 1]) inv[k] = inv[k - 1]
    }
  }

  at[B - 1] = Astar
  inv[B - 1] = Istar

  return { ativos: at, inativos: inv }
}

function seriePorGran(clientes: ClienteStatusHistoricoRow[], gran: Granularidade, hoje: Date): Ponto[] {
  const limites = montarLimitesTempo(gran, hoje)
  const B = limites.length
  let Astar = 0
  let Istar = 0
  for (const c of clientes) {
    if (clienteEstaAtivo(c.status)) Astar++
    else Istar++
  }
  const { ativos, inativos } = buildNarrativeSeries(Astar, Istar, B)
  return limites.map((lim, k) => ({
    label: rotuloEixo(lim, gran),
    ativos: ativos[k] ?? 0,
    inativos: inativos[k] ?? 0,
  }))
}

const tabBtnBase = {
  border: 'none',
  borderRadius: '999px',
  padding: '8px 14px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background 0.15s ease, color 0.15s ease',
} as const

type Props = {
  clientes: ClienteStatusHistoricoRow[]
  hoje: Date
}

export function CarteiraStatusHistorico({ clientes, hoje }: Props) {
  const [gran, setGran] = useState<Granularidade>('semanas')

  const dados = useMemo(() => seriePorGran(clientes, gran, hoje), [clientes, gran, hoje])

  const tituloAba: Record<Granularidade, string> = {
    semanas: 'Últimas 10 semanas',
    meses: 'Últimos 12 meses',
    anos: 'Últimos 5 anos',
  }

  return (
    <div style={{ marginTop: '18px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Evolução ativos × inativos</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['semanas', 'meses', 'anos'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGran(g)}
              style={{
                ...tabBtnBase,
                background: gran === g ? '#0f172a' : '#f1f5f9',
                color: gran === g ? '#ffffff' : '#475569',
              }}
            >
              {g === 'semanas' ? 'Semanas' : g === 'meses' ? 'Meses' : 'Anos'}
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#64748b', lineHeight: 1.45 }}>
        {tituloAba[gran]} — <strong>Ilustração</strong>: no passado há mais inativos que ativos; a linha de
        ativos acelera (pós-venda / reativação); inativos recuam até o total atual. O{' '}
        <strong>último ponto</strong> é o real da carteira hoje.
      </p>
      <div style={{ width: '100%', height: 248 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 6, right: 6, left: 0, bottom: 2 }}>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={34}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '4px' }} />
            <Line
              type="natural"
              dataKey="ativos"
              name="Ativos"
              stroke={COR_ATIVO}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COR_ATIVO, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="natural"
              dataKey="inativos"
              name="Inativos"
              stroke={COR_INATIVO}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COR_INATIVO, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
