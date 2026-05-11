import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSessionPersistedState } from '../../lib/usePageSessionPersistence'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import MainLayout from '../../layouts/MainLayout'
import { RgReportPdfIcon } from '../ui/RgReportPdfIcon'
import { supabase } from '../../lib/supabase'
import { coletaVisivelListaFinanceiro, isVencidoFinanceiro } from '../../lib/financeiroColetas'
import {
  formatarEtapaParaUI,
  formatarFaseFluxoOficialParaUI,
  indiceEtapaFluxo,
  normalizarEtapaColeta,
  type EtapaFluxo,
} from '../../lib/fluxoEtapas'
import {
  ExecutivePrintReportRoot,
  type ExecutivePrintReportProps,
} from './ExecutiveDashboardPrintReport'
import { ExecutiveLinhaTempoModal } from './ExecutiveLinhaTempoModal'

/** Paleta BI premium — teal RG refinado + neutros frios */
const CHART_COLORS = [
  '#0f766e',
  '#14b8a6',
  '#2dd4bf',
  '#5eead4',
  '#64748b',
  '#94a3b8',
  '#cbd5e1',
  '#e2e8f0',
]
const CHART_LINE_PRIMARY = '#0d9488'
const CHART_LINE_SECONDARY = '#0f766e'
const CHART_TICK = '#64748b'
const CHART_AREA_H = 240
const CHART_AREA_H_LG = 280
const CHART_AREA_H_SM = 132

const tooltipStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.04)',
  fontSize: 12,
  fontWeight: 500,
  color: '#1e293b',
  background: 'rgba(255, 255, 255, 0.98)',
  backdropFilter: 'blur(8px)',
}

type ColetaRow = {
  id: string
  numero: string
  cliente: string
  cliente_id: string | null
  cidade: string
  tipo_residuo: string
  data_agendada: string | null
  etapa_operacional: string | null
  fluxo_status: string | null
  observacoes: string | null
  liberado_financeiro: boolean | null
  valor_coleta: number | null
  status_pagamento: string | null
  data_vencimento: string | null
  peso_liquido: number | null
  created_at: string
  programacao_id: string | null
  mtr_id: string | null
}

type MtrRow = { id: string; created_at: string; status: string | null }

export type PresetPeriodo = 'today' | '7d' | '30d' | 'month' | 'year' | 'custom'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function hojeLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function defaultCustomFromExecutivo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 29)
  return d.toISOString().slice(0, 10)
}

function defaultCalMonthExecutivo(): { y: number; m: number } {
  const d = new Date()
  return { y: d.getFullYear(), m: d.getMonth() }
}

/** Janela mínima de `created_at` para o dashboard (gráficos 12m + calendário); reduz payload vs. histórico ilimitado. */
function dataMinimaColetasDashboardExecutivo(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 18)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function inicioFimPreset(p: PresetPeriodo, customFrom: string, customTo: string): { ini: Date; fim: Date } {
  const fim = new Date()
  fim.setHours(23, 59, 59, 999)
  const ini = new Date()

  if (p === 'today') {
    ini.setHours(0, 0, 0, 0)
    return { ini, fim }
  }
  if (p === '7d') {
    ini.setDate(ini.getDate() - 6)
    ini.setHours(0, 0, 0, 0)
    return { ini, fim }
  }
  if (p === '30d') {
    ini.setDate(ini.getDate() - 29)
    ini.setHours(0, 0, 0, 0)
    return { ini, fim }
  }
  if (p === 'month') {
    ini.setDate(1)
    ini.setHours(0, 0, 0, 0)
    return { ini, fim }
  }
  if (p === 'year') {
    ini.setMonth(0, 1)
    ini.setHours(0, 0, 0, 0)
    return { ini, fim }
  }
  const a = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(fim.getFullYear(), fim.getMonth(), 1)
  const b = customTo ? new Date(`${customTo}T23:59:59`) : fim
  return { ini: a, fim: b }
}

function parseDataRef(c: ColetaRow): string | null {
  const d = c.data_agendada?.trim()
  if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const cr = c.created_at
  if (cr) return cr.slice(0, 10)
  return null
}

function parseDataAsDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function etapaFinalizada(etapa: EtapaFluxo): boolean {
  const i = indiceEtapaFluxo(etapa)
  return i >= indiceEtapaFluxo('FATURADO')
}

function formatDeltaPct(atual: number, anterior: number): string {
  if (anterior <= 0) return atual > 0 ? '↑ novo' : '—'
  const p = ((atual - anterior) / anterior) * 100
  if (Math.abs(p) < 1) return 'estável'
  const s = p >= 0 ? '↑' : '↓'
  return `${s} ${Math.abs(p).toFixed(0)}%`
}

type DeltaVariacao = 'up' | 'down' | 'flat' | 'new' | 'none'

function deltaVariacao(atual: number, anterior: number): DeltaVariacao {
  if (anterior <= 0) return atual > 0 ? 'new' : 'none'
  const p = ((atual - anterior) / anterior) * 100
  if (Math.abs(p) < 1) return 'flat'
  return p >= 0 ? 'up' : 'down'
}

function linhaInsightCor(
  pendentes: number,
  vencidosQtd: number,
  ratioFinal: number,
  n: number
): 'ok' | 'warn' | 'crit' {
  if (n === 0) return 'ok'
  if (vencidosQtd > 0 || pendentes > n * 0.55) return 'crit'
  if (pendentes > n * 0.35 || ratioFinal < 35) return 'warn'
  return 'ok'
}

