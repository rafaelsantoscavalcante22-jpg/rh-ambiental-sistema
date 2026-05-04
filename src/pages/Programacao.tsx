import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { overlayAreaPrincipal } from '../lib/layoutOverlay'
import { chunkArray } from '../lib/chunkArray'
import { supabase } from '../lib/supabase'
import { cargoPodeEditarProgramacao } from '../lib/workflowPermissions'
import { BRAND_LOGO_MARK } from '../lib/brandLogo'
import { RgReportPdfIcon } from '../components/ui/RgReportPdfIcon'
import { FloatingAlert } from '../components/ui/FloatingAlert'

type ClienteOption = {
  id: string
  nome: string
}

type ProgramacaoStatus =
  | 'PENDENTE'
  | 'QUADRO_ATUALIZADO'
  | 'EM_COLETA'
  | 'CONCLUIDA'
  | 'CANCELADA'

type ProgramacaoRow = {
  id: string
  numero: string | null
  cliente_id: string | null
  cliente: string | null
  data_programada: string | null
  tipo_caminhao: string | null
  tipo_servico: string | null
  observacoes: string | null
  coleta_fixa: boolean | null
  periodicidade: string | null
  status_programacao: ProgramacaoStatus | null
  coleta_id: string | null
  created_at: string | null
}

type ProgramacaoItem = {
  id: string
  numero: string
  clienteId: string
  clienteNome: string
  dataProgramada: string
  tipoCaminhao: string
  tipoServico: string
  observacoes: string
  coletaFixa: boolean
  periodicidade: string
  statusProgramacao: ProgramacaoStatus
  coletaId: string
  mtrId: string
  createdAt: string
}

type FormState = {
  id: string | null
  clienteId: string
  dataProgramada: string
  tipoCaminhao: string
  tipoServico: string
  observacoes: string
  coletaFixa: boolean
  periodicidade: string
}

type CalendarCell = {
  key: string
  date: string | null
  dayNumber: number | null
  items: ProgramacaoItem[]
  isCurrentMonth: boolean
  isToday: boolean
}