export function ExecutiveDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [coletas, setColetas] = useState<ColetaRow[]>([])
  const [mtrs, setMtrs] = useState<MtrRow[]>([])
  const [tipoCaminhaoPorProg, setTipoCaminhaoPorProg] = useState<Record<string, string>>({})
  const [totalClientesCadastro, setTotalClientesCadastro] = useState(0)

  const [preset, setPreset] = useSessionPersistedState<PresetPeriodo>('exe-preset', '30d')
  const [customFrom, setCustomFrom] = useSessionPersistedState(
    'exe-custom-from',
    defaultCustomFromExecutivo()
  )
  const [customTo, setCustomTo] = useSessionPersistedState('exe-custom-to', hojeLocalISO())

  const [filtroClienteId, setFiltroClienteId] = useSessionPersistedState('exe-filtro-cliente', '')
  const [filtroEtapa, setFiltroEtapa] = useSessionPersistedState('exe-filtro-etapa', '')
  const [filtroTipoResiduo, setFiltroTipoResiduo] = useSessionPersistedState(
    'exe-filtro-residuo',
    ''
  )
  const [filtroTipoCaminhao, setFiltroTipoCaminhao] = useSessionPersistedState(
    'exe-filtro-caminhao',
    ''
  )

  const [diaModal, setDiaModal] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useSessionPersistedState('exe-cal-month', defaultCalMonthExecutivo())
  const [relatorioEmissaoLabel, setRelatorioEmissaoLabel] = useState(() =>
    new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  )
  const [relatorioPrintNonce, setRelatorioPrintNonce] = useState(0)
  const [linhaTempoAberta, setLinhaTempoAberta] = useSessionPersistedState('exe-linha-tempo', false)

  const EXEC_PAGE_SIZE = 1000
  const EXEC_MAX_COLETAS = 3000
  const EXEC_MAX_MTRS = 2000

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      setErro('')
      const desdeIso = dataMinimaColetasDashboardExecutivo()
      const clRes = await supabase.from('clientes').select('id', { count: 'exact', head: true })
      if (clRes.error) throw clRes.error

      const coletasAcc: ColetaRow[] = []
      for (let from = 0; from < EXEC_MAX_COLETAS; from += EXEC_PAGE_SIZE) {
        const to = Math.min(from + EXEC_PAGE_SIZE - 1, EXEC_MAX_COLETAS - 1)
        const cRes = await supabase
          .from('coletas')
          .select(
            'id, numero, cliente, cliente_id, cidade, tipo_residuo, data_agendada, etapa_operacional, fluxo_status, observacoes, liberado_financeiro, valor_coleta, status_pagamento, data_vencimento, peso_liquido, created_at, programacao_id, mtr_id'
          )
          .gte('created_at', desdeIso)
          .order('created_at', { ascending: false })
          .range(from, to)
        if (cRes.error) throw cRes.error
        const chunk = (cRes.data || []) as ColetaRow[]
        coletasAcc.push(...chunk)
        if (chunk.length < EXEC_PAGE_SIZE) break
      }

      const mtrsAcc: MtrRow[] = []
      for (let from = 0; from < EXEC_MAX_MTRS; from += EXEC_PAGE_SIZE) {
        const to = Math.min(from + EXEC_PAGE_SIZE - 1, EXEC_MAX_MTRS - 1)
        const mRes = await supabase
          .from('mtrs')
          .select('id, created_at, status')
          .gte('created_at', desdeIso)
          .order('created_at', { ascending: false })
          .range(from, to)
        if (mRes.error) throw mRes.error
        const chunk = (mRes.data || []) as MtrRow[]
        mtrsAcc.push(...chunk)
        if (chunk.length < EXEC_PAGE_SIZE) break
      }

      if (coletasAcc.length >= EXEC_MAX_COLETAS) {
        console.warn(
          `[ExecutiveDashboard] Cap de ${EXEC_MAX_COLETAS} coletas atingido; resultados podem estar truncados.`
        )
      }
      if (mtrsAcc.length >= EXEC_MAX_MTRS) {
        console.warn(
          `[ExecutiveDashboard] Cap de ${EXEC_MAX_MTRS} MTRs atingido; resultados podem estar truncados.`
        )
      }

      setColetas(coletasAcc)
      setMtrs(mtrsAcc)

      const progIds = [
        ...new Set(coletasAcc.map((c) => c.programacao_id).filter(Boolean)),
      ] as string[]
      const tc: Record<string, string> = {}
      const PROG_CHUNK = 450
      const fatias: string[][] = []
      for (let i = 0; i < progIds.length; i += PROG_CHUNK) {
        fatias.push(progIds.slice(i, i + PROG_CHUNK))
      }
      if (fatias.length > 0) {
        const progRespostas = await Promise.all(
          fatias.map((sl) =>
            supabase.from('programacoes').select('id, tipo_caminhao').in('id', sl)
          )
        )
        for (const pRes of progRespostas) {
          if (!pRes.error && pRes.data) {
            for (const r of pRes.data as { id: string; tipo_caminhao: string | null }[]) {
              tc[r.id] = (r.tipo_caminhao ?? '').trim() || '—'
            }
          }
        }
      }
      setTipoCaminhaoPorProg(tc)
      setTotalClientesCadastro(
        typeof clRes.count === 'number' && clRes.count !== null ? clRes.count : 0
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados executivos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void carregar()
    })
  }, [carregar])

  const { ini: rangeIni, fim: rangeFim } = useMemo(
    () => inicioFimPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const filtrarColetasNoIntervalo = useCallback(
    (ini: Date, fim: Date) => {
      return coletas.filter((c) => {
        const ref = parseDataRef(c)
        if (!ref) return false
        const dt = parseDataAsDate(ref)
        if (dt < ini || dt > fim) return false

        if (filtroClienteId) {
          const ok =
            c.cliente_id === filtroClienteId ||
            (c.cliente || '').trim() === filtroClienteId
          if (!ok) return false
        }

        const et = normalizarEtapaColeta({ fluxo_status: c.fluxo_status, etapa_operacional: c.etapa_operacional })
        if (filtroEtapa && et !== filtroEtapa) return false

        if (filtroTipoResiduo) {
          const t = (c.tipo_residuo || '').trim()
          if (t !== filtroTipoResiduo) return false
        }

        if (filtroTipoCaminhao) {
          const pid = c.programacao_id
          const tc = pid ? tipoCaminhaoPorProg[pid] ?? '' : ''
          if (tc !== filtroTipoCaminhao) return false
        }

        return true
      })
    },
    [coletas, filtroClienteId, filtroEtapa, filtroTipoResiduo, filtroTipoCaminhao, tipoCaminhaoPorProg]
  )

  const coletasFiltradas = useMemo(
    () => filtrarColetasNoIntervalo(rangeIni, rangeFim),
    [filtrarColetasNoIntervalo, rangeIni, rangeFim]
  )

  const coletasLinhaTempo = useMemo(
    () =>
      coletasFiltradas.map((c) => ({
        id: c.id,
        numero: String(c.numero ?? ''),
        cliente: String(c.cliente ?? ''),
        cidade: String(c.cidade ?? ''),
        data_agendada: c.data_agendada,
        fluxo_status: c.fluxo_status,
        etapa_operacional: c.etapa_operacional,
        mtr_id: c.mtr_id,
        created_at: c.created_at,
      })),
    [coletasFiltradas]
  )

  const intervaloAnterior = useMemo(() => {
    const dur = rangeFim.getTime() - rangeIni.getTime()
    const prevFim = new Date(rangeIni.getTime())
    prevFim.setMilliseconds(prevFim.getMilliseconds() - 1)
    const prevIni = new Date(prevFim.getTime() - dur)
    return { prevIni, prevFim }
  }, [rangeIni, rangeFim])

  const coletasFiltradasAnterior = useMemo(
    () => filtrarColetasNoIntervalo(intervaloAnterior.prevIni, intervaloAnterior.prevFim),
    [filtrarColetasNoIntervalo, intervaloAnterior.prevIni, intervaloAnterior.prevFim]
  )

  const metricasPeriodoAnterior = useMemo(() => {
    let receita = 0
    let liberadasComValor = 0
    for (const c of coletasFiltradasAnterior) {
      const noFin = coletaVisivelListaFinanceiro({
        fluxo_status: c.fluxo_status,
        etapa_operacional: c.etapa_operacional,
        liberado_financeiro: c.liberado_financeiro,
        observacoes: c.observacoes,
      })
      if (noFin && c.valor_coleta != null) {
        const v = Number(c.valor_coleta)
        if (!Number.isNaN(v) && v > 0) {
          receita += v
          liberadasComValor += 1
        }
      }
    }
    const ticketMedio = liberadasComValor > 0 ? receita / liberadasComValor : 0
    return {
      coletas: coletasFiltradasAnterior.length,
      receita,
      ticketMedio,
    }
  }, [coletasFiltradasAnterior])

  const hojeIso = hojeLocalISO()
  const inicioAno = useMemo(() => `${new Date().getFullYear()}-01-01`, [])

  const kpis = useMemo(() => {
    const refDia = (c: ColetaRow) => parseDataRef(c)
    const ymAtual = hojeIso.slice(0, 7)
    let coletasHoje = 0
    let coletasMes = 0
    let coletasAno = 0
    for (const c of coletas) {
      const r = refDia(c)
      if (!r) continue
      if (r === hojeIso) coletasHoje += 1
      if (r.slice(0, 7) === ymAtual) coletasMes += 1
      if (r >= inicioAno) coletasAno += 1
    }

    const filtradas = coletasFiltradas
    let peso = 0
    let receita = 0
    let liberadasComValor = 0
    let vencidosQtd = 0
    let vencidosValor = 0
    let finalizadas = 0
    let pendentes = 0
    const clientesDist = new Set<string>()

    for (const c of filtradas) {
      const et = normalizarEtapaColeta({ fluxo_status: c.fluxo_status, etapa_operacional: c.etapa_operacional })
      if (etapaFinalizada(et)) finalizadas += 1
      else pendentes += 1

      const pl = c.peso_liquido
      if (pl != null && !Number.isNaN(Number(pl))) peso += Number(pl)

      const noFinanceiro = coletaVisivelListaFinanceiro({
        fluxo_status: c.fluxo_status,
        etapa_operacional: c.etapa_operacional,
        liberado_financeiro: c.liberado_financeiro,
        observacoes: c.observacoes,
      })

      if (noFinanceiro && c.valor_coleta != null) {
        const v = Number(c.valor_coleta)
        if (!Number.isNaN(v) && v > 0) {
          receita += v
          liberadasComValor += 1
        }
      }

      if (noFinanceiro && isVencidoFinanceiro(c.data_vencimento, c.status_pagamento)) {
        vencidosQtd += 1
        const vv = Number(c.valor_coleta ?? 0)
        vencidosValor += Number.isNaN(vv) ? 0 : vv
      }

      if (c.cliente?.trim()) clientesDist.add(c.cliente.trim())
    }

    const ticketMedio = liberadasComValor > 0 ? receita / liberadasComValor : 0

    const mtrsPeriodo = mtrs.filter((m) => {
      if ((m.status || '').toLowerCase() === 'cancelado') return false
      const t = m.created_at ? new Date(m.created_at) : null
      if (!t) return false
      return t >= rangeIni && t <= rangeFim
    }).length

    return {
      coletasHoje,
      coletasMes,
      coletasAno,
      coletasPeriodo: filtradas.length,
      clientesAtivosLista: clientesDist.size,
      totalClientesCadastro,
      mtrsEmitidas: mtrsPeriodo,
      finalizadas,
      pendentes,
      pesoTotal: peso,
      receita,
      ticketMedio,
      vencidosQtd,
      vencidosValor,
    }
  }, [
    coletas,
    coletasFiltradas,
    hojeIso,
    inicioAno,
    mtrs,
    rangeIni,
    rangeFim,
    totalClientesCadastro,
  ])

  const topClientesReceita = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of coletasFiltradas) {
      if (
        !coletaVisivelListaFinanceiro({
          fluxo_status: c.fluxo_status,
          etapa_operacional: c.etapa_operacional,
          liberado_financeiro: c.liberado_financeiro,
          observacoes: c.observacoes,
        })
      ) {
        continue
      }
      const v = Number(c.valor_coleta)
      if (Number.isNaN(v) || v <= 0) continue
      const k = c.cliente?.trim() || '—'
      m.set(k, (m.get(k) || 0) + v)
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, valor]) => ({ nome, valor }))
  }, [coletasFiltradas])

  const concentracaoReceitaTop1 = useMemo(() => {
    if (topClientesReceita.length === 0 || kpis.receita <= 0) return null
    const t = topClientesReceita[0]
    return Math.round((t.valor / kpis.receita) * 100)
  }, [topClientesReceita, kpis.receita])

  const seriePorDia = useMemo(() => {
    const map = new Map<string, number>()
    const cur = new Date(rangeIni)
    const end = new Date(rangeFim)
    while (cur <= end) {
      map.set(cur.toISOString().slice(0, 10), 0)
      cur.setDate(cur.getDate() + 1)
    }
    for (const c of coletasFiltradas) {
      const r = parseDataRef(c)
      if (!r || !map.has(r)) continue
      map.set(r, (map.get(r) || 0) + 1)
    }
    return [...map.entries()].map(([dataIso, n]) => ({
      dataIso,
      label: `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`,
      coletas: n,
    }))
  }, [coletasFiltradas, rangeIni, rangeFim])

  const topClientes = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of coletasFiltradas) {
      const k = c.cliente?.trim() || '—'
      m.set(k, (m.get(k) || 0) + 1)
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, qtd]) => ({ nome, qtd }))
  }, [coletasFiltradas])

  const topClientesPeso = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of coletasFiltradas) {
      const k = c.cliente?.trim() || '—'
      const p = c.peso_liquido != null ? Number(c.peso_liquido) : 0
      m.set(k, (m.get(k) || 0) + (Number.isNaN(p) ? 0 : p))
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, kg]) => ({ nome, kg }))
  }, [coletasFiltradas])

  const receitaPorMes = useMemo(() => {
    const m = new Map<string, number>()
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
      m.set(key, 0)
    }
    for (const c of coletas) {
      if (
        !coletaVisivelListaFinanceiro({
          fluxo_status: c.fluxo_status,
          etapa_operacional: c.etapa_operacional,
          liberado_financeiro: c.liberado_financeiro,
          observacoes: c.observacoes,
        }) ||
        c.valor_coleta == null
      ) {
        continue
      }
      const v = Number(c.valor_coleta)
      if (Number.isNaN(v) || v <= 0) continue
      const ref = parseDataRef(c)
      if (!ref) continue
      const ym = ref.slice(0, 7)
      if (m.has(ym)) m.set(ym, (m.get(ym) || 0) + v)
    }
    return [...m.entries()].map(([mes, valor]) => ({
      mes,
      label: mes.slice(5, 7) + '/' + mes.slice(0, 4),
      valor,
    }))
  }, [coletas])

  const mtrsPorMes = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of mtrs) {
      if ((row.status || '').toLowerCase() === 'cancelado') continue
      const t = row.created_at?.slice(0, 7)
      if (!t) continue
      m.set(t, (m.get(t) || 0) + 1)
    }
    const keys = [...m.keys()].sort().slice(-12)
    return keys.map((k) => ({ mes: k, label: k.slice(5, 7) + '/' + k.slice(0, 4), qtd: m.get(k) || 0 }))
  }, [mtrs])

  const calendarioCounts = useMemo(() => {
    const map = new Map<string, number>()
    const ym = `${calMonth.y}-${pad(calMonth.m + 1)}`
    for (const c of coletas) {
      const r = parseDataRef(c)
      if (!r || r.slice(0, 7) !== ym) continue
      map.set(r, (map.get(r) || 0) + 1)
    }
    return map
  }, [coletas, calMonth])

  const maxCountCalendario = useMemo(() => {
    let m = 0
    for (const v of calendarioCounts.values()) {
      if (v > m) m = v
    }
    return Math.max(1, m)
  }, [calendarioCounts])

  const distribuicaoPorEtapa = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of coletasFiltradas) {
      const et = normalizarEtapaColeta({ fluxo_status: c.fluxo_status, etapa_operacional: c.etapa_operacional })
      const label = formatarFaseFluxoOficialParaUI(et, { statusPagamento: c.status_pagamento })
      m.set(label, (m.get(label) || 0) + 1)
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([nome, qtd]) => ({ nome, qtd }))
  }, [coletasFiltradas])

  const semMtrNoPeriodo = useMemo(
    () => coletasFiltradas.filter((c) => !c.mtr_id).length,
    [coletasFiltradas]
  )

  const donutDistribuicaoEtapa = useMemo(() => {
    const raw = [...distribuicaoPorEtapa]
    if (raw.length === 0) return [] as { name: string; value: number }[]
    const top = raw.slice(0, 8)
    const rest = raw.slice(8)
    const out = top.map((r) => ({
      name: r.nome.length > 24 ? `${r.nome.slice(0, 22)}…` : r.nome,
      value: r.qtd,
    }))
    if (rest.length > 0) {
      const sum = rest.reduce((a, b) => a + b.qtd, 0)
      if (sum > 0) out.push({ name: 'Outros', value: sum })
    }
    return out
  }, [distribuicaoPorEtapa])

  const seriePorDiaMesCalendario = useMemo(() => {
    const diasNoMes = new Date(calMonth.y, calMonth.m + 1, 0).getDate()
    const out: { label: string; coletas: number; dataIso: string }[] = []
    for (let d = 1; d <= diasNoMes; d++) {
      const dataIso = `${calMonth.y}-${pad(calMonth.m + 1)}-${pad(d)}`
      out.push({
        dataIso,
        label: String(d),
        coletas: calendarioCounts.get(dataIso) || 0,
      })
    }
    return out
  }, [calMonth, calendarioCounts])

  const diasNoModal = useMemo(() => {
    if (!diaModal) return []
    return coletas.filter((c) => parseDataRef(c) === diaModal)
  }, [coletas, diaModal])

  const opcoesClientes = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of coletas) {
      if (c.cliente_id) m.set(c.cliente_id, c.cliente || c.cliente_id)
      else if (c.cliente) m.set(c.cliente, c.cliente)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [coletas])

  const opcoesTipoResiduo = useMemo(() => {
    const s = new Set<string>()
    for (const c of coletas) {
      const t = (c.tipo_residuo || '').trim()
      if (t) s.add(t)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [coletas])

  const opcoesTipoCaminhao = useMemo(() => {
    const s = new Set<string>()
    for (const v of Object.values(tipoCaminhaoPorProg)) {
      if (v && v !== '—') s.add(v)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [tipoCaminhaoPorProg])

  const ratioFinalizadasPct = useMemo(() => {
    const t = coletasFiltradas.length
    if (t === 0) return 0
    return Math.round((kpis.finalizadas / t) * 100)
  }, [coletasFiltradas.length, kpis.finalizadas])

  const insightStatusLinha = useMemo(
    () =>
      linhaInsightCor(
        kpis.pendentes,
        kpis.vencidosQtd,
        ratioFinalizadasPct,
        coletasFiltradas.length
      ),
    [kpis.pendentes, kpis.vencidosQtd, ratioFinalizadasPct, coletasFiltradas.length]
  )

  const textoInsightPrincipal = useMemo(() => {
    const t = coletasFiltradas.length
    if (t === 0) {
      return 'Sem coletas no período filtrado — alargue o intervalo ou ajuste os filtros.'
    }
    if (kpis.vencidosQtd > 0) {
      return `Atenção financeira: ${kpis.vencidosQtd} cobrança(ões) vencida(s) (${formatBRL(kpis.vencidosValor)} em aberto).`
    }
    if (kpis.pendentes > t * 0.5) {
      return `Fila operacional: ${kpis.pendentes} coletas ainda em etapas anteriores ao faturamento.`
    }
    if (ratioFinalizadasPct >= 55) {
      return `Operação estável: ${ratioFinalizadasPct}% das coletas em fase final no período · ${kpis.pendentes} em andamento.`
    }
    return `${t} coletas no período · ${kpis.finalizadas} em fase final (${ratioFinalizadasPct}%) · ${kpis.pendentes} em andamento.`
  }, [
    coletasFiltradas.length,
    kpis.finalizadas,
    kpis.pendentes,
    kpis.vencidosQtd,
    kpis.vencidosValor,
    ratioFinalizadasPct,
  ])

  const deltaColetasStr = useMemo(
    () => formatDeltaPct(kpis.coletasPeriodo, metricasPeriodoAnterior.coletas),
    [kpis.coletasPeriodo, metricasPeriodoAnterior.coletas]
  )

  const deltaReceitaStr = useMemo(
    () => formatDeltaPct(kpis.receita, metricasPeriodoAnterior.receita),
    [kpis.receita, metricasPeriodoAnterior.receita]
  )

  const deltaTicketStr = useMemo(
    () => formatDeltaPct(kpis.ticketMedio, metricasPeriodoAnterior.ticketMedio),
    [kpis.ticketMedio, metricasPeriodoAnterior.ticketMedio]
  )

  const deltaReceitaV = useMemo(
    () => deltaVariacao(kpis.receita, metricasPeriodoAnterior.receita),
    [kpis.receita, metricasPeriodoAnterior.receita]
  )
  const deltaColetasV = useMemo(
    () => deltaVariacao(kpis.coletasPeriodo, metricasPeriodoAnterior.coletas),
    [kpis.coletasPeriodo, metricasPeriodoAnterior.coletas]
  )
  const deltaTicketV = useMemo(
    () => deltaVariacao(kpis.ticketMedio, metricasPeriodoAnterior.ticketMedio),
    [kpis.ticketMedio, metricasPeriodoAnterior.ticketMedio]
  )

  const insightConcentracaoCliente = useMemo(() => {
    if (concentracaoReceitaTop1 == null || kpis.receita <= 0) return null
    if (concentracaoReceitaTop1 < 28) return null
    return `Concentração: o maior cliente representa cerca de ${concentracaoReceitaTop1}% da receita no período — avalie risco de dependência.`
  }, [concentracaoReceitaTop1, kpis.receita])

  const alertasExecutivos = useMemo(() => {
    const out: { nivel: 'info' | 'warn' | 'crit'; msg: string }[] = []
    if (kpis.vencidosQtd > 0) {
      out.push({
        nivel: 'crit',
        msg: `${kpis.vencidosQtd} vencido(s) · ${formatBRL(kpis.vencidosValor)} em aberto`,
      })
    }
    if (kpis.pendentes > 0) {
      out.push({ nivel: 'info', msg: `${kpis.pendentes} coleta(s) em etapas operacionais (não final)` })
    }
    if (semMtrNoPeriodo > 0) {
      out.push({ nivel: 'warn', msg: `${semMtrNoPeriodo} coleta(s) sem MTR vinculada no período` })
    }
    return out
  }, [kpis.pendentes, kpis.vencidosQtd, kpis.vencidosValor, semMtrNoPeriodo])

  useEffect(() => {
    if (relatorioPrintNonce === 0) return
    const t = window.setTimeout(() => window.print(), 150)
    return () => window.clearTimeout(t)
  }, [relatorioPrintNonce])

  const periodoPresetLabel = useMemo(() => {
    const map: Record<PresetPeriodo, string> = {
      today: 'Hoje',
      '7d': 'Últimos 7 dias',
      '30d': 'Últimos 30 dias',
      month: 'Mês atual',
      year: 'Ano atual',
      custom: 'Intervalo personalizado',
    }
    return map[preset]
  }, [preset])

  const periodoIntervaloLabel = useMemo(
    () =>
      `${rangeIni.toLocaleDateString('pt-BR')} a ${rangeFim.toLocaleDateString('pt-BR')}${
        preset === 'custom' ? ` (${customFrom} → ${customTo})` : ''
      }`,
    [rangeIni, rangeFim, preset, customFrom, customTo]
  )

  const nomeClienteFiltro = useMemo(() => {
    if (!filtroClienteId) return ''
    const hit = opcoesClientes.find(([id]) => id === filtroClienteId)
    return hit ? hit[1] : filtroClienteId
  }, [filtroClienteId, opcoesClientes])

  const filtrosRelatorioLinhas = useMemo(() => {
    const lines: string[] = []
    if (filtroClienteId) lines.push(`Cliente: ${nomeClienteFiltro || filtroClienteId}`)
    if (filtroEtapa) lines.push(`Etapa: ${formatarEtapaParaUI(filtroEtapa as EtapaFluxo)}`)
    if (filtroTipoResiduo) lines.push(`Tipo de resíduo / serviço: ${filtroTipoResiduo}`)
    if (filtroTipoCaminhao) lines.push(`Tipo de caminhão: ${filtroTipoCaminhao}`)
    return lines
  }, [filtroClienteId, filtroEtapa, filtroTipoResiduo, filtroTipoCaminhao, nomeClienteFiltro])

  const volumePesoStr = useMemo(
    () =>
      kpis.pesoTotal >= 1000
        ? `${(kpis.pesoTotal / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t`
        : `${kpis.pesoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`,
    [kpis.pesoTotal]
  )

  const relatorioGerencialProps = useMemo((): ExecutivePrintReportProps => {
    return {
      geradoEmLabel: relatorioEmissaoLabel,
      periodoPresetLabel,
      periodoIntervaloLabel,
      filtrosLinhas: filtrosRelatorioLinhas,
      resumoExecutivo: textoInsightPrincipal,
      concentracao: insightConcentracaoCliente,
      alertas: alertasExecutivos.map((a) => ({ msg: a.msg })),
      kpis: {
        receita: formatBRL(kpis.receita),
        coletasPeriodo: kpis.coletasPeriodo,
        ticketMedio: formatBRL(kpis.ticketMedio),
        vencidosValor: formatBRL(kpis.vencidosValor),
        vencidosQtd: kpis.vencidosQtd,
        deltaReceita: deltaReceitaStr,
        deltaColetas: deltaColetasStr,
        deltaTicket: deltaTicketStr,
        coletasHoje: kpis.coletasHoje,
        coletasMes: kpis.coletasMes,
        coletasAno: kpis.coletasAno,
        mtrsEmitidas: kpis.mtrsEmitidas,
        clientesAtivos: kpis.clientesAtivosLista,
        clientesCadastro: kpis.totalClientesCadastro,
        finalizadas: kpis.finalizadas,
        pendentes: kpis.pendentes,
        volumePeso: volumePesoStr,
      },
      topReceita: topClientesReceita.map((t) => ({ nome: t.nome, valor: formatBRL(t.valor) })),
      topFrequencia: topClientes,
      topVolume: topClientesPeso.map((t) => ({
        nome: t.nome,
        kg: `${Number(t.kg).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`,
      })),
      distribuicaoEtapa: distribuicaoPorEtapa,
      gargalos: {
        pendentes: kpis.pendentes,
        semMtr: semMtrNoPeriodo,
        vencidosValor: formatBRL(kpis.vencidosValor),
        vencidosQtd: kpis.vencidosQtd,
        taxaFinalPct: ratioFinalizadasPct,
      },
    }
  }, [
    relatorioEmissaoLabel,
    periodoPresetLabel,
    periodoIntervaloLabel,
    filtrosRelatorioLinhas,
    textoInsightPrincipal,
    insightConcentracaoCliente,
    alertasExecutivos,
    kpis,
    deltaReceitaStr,
    deltaColetasStr,
    deltaTicketStr,
    topClientesReceita,
    topClientes,
    topClientesPeso,
    distribuicaoPorEtapa,
    semMtrNoPeriodo,
    ratioFinalizadasPct,
    volumePesoStr,
  ])

  const imprimirRelatorioGerencial = useCallback(() => {
    setRelatorioEmissaoLabel(
      new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    )
    setRelatorioPrintNonce((n) => n + 1)
  }, [])

  const primeiroDiaMes = new Date(calMonth.y, calMonth.m, 1)
  const ultimoDiaMes = new Date(calMonth.y, calMonth.m + 1, 0)
  const startWeekday = (primeiroDiaMes.getDay() + 6) % 7
  const diasNoMes = ultimoDiaMes.getDate()
  const cells: { dia: number | null; iso: string | null; count: number }[] = []
  for (let i = 0; i < startWeekday; i++) cells.push({ dia: null, iso: null, count: 0 })
  for (let d = 1; d <= diasNoMes; d++) {
    const iso = `${calMonth.y}-${pad(calMonth.m + 1)}-${pad(d)}`
    cells.push({ dia: d, iso, count: calendarioCounts.get(iso) || 0 })
  }

  return (
    <MainLayout>
      {createPortal(<ExecutivePrintReportRoot {...relatorioGerencialProps} />, document.body)}
      <ExecutiveLinhaTempoModal
        open={linhaTempoAberta}
        onClose={() => setLinhaTempoAberta(false)}
        coletas={coletasLinhaTempo}
        periodoLabel={periodoIntervaloLabel}
      />
      <div className="page-shell exec-dash exec-dash-premium">
        <header style={execHeroOuter} className="exec-hero-premium exec-hero-board">
          <div style={execHeroInner}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={execEyebrow}>
                <span style={execEyebrowMark} aria-hidden />
                RG Ambiental · Painel executivo
              </p>
              <h1 style={execH1}>Relatório Gerencial</h1>
              <p style={execLead}>
                Síntese financeira e operacional do período filtrado — leitura estratégica para decisão.
              </p>
              <p
                className="exec-hero-board__insight"
                style={{
                  ...execMoment,
                  ...(insightStatusLinha === 'crit'
                    ? execMomentCrit
                    : insightStatusLinha === 'warn'
                      ? execMomentWarn
                      : {}),
                }}
              >
                {textoInsightPrincipal}
              </p>
              {insightConcentracaoCliente ? (
                <p className="exec-hero-board__insight-secondary">{insightConcentracaoCliente}</p>
              ) : null}
            </div>
            <div style={execHeaderMeta}>
              <div className="exec-hero-datebox" style={execDateBox}>
                <span style={execDateEyebrow}>Hoje</span>
                <span style={execDateMain}>
                  {new Date().toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="exec-hero-actions__btns">
                <button
                  type="button"
                  className="exec-timeline-open-btn"
                  onClick={() => setLinhaTempoAberta(true)}
                  title="Ver em que etapa do fluxo está cada coleta do período filtrado"
                >
                  <svg
                    className="exec-timeline-open-btn__icon"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      fill="currentColor"
                      d="M5 5h2v3H5V5zm4 0h10v3H9V5zM5 11h2v3H5v-3zm4 0h10v3H9v-3zm-4 6h2v3H5v-3zm4 0h10v3H9v-3z"
                      opacity="0.35"
                    />
                    <circle cx="6" cy="6.5" r="2.25" fill="currentColor" />
                    <circle cx="6" cy="12.5" r="2.25" fill="currentColor" opacity="0.55" />
                    <circle cx="6" cy="18.5" r="2.25" fill="currentColor" opacity="0.35" />
                  </svg>
                  Linha do tempo
                </button>
                <button
                  type="button"
                  className="rg-btn rg-btn--report"
                  onClick={imprimirRelatorioGerencial}
                  title="Gera o relatório com o período e filtros atuais e abre a impressão"
                >
                  <RgReportPdfIcon className="rg-btn__icon" />
                  Imprimir relatório
                </button>
                <button type="button" className="exec-refresh-premium" style={execRefreshBtn} onClick={() => void carregar()} disabled={loading}>
                  {loading ? 'A sincronizar…' : 'Atualizar painel'}
                </button>
              </div>
            </div>
          </div>
        </header>

        {erro ? <div style={execErro}>{erro}</div> : null}

        <section style={execFiltersBar} aria-label="Filtros do painel">
          <span style={filterLabel}>Período</span>
          {(
            [
              ['today', 'Hoje'],
              ['7d', '7 dias'],
              ['30d', '30 dias'],
              ['month', 'Mês atual'],
              ['year', 'Ano atual'],
              ['custom', 'Personalizado'],
            ] as const
          ).map(([k, lab]) => (
            <button
              key={k}
              type="button"
              className={preset === k ? undefined : 'exec-chip-quiet'}
              style={preset === k ? execChipActive : execChip}
              onClick={() => setPreset(k)}
            >
              {lab}
            </button>
          ))}
          {preset === 'custom' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={execInput}
              />
              <span style={{ color: '#94a3b8' }}>a</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={execInput} />
            </span>
          ) : null}

          <span style={{ ...filterLabel, marginLeft: 12 }}>Refinar</span>
          <select
            value={filtroClienteId}
            onChange={(e) => setFiltroClienteId(e.target.value)}
            style={execSelect}
            aria-label="Cliente"
          >
            <option value="">Todos os clientes</option>
            {opcoesClientes.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          <select
            value={filtroEtapa}
            onChange={(e) => setFiltroEtapa(e.target.value)}
            style={execSelect}
            aria-label="Etapa"
          >
            <option value="">Todas as etapas</option>
            {['PROGRAMACAO_CRIADA', 'MTR_PREENCHIDA', 'CONTROLE_PESAGEM_LANCADO', 'TICKET_GERADO', 'ENVIADO_APROVACAO', 'FATURADO', 'FINALIZADO'].map(
              (e) => (
                <option key={e} value={e}>
                  {formatarEtapaParaUI(e as EtapaFluxo)}
                </option>
              )
            )}
          </select>
          <select
            value={filtroTipoResiduo}
            onChange={(e) => setFiltroTipoResiduo(e.target.value)}
            style={execSelect}
          >
            <option value="">Tipo de serviço / resíduo</option>
            {opcoesTipoResiduo.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={filtroTipoCaminhao}
            onChange={(e) => setFiltroTipoCaminhao(e.target.value)}
            style={execSelect}
          >
            <option value="">Tipo de caminhão</option>
            {opcoesTipoCaminhao.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </section>

        {alertasExecutivos.length > 0 ? (
          <div
            className="exec-alert-strip"
            style={execAlertStrip}
            role="status"
            aria-label="Alertas executivos"
          >
            {alertasExecutivos.map((a, i) => (
              <span
                key={i}
                style={
                  a.nivel === 'crit'
                    ? execAlertPillCrit
                    : a.nivel === 'warn'
                      ? execAlertPillWarn
                      : execAlertPillInfo
                }
              >
                {a.msg}
              </span>
            ))}
          </div>
        ) : null}

        <section className="exec-section" aria-labelledby="exec-h-sec-kpi">
          <div style={execSectionIntroFirst}>
            <span id="exec-h-sec-kpi" style={execRegionLabel}>
              Indicadores principais
            </span>
            <p style={execSectionSubtitle}>
              Métricas de negócio no período filtrado · variação vs. período anterior de mesma duração (receita,
              coletas e ticket).
            </p>
          </div>

          <div className="exec-grid-12 exec-grid-12--kpi-a">
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--hero exec-kpi-card--tier-a exec-col"
              style={{ ...execKpi, ...execKpiHeroShell, gridColumn: 'span 3' }}
              onClick={() => navigate('/financeiro')}
            >
              <span style={execKpiLab}>Receita total</span>
              <span style={{ ...execKpiVal, fontSize: 30 }}>{formatBRL(kpis.receita)}</span>
              <span className={`exec-kpi-delta-text exec-kpi-delta-text--${deltaReceitaV}`}>
                {deltaReceitaStr} <span className="exec-kpi-delta-vs">vs. período anterior</span>
              </span>
              <span style={execKpiHint}>Base cobrança · Financeiro</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--hero exec-kpi-card--tier-a exec-col"
              style={{ ...execKpi, ...execKpiHeroShell, gridColumn: 'span 3' }}
              onClick={() => navigate('/controle-massa')}
            >
              <span style={execKpiLab}>Coletas no período</span>
              <span style={{ ...execKpiVal, fontSize: 30 }}>{kpis.coletasPeriodo}</span>
              <span className={`exec-kpi-delta-text exec-kpi-delta-text--${deltaColetasV}`}>
                {deltaColetasStr} <span className="exec-kpi-delta-vs">vs. período anterior</span>
              </span>
              <span style={execKpiHint}>Volume operacional no filtro</span>
            </button>
            <div
              className="exec-kpi-card exec-kpi-card--hero exec-kpi-card--tier-a exec-col"
              style={{ ...execKpi, ...execKpiHeroShell, gridColumn: 'span 3' }}
            >
              <span style={execKpiLab}>Ticket médio</span>
              <span style={{ ...execKpiVal, fontSize: 28 }}>{formatBRL(kpis.ticketMedio)}</span>
              <span className={`exec-kpi-delta-text exec-kpi-delta-text--${deltaTicketV}`}>
                {deltaTicketStr} <span className="exec-kpi-delta-vs">vs. período anterior</span>
              </span>
              <span style={execKpiHint}>Sobre coletas com valor no período</span>
            </div>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--hero exec-kpi-card--tier-a exec-kpi-card--alert exec-col"
              style={{
                ...execKpi,
                ...execKpiHeroShell,
                gridColumn: 'span 3',
              }}
              onClick={() => navigate('/financeiro?vencidos=1')}
              title="Financeiro — filtro «Só vencidos»"
            >
              <span style={{ ...execKpiLab, color: '#991b1b' }}>Valores em aberto vencidos</span>
              <span style={{ ...execKpiVal, fontSize: 28, color: '#b91c1c' }}>{formatBRL(kpis.vencidosValor)}</span>
              <span style={{ ...execKpiHint, color: '#7f1d1d' }}>
                {kpis.vencidosQtd} cobrança(ões) · requer ação
              </span>
            </button>
          </div>

          <div style={execSectionIntroKpiSecondary}>
            <span style={execRegionLabel}>Cadência, base e volume</span>
            <p style={execSectionSubtitleMuted}>Indicadores complementares e leitura operacional rápida.</p>
          </div>

          <div className="exec-grid-12 exec-grid-12--subkpi">
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/controle-massa')}
            >
              <span style={execKpiLab}>Coletas hoje</span>
              <span style={execKpiValSm}>{kpis.coletasHoje}</span>
              <span style={execKpiHintSm}>Referência do dia</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/controle-massa')}
            >
              <span style={execKpiLab}>Coletas no mês</span>
              <span style={execKpiValSm}>{kpis.coletasMes}</span>
              <span style={execKpiHintSm}>Mês civil</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/controle-massa')}
            >
              <span style={execKpiLab}>Coletas no ano</span>
              <span style={execKpiValSm}>{kpis.coletasAno}</span>
              <span style={execKpiHintSm}>Ano civil</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/mtr')}
            >
              <span style={execKpiLab}>MTRs emitidas</span>
              <span style={execKpiValSm}>{kpis.mtrsEmitidas}</span>
              <span style={execKpiHintSm}>Período · não canceladas</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/clientes')}
            >
              <span style={execKpiLab}>Clientes ativos</span>
              <span style={execKpiValSm}>{kpis.clientesAtivosLista}</span>
              <span style={execKpiHintSm}>Com coleta no período</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/clientes')}
            >
              <span style={execKpiLab}>Clientes (cadastro)</span>
              <span style={execKpiValSm}>{kpis.totalClientesCadastro}</span>
              <span style={execKpiHintSm}>Base total</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/controle-massa')}
            >
              <span style={execKpiLab}>Coletas finalizadas</span>
              <span style={execKpiValSm}>{kpis.finalizadas}</span>
              <span style={execKpiHintSm}>Fase final no período</span>
            </button>
            <button
              type="button"
              className="exec-kpi-card exec-kpi-card--clickable exec-kpi-card--compact exec-col"
              style={{ ...execKpiCompact, gridColumn: 'span 4' }}
              onClick={() => navigate('/controle-massa')}
            >
              <span style={execKpiLab}>Coletas pendentes</span>
              <span style={execKpiValSm}>{kpis.pendentes}</span>
              <span style={execKpiHintSm}>Ainda em etapas operacionais</span>
            </button>
            <div className="exec-kpi-card exec-kpi-card--compact exec-col" style={{ ...execKpiCompact, gridColumn: 'span 4' }}>
              <span style={execKpiLab}>Volume coletado</span>
              <span style={execKpiValSm}>
                {kpis.pesoTotal >= 1000
                  ? `${(kpis.pesoTotal / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t`
                  : `${kpis.pesoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`}
              </span>
              <span style={execKpiHintSm}>Peso líquido no período</span>
            </div>
          </div>
        </section>

        <section className="exec-section" aria-labelledby="exec-h-sec-trend">
          <div style={execSectionIntro}>
            <span id="exec-h-sec-trend" style={execRegionLabel}>
              Tendências e evolução
            </span>
            <p style={execSectionSubtitle}>
              Evolução operacional no período filtrado · receita mensal e documentação MTR para cruzar tendência
              financeira e compliance.
            </p>
          </div>

          <div className="exec-grid-12 exec-grid-12--charts">
            <div className="exec-viz-surface exec-viz-surface--chart exec-col exec-viz-fill" style={{ ...execViz, gridColumn: 'span 8' }}>
            <div style={execVizHead}>
              <span style={execVizTitle}>Evolução diária de coletas</span>
              <span style={execVizSub}>Volume por dia · ritmo operacional</span>
            </div>
            <div style={{ height: CHART_AREA_H_LG, width: '100%' }}>
              {seriePorDia.length === 0 ? (
                <div style={{ ...execEmpty, height: CHART_AREA_H_LG, minHeight: CHART_AREA_H_LG }}>Sem dados no intervalo.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriePorDia} margin={{ top: 10, right: 10, left: -12, bottom: 4 }}>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_TICK }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_TICK }} width={36} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}`, 'Coletas']} />
                    <Line
                      type="monotone"
                      dataKey="coletas"
                      stroke={CHART_LINE_PRIMARY}
                      strokeWidth={2.25}
                      dot={false}
                      activeDot={{ r: 4, fill: CHART_LINE_SECONDARY }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="exec-col exec-trend-stack" style={{ gridColumn: 'span 4' }}>
            <div className="exec-viz-surface exec-viz-surface--chart exec-viz-fill" style={{ ...execViz, flex: 1, minHeight: 0 }}>
            <div style={execVizHeadCompact}>
              <span style={execVizTitle}>Receita por mês</span>
              <span style={execVizSub}>Últimos 12 meses · cobrança (Financeiro)</span>
            </div>
            <div style={{ height: CHART_AREA_H_SM, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={receitaPorMes} margin={{ left: -8, right: 10, top: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: CHART_TICK }} angle={-22} textAnchor="end" height={44} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_TICK }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} width={36} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatBRL(Number(v)), '']} />
                  <Bar dataKey="valor" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

            <div className="exec-viz-surface exec-viz-surface--chart exec-viz-fill" style={{ ...execViz, flex: 1, minHeight: 0 }}>
              <div style={execVizHeadCompact}>
                <span style={execVizTitle}>MTRs por mês</span>
                <span style={execVizSub}>Volume de documentação · séries recentes</span>
              </div>
              <div style={{ height: CHART_AREA_H_SM, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mtrsPorMes} margin={{ left: -8, right: 10, top: 10, bottom: 4 }}>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_TICK }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART_TICK }} width={30} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="qtd"
                      stroke={CHART_LINE_SECONDARY}
                      strokeWidth={2.25}
                      dot={{ r: 3, fill: CHART_COLORS[4], strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
        </section>

        <section className="exec-section" aria-labelledby="exec-h-sec-clients">
        <div style={execSectionIntro}>
          <span id="exec-h-sec-clients" style={execRegionLabel}>Clientes e concentração</span>
          <p style={execSectionSubtitle}>
            Ranking dos clientes com maior impacto operacional e financeiro no período
            {concentracaoReceitaTop1 != null && kpis.receita > 0
              ? ` · maior cliente ≈ ${concentracaoReceitaTop1}% da receita`
              : ''}
            .
          </p>
        </div>

        <div className="exec-grid-12 exec-grid-12--charts exec-grid-12--clients">
          <div className="exec-viz-surface exec-viz-surface--chart exec-col" style={{ ...execViz, gridColumn: 'span 4' }}>
            <div style={execVizHead}>
              <span style={execVizTitle}>Top clientes por volume</span>
              <span style={execVizSub}>Peso líquido no período (kg)</span>
            </div>
            <div className="exec-chart-slot" style={{ height: CHART_AREA_H, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientesPeso} layout="vertical" margin={{ left: 4, right: 10, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: CHART_TICK }} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={108}
                    tick={{ fontSize: 10, fill: CHART_TICK }}
                    tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 12)}…` : v)}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toLocaleString('pt-BR')} kg`, '']} />
                  <Bar dataKey="kg" fill={CHART_COLORS[2]} radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="exec-viz-surface exec-viz-surface--chart exec-col" style={{ ...execViz, gridColumn: 'span 4' }}>
            <div style={execVizHead}>
              <span style={execVizTitle}>Top clientes por receita</span>
              <span style={execVizSub}>Soma de valores (cobrança)</span>
            </div>
            <div className="exec-chart-slot" style={{ height: CHART_AREA_H, width: '100%' }}>
              {topClientesReceita.length === 0 ? (
                <div style={execEmpty}>Sem receita no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topClientesReceita}
                    layout="vertical"
                    margin={{ left: 4, right: 10, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: CHART_TICK }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={108}
                      tick={{ fontSize: 10, fill: CHART_TICK }}
                      tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 12)}…` : v)}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatBRL(Number(v)), '']} />
                    <Bar dataKey="valor" fill={CHART_COLORS[1]} radius={[0, 6, 6, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="exec-viz-surface exec-viz-surface--chart exec-col" style={{ ...execViz, gridColumn: 'span 4' }}>
            <div style={execVizHead}>
              <span style={execVizTitle}>Top clientes por frequência</span>
              <span style={execVizSub}>Número de coletas no período</span>
            </div>
            <div className="exec-chart-slot" style={{ height: CHART_AREA_H, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientes} layout="vertical" margin={{ left: 4, right: 10, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: CHART_TICK }} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={108}
                    tick={{ fontSize: 10, fill: CHART_TICK }}
                    tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 12)}…` : v)}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="qtd" fill={CHART_COLORS[0]} radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        </section>

        <section className="exec-section" aria-labelledby="exec-h-sec-op">
          <div style={execSectionIntro}>
            <span id="exec-h-sec-op" style={execRegionLabel}>Operação e gargalos</span>
            <p style={execSectionSubtitle}>
              Onde está o fluxo no período e o que exige decisão: pendências, documentação e risco financeiro.
            </p>
          </div>

          <div className="exec-grid-12 exec-grid-12--charts">
            <div className="exec-viz-surface exec-viz-surface--chart exec-col" style={{ ...execViz, gridColumn: 'span 6' }}>
              <div style={execVizHead}>
                <span style={execVizTitle}>Distribuição por etapa</span>
                <span style={execVizSub}>Proporção de coletas por status do fluxo no período filtrado</span>
              </div>
              <div className="exec-chart-slot exec-chart-slot--donut" style={{ height: CHART_AREA_H, width: '100%' }}>
                {donutDistribuicaoEtapa.length === 0 ? (
                  <div style={execEmpty}>Sem dados no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <Pie
                        data={donutDistribuicaoEtapa}
                        dataKey="value"
                        nameKey="name"
                        cx="42%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={2}
                        strokeWidth={2}
                        stroke="rgba(255,255,255,0.98)"
                      >
                        {donutDistribuicaoEtapa.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend
                        verticalAlign="middle"
                        align="right"
                        layout="vertical"
                        wrapperStyle={{ fontSize: 11, color: '#475569', maxHeight: 220, overflowY: 'auto', paddingLeft: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="exec-viz-surface exec-gargalos exec-col" style={{ ...execViz, gridColumn: 'span 6' }}>
              <div style={execVizHead}>
                <span style={execVizTitle}>Gargalos e alertas</span>
                <span style={execVizSub}>Indicadores que costumam acionar a diretoria no período</span>
              </div>
              <div className="exec-gargalos__list">
                <button
                  type="button"
                  className="exec-gargalo-row exec-gargalo-row--click"
                  onClick={() => navigate('/controle-massa')}
                >
                  <div>
                    <span className="exec-gargalo-row__title">Coletas pendentes</span>
                    <span className="exec-gargalo-row__sub">Fora da fase final · fila operacional</span>
                  </div>
                  <span className="exec-gargalo-row__value">{kpis.pendentes}</span>
                </button>
                <button
                  type="button"
                  className={`exec-gargalo-row exec-gargalo-row--click ${semMtrNoPeriodo > 0 ? 'exec-gargalo-row--warn' : ''}`}
                  onClick={() => navigate('/mtr')}
                >
                  <div>
                    <span className="exec-gargalo-row__title">Coletas sem MTR</span>
                    <span className="exec-gargalo-row__sub">No período filtrado · documentação pendente</span>
                  </div>
                  <span className="exec-gargalo-row__value">{semMtrNoPeriodo}</span>
                </button>
                <button
                  type="button"
                  className={`exec-gargalo-row exec-gargalo-row--click ${kpis.vencidosQtd > 0 ? 'exec-gargalo-row--crit' : ''}`}
                  onClick={() => navigate('/financeiro?vencidos=1')}
                >
                  <div>
                    <span className="exec-gargalo-row__title">Valores vencidos</span>
                    <span className="exec-gargalo-row__sub">Cobranças em atraso no período</span>
                  </div>
                  <div className="exec-gargalo-row__value-block">
                    <span className="exec-gargalo-row__value exec-gargalo-row__value--money">{formatBRL(kpis.vencidosValor)}</span>
                    <span className="exec-gargalo-row__badge">{kpis.vencidosQtd} título(s)</span>
                  </div>
                </button>
                <div className="exec-gargalo-row exec-gargalo-row--static">
                  <div>
                    <span className="exec-gargalo-row__title">Taxa em fase final</span>
                    <span className="exec-gargalo-row__sub">Coletas concluídas no fluxo vs. total no período</span>
                  </div>
                  <span className="exec-gargalo-row__value">{ratioFinalizadasPct}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="exec-section" aria-labelledby="exec-h-sec-cal">
        <div style={execSectionIntroCalendar}>
          <span id="exec-h-sec-cal" style={execRegionLabel}>Calendário operacional</span>
          <p style={execSectionSubtitle}>
            Distribuição da carga por dia no mês · intensidade do verde = maior volume relativo no mês.
          </p>
        </div>

        <div className="exec-grid-12 exec-grid-12--calendar">
          <div className="exec-viz-surface exec-calendar-panel exec-viz-surface--chart exec-col" style={{ ...execCalWrap, gridColumn: 'span 7' }}>
            <div style={execVizHead}>
              <span style={execVizTitle}>Agenda de coletas</span>
              <span style={execVizSub}>Data de referência (agendamento) · clique no dia para detalhes</span>
            </div>
            <div style={execCalNav}>
              <button
                type="button"
                className="exec-cal-arrow"
                style={execCalArrow}
                onClick={() =>
                  setCalMonth((prev) =>
                    prev.m === 0 ? { y: prev.y - 1, m: 11 } : { y: prev.y, m: prev.m - 1 }
                  )
                }
              >
                ‹
              </button>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                {new Date(calMonth.y, calMonth.m).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                className="exec-cal-arrow"
                style={execCalArrow}
                onClick={() =>
                  setCalMonth((prev) =>
                    prev.m === 11 ? { y: prev.y + 1, m: 0 } : { y: prev.y, m: prev.m + 1 }
                  )
                }
              >
                ›
              </button>
            </div>
            <div style={execCalWeekdays}>
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                <span key={d} style={execCalWd}>
                  {d}
                </span>
              ))}
            </div>
            <div style={execCalGrid}>
              {cells.map((cell, idx) =>
                cell.dia == null ? (
                  <div key={`e-${idx}`} style={execCalCellEmpty} />
                ) : (
                  <button
                    key={cell.iso!}
                    type="button"
                    className={[
                      'exec-cal-day',
                      cell.count > 0 ? 'exec-cal-day--has-coleta' : '',
                      cell.count > 0 && maxCountCalendario > 0 && cell.count / maxCountCalendario >= 0.66
                        ? 'exec-cal-day--heat-high'
                        : '',
                      cell.iso === hojeIso ? 'exec-cal-day--today' : '',
                      diaModal === cell.iso ? 'exec-cal-day--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      ...execCalCell,
                      ...(cell.count > 0 ? execCalCellOn : {}),
                    }}
                    onClick={() => cell.iso && setDiaModal(cell.iso)}
                  >
                    <span style={execCalDiaN}>{cell.dia}</span>
                    {cell.count > 0 ? <span style={execCalBadge}>{cell.count}</span> : null}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="exec-viz-surface exec-viz-surface--chart exec-col exec-viz-calendar-side" style={{ ...execViz, gridColumn: 'span 5' }}>
            <div style={execVizHead}>
              <span style={execVizTitle}>Carga por dia no mês</span>
              <span style={execVizSub}>Mesmo mês do calendário · coletas por data de referência</span>
            </div>
            <div className="exec-chart-slot exec-chart-slot--calendar" style={{ height: 340, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seriePorDiaMesCalendario} margin={{ left: -6, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_TICK }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART_TICK }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}`, 'Coletas']} />
                  <Bar dataKey="coletas" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        </section>

        {diaModal ? (
          <div style={execModalOverlay} role="dialog" aria-modal="true" aria-labelledby="exec-day-title">
            <div style={execModal}>
              <div style={execModalHead}>
                <h2 id="exec-day-title" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {new Date(`${diaModal}T12:00:00`).toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h2>
                <button type="button" style={execModalClose} onClick={() => setDiaModal(null)} aria-label="Fechar">
                  ×
                </button>
              </div>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
                {diasNoModal.length} coleta(s) · Clique para abrir no fluxo.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'min(52vh, 420px)', overflowY: 'auto' }}>
                {diasNoModal.map((c) => {
                  const et = normalizarEtapaColeta({ fluxo_status: c.fluxo_status, etapa_operacional: c.etapa_operacional })
                  const params = new URLSearchParams()
                  params.set('coleta', c.id)
                  if (c.mtr_id) params.set('mtr', c.mtr_id)
                  if (c.programacao_id) params.set('programacao', c.programacao_id)
                  if (c.cliente_id) params.set('cliente', c.cliente_id)
                  const q = params.toString()
                  return (
                    <div
                      key={c.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '12px 14px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#fafbfc',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>Coleta {c.numero}</div>
                        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{c.cliente}</div>
                        <div style={{ marginTop: 8 }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: '#e0e7ff',
                              color: '#3730a3',
                            }}
                          >
                            {formatarFaseFluxoOficialParaUI(et, { statusPagamento: c.status_pagamento })}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          style={execModalLink}
                          onClick={() => {
                            navigate(`/controle-massa?${q}`)
                            setDiaModal(null)
                          }}
                        >
                          Controle de Massa
                        </button>
                        <button
                          type="button"
                          style={execModalLink}
                          onClick={() => {
                            navigate(`/financeiro?${q}`)
                            setDiaModal(null)
                          }}
                        >
                          Financeiro
                        </button>
                        <button
                          type="button"
                          style={execModalLink}
                          onClick={() => {
                            navigate(`/mtr?${q}`)
                            setDiaModal(null)
                          }}
                        >
                          MTR
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </MainLayout>
  )
}

const execSectionIntroFirst: CSSProperties = {
  marginTop: 8,
  marginBottom: 22,
}

const execSectionIntro: CSSProperties = {
  marginTop: 44,
  marginBottom: 22,
}

const execSectionIntroCalendar: CSSProperties = {
  marginTop: 28,
  marginBottom: 18,
}

const execSectionIntroKpiSecondary: CSSProperties = {
  marginTop: 28,
  marginBottom: 14,
}

const execSectionSubtitleMuted: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 12,
  color: '#94a3b8',
  lineHeight: 1.5,
  fontWeight: 500,
  maxWidth: 640,
}

const execVizHeadCompact: CSSProperties = {
  marginBottom: 12,
  borderBottom: '1px solid #eef2f7',
  paddingBottom: 10,
}

const execRegionLabel: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#64748b',
}

const execHeroOuter: CSSProperties = {
  marginBottom: 36,
  padding: '36px 36px 40px',
  borderRadius: 20,
  background:
    'linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 45%, rgba(240,253,250,0.35) 100%)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  boxShadow:
    '0 1px 2px rgba(15, 23, 42, 0.04), 0 20px 50px -12px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
  position: 'relative',
  overflow: 'hidden',
}

const execHeroInner: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 32,
  position: 'relative',
  zIndex: 1,
}

const execEyebrowMark: CSSProperties = {
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: 999,
  background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
  marginRight: 10,
  verticalAlign: 'middle',
  boxShadow: '0 0 0 3px rgba(13, 148, 136, 0.2)',
}

const execEyebrow: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#475569',
  display: 'flex',
  alignItems: 'center',
}

const execH1: CSSProperties = {
  margin: '14px 0 10px',
  fontSize: 'clamp(1.85rem, 3.2vw, 2.35rem)',
  fontWeight: 800,
  color: '#0c1222',
  letterSpacing: '-0.038em',
  lineHeight: 1.08,
}

const execLead: CSSProperties = {
  margin: 0,
  maxWidth: 640,
  fontSize: 15,
  color: '#475569',
  lineHeight: 1.65,
  fontWeight: 400,
}

const execMoment: CSSProperties = {
  margin: '18px 0 0',
  fontSize: 13,
  color: '#0f766e',
  fontWeight: 600,
  lineHeight: 1.55,
  padding: '12px 16px',
  background: 'linear-gradient(90deg, rgba(240,253,250,0.9) 0%, rgba(255,255,255,0) 100%)',
  borderLeft: '3px solid #0d9488',
  borderRadius: '0 10px 10px 0',
}

const execMomentWarn: CSSProperties = {
  color: '#92400e',
  background: 'linear-gradient(90deg, rgba(255, 251, 235, 0.95) 0%, rgba(255, 255, 255, 0) 100%)',
  borderLeft: '3px solid #f59e0b',
}