const STATUS_LABELS: Record<ProgramacaoStatus, string> = {
  PENDENTE: 'Pendente',
  QUADRO_ATUALIZADO: 'Quadro atualizado',
  EM_COLETA: 'Em coleta',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

const initialFormState: FormState = {
  id: null,
  clienteId: '',
  dataProgramada: '',
  tipoCaminhao: '',
  tipoServico: '',
  observacoes: '',
  coletaFixa: false,
  periodicidade: '',
}

/** Catálogo fixo de tipos de caminhão (valor salvo = texto da opção). */
const TIPOS_CAMINHAO_GRUPOS: readonly { titulo: string; opcoes: readonly string[] }[] = [
  { titulo: 'Baú e veículo leve', opcoes: ['Baú', 'Fiorino'] },
  {
    titulo: 'Roll-on',
    opcoes: [
      'Rollon Caixa Alta',
      'Rollon Caixa baixa',
      'Rollon Caixa de 30',
      'Rollon caixa de 40',
    ],
  },
  { titulo: 'Vácuo', opcoes: ['Vacuo de 13', 'Vacuo de 15'] },
  { titulo: 'Carreta', opcoes: ['Carreta de 30', 'Carreta de 40'] },
  {
    titulo: 'Polli (caçamba)',
    opcoes: ['Polli (Caçamba de 5)', 'Polli (Caçamba de 7)', 'Polli (Caçamba de 10)'],
  },
] as const

const TIPOS_CAMINHAO_CATALOGO = new Set(
  TIPOS_CAMINHAO_GRUPOS.flatMap((g) => g.opcoes as string[])
)

function formatDate(date: string) {
  if (!date) return '-'
  const [year, month, day] = date.split('-')
  if (!year || !month || !day) return date
  return `${day}/${month}/${year}`
}

function formatMonthLabel(value: string) {
  if (!value) return '-'
  const [year, month] = value.split('-')
  if (!year || !month) return value

  const date = new Date(Number(year), Number(month) - 1, 1)

  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** Mês por extenso com inicial maiúscula (cabeçalho do calendário). */
function formatMonthLabelTitulo(value: string) {
  const s = formatMonthLabel(value)
  if (!s || s === '-') return s
  return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1)
}

function iniciaisNomeCliente(nome: string) {
  const base = (nome || '').trim()
  if (!base) return '?'
  const partes = base.split(/\s+/).filter(Boolean)
  if (partes.length >= 2) {
    return `${partes[0][0]}${partes[1][0]}`.toUpperCase()
  }
  return base.slice(0, 2).toUpperCase()
}

function truncarTexto(texto: string, max: number) {
  const t = texto.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function formatDiaPainelTitulo(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return formatDate(iso)
  const date = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function getMonthInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/** `yyyyMm` = `YYYY-MM`; avança ou recua meses (calendário). */
function addMonthsYyyyMm(yyyyMm: string, deltaMonths: number): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  if (!y || !m) return yyyyMm
  const d = new Date(y, m - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Data local no formato YYYY-MM-DD (sem UTC). */
function todayIsoLocal() {
  const t = new Date()
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`
}

function parseIsoLocalDate(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Semana de segunda a domingo, ancorada em qualquer dia da semana. */
function weekRangeMondayFirst(anchorIso: string): { start: string; end: string } {
  const d = parseIsoLocalDate(anchorIso)
  if (!d) return { start: anchorIso, end: anchorIso }
  const mondayOffset = (d.getDay() + 6) % 7
  const start = new Date(d)
  start.setDate(d.getDate() - mondayOffset)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    start: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`,
    end: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
  }
}

function monthRangeIso(yyyyMm: string): { start: string; end: string } {
  const [y, m] = yyyyMm.split('-').map(Number)
  if (!y || !m) return { start: '', end: '' }
  const last = new Date(y, m, 0).getDate()
  return {
    start: `${y}-${pad2(m)}-01`,
    end: `${y}-${pad2(m)}-${pad2(last)}`,
  }
}

type RelatorioFiltro = 'dia' | 'semana' | 'mes'

type ProgramacaoRelatorioPrintProps = {
  tituloPeriodo: string
  filtroLabel: string
  periodoIniFmt: string
  periodoFimFmt: string
  geradoEm: string
  grupos: Array<[string, ProgramacaoItem[]]>
  total: number
}

function ProgramacaoRelatorioPrintRoot(p: ProgramacaoRelatorioPrintProps) {
  return (
    <div className="programacao-relatorio-print-root">
      <header className="programacao-relatorio-print__header">
        <img
          className="programacao-relatorio-print__logo"
          src={BRAND_LOGO_MARK}
          alt="RG Ambiental"
          decoding="async"
        />
        <h1 className="programacao-relatorio-print__title">Calendário: visitas e coletas (impressão)</h1>
        <p className="programacao-relatorio-print__meta">
          Filtro: {p.filtroLabel}
          <br />
          Período: {p.periodoIniFmt} — {p.periodoFimFmt}
          <br />
          <span className="programacao-relatorio-print__meta-cap">{p.tituloPeriodo}</span>
          <br />
          Emitido em {p.geradoEm} · {p.total} programação(ões)
        </p>
      </header>

      {p.grupos.length === 0 ? (
        <p className="programacao-relatorio-print__empty">Nenhuma programação no período selecionado.</p>
      ) : (
        <table className="programacao-relatorio-print__table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Prog.</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Caminhão</th>
              <th>Serviço</th>
              <th>MTR</th>
              <th>Coleta</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {p.grupos.flatMap(([data, itens]) =>
              itens.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(data)}</td>
                  <td>{item.numero || '—'}</td>
                  <td>{item.clienteNome}</td>
                  <td>{STATUS_LABELS[item.statusProgramacao]}</td>
                  <td>{item.tipoCaminhao || '—'}</td>
                  <td>{item.tipoServico || '—'}</td>
                  <td>{item.mtrId ? 'Sim' : 'Não'}</td>
                  <td>{item.coletaId ? 'Sim' : 'Não'}</td>
                  <td>{truncarTexto(item.observacoes || '', 80)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <p className="programacao-relatorio-print__footer">
        Documento gerado pelo sistema — use &quot;Salvar como PDF&quot; na impressão do navegador, se desejar.
      </p>
    </div>
  )
}

/** Linhas preview no calendário; contador no topo = total do dia (sem duplicar “+N mais”). */
const CALENDAR_PREVIEW_MAX = 4

function textoServicoCalendario(item: ProgramacaoItem): string | null {
  const t = (item.tipoServico || '').trim()
  if (!t) return null
  if (t.toLowerCase() === 'coleta') return null
  return t
}

function getStatusStyle(status: ProgramacaoStatus) {
  switch (status) {
    case 'PENDENTE':
      return { backgroundColor: '#fef3c7', color: '#b45309' }
    case 'QUADRO_ATUALIZADO':
      return { backgroundColor: '#dbeafe', color: '#1d4ed8' }
    case 'EM_COLETA':
      return { backgroundColor: '#ede9fe', color: '#6d28d9' }
    case 'CONCLUIDA':
      return { backgroundColor: '#dcfce7', color: '#15803d' }
    case 'CANCELADA':
      return { backgroundColor: '#fee2e2', color: '#dc2626' }
    default:
      return { backgroundColor: '#e5e7eb', color: '#374151' }
  }
}

function gerarNumeroProgramacao(totalAtual: number) {
  const proximo = totalAtual + 1
  return String(proximo).padStart(3, '0')
}

function getSupabaseErrorMessage(error: unknown) {
  if (!error) return 'Erro desconhecido ao salvar programação.'

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }

    const partes = [
      maybeError.message,
      maybeError.details,
      maybeError.hint,
      maybeError.code ? `Código: ${maybeError.code}` : '',
    ].filter(Boolean)

    if (partes.length > 0) {
      return partes.join(' | ')
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Erro desconhecido ao salvar programação.'
}

function getCalendarCells(
  monthValue: string,
  items: ProgramacaoItem[]
): CalendarCell[] {
  if (!monthValue) return []

  const [yearString, monthString] = monthValue.split('-')
  const year = Number(yearString)
  const monthIndex = Number(monthString) - 1

  if (Number.isNaN(year) || Number.isNaN(monthIndex)) return []

  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const totalDays = lastDay.getDate()

  const firstWeekDay = (firstDay.getDay() + 6) % 7
  const today = new Date()
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`

  const itemsByDate = new Map<string, ProgramacaoItem[]>()

  for (const item of items) {
    if (!item.dataProgramada) continue
    if (!itemsByDate.has(item.dataProgramada)) {
      itemsByDate.set(item.dataProgramada, [])
    }
    itemsByDate.get(item.dataProgramada)?.push(item)
  }

  const cells: CalendarCell[] = []

  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate()
  const startDayPrevMonth = daysInPrevMonth - firstWeekDay + 1
  const prevYear = monthIndex === 0 ? year - 1 : year
  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1

  for (let i = 0; i < firstWeekDay; i++) {
    const day = startDayPrevMonth + i
    const dateString = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(
      2,
      '0'
    )}`

    cells.push({
      key: `prev-${dateString}`,
      date: dateString,
      dayNumber: day,
      items: itemsByDate.get(dateString) || [],
      isCurrentMonth: false,
      isToday: dateString === todayString,
    })
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateString = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    cells.push({
      key: dateString,
      date: dateString,
      dayNumber: day,
      items: itemsByDate.get(dateString) || [],
      isCurrentMonth: true,
      isToday: dateString === todayString,
    })
  }

  let nextYear = year
  let nextMonthIdx = monthIndex + 1
  if (nextMonthIdx > 11) {
    nextMonthIdx = 0
    nextYear++
  }
  let nextDayNum = 1

  while (cells.length % 7 !== 0) {
    const dateString = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(nextDayNum).padStart(
      2,
      '0'
    )}`

    cells.push({
      key: `next-${dateString}`,
      date: dateString,
      dayNumber: nextDayNum,
      items: itemsByDate.get(dateString) || [],
      isCurrentMonth: false,
      isToday: dateString === todayString,
    })
    nextDayNum++
  }

  return cells
}

function resolverProgramacaoContexto(
  items: ProgramacaoItem[],
  ids: {
    programacao: string | null
    coleta: string | null
    cliente: string | null
    mtr: string | null
  }
): ProgramacaoItem | null {
  if (ids.programacao) {
    const found = items.find((i) => i.id === ids.programacao)
    if (found) return found
  }
  if (ids.coleta) {
    const found = items.find((i) => i.coletaId && i.coletaId === ids.coleta)
    if (found) return found
  }
  if (ids.mtr) {
    const found = items.find((i) => i.mtrId && i.mtrId === ids.mtr)
    if (found) return found
  }
  if (ids.cliente) {
    const first = items.find((i) => i.clienteId === ids.cliente)
    if (first) return first
  }
  return null
}

export default function Programacao() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlProgramacaoId = searchParams.get('programacao')
  const urlColetaId = searchParams.get('coleta')
  const urlClienteId = searchParams.get('cliente')
  const urlMtrId = searchParams.get('mtr')

  const prevContextoUrlKeyRef = useRef<string>('')
  const prevScrollKeyRef = useRef<string>('')

  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [programacoes, setProgramacoes] = useState<ProgramacaoItem[]>([])
  const [form, setForm] = useState<FormState>(initialFormState)
  const [formEdicaoModal, setFormEdicaoModal] = useState<FormState | null>(null)
  const [mesSelecionado, setMesSelecionado] = useState(getMonthInputValue())
  const [loading, setLoading] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvandoEdicaoModal, setSalvandoEdicaoModal] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [contextoDestaqueId, setContextoDestaqueId] = useState<string | null>(null)
  const [usuarioCargo, setUsuarioCargo] = useState<string | null>(null)
  const [diaPainelCalendario, setDiaPainelCalendario] = useState<string | null>(null)
  const [modalNovaProgramacaoAberto, setModalNovaProgramacaoAberto] = useState(false)
  const [relatorioAberto, setRelatorioAberto] = useState(false)
  const [relatorioFiltro, setRelatorioFiltro] = useState<RelatorioFiltro>('dia')
  const [relatorioDiaRef, setRelatorioDiaRef] = useState(() => todayIsoLocal())
  const [relatorioMesRef, setRelatorioMesRef] = useState(() => getMonthInputValue())
  const [relatorioPrintTick, setRelatorioPrintTick] = useState({ n: 0, em: '' })

  const podeMutarProgramacao = cargoPodeEditarProgramacao(usuarioCargo)

  useEffect(() => {
    if (!sucesso) return
    const t = window.setTimeout(() => setSucesso(''), 4500)
    return () => window.clearTimeout(t)
  }, [sucesso])

  const itemContextoResolvido = useMemo(
    () =>
      resolverProgramacaoContexto(programacoes, {
        programacao: urlProgramacaoId,
        coleta: urlColetaId,
        cliente: urlClienteId,
        mtr: urlMtrId,
      }),
    [programacoes, urlProgramacaoId, urlColetaId, urlClienteId, urlMtrId]
  )

  const temParametrosContexto =
    !!(urlProgramacaoId || urlColetaId || urlClienteId || urlMtrId)

  function limparContextoUrl() {
    setSearchParams({}, { replace: true })
    setContextoDestaqueId(null)
    prevContextoUrlKeyRef.current = ''
    prevScrollKeyRef.current = ''
  }

  function montarParamsFluxo(item: ProgramacaoItem) {
    const p = new URLSearchParams()
    if (item.id) p.set('programacao', item.id)
    if (item.coletaId) p.set('coleta', item.coletaId)
    if (item.mtrId) p.set('mtr', item.mtrId)
    if (item.clienteId) p.set('cliente', item.clienteId)
    return p
  }

  function irMtr(item: ProgramacaoItem) {
    navigate(`/mtr?${montarParamsFluxo(item).toString()}`)
  }

  function irControleMassa(item: ProgramacaoItem) {
    navigate(`/controle-massa?${montarParamsFluxo(item).toString()}`)
  }

  function irFaturamento(item: ProgramacaoItem) {
    navigate(`/faturamento?${montarParamsFluxo(item).toString()}`)
  }

  function irFinanceiro(item: ProgramacaoItem) {
    navigate(`/financeiro?${montarParamsFluxo(item).toString()}`)
  }

  const anoCalendario = mesSelecionado.slice(0, 4)

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      setErro('')
      setSucesso('')

      const { data: clientesData, error: clientesError } = await supabase
        .from('clientes')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (clientesError) {
        console.error('ERRO AO CARREGAR CLIENTES:', clientesError)
        throw clientesError
      }

      const clientesLista = (clientesData || []) as ClienteOption[]
      setClientes(clientesLista)

      const ano = anoCalendario
      const rangeIni = `${ano}-01-01`
      const rangeFim = `${ano}-12-31`

      const { data: programacoesData, error: programacoesError } = await supabase
        .from('programacoes')
        .select(
          'id, numero, cliente_id, cliente, data_programada, tipo_caminhao, tipo_servico, observacoes, coleta_fixa, periodicidade, status_programacao, coleta_id, created_at'
        )
        .gte('data_programada', rangeIni)
        .lte('data_programada', rangeFim)
        .order('data_programada', { ascending: true })

      if (programacoesError) {
        console.error('ERRO AO CARREGAR PROGRAMAÇÕES:', programacoesError)
        throw programacoesError
      }

      const progs = (programacoesData || []) as ProgramacaoRow[]
      const progIds = progs.map((p) => p.id)

      const mtrMapByProgramacaoId = new Map<string, string>()
      const coletaMapByProgramacaoId = new Map<string, string>()

      if (progIds.length > 0) {
        const chunks = chunkArray(progIds, 120)
        for (const ch of chunks) {
          const [{ data: mtrsData, error: mtrsError }, { data: coletasData, error: coletasError }] =
            await Promise.all([
              supabase.from('mtrs').select('id, programacao_id').in('programacao_id', ch),
              supabase.from('coletas').select('id, programacao_id, mtr_id').in('programacao_id', ch),
            ])

          if (mtrsError) {
            console.error('ERRO AO CARREGAR MTRS:', mtrsError)
            throw mtrsError
          }
          if (coletasError) {
            console.error('ERRO AO CARREGAR COLETAS:', coletasError)
            throw coletasError
          }

          ;((mtrsData || []) as Array<{ id: string; programacao_id: string | null }>).forEach((item) => {
            if (item.programacao_id) {
              mtrMapByProgramacaoId.set(item.programacao_id, item.id)
            }
          })

          ;((coletasData || []) as Array<{ id: string; programacao_id: string | null; mtr_id?: string | null }>).forEach(
            (item) => {
              if (item.programacao_id) {
                coletaMapByProgramacaoId.set(item.programacao_id, item.id)
              }
            }
          )
        }
      }

      const clientesMap = new Map(clientesLista.map((cliente) => [cliente.id, cliente.nome]))

      const rows = progs.map((row) => {
        const mtrId = mtrMapByProgramacaoId.get(row.id) || ''
        const coletaId = row.coleta_id || coletaMapByProgramacaoId.get(row.id) || ''
        const statusDerivado: ProgramacaoStatus =
          coletaId
            ? 'EM_COLETA'
            : mtrId
            ? 'QUADRO_ATUALIZADO'
            : row.status_programacao || 'PENDENTE'

        return {
          id: row.id,
          numero: row.numero || '',
          clienteId: row.cliente_id || '',
          clienteNome:
            row.cliente ||
            clientesMap.get(row.cliente_id || '') ||
            'Cliente não identificado',
          dataProgramada: row.data_programada || '',
          tipoCaminhao: row.tipo_caminhao || '',
          tipoServico: row.tipo_servico || '',
          observacoes: row.observacoes || '',
          coletaFixa: row.coleta_fixa ?? false,
          periodicidade: row.periodicidade || '',
          statusProgramacao: statusDerivado,
          coletaId,
          mtrId,
          createdAt: row.created_at || '',
        }
      })

      setProgramacoes(rows)
    } catch (error) {
      setErro(getSupabaseErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [anoCalendario])

  useEffect(() => {
    queueMicrotask(() => {
      void carregarDados()
    })
  }, [carregarDados])

  useEffect(() => {
    async function carregarCargo() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUsuarioCargo(null)
        return
      }
      const { data } = await supabase
        .from('usuarios')
        .select('cargo')
        .eq('id', user.id)
        .maybeSingle()
      setUsuarioCargo(data?.cargo ?? null)
    }
    void carregarCargo()
  }, [])

  useEffect(() => {
    if (loading) return

    if (!temParametrosContexto) {
      queueMicrotask(() => {
        setContextoDestaqueId(null)
        prevContextoUrlKeyRef.current = ''
        prevScrollKeyRef.current = ''
      })
      return
    }

    const target = resolverProgramacaoContexto(programacoes, {
      programacao: urlProgramacaoId,
      coleta: urlColetaId,
      cliente: urlClienteId,
      mtr: urlMtrId,
    })

    const urlKey = [urlProgramacaoId, urlColetaId, urlClienteId, urlMtrId].join('|')

    if (!target) {
      queueMicrotask(() => {
        setContextoDestaqueId(null)
        prevContextoUrlKeyRef.current = urlKey
        prevScrollKeyRef.current = ''
      })
      return
    }

    queueMicrotask(() => {
      setContextoDestaqueId(target.id)
    })

    if (prevContextoUrlKeyRef.current !== urlKey) {
      const dp = target.dataProgramada
      if (dp && dp.length >= 7) {
        queueMicrotask(() => {
          setMesSelecionado(dp.slice(0, 7))
        })
      }
      prevContextoUrlKeyRef.current = urlKey
    }
  }, [
    loading,
    programacoes,
    temParametrosContexto,
    urlProgramacaoId,
    urlColetaId,
    urlClienteId,
    urlMtrId,
  ])

  function atualizarCampo<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function atualizarCampoModal<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setFormEdicaoModal((prev) => (prev ? { ...prev, [campo]: valor } : null))
  }

  function limparFormulario() {
    setForm(initialFormState)
  }

  function fecharModalNovaProgramacao() {
    setModalNovaProgramacaoAberto(false)
    limparFormulario()
    setErro('')
  }

  /** Abre o formulário flutuante; `isoDate` opcional (defeito: hoje). */
  function abrirModalNovaProgramacao(isoDate?: string) {
    if (!podeMutarProgramacao) {
      setErro('Seu perfil não pode criar programações. Apenas operacional ou administrador.')
      return
    }
    const data = isoDate ?? todayIsoLocal()
    const mesDoDia = data.slice(0, 7)
    if (mesDoDia !== mesSelecionado) {
      setMesSelecionado(mesDoDia)
    }
    setDiaPainelCalendario(null)
    setForm({
      ...initialFormState,
      dataProgramada: data,
    })
    setErro('')
    setSucesso('')
    setModalNovaProgramacaoAberto(true)
  }

  function iniciarNovaProgramacaoNoDia(isoDate: string) {
    abrirModalNovaProgramacao(isoDate)
  }

  function fecharModalEdicao() {
    setFormEdicaoModal(null)
    setErro('')
  }

  function editarProgramacao(item: ProgramacaoItem) {
    setFormEdicaoModal({
      id: item.id,
      clienteId: item.clienteId,
      dataProgramada: item.dataProgramada,
      tipoCaminhao: item.tipoCaminhao,
      tipoServico: item.tipoServico,
      observacoes: item.observacoes,
      coletaFixa: item.coletaFixa,
      periodicidade: item.periodicidade,
    })
    setErro('')
    setSucesso('')
  }

  function editarProgramacaoDoPainel(item: ProgramacaoItem) {
    editarProgramacao(item)
    setDiaPainelCalendario(null)
  }

  async function excluirProgramacao(id: string) {
    if (!podeMutarProgramacao) {
      setErro('Seu perfil não pode excluir programações. Apenas operacional ou administrador.')
      return
    }
    const confirmar = window.confirm('Tem certeza que deseja excluir esta programação?')
    if (!confirmar) return

    try {
      setErro('')
      setSucesso('')

      const { error } = await supabase.from('programacoes').delete().eq('id', id)

      if (error) {
        console.error('ERRO AO EXCLUIR PROGRAMAÇÃO:', error)
        throw error
      }

      setSucesso('Programação excluída com sucesso.')
      await carregarDados()

      if (form.id === id) {
        limparFormulario()
        setModalNovaProgramacaoAberto(false)
      }
      if (formEdicaoModal?.id === id) {
        setFormEdicaoModal(null)
      }
    } catch (error) {
      setErro(getSupabaseErrorMessage(error))
    }
  }

  async function salvarEdicaoModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!formEdicaoModal) return

    if (!podeMutarProgramacao) {
      setErro('Seu perfil não pode criar ou editar programações. Apenas operacional ou administrador.')
      return
    }

    try {
      setErro('')
      setSucesso('')

      if (!formEdicaoModal.clienteId) {
        setErro('Selecione um cliente.')
        return
      }

      if (!formEdicaoModal.dataProgramada) {
        setErro('Preencha a data da programação.')
        return
      }

      if (!formEdicaoModal.tipoServico.trim()) {
        setErro('Preencha o tipo de serviço.')
        return
      }

      if (!formEdicaoModal.id) {
        setErro('Identificador da programação ausente.')
        return
      }

      setSalvandoEdicaoModal(true)

      const clienteSelecionado = clientes.find((cliente) => cliente.id === formEdicaoModal.clienteId)

      if (!clienteSelecionado) {
        setErro('Cliente selecionado não encontrado.')
        setSalvandoEdicaoModal(false)
        return
      }

      const payload = {
        cliente_id: formEdicaoModal.clienteId,
        cliente: clienteSelecionado.nome,
        data_programada: formEdicaoModal.dataProgramada,
        tipo_caminhao: formEdicaoModal.tipoCaminhao || null,
        tipo_servico: formEdicaoModal.tipoServico.trim(),
        observacoes: formEdicaoModal.observacoes.trim() || null,
        coleta_fixa: formEdicaoModal.coletaFixa,
        periodicidade: formEdicaoModal.coletaFixa ? formEdicaoModal.periodicidade.trim() || null : null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('programacoes').update(payload).eq('id', formEdicaoModal.id)

      if (error) {
        console.error('ERRO SUPABASE AO ATUALIZAR PROGRAMAÇÃO:', error)
        throw error
      }

      setSucesso('Programação atualizada com sucesso.')
      setFormEdicaoModal(null)
      await carregarDados()
    } catch (error) {
      setErro(getSupabaseErrorMessage(error))
    } finally {
      setSalvandoEdicaoModal(false)
    }
  }

  async function salvarProgramacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!podeMutarProgramacao) {
      setErro('Seu perfil não pode criar ou editar programações. Apenas operacional ou administrador.')
      return
    }

    try {
      setErro('')
      setSucesso('')

      if (!form.clienteId) {
        setErro('Selecione um cliente.')
        return
      }

      if (!form.dataProgramada) {
        setErro('Preencha a data da programação.')
        return
      }

      if (!form.tipoServico.trim()) {
        setErro('Preencha o tipo de serviço.')
        return
      }

      setSalvando(true)

      const clienteSelecionado = clientes.find((cliente) => cliente.id === form.clienteId)

      if (!clienteSelecionado) {
        setErro('Cliente selecionado não encontrado.')
        setSalvando(false)
        return
      }

      const payloadBase = {
        cliente_id: form.clienteId,
        cliente: clienteSelecionado.nome,
        data_programada: form.dataProgramada,
        tipo_caminhao: form.tipoCaminhao || null,
        tipo_servico: form.tipoServico.trim(),
        observacoes: form.observacoes.trim() || null,
        coleta_fixa: form.coletaFixa,
        periodicidade: form.coletaFixa ? form.periodicidade.trim() || null : null,
        updated_at: new Date().toISOString(),
      }

      if (form.id) {
        const { error } = await supabase
          .from('programacoes')
          .update(payloadBase)
          .eq('id', form.id)

        if (error) {
          console.error('ERRO SUPABASE AO ATUALIZAR PROGRAMAÇÃO:', error)
          throw error
        }

        setSucesso('Programação atualizada com sucesso.')
      } else {
        const novoNumero = gerarNumeroProgramacao(programacoes.length)

        const { error } = await supabase.from('programacoes').insert([
          {
            ...payloadBase,
            numero: novoNumero,
            status_programacao: 'PENDENTE' as ProgramacaoStatus,
          },
        ])

        if (error) {
          console.error('ERRO SUPABASE AO INSERIR PROGRAMAÇÃO:', error)
          throw error
        }

        setSucesso('A programação foi criada com sucesso.')
      }

      limparFormulario()
      setModalNovaProgramacaoAberto(false)
      await carregarDados()
    } catch (error) {
      setErro(getSupabaseErrorMessage(error))
    } finally {
      setSalvando(false)
    }
  }

  const programacoesFiltradas = useMemo(() => {
    return programacoes.filter((item) => {
      if (!item.dataProgramada) return false
      return item.dataProgramada.startsWith(mesSelecionado)
    })
  }, [programacoes, mesSelecionado])

  const agendaAgrupada = useMemo(() => {
    const grupos = new Map<string, ProgramacaoItem[]>()

    for (const item of programacoesFiltradas) {
      if (!grupos.has(item.dataProgramada)) {
        grupos.set(item.dataProgramada, [])
      }
      grupos.get(item.dataProgramada)?.push(item)
    }

    return Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [programacoesFiltradas])

  const calendarCells = useMemo(() => {
    return getCalendarCells(mesSelecionado, programacoes)
  }, [mesSelecionado, programacoes])

  const itensDiaPainelCalendario = useMemo(() => {
    if (!diaPainelCalendario) return []
    return programacoes
      .filter((i) => i.dataProgramada === diaPainelCalendario)
      .sort((a, b) =>
        String(a.numero || '').localeCompare(String(b.numero || ''), undefined, { numeric: true })
      )
  }, [diaPainelCalendario, programacoes])

  const relatorioRange = useMemo(() => {
    if (relatorioFiltro === 'dia') {
      return { ini: relatorioDiaRef, fim: relatorioDiaRef }
    }
    if (relatorioFiltro === 'semana') {
      const w = weekRangeMondayFirst(relatorioDiaRef)
      return { ini: w.start, fim: w.end }
    }
    const m = monthRangeIso(relatorioMesRef)
    return { ini: m.start, fim: m.end }
  }, [relatorioFiltro, relatorioDiaRef, relatorioMesRef])

  const relatorioTituloPeriodo = useMemo(() => {
    if (relatorioFiltro === 'dia') {
      return formatDiaPainelTitulo(relatorioDiaRef)
    }
    if (relatorioFiltro === 'semana') {
      const w = weekRangeMondayFirst(relatorioDiaRef)
      return `${formatDate(w.start)} a ${formatDate(w.end)}`
    }
    return formatMonthLabel(relatorioMesRef)
  }, [relatorioFiltro, relatorioDiaRef, relatorioMesRef])

  const agendaRelatorioAgrupada = useMemo(() => {
    const { ini, fim } = relatorioRange
    if (!ini || !fim) return []

    const filtradas = programacoes.filter(
      (item) => item.dataProgramada && item.dataProgramada >= ini && item.dataProgramada <= fim
    )

    const grupos = new Map<string, ProgramacaoItem[]>()
    for (const item of filtradas) {
      const d = item.dataProgramada
      if (!grupos.has(d)) grupos.set(d, [])
      grupos.get(d)?.push(item)
    }

    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, itens]) => [
        data,
        itens.sort((a, b) =>
          String(a.numero || '').localeCompare(String(b.numero || ''), undefined, { numeric: true })
        ),
      ] as [string, ProgramacaoItem[]])
  }, [programacoes, relatorioRange])

  const relatorioPrintDocumentProps = useMemo((): ProgramacaoRelatorioPrintProps => {
    const filtroLabel =
      relatorioFiltro === 'dia' ? 'Dia' : relatorioFiltro === 'semana' ? 'Semana' : 'Mês'
    return {
      tituloPeriodo: relatorioTituloPeriodo,
      filtroLabel,
      periodoIniFmt: formatDate(relatorioRange.ini),
      periodoFimFmt: formatDate(relatorioRange.fim),
      geradoEm: relatorioPrintTick.em || '—',
      grupos: agendaRelatorioAgrupada,
      total: agendaRelatorioAgrupada.reduce((n, [, it]) => n + it.length, 0),
    }
  }, [
    relatorioTituloPeriodo,
    relatorioFiltro,
    relatorioRange.ini,
    relatorioRange.fim,
    agendaRelatorioAgrupada,
    relatorioPrintTick.em,
  ])

  useEffect(() => {
    if (relatorioPrintTick.n === 0) return
    const t = window.setTimeout(() => window.print(), 150)
    return () => window.clearTimeout(t)
  }, [relatorioPrintTick.n])

  useEffect(() => {
    if (!diaPainelCalendario) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDiaPainelCalendario(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [diaPainelCalendario])

  useEffect(() => {
    if (!formEdicaoModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFormEdicaoModal(null)
        setErro('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [formEdicaoModal])

  useEffect(() => {
    if (!relatorioAberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRelatorioAberto(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [relatorioAberto])

  useEffect(() => {
    if (!contextoDestaqueId || loading) return

    const scrollKey = `${contextoDestaqueId}|${mesSelecionado}`
    if (prevScrollKeyRef.current === scrollKey) return
    prevScrollKeyRef.current = scrollKey

    const id = contextoDestaqueId
    const timer = window.setTimeout(() => {
      document.getElementById(`prog-agenda-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 180)

    return () => window.clearTimeout(timer)
  }, [contextoDestaqueId, mesSelecionado, loading])

  const totalProgramacoes = programacoesFiltradas.length
  const totalFixas = programacoesFiltradas.filter((item) => item.coletaFixa).length
  const totalQuadroAtualizado = programacoesFiltradas.filter(
    (item) => item.statusProgramacao === 'QUADRO_ATUALIZADO'
  ).length
  const totalPendentes = programacoesFiltradas.filter(
    (item) => item.statusProgramacao === 'PENDENTE'
  ).length

  function renderFormFields(
    f: FormState,
    patch: <K extends keyof FormState>(campo: K, valor: FormState[K]) => void
  ) {
    return (
      <>
        <div>
          <label style={labelStyle}>Cliente</label>
          <select
            value={f.clienteId}
            onChange={(event) => patch('clienteId', event.target.value)}
            style={inputStyle}
          >
            <option value="">Selecione um cliente</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Data programada</label>
          <input
            type="date"
            value={f.dataProgramada}
            onChange={(event) => patch('dataProgramada', event.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Tipo de caminhão</label>
          <select
            value={
              f.tipoCaminhao && !TIPOS_CAMINHAO_CATALOGO.has(f.tipoCaminhao)
                ? '__legado__'
                : f.tipoCaminhao
            }
            onChange={(event) => {
              const v = event.target.value
              if (v === '__legado__') return
              patch('tipoCaminhao', v)
            }}
            style={inputStyle}
          >
            <option value="">Selecione o tipo de caminhão</option>
            {f.tipoCaminhao && !TIPOS_CAMINHAO_CATALOGO.has(f.tipoCaminhao) ? (
              <option value="__legado__">Outro (texto anterior): {f.tipoCaminhao}</option>
            ) : null}
            {TIPOS_CAMINHAO_GRUPOS.map((grupo) => (
              <optgroup key={grupo.titulo} label={grupo.titulo}>
                {grupo.opcoes.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {f.tipoCaminhao && !TIPOS_CAMINHAO_CATALOGO.has(f.tipoCaminhao) ? (
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
              Valor anterior (texto livre). Escolha uma opção abaixo para padronizar; se não alterar, o
              valor atual permanece ao salvar.
            </p>
          ) : null}
        </div>

        <div>
          <label style={labelStyle}>Tipo de serviço</label>
          <input
            type="text"
            value={f.tipoServico}
            onChange={(event) => patch('tipoServico', event.target.value)}
            placeholder="Ex: Coleta, troca de caçamba"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Observações gerais</label>
          <textarea
            value={f.observacoes}
            onChange={(event) => patch('observacoes', event.target.value)}
            placeholder="Informações importantes para o operacional"
            style={textareaStyle}
          />
        </div>

        <div style={checkboxLinhaStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={f.coletaFixa}
              onChange={(event) => patch('coletaFixa', event.target.checked)}
            />
            Coleta fixa
          </label>
        </div>

        {f.coletaFixa && (
          <div>
            <label style={labelStyle}>Periodicidade</label>
            <input
              type="text"
              value={f.periodicidade}
              onChange={(event) => patch('periodicidade', event.target.value)}
              placeholder="Ex: semanal, quinzenal, toda segunda"
              style={inputStyle}
            />
          </div>
        )}
      </>
    )
  }

  return (
    <MainLayout>
      <div className="page-shell">
      <div
        style={{
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1', minWidth: 'min(100%, 260px)' }}>
          <h1 style={{ margin: 0, fontSize: '26px', color: '#0f172a', fontWeight: 800 }}>
            Calendário das programações de Coleta
          </h1>
          <p className="page-header__lead" style={{ margin: '6px 0 0' }}>
            <strong>Fluxo:</strong> Programação → MTR → Controle de Massa (pesagem). Monte o calendário e
            cadastre visitas; o status no calendário acompanha automaticamente MTR e coleta (não é editável
            aqui).
          </p>
          {usuarioCargo ? (
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
              Perfil: <span style={{ color: '#0f172a' }}>{usuarioCargo}</span>
              {!podeMutarProgramacao ? ' · somente consulta' : ' · pode criar e editar'}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rg-btn rg-btn--report"
          style={{ flexShrink: 0, alignSelf: 'flex-start' }}
          onClick={() => {
            setRelatorioDiaRef(todayIsoLocal())
            setRelatorioMesRef(mesSelecionado)
            setRelatorioFiltro('dia')
            setRelatorioAberto(true)
          }}
          aria-label="Abrir relatório de programações"
        >
          <RgReportPdfIcon className="rg-btn__icon" />
          Relatório (PDF)
        </button>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="rg-btn rg-btn--outline"
          onClick={carregarDados}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>

        {podeMutarProgramacao ? (
          <button
            type="button"
            className="rg-btn rg-btn--primary"
            onClick={() => abrirModalNovaProgramacao()}
            title="Abrir formulário de nova programação (data inicial = hoje)"
          >
            + Nova programação
          </button>
        ) : null}

        <input
          type="month"
          value={mesSelecionado}
          onChange={(event) => setMesSelecionado(event.target.value)}
          style={{ ...inputStyle, width: '220px' }}
        />
      </div>

      {erro ? <FloatingAlert message={erro} variant="error" onClose={() => setErro('')} /> : null}
      {sucesso ? (
        <FloatingAlert message={sucesso} variant="success" onClose={() => setSucesso('')} />
      ) : null}

      {temParametrosContexto && (
        <div
          style={{
            ...bannerContextoBaseStyle,
            ...(itemContextoResolvido ? bannerContextoOkStyle : bannerContextoAlertaStyle),
          }}
        >
          <div style={{ flex: '1', minWidth: '220px' }}>
            <strong style={{ color: '#0f172a' }}>Veio de outra tela</strong>
            {itemContextoResolvido ? (
              <span style={{ color: '#475569' }}>
                {' '}
                · Prog. {itemContextoResolvido.numero || '—'} · {itemContextoResolvido.clienteNome}
                {itemContextoResolvido.dataProgramada
                  ? ` · ${formatDate(itemContextoResolvido.dataProgramada)}`
                  : ''}
              </span>
            ) : (
              <span style={{ color: '#92400e' }}>
                {' '}
                · Nada encontrado para o link (confira o mês selecionado ou atualize a lista).
              </span>
            )}
          </div>

          {itemContextoResolvido ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {itemContextoResolvido.mtrId ? (
                <button type="button" className="rg-btn rg-btn--outline" onClick={() => irMtr(itemContextoResolvido)}>
                  MTR
                </button>
              ) : null}
              {itemContextoResolvido.coletaId ? (
                <>
                  <button
                    type="button"
                    className="rg-btn rg-btn--outline"
                    onClick={() => irControleMassa(itemContextoResolvido)}
                  >
                    Controle de Massa
                  </button>
                  <button
                    type="button"
                    className="rg-btn rg-btn--outline"
                    onClick={() => irFaturamento(itemContextoResolvido)}
                  >
                    Faturamento
                  </button>
                  <button
                    type="button"
                    className="rg-btn rg-btn--outline"
                    onClick={() => irFinanceiro(itemContextoResolvido)}
                  >
                    Financeiro
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <button type="button" style={botaoLimparContextoStyle} onClick={limparContextoUrl}>
            Limpar contexto
          </button>
        </div>
      )}

      <div style={cardsGridStyle}>
        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Mês selecionado</div>
          <div style={cardResumoValorStyle}>{formatMonthLabel(mesSelecionado)}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Total de programações</div>
          <div style={cardResumoValorStyle}>{totalProgramacoes}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Coletas fixas</div>
          <div style={cardResumoValorStyle}>{totalFixas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Com MTR (fluxo)</div>
          <div style={cardResumoValorStyle}>{totalQuadroAtualizado}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Aguardando MTR</div>
          <div style={cardResumoValorStyle}>{totalPendentes}</div>
        </div>
      </div>

      <div style={layoutPrincipalStyle}>
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={cardPrincipalStyle}>
            <h2 style={cardTituloStyle}>Calendário do mês</h2>
            <p style={cardDescricaoStyle}>
              Cores por status; número no canto = total do dia. Dias acinzentados são do mês anterior ou
              seguinte — ao clicar, o mês acima acompanha. Clique para abrir a lista e atalhos.
            </p>

            <div
              style={{
                textAlign: 'center',
                marginBottom: '16px',
                padding: '14px 18px',
                borderRadius: '16px',
                background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)',
                border: '1px solid #6ee7b7',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#047857',
                  letterSpacing: '0.06em',
                }}
              >
                Calendário de Programações
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  marginTop: '6px',
                  lineHeight: 1.15,
                }}
              >
                <button
                  type="button"
                  aria-label="Mês anterior"
                  title="Mês anterior"
                  onClick={() =>
                    setMesSelecionado((prev) => addMonthsYyyyMm(prev, -1))
                  }
                  style={{
                    flexShrink: 0,
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: '1px solid #6ee7b7',
                    background: 'rgba(255,255,255,0.65)',
                    color: '#064e3b',
                    fontSize: 22,
                    fontWeight: 700,
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ‹
                </button>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'center',
                    fontSize: 'clamp(20px, 2.8vw, 26px)',
                    fontWeight: 900,
                    color: '#064e3b',
                  }}
                >
                  {formatMonthLabelTitulo(mesSelecionado)}
                </div>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  title="Próximo mês"
                  onClick={() =>
                    setMesSelecionado((prev) => addMonthsYyyyMm(prev, 1))
                  }
                  style={{
                    flexShrink: 0,
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: '1px solid #6ee7b7',
                    background: 'rgba(255,255,255,0.65)',
                    color: '#064e3b',
                    fontSize: 22,
                    fontWeight: 700,
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ›
                </button>
              </div>
            </div>

            <div style={calendarWeekHeaderStyle}>
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                <div key={day} style={calendarWeekDayStyle}>
                  {day}
                </div>
              ))}
            </div>

            <div style={calendarGridStyle}>
              {calendarCells.map((cell) => {
                const destaqueContexto =
                  !!contextoDestaqueId &&
                  cell.items.some((i) => i.id === contextoDestaqueId)

                const podeAbrirPainelDia = Boolean(cell.date)

                const abrirPainelDia = () => {
                  if (!cell.date) return
                  const mesDoDia = cell.date.slice(0, 7)
                  if (mesDoDia !== mesSelecionado) {
                    setMesSelecionado(mesDoDia)
                  }
                  setDiaPainelCalendario(cell.date)
                }

                return (
                <div
                  key={cell.key}
                  role={podeAbrirPainelDia ? 'button' : undefined}
                  tabIndex={podeAbrirPainelDia ? 0 : undefined}
                  onClick={abrirPainelDia}
                  onKeyDown={(e) => {
                    if (!podeAbrirPainelDia || !cell.date) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      abrirPainelDia()
                    }
                  }}
                  style={{
                    ...calendarCellStyle,
                    opacity: cell.isCurrentMonth ? 1 : 0.4,
                    borderColor: destaqueContexto
                      ? '#22c55e'
                      : cell.isToday
                        ? '#22c55e'
                        : '#e2e8f0',
                    boxShadow: destaqueContexto
                      ? '0 0 0 2px rgba(34,197,94,0.35)'
                      : cell.isToday
                        ? '0 0 0 2px rgba(34,197,94,0.15)'
                        : 'none',
                    cursor: podeAbrirPainelDia ? 'pointer' : 'default',
                  }}
                  aria-label={
                    podeAbrirPainelDia && cell.dayNumber
                      ? `Dia ${cell.dayNumber}, ${cell.items.length} programação(ões). Clique para detalhes.`
                      : undefined
                  }
                >
                  {cell.dayNumber ? (
                    <>
                      <div style={calendarCellTopStyle}>
                        <span
                          style={{
                            ...calendarDayNumberStyle,
                            background: cell.isToday ? '#dcfce7' : 'transparent',
                            color: cell.isToday ? '#15803d' : '#0f172a',
                          }}
                        >
                          {cell.dayNumber}
                        </span>

                        {cell.items.length > 0 && (
                          <span style={calendarCountStyle}>{cell.items.length}</span>
                        )}
                      </div>

                      <div style={calendarItemsListStyle}>
                        {cell.items.slice(0, CALENDAR_PREVIEW_MAX).map((item) => {
                          const statusStyle = getStatusStyle(item.statusProgramacao)
                          const sec = textoServicoCalendario(item)
                          return (
                            <div
                              key={item.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                minWidth: 0,
                                padding: '4px 6px',
                                borderRadius: '8px',
                                background: '#ffffff',
                                border: '1px solid #e8ecf1',
                                borderLeft: `3px solid ${statusStyle.color}`,
                              }}
                              title={`${item.clienteNome}${
                                sec ? ` · ${sec}` : ''
                              } · ${STATUS_LABELS[item.statusProgramacao]}`}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#0f172a',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {item.clienteNome}
                                {sec ? (
                                  <span style={{ fontWeight: 600, color: '#64748b' }}> · {sec}</span>
                                ) : null}
                              </div>
                              {item.coletaFixa ? (
                                <span
                                  style={{
                                    flexShrink: 0,
                                    fontSize: '9px',
                                    fontWeight: 800,
                                    color: '#c2410c',
                                  }}
                                  title="Coleta fixa"
                                >
                                  F
                                </span>
                              ) : null}
                            </div>
                          )
                        })}

                        {cell.items.length > CALENDAR_PREVIEW_MAX && (
                          <div style={calendarOverflowHintStyle}>
                            +{cell.items.length - CALENDAR_PREVIEW_MAX} · clique para ver todas
                          </div>
                        )}
                      </div>

                      {cell.date ? (
                        <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              iniciarNovaProgramacaoNoDia(cell.date!)
                            }}
                            disabled={!podeMutarProgramacao}
                            title={
                              podeMutarProgramacao
                                ? 'Preencher o formulário «Nova programação» com esta data'
                                : 'Apenas operacional ou administrador pode criar programações.'
                            }
                            style={{
                              width: '100%',
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '6px 4px',
                              borderRadius: '8px',
                              border: '1px dashed #0f766e',
                              background: '#ffffff',
                              color: '#0f766e',
                              cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                              opacity: podeMutarProgramacao ? 1 : 0.5,
                            }}
                          >
                            + Nova programação
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
                )
              })}
            </div>
          </div>

          <div style={cardPrincipalStyle}>
            <h2 style={cardTituloStyle}>Agenda detalhada</h2>
            <p style={cardDescricaoStyle}>
              Por data: editar ou excluir programações.
            </p>

            {loading ? (
              <div style={estadoVazioStyle}>Carregando programação...</div>
            ) : agendaAgrupada.length === 0 ? (
              <div style={estadoVazioStyle}>
                Nenhuma programação encontrada para o mês selecionado.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {agendaAgrupada.map(([data, itens]) => (
                  <div key={data} style={grupoAgendaStyle}>
                    <div style={grupoAgendaHeaderStyle}>
                      <div style={grupoAgendaDataStyle}>{formatDate(data)}</div>
                      <div style={grupoAgendaCountStyle}>{itens.length} programação(ões)</div>
                    </div>

                    <div style={grupoAgendaItensWrapStyle}>
                      {itens.map((item) => {
                        const statusStyle = getStatusStyle(item.statusProgramacao)

                        const emDestaqueContexto = contextoDestaqueId === item.id

                        return (
                          <div
                            key={item.id}
                            id={`prog-agenda-${item.id}`}
                            style={{
                              ...itemAgendaStyle,
                              borderLeft: `3px solid ${statusStyle.color}`,
                              ...(emDestaqueContexto
                                ? {
                                    boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.35)',
                                  }
                                : {}),
                            }}
                          >
                            <div style={itemAgendaMainRowStyle}>
                              <div
                                style={agendaAvatarStyle}
                                aria-hidden
                                title={item.clienteNome}
                              >
                                {iniciaisNomeCliente(item.clienteNome)}
                              </div>
                              <div style={itemAgendaTituloBlocoStyle}>
                                <div style={itemNumeroStyle}>Programação {item.numero || '—'}</div>
                                <div style={itemClienteStyle}>{item.clienteNome}</div>
                                <div style={itemAgendaChipsRowStyle}>
                                  <span
                                    style={{
                                      ...statusBadgeCompactStyle,
                                      backgroundColor: item.mtrId ? '#dbeafe' : '#f1f5f9',
                                      color: item.mtrId ? '#1d4ed8' : '#64748b',
                                    }}
                                  >
                                    {item.mtrId ? 'MTR' : 'Sem MTR'}
                                  </span>
                                  <span
                                    style={{
                                      ...statusBadgeCompactStyle,
                                      backgroundColor: item.coletaId ? '#dcfce7' : '#f1f5f9',
                                      color: item.coletaId ? '#15803d' : '#64748b',
                                    }}
                                  >
                                    {item.coletaId ? 'Coleta' : 'Sem coleta'}
                                  </span>
                                </div>
                              </div>
                              <span
                                style={{
                                  ...statusBadgeStyle,
                                  backgroundColor: statusStyle.backgroundColor,
                                  color: statusStyle.color,
                                  flexShrink: 0,
                                  alignSelf: 'flex-start',
                                }}
                              >
                                {STATUS_LABELS[item.statusProgramacao]}
                              </span>
                            </div>

                            <div style={itemAgendaMetaStripStyle}>
                              <span>
                                <span style={itemMetaKeyStyle}>Caminhão</span>{' '}
                                {item.tipoCaminhao || '—'}
                              </span>
                              <span style={itemMetaSepStyle} aria-hidden>
                                ·
                              </span>
                              <span>
                                <span style={itemMetaKeyStyle}>Serviço</span> {item.tipoServico || '—'}
                              </span>
                              <span style={itemMetaSepStyle} aria-hidden>
                                ·
                              </span>
                              <span>
                                <span style={itemMetaKeyStyle}>Fixa</span>{' '}
                                {item.coletaFixa ? 'Sim' : 'Não'}
                              </span>
                              <span style={itemMetaSepStyle} aria-hidden>
                                ·
                              </span>
                              <span>
                                <span style={itemMetaKeyStyle}>Per.</span>{' '}
                                {item.periodicidade || '—'}
                              </span>
                              <span style={itemMetaSepStyle} aria-hidden>
                                ·
                              </span>
                              <span>
                                <span style={itemMetaKeyStyle}>MTR</span> {item.mtrId ? 'sim' : 'não'}
                              </span>
                              <span style={itemMetaSepStyle} aria-hidden>
                                ·
                              </span>
                              <span>
                                <span style={itemMetaKeyStyle}>Coleta</span>{' '}
                                {item.coletaId ? 'sim' : 'não'}
                              </span>
                            </div>

                            {item.observacoes?.trim() ? (
                              <div style={itemAgendaObsStyle} title={item.observacoes}>
                                <span style={itemMetaKeyStyle}>Obs.</span>{' '}
                                {truncarTexto(item.observacoes, 120)}
                              </div>
                            ) : null}

                            <div style={acoesRowCompactStyle}>
                              {item.mtrId ? (
                                <button
                                  type="button"
                                  className="rg-btn rg-btn--outline"
                                  onClick={() => irMtr(item)}
                                  title="Abrir MTR desta programação"
                                >
                                  MTR
                                </button>
                              ) : null}
                              {item.coletaId ? (
                                <>
                                  <button
                                    type="button"
                                    className="rg-btn rg-btn--outline"
                                    onClick={() => irControleMassa(item)}
                                    title="Abrir Controle de Massa desta coleta"
                                  >
                                    Massa
                                  </button>
                                  <button
                                    type="button"
                                    className="rg-btn rg-btn--outline"
                                    onClick={() => irFaturamento(item)}
                                    title="Abrir Faturamento desta coleta"
                                  >
                                    Faturar
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                style={{
                                  ...botaoEditarListaCompactStyle,
                                  opacity: podeMutarProgramacao ? 1 : 0.5,
                                  cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                                }}
                                onClick={() => editarProgramacao(item)}
                                disabled={!podeMutarProgramacao}
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                style={{
                                  ...botaoExcluirListaCompactStyle,
                                  opacity: podeMutarProgramacao ? 1 : 0.5,
                                  cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                                }}
                                onClick={() => excluirProgramacao(item.id)}
                                disabled={!podeMutarProgramacao}
                              >
                                Excluir
                              </button>

                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {diaPainelCalendario ? (
        <div
          style={calendarPainelOverlayStyle}
          onClick={() => setDiaPainelCalendario(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendario-dia-titulo"
            style={calendarPainelModalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div
                  id="calendario-dia-titulo"
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#0f172a',
                    textTransform: 'capitalize',
                    lineHeight: 1.3,
                  }}
                >
                  {formatDiaPainelTitulo(diaPainelCalendario)}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
                  {itensDiaPainelCalendario.length}{' '}
                  {itensDiaPainelCalendario.length === 1 ? 'programação' : 'programações'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDiaPainelCalendario(null)}
                style={calendarPainelFecharStyle}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {itensDiaPainelCalendario.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  alignItems: 'stretch',
                }}
              >
                <div
                  style={{
                    ...estadoVazioStyle,
                    padding: '20px',
                  }}
                >
                  Nenhuma programação neste dia.
                </div>
                <button
                  type="button"
                  className="rg-btn rg-btn--primary"
                  onClick={() => iniciarNovaProgramacaoNoDia(diaPainelCalendario)}
                  disabled={!podeMutarProgramacao}
                  title={
                    podeMutarProgramacao
                      ? 'Preencher o formulário «Nova programação» com esta data'
                      : 'Apenas operacional ou administrador pode criar programações.'
                  }
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    opacity: podeMutarProgramacao ? 1 : 0.55,
                    cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                  }}
                >
                  + Nova programação
                </button>
              </div>
            ) : (
              <>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  maxHeight: 'min(70vh, 520px)',
                  overflowY: 'auto',
                }}
              >
                {itensDiaPainelCalendario.map((item) => {
                  const statusStyle = getStatusStyle(item.statusProgramacao)
                  const secPainel = textoServicoCalendario(item)
                  return (
                    <div
                      key={item.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '14px',
                        padding: '14px 16px',
                        background: '#ffffff',
                        borderLeft: `4px solid ${statusStyle.color}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap',
                          marginBottom: '10px',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#64748b',
                              fontWeight: 700,
                              marginBottom: '4px',
                            }}
                          >
                            Programação {item.numero || '—'}
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                            {item.clienteNome}
                          </div>
                          {secPainel ? (
                            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
                              {secPainel}
                            </div>
                          ) : null}
                        </div>
                        <span
                          style={{
                            ...statusBadgeStyle,
                            backgroundColor: statusStyle.backgroundColor,
                            color: statusStyle.color,
                          }}
                        >
                          {STATUS_LABELS[item.statusProgramacao]}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          flexWrap: 'wrap',
                          marginBottom: '12px',
                        }}
                      >
                        <span
                          style={{
                            ...statusBadgeStyle,
                            backgroundColor: item.mtrId ? '#dbeafe' : '#f1f5f9',
                            color: item.mtrId ? '#1d4ed8' : '#64748b',
                          }}
                        >
                          {item.mtrId ? 'MTR vinculada' : 'Sem MTR'}
                        </span>
                        <span
                          style={{
                            ...statusBadgeStyle,
                            backgroundColor: item.coletaId ? '#dcfce7' : '#f1f5f9',
                            color: item.coletaId ? '#15803d' : '#64748b',
                          }}
                        >
                          {item.coletaId ? 'Coleta criada' : 'Sem coleta'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {item.mtrId ? (
                          <button
                            type="button"
                            className="rg-btn rg-btn--outline"
                            onClick={() => {
                              irMtr(item)
                              setDiaPainelCalendario(null)
                            }}
                            title="Abrir MTR desta programação"
                          >
                            MTR
                          </button>
                        ) : null}
                        {item.coletaId ? (
                          <>
                            <button
                              type="button"
                              className="rg-btn rg-btn--outline"
                              onClick={() => {
                                irControleMassa(item)
                                setDiaPainelCalendario(null)
                              }}
                              title="Abrir Controle de Massa desta coleta"
                            >
                              Massa
                            </button>
                            <button
                              type="button"
                              className="rg-btn rg-btn--outline"
                              onClick={() => {
                                irFaturamento(item)
                                setDiaPainelCalendario(null)
                              }}
                              title="Abrir Faturamento desta coleta"
                            >
                              Faturar
                            </button>
                            <button
                              type="button"
                              className="rg-btn rg-btn--outline"
                              onClick={() => {
                                irFinanceiro(item)
                                setDiaPainelCalendario(null)
                              }}
                              title="Abrir Financeiro desta coleta"
                            >
                              Financeiro
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          style={{
                            ...botaoEditarListaStyle,
                            opacity: podeMutarProgramacao ? 1 : 0.5,
                            cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => editarProgramacaoDoPainel(item)}
                          disabled={!podeMutarProgramacao}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          style={{
                            ...botaoExcluirListaStyle,
                            opacity: podeMutarProgramacao ? 1 : 0.5,
                            cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => void excluirProgramacao(item.id)}
                          disabled={!podeMutarProgramacao}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                className="rg-btn rg-btn--outline"
                onClick={() => iniciarNovaProgramacaoNoDia(diaPainelCalendario)}
                disabled={!podeMutarProgramacao}
                title={
                  podeMutarProgramacao
                    ? 'Incluir outra programação nesta data'
                    : 'Apenas operacional ou administrador pode criar programações.'
                }
                style={{
                  width: '100%',
                  marginTop: '4px',
                  justifyContent: 'center',
                  flexShrink: 0,
                  borderStyle: 'dashed',
                  borderColor: '#0f766e',
                  color: '#0f766e',
                  opacity: podeMutarProgramacao ? 1 : 0.55,
                  cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                }}
              >
                + Nova programação neste dia
              </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {modalNovaProgramacaoAberto ? (
        <div
          style={novaProgramacaoModalOverlayStyle}
          onClick={fecharModalNovaProgramacao}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nova-programacao-titulo"
            style={{ ...calendarPainelModalStyle, maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '16px',
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 id="nova-programacao-titulo" style={cardTituloStyle}>
                  Nova programação
                </h2>
                <p style={{ ...cardDescricaoStyle, marginBottom: 0 }}>
                  Cliente, data e tipo de serviço — depois salve para aparecer no calendário. Para alterar uma
                  visita já agendada, use <strong>Editar</strong> no calendário ou na agenda.
                </p>
              </div>
              <button
                type="button"
                onClick={fecharModalNovaProgramacao}
                style={calendarPainelFecharStyle}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div
              style={{
                overflowY: 'auto',
                flex: 1,
                minHeight: 0,
                paddingRight: '4px',
              }}
            >
              <form onSubmit={salvarProgramacao} style={{ display: 'grid', gap: '16px' }}>
                {renderFormFields(form, atualizarCampo)}

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    className="rg-btn rg-btn--primary"
                    style={{
                      opacity: salvando || !podeMutarProgramacao ? 0.55 : 1,
                      cursor: salvando || !podeMutarProgramacao ? 'not-allowed' : 'pointer',
                    }}
                    disabled={salvando || !podeMutarProgramacao}
                    title={
                      !podeMutarProgramacao
                        ? 'Apenas operacional ou administrador pode salvar.'
                        : undefined
                    }
                  >
                    {salvando ? 'Salvando...' : 'Criar programação'}
                  </button>

                  <button type="button" className="rg-btn rg-btn--outline" onClick={limparFormulario}>
                    Limpar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {createPortal(<ProgramacaoRelatorioPrintRoot {...relatorioPrintDocumentProps} />, document.body)}

      {relatorioAberto ? (
        <div
          style={relatorioModalOverlayStyle}
          onClick={() => setRelatorioAberto(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="programacao-relatorio-titulo"
            style={relatorioModalBoxStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '14px',
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 id="programacao-relatorio-titulo" style={{ ...cardTituloStyle, marginBottom: '6px' }}>
                  Relatório de programações
                </h2>
                <p style={{ ...cardDescricaoStyle, margin: 0 }}>
                  <span style={{ textTransform: 'capitalize' }}>{relatorioTituloPeriodo}</span>
                  {loading ? ' · carregando…' : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRelatorioAberto(false)}
                style={calendarPainelFecharStyle}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
              <div style={relatorioSegmentWrapStyle}>
                {(
                  [
                    ['dia', 'Dia'],
                    ['semana', 'Semana'],
                    ['mes', 'Mês'],
                  ] as const
                ).map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    style={{
                      ...relatorioSegmentBtnStyle,
                      ...(relatorioFiltro === valor ? relatorioSegmentBtnAtivoStyle : {}),
                    }}
                    onClick={() => setRelatorioFiltro(valor)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {relatorioFiltro === 'mes' ? (
                <div>
                  <label style={labelStyle}>Mês</label>
                  <input
                    type="month"
                    value={relatorioMesRef}
                    onChange={(e) => setRelatorioMesRef(e.target.value)}
                    style={{ ...inputStyle, maxWidth: '240px' }}
                  />
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>
                    {relatorioFiltro === 'dia' ? 'Data' : 'Dia na semana (qualquer dia)'}
                  </label>
                  <input
                    type="date"
                    value={relatorioDiaRef}
                    onChange={(e) => setRelatorioDiaRef(e.target.value)}
                    style={{ ...inputStyle, maxWidth: '240px' }}
                  />
                </div>
              )}

              <div style={relatorioResumoBarStyle}>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>
                  {agendaRelatorioAgrupada.reduce((n, [, it]) => n + it.length, 0)} programação(ões)
                </span>
                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '13px' }}>
                  Período: {formatDate(relatorioRange.ini)} — {formatDate(relatorioRange.fim)}
                </span>
              </div>
            </div>

            {agendaRelatorioAgrupada.length === 0 ? (
              <div style={{ ...estadoVazioStyle, padding: '20px' }}>
                Nenhuma programação neste período.
                {relatorioRange.ini.slice(0, 4) !== mesSelecionado.slice(0, 4) ? (
                  <div style={{ marginTop: '10px', fontSize: '13px', color: '#94a3b8' }}>
                    Dica: os dados desta tela são carregados para o ano do seletor &quot;Calendário do
                    mês&quot; acima. Ajuste esse mês (ou clique em Atualizar) se estiver consultando outro
                    ano.
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  maxHeight: 'min(62vh, 480px)',
                  overflowY: 'auto',
                  paddingRight: '4px',
                }}
              >
                {agendaRelatorioAgrupada.map(([data, itens]) => (
                  <div key={data} style={grupoAgendaStyle}>
                    <div style={grupoAgendaHeaderStyle}>
                      <div style={grupoAgendaDataStyle}>{formatDate(data)}</div>
                      <div style={grupoAgendaCountStyle}>{itens.length} programação(ões)</div>
                    </div>
                    <div style={grupoAgendaItensWrapStyle}>
                      {itens.map((item) => {
                        const statusStyle = getStatusStyle(item.statusProgramacao)
                        return (
                          <div
                            key={item.id}
                            style={{
                              ...itemAgendaStyle,
                              borderLeft: `3px solid ${statusStyle.color}`,
                            }}
                          >
                            <div style={itemAgendaMainRowStyle}>
                              <div style={agendaAvatarStyle} aria-hidden title={item.clienteNome}>
                                {iniciaisNomeCliente(item.clienteNome)}
                              </div>
                              <div style={itemAgendaTituloBlocoStyle}>
                                <div style={itemNumeroStyle}>Programação {item.numero || '—'}</div>
                                <div style={itemClienteStyle}>{item.clienteNome}</div>
                              </div>
                              <span
                                style={{
                                  ...statusBadgeStyle,
                                  backgroundColor: statusStyle.backgroundColor,
                                  color: statusStyle.color,
                                  flexShrink: 0,
                                  alignSelf: 'flex-start',
                                }}
                              >
                                {STATUS_LABELS[item.statusProgramacao]}
                              </span>
                            </div>
                            <div style={itemAgendaMetaStripStyle}>
                              <span>
                                <span style={itemMetaKeyStyle}>Caminhão</span> {item.tipoCaminhao || '—'}
                              </span>
                              <span style={itemMetaSepStyle} aria-hidden>
                                ·
                              </span>
                              <span>
                                <span style={itemMetaKeyStyle}>Serviço</span> {item.tipoServico || '—'}
                              </span>
                            </div>
                            <div style={acoesRowCompactStyle}>
                              {item.mtrId ? (
                                <button
                                  type="button"
                                  className="rg-btn rg-btn--outline"
                                  onClick={() => {
                                    irMtr(item)
                                    setRelatorioAberto(false)
                                  }}
                                >
                                  MTR
                                </button>
                              ) : null}
                              {item.coletaId ? (
                                <>
                                  <button
                                    type="button"
                                    className="rg-btn rg-btn--outline"
                                    onClick={() => {
                                      irControleMassa(item)
                                      setRelatorioAberto(false)
                                    }}
                                  >
                                    Massa
                                  </button>
                                  <button
                                    type="button"
                                    className="rg-btn rg-btn--outline"
                                    onClick={() => {
                                      irFaturamento(item)
                                      setRelatorioAberto(false)
                                    }}
                                  >
                                    Faturar
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                style={{
                                  ...botaoEditarListaCompactStyle,
                                  opacity: podeMutarProgramacao ? 1 : 0.5,
                                  cursor: podeMutarProgramacao ? 'pointer' : 'not-allowed',
                                }}
                                onClick={() => {
                                  editarProgramacao(item)
                                  setRelatorioAberto(false)
                                }}
                                disabled={!podeMutarProgramacao}
                              >
                                Editar
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={relatorioModalAcoesStyle}>
              <button type="button" className="rg-btn rg-btn--outline" onClick={() => setRelatorioAberto(false)}>
                Fechar
              </button>
              <button
                type="button"
                className="rg-btn rg-btn--report"
                onClick={() =>
                  setRelatorioPrintTick((prev) => ({
                    n: prev.n + 1,
                    em: new Date().toLocaleString('pt-BR'),
                  }))
                }
                title="Abre a impressão do navegador — escolha &quot;Salvar como PDF&quot; se disponível"
              >
                <RgReportPdfIcon className="rg-btn__icon" />
                Imprimir / PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {formEdicaoModal ? (
        <div
          style={edicaoModalOverlayStyle}
          onClick={fecharModalEdicao}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="programacao-edicao-titulo"
            style={edicaoModalBoxStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '14px',
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 id="programacao-edicao-titulo" style={{ ...cardTituloStyle, marginBottom: '6px' }}>
                  Editar programação
                </h2>
                <p style={{ ...cardDescricaoStyle, margin: 0 }}>
                  Ajuste os campos e salve; o calendário e a agenda atualizam em seguida.
                </p>
              </div>
              <button
                type="button"
                onClick={fecharModalEdicao}
                style={calendarPainelFecharStyle}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={salvarEdicaoModal}
              style={{
                display: 'grid',
                gap: '16px',
                maxHeight: 'min(72vh, 600px)',
                overflowY: 'auto',
                paddingRight: '6px',
              }}
            >
              {renderFormFields(formEdicaoModal, atualizarCampoModal)}
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap',
                  paddingTop: '14px',
                  borderTop: '1px solid #e5e7eb',
                  marginTop: '4px',
                }}
              >
                <button
                  type="submit"
                  className="rg-btn rg-btn--primary"
                  style={{
                    opacity: salvandoEdicaoModal || !podeMutarProgramacao ? 0.55 : 1,
                    cursor:
                      salvandoEdicaoModal || !podeMutarProgramacao ? 'not-allowed' : 'pointer',
                  }}
                  disabled={salvandoEdicaoModal || !podeMutarProgramacao}
                  title={
                    !podeMutarProgramacao
                      ? 'Apenas operacional ou administrador pode salvar.'
                      : undefined
                  }
                >
                  {salvandoEdicaoModal ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button type="button" className="rg-btn rg-btn--outline" onClick={fecharModalEdicao}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </MainLayout>
  )
}

const cardsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '14px',
  marginBottom: '22px',
}

const cardResumoStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '18px',
  padding: '18px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const cardResumoTituloStyle: CSSProperties = {
  fontSize: '13px',
  color: '#64748b',
  marginBottom: '8px',
  fontWeight: 700,
}

const cardResumoValorStyle: CSSProperties = {
  fontSize: '24px',
  color: '#0f172a',
  fontWeight: 800,
  textTransform: 'capitalize',
}

const layoutPrincipalStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '22px',
  alignItems: 'start',
}

const cardPrincipalStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '20px',
  padding: '20px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const cardTituloStyle: CSSProperties = {
  margin: 0,
  fontSize: '20px',
  color: '#0f172a',
  fontWeight: 800,
}

const cardDescricaoStyle: CSSProperties = {
  margin: '8px 0 18px',
  color: '#64748b',
  fontSize: '14px',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '6px',
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: '42px',
  borderRadius: '12px',
  border: '1px solid #d1d5db',
  padding: '0 12px',
  fontSize: '14px',
  color: '#0f172a',
  background: '#ffffff',
  outline: 'none',
  boxSizing: 'border-box',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '100px',
  borderRadius: '12px',
  border: '1px solid #d1d5db',
  padding: '12px',
  fontSize: '14px',
  color: '#0f172a',
  background: '#ffffff',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
}

const checkboxLinhaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
}

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  color: '#0f172a',
  fontWeight: 600,
  fontSize: '14px',
}

const calendarWeekHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: '10px',
  marginBottom: '10px',
}

const calendarWeekDayStyle: CSSProperties = {
  textAlign: 'center',
  fontSize: '12px',
  fontWeight: 800,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const calendarGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: '10px',
}

const calendarCellStyle: CSSProperties = {
  minHeight: '128px',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  background: '#f8fafc',
  padding: '8px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const calendarCellTopStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const calendarDayNumberStyle: CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '999px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  fontWeight: 800,
}

const calendarCountStyle: CSSProperties = {
  minWidth: '22px',
  height: '22px',
  borderRadius: '999px',
  padding: '0 6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#16a34a',
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 800,
}

const calendarItemsListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: 1,
  minHeight: 0,
}

const calendarOverflowHintStyle: CSSProperties = {
  fontSize: '10px',
  color: '#64748b',
  fontWeight: 700,
  paddingLeft: '2px',
  marginTop: '2px',
}

const calendarPainelOverlayStyle: CSSProperties = {
  ...overlayAreaPrincipal,
  zIndex: 2000,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
}

const calendarPainelModalStyle: CSSProperties = {
  width: '100%',
  maxWidth: '520px',
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  background: '#ffffff',
  borderRadius: '18px',
  boxShadow: '0 24px 48px rgba(15, 23, 42, 0.2)',
  padding: '22px 20px 20px',
  border: '1px solid #e2e8f0',
}

const novaProgramacaoModalOverlayStyle: CSSProperties = {
  ...calendarPainelOverlayStyle,
  zIndex: 2050,
}

const calendarPainelFecharStyle: CSSProperties = {
  flexShrink: 0,
  width: '40px',
  height: '40px',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  color: '#64748b',
  fontSize: '24px',
  lineHeight: 1,
  cursor: 'pointer',
  fontWeight: 700,
}

const edicaoModalOverlayStyle: CSSProperties = {
  ...calendarPainelOverlayStyle,
  zIndex: 2100,
}

const edicaoModalBoxStyle: CSSProperties = {
  ...calendarPainelModalStyle,
  maxWidth: '540px',
}

const estadoVazioStyle: CSSProperties = {
  border: '1px dashed #d1d5db',
  borderRadius: '14px',
  padding: '26px',
  textAlign: 'center',
  color: '#64748b',
  background: '#f8fafc',
}

const grupoAgendaStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '18px',
  overflow: 'hidden',
  background: '#f8fafc',
}

const grupoAgendaHeaderStyle: CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid #e5e7eb',
  background: '#ffffff',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
}

const grupoAgendaDataStyle: CSSProperties = {
  fontSize: '16px',
  color: '#0f172a',
  fontWeight: 800,
}

const grupoAgendaCountStyle: CSSProperties = {
  fontSize: '13px',
  color: '#64748b',
  fontWeight: 700,
}

const grupoAgendaItensWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 10px 12px',
}

const itemAgendaStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8ecf1',
  borderRadius: '10px',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const itemAgendaMainRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
}

const agendaAvatarStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 999,
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  color: '#475569',
  fontSize: 13,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  letterSpacing: '-0.02em',
}

const itemAgendaTituloBlocoStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const itemAgendaChipsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: '6px',
}

const statusBadgeCompactStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const itemAgendaMetaStripStyle: CSSProperties = {
  fontSize: '12px',
  color: '#64748b',
  lineHeight: 1.5,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
}

const itemMetaKeyStyle: CSSProperties = {
  color: '#94a3b8',
  fontWeight: 600,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const itemMetaSepStyle: CSSProperties = {
  color: '#cbd5e1',
  padding: '0 6px',
  userSelect: 'none',
}

const itemAgendaObsStyle: CSSProperties = {
  fontSize: '12px',
  color: '#475569',
  lineHeight: 1.45,
  padding: '8px 10px',
  background: '#f8fafc',
  borderRadius: '8px',
  border: '1px solid #eef2f7',
}

const itemNumeroStyle: CSSProperties = {
  fontSize: '12px',
  color: '#64748b',
  fontWeight: 600,
  marginBottom: '2px',
}

const itemClienteStyle: CSSProperties = {
  fontSize: '16px',
  color: '#0f172a',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1.25,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const statusBadgeStyle: CSSProperties = {
  padding: '6px 11px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const acoesRowCompactStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  alignItems: 'center',
}

const botaoEditarListaStyle: CSSProperties = {
  background: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  padding: '9px 14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoExcluirListaStyle: CSSProperties = {
  background: '#ef4444',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  padding: '9px 14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoEditarListaCompactStyle: CSSProperties = {
  background: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 12px',
  fontWeight: 700,
  fontSize: '12px',
  cursor: 'pointer',
}

const botaoExcluirListaCompactStyle: CSSProperties = {
  background: '#ef4444',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  padding: '6px 12px',
  fontWeight: 700,
  fontSize: '12px',
  cursor: 'pointer',
}

const bannerContextoBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '14px',
  marginBottom: '18px',
  fontSize: '14px',
}

const bannerContextoOkStyle: CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
}

const bannerContextoAlertaStyle: CSSProperties = {
  background: '#fffbeb',
  border: '1px solid #fcd34d',
}

const botaoLimparContextoStyle: CSSProperties = {
  background: '#ffffff',
  color: '#64748b',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '8px 14px',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: '13px',
}

const relatorioModalAcoesStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  marginTop: '18px',
  paddingTop: '16px',
  borderTop: '1px solid #e5e7eb',
  flexShrink: 0,
}

const relatorioModalOverlayStyle: CSSProperties = {
  ...calendarPainelOverlayStyle,
  zIndex: 10100,
}

const relatorioModalBoxStyle: CSSProperties = {
  ...calendarPainelModalStyle,
  maxWidth: '560px',
}

const relatorioSegmentWrapStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
}

const relatorioSegmentBtnStyle: CSSProperties = {
  flex: '1',
  minWidth: '88px',
  height: '40px',
  borderRadius: '12px',
  border: '1px solid #d1d5db',
  background: '#f8fafc',
  color: '#475569',
  fontWeight: 700,
  fontSize: '13px',
  cursor: 'pointer',
}

const relatorioSegmentBtnAtivoStyle: CSSProperties = {
  background: '#0f172a',
  color: '#ffffff',
  borderColor: '#0f172a',
}

const relatorioResumoBarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px',
  borderRadius: '14px',
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
}