const execMomentCrit: CSSProperties = {
  color: '#991b1b',
  background: 'linear-gradient(90deg, rgba(254, 242, 242, 0.95) 0%, rgba(255, 255, 255, 0) 100%)',
  borderLeft: '3px solid #dc2626',
}

const execAlertStrip: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginBottom: 28,
  padding: '14px 18px',
  borderRadius: 14,
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'linear-gradient(180deg, #fafbfc 0%, #ffffff 100%)',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const execAlertPillBase: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: '8px 12px',
  borderRadius: 999,
  lineHeight: 1.35,
}

const execAlertPillInfo: CSSProperties = {
  ...execAlertPillBase,
  background: 'rgba(13, 148, 136, 0.1)',
  color: '#0f766e',
  border: '1px solid rgba(13, 148, 136, 0.22)',
}

const execAlertPillWarn: CSSProperties = {
  ...execAlertPillBase,
  background: 'rgba(245, 158, 11, 0.12)',
  color: '#92400e',
  border: '1px solid rgba(245, 158, 11, 0.35)',
}

const execAlertPillCrit: CSSProperties = {
  ...execAlertPillBase,
  background: 'rgba(220, 38, 38, 0.08)',
  color: '#991b1b',
  border: '1px solid rgba(220, 38, 38, 0.28)',
}

const execSectionSubtitle: CSSProperties = {
  margin: '10px 0 0',
  fontSize: 13,
  color: '#64748b',
  lineHeight: 1.55,
  fontWeight: 500,
  maxWidth: 720,
}

const execKpiHeroShell: CSSProperties = {
  minHeight: 152,
  padding: '26px 22px',
}

const execKpiCompact: CSSProperties = {
  textAlign: 'left',
  padding: '18px 16px',
  borderRadius: 14,
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 100%)',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  cursor: 'default',
}

const execKpiValSm: CSSProperties = {
  display: 'block',
  fontSize: 26,
  fontWeight: 800,
  color: '#0c1222',
  letterSpacing: '-0.03em',
  lineHeight: 1.05,
  fontVariantNumeric: 'tabular-nums',
}

const execKpiHintSm: CSSProperties = {
  display: 'block',
  marginTop: 8,
  fontSize: 10,
  color: '#64748b',
  fontWeight: 500,
  lineHeight: 1.4,
}

const execHeaderMeta: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 16,
  flexShrink: 0,
}

const execDateBox: CSSProperties = {
  textAlign: 'right',
  padding: '16px 22px',
  background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 55%, #f0fdfa 100%)',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.2)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 8px 32px rgba(15, 23, 42, 0.06)',
  minWidth: 220,
}

const execDateEyebrow: CSSProperties = {
  display: 'block',
  fontSize: 9,
  color: '#64748b',
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const execDateMain: CSSProperties = {
  display: 'block',
  fontSize: 16,
  fontWeight: 800,
  color: '#0f172a',
  letterSpacing: '-0.02em',
  lineHeight: 1.3,
  textTransform: 'capitalize',
}

const execRefreshBtn: CSSProperties = {
  padding: '12px 24px',
  borderRadius: 12,
  border: '1px solid rgba(13, 148, 136, 0.35)',
  background: 'linear-gradient(180deg, #14b8a6 0%, #0d9488 48%, #0f766e 100%)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(13, 148, 136, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
}

const execErro: CSSProperties = {
  padding: '16px 20px',
  background: 'linear-gradient(180deg, #fef2f2 0%, #fff 100%)',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  borderRadius: 14,
  marginBottom: 20,
  fontWeight: 500,
  fontSize: 14,
}

const execFiltersBar: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 14,
  marginBottom: 36,
  padding: '22px 26px',
  background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.16)',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 40px rgba(15, 23, 42, 0.05)',
}

const filterLabel: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
}

const execChip: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 999,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  cursor: 'pointer',
  transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
}

const execChipActive: CSSProperties = {
  ...execChip,
  background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)',
  borderColor: 'rgba(13, 148, 136, 0.5)',
  color: '#047857',
  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.15), inset 0 1px 0 rgba(255,255,255,0.6)',
}

const execInput: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 11,
  border: '1px solid #e2e8f0',
  fontSize: 13,
  background: '#fff',
  color: '#0f172a',
  boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
}

const execSelect: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 11,
  border: '1px solid #e2e8f0',
  fontSize: 13,
  maxWidth: 210,
  background: '#fff',
  color: '#334155',
  fontWeight: 500,
  boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.03)',
}

const execKpi: CSSProperties = {
  textAlign: 'left',
  padding: '26px 22px',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'linear-gradient(165deg, #ffffff 0%, #f8fafc 55%, #fafafa 100%)',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.06)',
  cursor: 'default',
}

const execKpiLab: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: 12,
}

const execKpiVal: CSSProperties = {
  display: 'block',
  fontSize: 34,
  fontWeight: 800,
  color: '#0c1222',
  letterSpacing: '-0.035em',
  lineHeight: 1.05,
  fontVariantNumeric: 'tabular-nums',
}

const execKpiHint: CSSProperties = {
  display: 'block',
  marginTop: 12,
  fontSize: 11,
  color: '#64748b',
  fontWeight: 500,
  lineHeight: 1.45,
}

const execViz: CSSProperties = {
  background: 'linear-gradient(180deg, #ffffff 0%, #fcfcfd 100%)',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.14)',
  padding: '24px 24px 20px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 40px rgba(15, 23, 42, 0.06)',
  minWidth: 0,
}

const execCalWrap: CSSProperties = {
  ...execViz,
}

const execVizHead: CSSProperties = {
  marginBottom: 18,
  borderBottom: '1px solid #eef2f7',
  paddingBottom: 14,
}

const execVizTitle: CSSProperties = {
  display: 'block',
  fontSize: 15,
  fontWeight: 800,
  color: '#0c1222',
  letterSpacing: '-0.022em',
}

const execVizSub: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#64748b',
  marginTop: 6,
  fontWeight: 500,
}

const execEmpty: CSSProperties = {
  height: CHART_AREA_H,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 500,
  border: '1px dashed #dce3ec',
  borderRadius: 14,
  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
}

const execCalNav: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 16,
}

const execCalArrow: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: 'linear-gradient(180deg, #ffffff, #f8fafc)',
  fontSize: 18,
  cursor: 'pointer',
  fontWeight: 700,
  color: '#475569',
  transition: 'background 0.18s ease, border-color 0.18s ease',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const execCalWeekdays: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 8,
  marginBottom: 10,
}

const execCalWd: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: '#64748b',
  textAlign: 'center',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const execCalGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 8,
}

const execCalCellEmpty: CSSProperties = {
  minHeight: 44,
}

const execCalCell: CSSProperties = {
  position: 'relative',
  minHeight: 48,
  borderRadius: 10,
  border: '1px solid #eef2f7',
  background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: 6,
}

const execCalCellOn: CSSProperties = {
  background: 'linear-gradient(165deg, #ecfdf5 0%, #d1fae5 100%)',
  borderColor: 'rgba(13, 148, 136, 0.4)',
  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.12)',
}

const execCalDiaN: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#0c1222',
  fontVariantNumeric: 'tabular-nums',
}

const execCalBadge: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: '#065f46',
  background: 'rgba(255, 255, 255, 0.92)',
  padding: '4px 8px',
  borderRadius: 999,
  border: '1px solid rgba(13, 148, 136, 0.28)',
  minWidth: 24,
  textAlign: 'center',
  boxShadow: '0 1px 2px rgba(13, 148, 136, 0.08)',
}

const execModalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'rgba(15, 23, 42, 0.5)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const execModal: CSSProperties = {
  width: 'min(560px, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
  borderRadius: 18,
  padding: 28,
  border: '1px solid rgba(148, 163, 184, 0.2)',
  boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22), 0 8px 24px rgba(15, 23, 42, 0.08)',
}

const execModalHead: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 8,
}

const execModalClose: CSSProperties = {
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  width: 38,
  height: 38,
  borderRadius: 12,
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  color: '#475569',
  transition: 'background 0.15s ease',
}

const execModalLink: CSSProperties = {
  padding: '9px 14px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  background: '#fff',
  fontSize: 12,
  fontWeight: 700,
  color: '#0d9488',
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}
