import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { montarMapNomeExibicaoPorUsuarioId } from '../lib/resolveAutorUsuarioNomes'
import {
  formatarEtapaParaUI,
  formatarFaseFluxoOficialParaUI,
  indiceEtapaFluxo,
  normalizarEtapaColeta,
} from '../lib/fluxoEtapas'
import { isBenignSupabaseFetchError } from '../lib/supabaseErrors'
import { cargoEhDesenvolvedor, cargoPodeEditarMtr } from '../lib/workflowPermissions'
import { formatarLancadoPorResumo } from '../lib/formatLancamentoAutor'
import { BRAND_LOGO_MARK } from '../lib/brandLogo'
import { officialSiteUrl } from '../lib/officialSiteUrl'
import {
  nomeIndicaRgAmbiental,
  preencherCamposVazios,
  TRANSPORTADOR_RG_AMBIENTAL_PADRAO,
} from '../lib/mtrTransportadorRgDefaults'
import { MTR_RODAPE_VIAS, MTR_TEXTO_VIDE_FICHA, mtrTextoCelula } from '../lib/mtrPrintTexto'
import ProgramacaoCalendarPicker from '../components/mtr/ProgramacaoCalendarPicker'
import { useSessionObjectDraft } from '../lib/usePageSessionPersistence'

type MTRStatus = 'Rascunho' | 'Emitido' | 'Cancelado'

type ProgramacaoStatus =
  | 'PENDENTE'
  | 'QUADRO_ATUALIZADO'
  | 'EM_COLETA'
  | 'CONCLUIDA'
  | 'CANCELADA'

interface Programacao {
  id: string
  numero?: string | null
  cliente_id?: string | null
  cliente?: string | null
  data_programada?: string | null
  tipo_caminhao?: string | null
  tipo_servico?: string | null
  observacoes?: string | null
  coleta_fixa?: boolean | null
  frequencia?: string | null
  periodicidade?: string | null
  status_programacao?: ProgramacaoStatus | null
  created_at?: string | null
  criado_por_user_id?: string | null
  criado_por_nome?: string | null
}

interface MTR {
  id: string
  numero: string
  programacao_id?: string | null
  cliente: string
  gerador: string
  endereco: string
  cidade: string
  tipo_residuo: string
  quantidade: number | null
  unidade: string
  destinador: string
  transportador: string
  detalhes?: MTRDetalhes | null
  data_emissao: string
  observacoes: string
  status: MTRStatus
  created_at?: string
  criado_por_nome?: string | null
  criado_por_user_id?: string | null
}

interface Coleta {
  id: string
  numero?: string | null
  cliente?: string | null
  etapa_operacional?: string | null
  fluxo_status?: string | null
  status_processo?: string | null
  mtr_id?: string | null
  programacao_id?: string | null
  motorista?: string | null
  motorista_nome?: string | null
  placa?: string | null
  tipo_residuo?: string | null
}

type SupabaseErrorLike = {
  message?: string
  details?: string
  hint?: string
  code?: string
}

function errorIndicaColunaInexistente(err: SupabaseErrorLike | null | undefined, coluna: string): boolean {
  const msg = String(err?.message ?? '')
  // PostgREST: "Could not find the 'col' column of 'table' in the schema cache"
  // code PGRST204 em alguns casos
  return msg.toLowerCase().includes(`'${coluna.toLowerCase()}'`) && msg.toLowerCase().includes('schema cache')
}

type MTRDetalhes = {
  gerador: {
    atividade: string
    cadri: string
    cnpj: string
    ie: string
    bairro: string
    cep: string
    estado: string
    cidade: string
    responsavel: string
    telefone: string
  }
  residuo: {
    fonte_origem: string
    caracterizacao: string
    estado_fisico: string
    acondicionamento: string
    quantidade_aproximada: string
    onu: string
  }
  blocos: {
    descricoes_adicionais_residuos: string
    instrucoes_manuseio: string
  }
  conformidade: {
    telefone_discrepancias: string
  }
  transportador: {
    razao_social: string
    atividade: string
    cnpj: string
    ie: string
    endereco: string
    municipio: string
    bairro: string
    cep: string
    estado: string
    responsavel: string
    telefone: string
    email: string
    motorista: string
    placa: string
    telefones_gerais: string
  }
  destinatario: {
    razao_social: string
    atividade: string
    lo: string
    cnpj: string
    ie: string
    endereco: string
    municipio: string
    bairro: string
    cep: string
    estado: string
    responsavel: string
    telefone: string
  }
}

type MTRFormState = Omit<MTR, 'id' | 'created_at' | 'status' | 'criado_por_nome' | 'criado_por_user_id'>

function detalhesVazios(): MTRDetalhes {
  return {
    gerador: {
      atividade: '',
      cadri: '',
      cnpj: '',
      ie: '',
      bairro: '',
      cep: '',
      estado: '',
      cidade: '',
      responsavel: '',
      telefone: '',
    },
    residuo: {
      fonte_origem: '',
      caracterizacao: '',
      estado_fisico: '',
      acondicionamento: '',
      quantidade_aproximada: '',
      onu: '',
    },
    blocos: {
      descricoes_adicionais_residuos: MTR_TEXTO_VIDE_FICHA,
      instrucoes_manuseio: MTR_TEXTO_VIDE_FICHA,
    },
    conformidade: {
      telefone_discrepancias: '',
    },
    transportador: {
      razao_social: '',
      atividade: '',
      cnpj: '',
      ie: '',
      endereco: '',
      municipio: '',
      bairro: '',
      cep: '',
      estado: '',
      responsavel: '',
      telefone: '',
      email: '',
      motorista: '',
      placa: '',
      telefones_gerais: '',
    },
    destinatario: {
      razao_social: '',
      atividade: '',
      lo: '',
      cnpj: '',
      ie: '',
      endereco: '',
      municipio: '',
      bairro: '',
      cep: '',
      estado: '',
      responsavel: '',
      telefone: '',
    },
  }
}

const emptyForm: MTRFormState = {
  numero: '',
  programacao_id: null,
  cliente: '',
  gerador: '',
  endereco: '',
  cidade: '',
  tipo_residuo: '',
  quantidade: null,
  unidade: 'kg',
  destinador: '',
  transportador: 'RG Ambiental',
  detalhes: detalhesVazios(),
  data_emissao: new Date().toISOString().slice(0, 10),
  observacoes: '',
}

type ClienteRowAutofill = {
  nome: string | null
  razao_social: string | null
  cnpj: string | null
  cep: string | null
  rua: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  endereco_coleta: string | null
  responsavel_nome: string | null
  telefone: string | null
  tipo_residuo: string | null
  unidade_medida: string | null
  classificacao: string | null
  licenca_numero: string | null
  destino: string | null
  mtr_destino: string | null
  residuo_destino: string | null
  observacoes_operacionais: string | null
  observacoes_gerais: string | null
  link_google_maps: string | null
  descricao_veiculo: string | null
  mtr_coleta: string | null
}

function montarEnderecoLinhaCliente(row: ClienteRowAutofill): string {
  const logradouro = [row.rua?.trim(), row.numero?.trim()].filter(Boolean).join(', ')
  const parts: string[] = []
  if (logradouro) parts.push(logradouro)
  if (row.complemento?.trim()) parts.push(row.complemento.trim())
  if (row.bairro?.trim()) parts.push(row.bairro.trim())
  if (row.cep?.trim()) parts.push(`CEP ${row.cep.trim()}`)
  const estruturado = parts.join(' — ')
  const livre = row.endereco_coleta?.trim()
  return estruturado || livre || ''
}

function nomeGeradorParaMtr(row: ClienteRowAutofill, fallbackCliente: string): string {
  return row.razao_social?.trim() || row.nome?.trim() || fallbackCliente.trim() || ''
}

function montarCidadeUfCliente(row: ClienteRowAutofill): string {
  const c = row.cidade?.trim()
  const uf = row.estado?.trim()
  if (c && uf) return `${c} — ${uf}`
  return c || uf || ''
}

/** Coluna `mtrs.cidade` (combinado ou legado); prioriza o campo de topo do formulário. */
function cidadeCompletaGeradorParaGravar(cidadeTopo: string, gerador: MTRDetalhes['gerador']): string {
  const top = (cidadeTopo ?? '').trim()
  if (top) return top
  const c = (gerador.cidade ?? '').trim()
  const u = (gerador.estado ?? '').trim()
  if (c && u) return `${c} — ${u}`
  if (c) return c
  return u || ''
}

/** data_programada vinda do banco (date ou timestamptz) → yyyy-mm-dd para input type=date */
function dataProgramacaoParaEmissao(dataProgramada: string | null | undefined): string | null {
  if (!dataProgramada) return null
  const s = dataProgramada.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function formatDate(date: string | null | undefined) {
  if (!date) return '-'
  const clean = date.includes('T') ? date.split('T')[0] : date
  const [year, month, day] = clean.split('-')
  if (!year || !month || !day) return clean
  return `${day}/${month}/${year}`
}

function generateMTRNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  return `MTR-${year}${month}${day}-${hours}${minutes}${seconds}`
}

/** Número estilo manifesto físico (ex.: 2650/2026), sequencial por ano com base nas MTR já listadas. */
function generateMTRNumberSequencialAno(mtrNumeros: string[], ano?: number): string {
  const y = ano ?? new Date().getFullYear()
  let maxSeq = 0
  for (const raw of mtrNumeros) {
    const n = raw.trim()
    const m = /^(\d+)\s*\/\s*(\d{4})$/.exec(n)
    if (m && Number(m[2]) === y) maxSeq = Math.max(maxSeq, Number(m[1]))
  }
  return `${maxSeq + 1}/${y}`
}

function mergeMtrDetalhesProfundo(raw: MTRDetalhes | null | undefined): MTRDetalhes {
  const z = detalhesVazios()
  if (!raw) return z
  const residuoL = { ...(raw.residuo as Record<string, string>) }
  delete residuoL.fp_numero
  return {
    gerador: { ...z.gerador, ...raw.gerador },
    residuo: { ...z.residuo, ...(residuoL as MTRDetalhes['residuo']) },
    transportador: { ...z.transportador, ...raw.transportador },
    destinatario: { ...z.destinatario, ...raw.destinatario },
    blocos: { ...z.blocos, ...(raw.blocos ?? z.blocos) },
    conformidade: { ...z.conformidade, ...(raw.conformidade ?? z.conformidade) },
  }
}

function mergeDetalhesParaDocumento(
  mtr: MTR,
  motoristaColeta: string,
  placaColeta: string,
  opts?: { tipoCaminhao?: string | null }
): MTRDetalhes {
  let d = mergeMtrDetalhesProfundo(mtr.detalhes ?? null)

  const qPart =
    mtr.quantidade !== null && mtr.quantidade !== undefined && !Number.isNaN(Number(mtr.quantidade))
      ? `${String(mtr.quantidade).replace('.', ',')} ${(mtr.unidade ?? '').trim()}`.trim()
      : ''
  if (qPart && !d.residuo.quantidade_aproximada.trim()) {
    d = { ...d, residuo: { ...d.residuo, quantidade_aproximada: qPart } }
  }

  if (!d.residuo.fonte_origem.trim()) {
    d = { ...d, residuo: { ...d.residuo, fonte_origem: 'Industrial' } }
  }
  if (!d.residuo.estado_fisico.trim()) {
    d = { ...d, residuo: { ...d.residuo, estado_fisico: 'SÓLIDO' } }
  }
  const tcam = (opts?.tipoCaminhao ?? '').trim()
  if (tcam && !d.residuo.acondicionamento.trim()) {
    d = { ...d, residuo: { ...d.residuo, acondicionamento: tcam } }
  }

  if (nomeIndicaRgAmbiental(mtr.transportador)) {
    d = {
      ...d,
      transportador: preencherCamposVazios(
        d.transportador,
        TRANSPORTADOR_RG_AMBIENTAL_PADRAO as unknown as Partial<MTRDetalhes['transportador']>
      ),
    }
  }
  if (nomeIndicaRgAmbiental(mtr.destinador)) {
    const padDest: Partial<MTRDetalhes['destinatario']> = {
      razao_social: (mtr.destinador ?? '').trim(),
      atividade: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.atividade,
      cnpj: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.cnpj,
      ie: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.ie,
      endereco: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.endereco,
      municipio: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.municipio,
      bairro: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.bairro,
      cep: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.cep,
      estado: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.estado,
      telefone: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.telefone,
    }
    d = { ...d, destinatario: preencherCamposVazios(d.destinatario, padDest) }
  }

  const mot = (d.transportador.motorista || motoristaColeta || '').trim()
  const plc = (d.transportador.placa || placaColeta || '').trim()
  d = { ...d, transportador: { ...d.transportador, motorista: mot, placa: plc } }

  if (!d.transportador.razao_social.trim() && (mtr.transportador ?? '').trim()) {
    d = {
      ...d,
      transportador: { ...d.transportador, razao_social: mtr.transportador.trim() },
    }
  }
  if (!d.destinatario.razao_social.trim() && (mtr.destinador ?? '').trim()) {
    d = {
      ...d,
      destinatario: { ...d.destinatario, razao_social: mtr.destinador.trim() },
    }
  }

  const telDisc =
    d.conformidade.telefone_discrepancias.trim() ||
    d.gerador.telefone.trim() ||
    d.transportador.telefones_gerais.trim() ||
    d.transportador.telefone.trim()
  d = {
    ...d,
    conformidade: { ...d.conformidade, telefone_discrepancias: telDisc },
  }

  return d
}

function avisosImpressaoMtr(mtr: MTR, d: MTRDetalhes): string[] {
  const f: string[] = []
  if (!mtr.numero?.trim()) f.push('Número da MTR')
  if (!(mtr.cidade ?? '').trim() && !cidadeCompletaGeradorParaGravar('', d.gerador).trim()) {
    f.push('Cidade do gerador (município/UF)')
  }
  if (!mtr.gerador?.trim()) f.push('Razão social (Gerador)')
  if (!(mtr.endereco ?? '').trim() && !(mtr.cidade ?? '').trim() && !(d.gerador.cep ?? '').trim()) {
    f.push('Endereço de coleta ou município')
  }
  if (!(mtr.tipo_residuo ?? '').trim() && !(d.residuo.caracterizacao ?? '').trim()) {
    f.push('Descrição / caracterização dos resíduos')
  }
  if (!(mtr.transportador ?? '').trim()) f.push('Transportador')
  if (!(mtr.destinador ?? '').trim()) f.push('Destinatário')
  if (!(d.gerador.cnpj ?? '').trim()) f.push('CNPJ do gerador')
  return f
}

function etiquetaEtapaColeta(c: Coleta | null | undefined) {
  if (!c) return '-'
  const e = normalizarEtapaColeta({
    fluxo_status: c.fluxo_status,
    etapa_operacional: c.etapa_operacional,
  })
  const macro = formatarFaseFluxoOficialParaUI(e)
  const det = formatarEtapaParaUI(e)
  return det === macro ? macro : `${macro} (${det})`
}

function classeEtapaColeta(c: Coleta | null | undefined) {
  if (!c) return 'flow-badge flow-gray'
  const e = normalizarEtapaColeta({
    fluxo_status: c.fluxo_status,
    etapa_operacional: c.etapa_operacional,
  })
  const i = indiceEtapaFluxo(e)
  if (i >= 16) return 'flow-badge flow-green'
  if (i >= 8) return 'flow-badge flow-blue'
  if (i >= 4) return 'flow-badge flow-yellow'
  return 'flow-badge flow-gray'
}

function getProgramacaoLabel(programacao: Programacao) {
  const numero = programacao.numero?.trim() || 'Sem número'
  const cliente = programacao.cliente?.trim() || 'Sem cliente'
  const data = formatDate(programacao.data_programada)
  return `${numero} - ${cliente} - ${data}`
}

function buildSupabaseErrorMessage(error: SupabaseErrorLike | null | undefined) {
  if (!error) return 'Erro desconhecido ao salvar.'

  const parts = [
    error.message || '',
    error.details ? `Detalhes: ${error.details}` : '',
    error.hint ? `Dica: ${error.hint}` : '',
    error.code ? `Código: ${error.code}` : '',
  ].filter(Boolean)

  return parts.join('\n')
}

function resolverMtrContexto(
  mtrs: MTR[],
  coletas: Coleta[],
  programacaoMap: Map<string, Programacao>,
  mtrMapByProgramacaoId: Map<string, MTR>,
  ids: {
    mtr: string | null
    coleta: string | null
    programacao: string | null
    cliente: string | null
  }
): MTR | null {
  if (ids.mtr) {
    const found = mtrs.find((m) => m.id === ids.mtr)
    if (found) return found
  }
  if (ids.coleta) {
    const c = coletas.find((x) => x.id === ids.coleta)
    if (c?.mtr_id) {
      const byMtr = mtrs.find((m) => m.id === c.mtr_id)
      if (byMtr) return byMtr
    }
    if (c?.programacao_id) {
      const byProg = mtrMapByProgramacaoId.get(c.programacao_id)
      if (byProg) return byProg
    }
  }
  if (ids.programacao) {
    const byProg = mtrMapByProgramacaoId.get(ids.programacao)
    if (byProg) return byProg
  }
  if (ids.cliente) {
    for (const m of mtrs) {
      if (!m.programacao_id) continue
      const p = programacaoMap.get(m.programacao_id)
      if (p?.cliente_id === ids.cliente) return m
    }
  }
  return null
}

const MTR_ATIVIDADE_SUGESTOES = [
  'Industrial',
  'Comercial',
  'Serviços',
  'Residencial',
  'Construção civil',
  'Hospitalar',
  'Automotivo',
  'Agrossilvipastoril',
]

export default function MTR() {
  const [searchParams, setSearchParams] = useSearchParams()

  const urlMtrId = searchParams.get('mtr')
  const urlColetaId = searchParams.get('coleta')
  const urlProgramacaoId = searchParams.get('programacao')
  const urlClienteId = searchParams.get('cliente')

  const prevContextoUrlKeyRef = useRef<string>('')

  const [mtrs, setMtrs] = useState<MTR[]>([])
  const [programacoes, setProgramacoes] = useState<Programacao[]>([])
  const [coletas, setColetas] = useState<Coleta[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedMTR, setSelectedMTR] = useState<MTR | null>(null)

  const [form, setForm] = useState<MTRFormState>(emptyForm)
  const [usuarioCargo, setUsuarioCargo] = useState<string | null>(null)
  const [usuarioNome, setUsuarioNome] = useState<string | null>(null)
  const [mtrEdicaoCreatedAtIso, setMtrEdicaoCreatedAtIso] = useState('')
  const [mtrDevCriadoPorNome, setMtrDevCriadoPorNome] = useState('')
  const [caminhoesPlacas, setCaminhoesPlacas] = useState<Array<{ id: string; placa: string }>>([])

  const mtrUiDraft = useMemo(
    () => ({
      showForm,
      editingId,
      form,
      selectedMTR,
      sp: searchParams.toString(),
    }),
    [showForm, editingId, form, selectedMTR, searchParams]
  )

  useSessionObjectDraft({
    cacheKey: 'mtr',
    debounceMs: 200,
    data: mtrUiDraft,
    onRestore: (d) => {
      setShowForm(d.showForm)
      setEditingId(d.editingId)
      setForm(d.form)
      setSelectedMTR(d.selectedMTR)
      setSearchParams(new URLSearchParams(d.sp), { replace: true })
    },
  })

  const podeMutarMtr = cargoPodeEditarMtr(usuarioCargo)

  const loadDataGenRef = useRef(0)
  const programacaoChangeGenRef = useRef(0)

  function resetForm() {
    setForm({
      ...emptyForm,
      numero: generateMTRNumber(),
      data_emissao: new Date().toISOString().slice(0, 10),
      detalhes: detalhesVazios(),
    })
    setEditingId(null)
    setMtrEdicaoCreatedAtIso('')
    setMtrDevCriadoPorNome('')
  }

  async function loadData() {
    const gen = ++loadDataGenRef.current
    setLoading(true)

    const [mtrsRes, programacoesRes, coletasRes] = await Promise.all([
      supabase
        .from('mtrs')
        .select(
          'id, numero, programacao_id, cliente, gerador, endereco, cidade, tipo_residuo, quantidade, unidade, destinador, transportador, detalhes, data_emissao, observacoes, status, created_at, criado_por_nome, criado_por_user_id'
        )
        .order('created_at', { ascending: false })
        .limit(300),
      (async () => {
        // Supabase PostgREST devolve no máximo 1000 linhas por chamada.
        // Com coletas fixas semanais geradas, pode haver milhares de programações.
        // Paginamos em blocos de 1000 e filtramos os últimos 12 meses + futuro.
        const dataLimite = new Date()
        dataLimite.setMonth(dataLimite.getMonth() - 12)
        const dataLimiteStr = dataLimite.toISOString().slice(0, 10)

        const PROG_PAGE = 1000
        const acc: Programacao[] = []
        for (let from = 0; from < 10000; from += PROG_PAGE) {
          const { data, error } = await supabase
            .from('programacoes')
            .select(
              'id, numero, cliente_id, cliente, data_programada, tipo_caminhao, tipo_servico, observacoes, coleta_fixa, frequencia, periodicidade, status_programacao, created_at, criado_por_nome, criado_por_user_id'
            )
            .neq('status_programacao', 'CANCELADA')
            .gte('data_programada', dataLimiteStr)
            .order('data_programada', { ascending: false })
            .range(from, from + PROG_PAGE - 1)
          if (error) return { data: acc, error }
          acc.push(...((data || []) as Programacao[]))
          if ((data || []).length < PROG_PAGE) break
        }
        return { data: acc, error: null }
      })(),
      supabase
        .from('coletas')
        .select(
          'id, numero, cliente, etapa_operacional, fluxo_status, status_processo, mtr_id, programacao_id, motorista, motorista_nome, placa, tipo_residuo'
        )
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (gen !== loadDataGenRef.current) return

    const alertarSeCritico = (titulo: string, err: typeof mtrsRes.error) => {
      if (!err) return
      if (isBenignSupabaseFetchError(err)) {
        if (import.meta.env.DEV) {
          console.debug(`[MTR] ${titulo} (ignorado):`, err.message ?? err)
        }
        return
      }
      alert(`${titulo}\n${buildSupabaseErrorMessage(err)}`)
    }

    if (mtrsRes.error) {
      alertarSeCritico('Erro ao carregar MTRs:', mtrsRes.error)
    } else {
      const rawMtrs = (mtrsRes.data || []) as MTR[]
      const idsAutorSemNome = rawMtrs
        .filter((m) => !(m.criado_por_nome || '').trim() && (m.criado_por_user_id || '').trim())
        .map((m) => m.criado_por_user_id as string)
      const nomePorUsuarioId = await montarMapNomeExibicaoPorUsuarioId(supabase, idsAutorSemNome)
      setMtrs(
        rawMtrs.map((m) => ({
          ...m,
          criado_por_nome:
            (m.criado_por_nome || '').trim() ||
            nomePorUsuarioId.get(String(m.criado_por_user_id || '').trim()) ||
            null,
        }))
      )
    }

    if (programacoesRes.error) {
      alertarSeCritico('Erro ao carregar programações:', programacoesRes.error)
    } else {
      setProgramacoes((programacoesRes.data || []) as Programacao[])
    }

    if (coletasRes.error) {
      alertarSeCritico('Erro ao carregar coletas:', coletasRes.error)
    } else {
      setColetas((coletasRes.data || []) as Coleta[])
    }

    setLoading(false)
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadData()
    })
  }, [])

  useEffect(() => {
    void supabase
      .from('caminhoes')
      .select('id, placa')
      .order('placa', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          if (import.meta.env.DEV) {
            console.debug('[MTR] caminhões (lista placas):', error.message)
          }
          return
        }
        const rows = ((data ?? []) as Array<{ id: string; placa: string | null }>).filter((r) =>
          (r.placa ?? '').trim()
        )
        setCaminhoesPlacas(rows.map((r) => ({ id: String(r.id), placa: String(r.placa).trim() })))
      })
  }, [])

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
        .select('cargo, nome')
        .eq('id', user.id)
        .maybeSingle()
      setUsuarioCargo(data?.cargo ?? null)
      setUsuarioNome(data?.nome ?? null)
    }
    void carregarCargo()
  }, [])

  /** Só limpa o formulário quando o utilizador fecha o painel — não na montagem inicial (senão apaga o rascunho restaurado). */
  const mtrFormEstavaAbertoRef = useRef(false)
  useEffect(() => {
    const formAberto = showForm || editingId != null
    const estavaAberto = mtrFormEstavaAbertoRef.current
    mtrFormEstavaAbertoRef.current = formAberto
    if (estavaAberto && !formAberto) {
      queueMicrotask(() => {
        resetForm()
      })
    }
  }, [showForm, editingId])

  const mtrMapByProgramacaoId = useMemo(() => {
    const map = new Map<string, MTR>()
    mtrs.forEach((item) => {
      if (item.programacao_id) {
        map.set(item.programacao_id, item)
      }
    })
    return map
  }, [mtrs])

  const coletaMapByMtrId = useMemo(() => {
    const map = new Map<string, Coleta>()
    coletas.forEach((item) => {
      if (item.mtr_id) {
        map.set(item.mtr_id, item)
      }
    })
    return map
  }, [coletas])

  const programacaoMap = useMemo(() => {
    const map = new Map<string, Programacao>()
    programacoes.forEach((item) => {
      map.set(item.id, item)
    })
    return map
  }, [programacoes])

  const temParametrosContexto = !!(
    urlMtrId ||
    urlColetaId ||
    urlProgramacaoId ||
    urlClienteId
  )

  const itemContextoResolvido = useMemo(
    () =>
      resolverMtrContexto(mtrs, coletas, programacaoMap, mtrMapByProgramacaoId, {
        mtr: urlMtrId,
        coleta: urlColetaId,
        programacao: urlProgramacaoId,
        cliente: urlClienteId,
      }),
    [
      mtrs,
      coletas,
      programacaoMap,
      mtrMapByProgramacaoId,
      urlMtrId,
      urlColetaId,
      urlProgramacaoId,
      urlClienteId,
    ]
  )

  function limparContextoUrl() {
    setSearchParams({}, { replace: true })
    prevContextoUrlKeyRef.current = ''
  }

  useEffect(() => {
    if (loading) return

    if (!temParametrosContexto) {
      prevContextoUrlKeyRef.current = ''
      return
    }

    const target = resolverMtrContexto(mtrs, coletas, programacaoMap, mtrMapByProgramacaoId, {
      mtr: urlMtrId,
      coleta: urlColetaId,
      programacao: urlProgramacaoId,
      cliente: urlClienteId,
    })

    const urlKey = [urlMtrId, urlColetaId, urlProgramacaoId, urlClienteId].join('|')

    if (!target) {
      prevContextoUrlKeyRef.current = urlKey
      return
    }

    if (prevContextoUrlKeyRef.current === urlKey && selectedMTR?.id === target.id) {
      return
    }

    prevContextoUrlKeyRef.current = urlKey
    queueMicrotask(() => {
      setSelectedMTR(target)
    })

    const id = target.id
    window.setTimeout(() => {
      document.getElementById(`mtr-row-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 160)
  }, [
    loading,
    mtrs,
    coletas,
    programacaoMap,
    mtrMapByProgramacaoId,
    temParametrosContexto,
    urlMtrId,
    urlColetaId,
    urlProgramacaoId,
    urlClienteId,
    selectedMTR?.id,
  ])

  function openNewForm() {
    if (!podeMutarMtr) {
      alert('Seu perfil não pode criar MTR. Apenas operacional ou administrador.')
      return
    }
    resetForm()
    setShowForm(true)
  }

  function openEditForm(item: MTR) {
    if (!podeMutarMtr) {
      alert('Seu perfil não pode editar MTR. Apenas operacional ou administrador.')
      return
    }
    setEditingId(item.id)
    setMtrEdicaoCreatedAtIso(item.created_at || '')
    setMtrDevCriadoPorNome(item.criado_por_nome || '')
    setForm({
      numero: item.numero || '',
      programacao_id: item.programacao_id || null,
      cliente: item.cliente || '',
      gerador: item.gerador || '',
      endereco: item.endereco || '',
      cidade: item.cidade || '',
      tipo_residuo: item.tipo_residuo || '',
      quantidade: item.quantidade ?? null,
      unidade: item.unidade || 'kg',
      destinador: item.destinador || '',
      transportador: item.transportador || 'RG Ambiental',
      detalhes: mergeMtrDetalhesProfundo(item.detalhes ?? null),
      data_emissao: item.data_emissao || new Date().toISOString().slice(0, 10),
      observacoes: item.observacoes || '',
    })
    setShowForm(true)
  }

  async function handleProgramacaoChange(programacaoIdSelecionada: string) {
    const programacao = programacoes.find((item) => item.id === programacaoIdSelecionada)

    if (!programacao) {
      setForm((prev) => ({
        ...prev,
        programacao_id: null,
        cliente: '',
        gerador: '',
        tipo_residuo: '',
        observacoes: '',
        endereco: '',
        cidade: '',
        quantidade: null,
        data_emissao: new Date().toISOString().slice(0, 10),
        detalhes: detalhesVazios(),
      }))
      return
    }

    const linked = mtrMapByProgramacaoId.get(programacao.id)
    if (linked && !(editingId && linked.id === editingId)) {
      const ok = window.confirm(
        `Esta programação já possui uma MTR vinculada (${linked.numero}).\n\nDeseja abrir a MTR existente?`
      )
      if (ok) {
        setSelectedMTR(linked)
        setShowForm(false)
      }
      return
    }

    const gen = ++programacaoChangeGenRef.current

    const frequencia = programacao.frequencia || programacao.periodicidade || ''

    const observacaoProgramacao = [
      programacao.coleta_fixa
        ? `COLETA FIXA: SIM${frequencia ? ` | FREQUÊNCIA: ${frequencia}` : ''}`
        : '',
      programacao.tipo_caminhao ? `TIPO CAMINHÃO: ${programacao.tipo_caminhao}` : '',
      programacao.observacoes || '',
    ]
      .filter(Boolean)
      .join(' | ')

    const dataEmissao =
      dataProgramacaoParaEmissao(programacao.data_programada) ||
      new Date().toISOString().slice(0, 10)

    setForm((prev) => ({
      ...prev,
      programacao_id: programacao.id,
      cliente: programacao.cliente || '',
      gerador: programacao.cliente || '',
      tipo_residuo: programacao.tipo_servico || '',
      observacoes: observacaoProgramacao,
      data_emissao: dataEmissao,
      endereco: '',
      cidade: '',
      detalhes: detalhesVazios(),
    }))

    const clienteId = programacao.cliente_id?.trim()
    if (!clienteId) return

    const { data: clienteRow, error } = await supabase
      .from('clientes')
      .select(
        'nome, razao_social, cnpj, cep, rua, numero, complemento, bairro, cidade, estado, endereco_coleta, responsavel_nome, telefone, tipo_residuo, unidade_medida, classificacao, licenca_numero, destino, mtr_destino, residuo_destino, observacoes_operacionais, observacoes_gerais, link_google_maps, descricao_veiculo, mtr_coleta'
      )
      .eq('id', clienteId)
      .maybeSingle()

    if (gen !== programacaoChangeGenRef.current) return
    if (error || !clienteRow) {
      if (import.meta.env.DEV && error) {
        console.debug('[MTR] Autofill cliente:', error.message)
      }
      return
    }

    const row = clienteRow as ClienteRowAutofill

    setForm((prev) => {
      if (prev.programacao_id !== programacao.id) return prev
      const dz = detalhesVazios()
      const unidade = (row.unidade_medida ?? '').trim()
      const atividadeGerador =
        (row.classificacao ?? '').trim() ||
        (programacao.tipo_servico ?? '').trim() ||
        (row.observacoes_operacionais ?? '').trim().slice(0, 120) ||
        (row.observacoes_gerais ?? '').trim().slice(0, 120) ||
        dz.gerador.atividade
      const obsExtrasCliente = [row.observacoes_gerais, row.link_google_maps]
        .map((s) => (s ?? '').trim())
        .filter(Boolean)
      const observacoesMescladas = [prev.observacoes?.trim(), ...obsExtrasCliente].filter(Boolean).join(' | ')
      const destinoTxt = (row.destino ?? '').trim()
      const transportNome = (prev.transportador ?? '').trim()
      let transportadorDet = {
        ...dz.transportador,
        ...(prev.detalhes?.transportador || {}),
      }
      if (nomeIndicaRgAmbiental(transportNome)) {
        transportadorDet = preencherCamposVazios(
          transportadorDet,
          TRANSPORTADOR_RG_AMBIENTAL_PADRAO as unknown as Partial<MTRDetalhes['transportador']>
        )
      }
      let destinatarioDet = {
        ...dz.destinatario,
        ...(prev.detalhes?.destinatario || {}),
      }
      if (destinoTxt && nomeIndicaRgAmbiental(destinoTxt)) {
        destinatarioDet = preencherCamposVazios(
          destinatarioDet,
          {
            atividade: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.atividade,
            cnpj: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.cnpj,
            ie: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.ie,
            endereco: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.endereco,
            municipio: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.municipio,
            bairro: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.bairro,
            cep: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.cep,
            estado: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.estado,
            telefone: TRANSPORTADOR_RG_AMBIENTAL_PADRAO.telefone,
          } as Partial<MTRDetalhes['destinatario']>
        )
      }
      const telGer = (row.telefone ?? '').trim()
      return {
        ...prev,
        observacoes: observacoesMescladas,
        gerador: nomeGeradorParaMtr(row, prev.cliente),
        endereco: montarEnderecoLinhaCliente(row),
        cidade: montarCidadeUfCliente(row),
        destinador: destinoTxt || prev.destinador,
        tipo_residuo:
          (prev.tipo_residuo || '').trim() || (row.tipo_residuo ?? '').trim() || prev.tipo_residuo,
        unidade: unidade || prev.unidade,
        detalhes: {
          ...dz,
          ...prev.detalhes,
          gerador: {
            ...dz.gerador,
            ...(prev.detalhes?.gerador || {}),
            atividade: (prev.detalhes?.gerador?.atividade ?? '').trim() || atividadeGerador,
            cnpj: (row.cnpj ?? '').trim() || dz.gerador.cnpj,
            cadri: (row.licenca_numero ?? '').trim() || dz.gerador.cadri,
            responsavel: (row.responsavel_nome ?? '').trim() || dz.gerador.responsavel,
            telefone: telGer || dz.gerador.telefone,
            bairro: (row.bairro ?? '').trim() || dz.gerador.bairro,
            cep: (row.cep ?? '').trim() || dz.gerador.cep,
            estado: (row.estado ?? '').trim() || dz.gerador.estado,
            cidade:
              (row.cidade ?? '').trim() ||
              (prev.detalhes?.gerador?.cidade ?? '').trim() ||
              dz.gerador.cidade,
          },
          residuo: {
            ...dz.residuo,
            ...(prev.detalhes?.residuo || {}),
            fonte_origem:
              (prev.detalhes?.residuo?.fonte_origem ?? '').trim() || dz.residuo.fonte_origem || 'Industrial',
            caracterizacao:
              (prev.detalhes?.residuo?.caracterizacao ?? '').trim() ||
              (row.classificacao ?? '').trim() ||
              (row.tipo_residuo ?? '').trim() ||
              dz.residuo.caracterizacao,
            acondicionamento:
              (prev.detalhes?.residuo?.acondicionamento ?? '').trim() ||
              (programacao.tipo_caminhao ?? '').trim() ||
              (row.descricao_veiculo ?? '').trim() ||
              dz.residuo.acondicionamento,
          },
          transportador: transportadorDet,
          destinatario: {
            ...destinatarioDet,
            atividade:
              (prev.detalhes?.destinatario?.atividade ?? '').trim() ||
              (row.residuo_destino ?? '').trim() ||
              destinatarioDet.atividade,
            lo: (prev.detalhes?.destinatario?.lo ?? '').trim() || (row.mtr_destino ?? '').trim() || destinatarioDet.lo,
          },
          conformidade: {
            ...dz.conformidade,
            ...(prev.detalhes?.conformidade || {}),
            telefone_discrepancias:
              (prev.detalhes?.conformidade?.telefone_discrepancias ?? '').trim() || telGer || dz.conformidade.telefone_discrepancias,
          },
          blocos: {
            ...dz.blocos,
            ...(prev.detalhes?.blocos || {}),
            descricoes_adicionais_residuos:
              (prev.detalhes?.blocos?.descricoes_adicionais_residuos ?? '').trim() ||
              (row.mtr_coleta ?? '').trim() ||
              dz.blocos.descricoes_adicionais_residuos,
            instrucoes_manuseio:
              (prev.detalhes?.blocos?.instrucoes_manuseio ?? '').trim() || dz.blocos.instrucoes_manuseio,
          },
        },
      }
    })
  }

  function getDuplicateMTRForSelectedProgramacao() {
    if (!form.programacao_id) return null

    const linkedMTR = mtrMapByProgramacaoId.get(form.programacao_id)
    if (!linkedMTR) return null

    if (editingId && linkedMTR.id === editingId) return null

    return linkedMTR
  }

  async function updateProgramacaoStatusAfterMTR(programacaoId: string) {
    const programacao = programacaoMap.get(programacaoId)
    if (!programacao) return

    if (programacao.status_programacao === 'PENDENTE') {
      await supabase
        .from('programacoes')
        .update({ status_programacao: 'QUADRO_ATUALIZADO' })
        .eq('id', programacaoId)
    }
  }

  async function updateColetasStatusAfterMTR(programacaoId: string) {
    try {
      const { data, error } = await supabase
        .from('coletas')
        .select('id, fluxo_status, etapa_operacional')
        .eq('programacao_id', programacaoId)
        .limit(50)

      if (error) throw error

      const rows = (data || []) as Array<{
        id: string
        fluxo_status?: string | null
        etapa_operacional?: string | null
      }>

      if (rows.length === 0) return

      const alvo = 'MTR_PREENCHIDA'
      const alvoI = indiceEtapaFluxo(alvo)

      for (const r of rows) {
        const e = normalizarEtapaColeta({
          fluxo_status: r.fluxo_status,
          etapa_operacional: r.etapa_operacional,
        })
        if (indiceEtapaFluxo(e) >= alvoI) continue

        const { error: uErr } = await supabase
          .from('coletas')
          .update({
            fluxo_status: alvo,
            etapa_operacional: alvo,
            status_processo: 'MTR',
            liberado_financeiro: false,
          })
          .eq('id', r.id)
        if (uErr) console.warn('update coletas after MTR', uErr.message)
      }
    } catch (e) {
      console.warn('updateColetasStatusAfterMTR', e)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()

    if (!podeMutarMtr) {
      alert('Seu perfil não pode salvar MTR. Apenas operacional ou administrador.')
      return
    }

    if (!form.numero.trim()) {
      alert('Preencha o número da MTR.')
      return
    }

    if (!form.programacao_id) {
      alert('Selecione a programação vinculada.')
      return
    }

    const selectedProgramacao = programacaoMap.get(form.programacao_id)

    if (!selectedProgramacao) {
      alert('A programação selecionada não foi encontrada.')
      return
    }

    const duplicateMTR = getDuplicateMTRForSelectedProgramacao()
    if (duplicateMTR) {
      alert(`Esta programação já possui uma MTR vinculada: ${duplicateMTR.numero}`)
      return
    }

    if (!form.cliente.trim()) {
      alert('Preencha o cliente.')
      return
    }

    if (!form.gerador.trim()) {
      alert('Preencha o gerador.')
      return
    }

    if (!form.tipo_residuo.trim()) {
      alert('Preencha o tipo de resíduo.')
      return
    }

    if (form.quantidade !== null && form.quantidade !== undefined) {
      if (Number.isNaN(Number(form.quantidade)) || Number(form.quantidade) < 0) {
        alert('Se informar quantidade, use um valor numérico válido (≥ 0).')
        return
      }
    }

    if (!form.destinador.trim()) {
      alert('Preencha o destinador.')
      return
    }

    if (!form.transportador.trim()) {
      alert('Preencha o transportador.')
      return
    }

    const detBasePrev = form.detalhes ?? detalhesVazios()
    if (!cidadeCompletaGeradorParaGravar(form.cidade, detBasePrev.gerador).trim()) {
      alert('Preencha a cidade do gerador (município e UF nos campos do layout, ou cidade no topo do formulário).')
      return
    }

    if (!form.data_emissao) {
      alert('Preencha a data de emissão.')
      return
    }

    setSaving(true)

    const qtd =
      form.quantidade === null || form.quantidade === undefined
        ? null
        : Number(form.quantidade)

    const detBase = form.detalhes ?? detalhesVazios()
    const cidadeSalvar = cidadeCompletaGeradorParaGravar(form.cidade, detBase.gerador)
    const detalhesGravar: MTRDetalhes = {
      ...detBase,
      gerador: { ...detBase.gerador },
    }

    const payload: Record<string, unknown> = {
      numero: form.numero.trim(),
      programacao_id: form.programacao_id,
      cliente: form.cliente.trim(),
      gerador: form.gerador.trim(),
      endereco: form.endereco.trim(),
      cidade: cidadeSalvar,
      tipo_residuo: form.tipo_residuo.trim(),
      quantidade: qtd,
      unidade: form.unidade.trim() || '',
      destinador: form.destinador.trim(),
      transportador: form.transportador.trim(),
      detalhes: detalhesGravar,
      data_emissao: form.data_emissao,
      observacoes: form.observacoes.trim(),
      /** Fluxo único: documento salvo é tratado como emitido (sem gestão de status na UI). */
      status: 'Emitido' as MTRStatus,
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!editingId) {
      let nomeLancador = (usuarioNome ?? '').trim()
      if (user && !nomeLancador) {
        const { data: rowU } = await supabase.from('usuarios').select('nome').eq('id', user.id).maybeSingle()
        nomeLancador = (rowU?.nome ?? '').trim()
      }
      if (!nomeLancador && user?.email) nomeLancador = user.email.trim()
      payload.criado_por_user_id = user?.id ?? null
      payload.criado_por_nome = nomeLancador || null
    } else if (cargoEhDesenvolvedor(usuarioCargo)) {
      payload.criado_por_nome = mtrDevCriadoPorNome.trim() || null
    }

    let error: SupabaseErrorLike | null = null

    if (editingId) {
      const response = await supabase.from('mtrs').update(payload).eq('id', editingId)
      error = response.error
      if (error && errorIndicaColunaInexistente(error, 'detalhes')) {
        const { detalhes, ...payloadSemDetalhes } = payload
        void detalhes
        const retry = await supabase.from('mtrs').update(payloadSemDetalhes).eq('id', editingId)
        error = retry.error
        if (!error) {
          alert(
            "MTR salva, mas o Supabase ainda não tem a coluna 'mtrs.detalhes'.\n\nAplique a migração `20260408133000_mtrs_detalhes_jsonb.sql` no Supabase para gravar os campos do modelo (Gerador/Resíduo/Transportador/Destinatário)."
          )
        }
      }
    } else {
      const response = await supabase.from('mtrs').insert([payload])
      error = response.error
      if (error && errorIndicaColunaInexistente(error, 'detalhes')) {
        const { detalhes, ...payloadSemDetalhes } = payload
        void detalhes
        const retry = await supabase.from('mtrs').insert([payloadSemDetalhes])
        error = retry.error
        if (!error) {
          alert(
            "MTR salva, mas o Supabase ainda não tem a coluna 'mtrs.detalhes'.\n\nAplique a migração `20260408133000_mtrs_detalhes_jsonb.sql` no Supabase para gravar os campos do modelo (Gerador/Resíduo/Transportador/Destinatário)."
          )
        }
      }
    }

    if (error) {
      setSaving(false)
      alert(`Erro ao salvar MTR:\n${buildSupabaseErrorMessage(error)}`)
      return
    }

    await updateProgramacaoStatusAfterMTR(form.programacao_id)
    await updateColetasStatusAfterMTR(form.programacao_id)

    setSaving(false)
    alert(editingId ? 'MTR atualizada com sucesso.' : 'MTR criada com sucesso.')
    setShowForm(false)
    resetForm()
    await loadData()
  }

  async function handleDelete(item: MTR) {
    if (!podeMutarMtr) {
      alert('Seu perfil não pode remover MTR. Apenas operacional ou administrador.')
      return
    }

    const coletaIds = coletas.filter((c) => c.mtr_id === item.id).map((c) => c.id)
    const temColeta = coletaIds.length > 0

    const msgConfirm = temColeta
      ? `Remover a MTR ${item.numero} e ${coletaIds.length} coleta(s) vinculada(s)?\n\nIsso apaga checklist, ticket, aprovação, faturamento e desvincula programação e controle de massa quando aplicável.`
      : `Deseja realmente remover a MTR ${item.numero}?`

    if (!window.confirm(msgConfirm)) return

    if (temColeta) {
      const excluiu = await handleDeleteColetasDaMtr(item.id, {
        skipConfirm: true,
        suppressSuccessAlert: true,
      })
      if (!excluiu) return
    }

    const { error } = await supabase.from('mtrs').delete().eq('id', item.id)

    if (error) {
      alert(`Erro ao remover MTR:\n${buildSupabaseErrorMessage(error)}`)
      return
    }

    if (item.programacao_id) {
      await supabase
        .from('programacoes')
        .update({ status_programacao: 'PENDENTE' })
        .eq('id', item.programacao_id)
    }

    if (selectedMTR?.id === item.id) {
      setSelectedMTR(null)
    }

    alert(
      temColeta
        ? 'MTR e coleta(s) vinculadas foram removidas com sucesso.'
        : 'MTR removida com sucesso.'
    )
    await loadData()
  }

  async function handleDeleteColetasDaMtr(
    mtrId: string,
    opts?: { skipConfirm?: boolean; suppressSuccessAlert?: boolean }
  ): Promise<boolean> {
    if (!podeMutarMtr) {
      alert('Seu perfil não pode excluir coletas. Apenas operacional ou administrador.')
      return false
    }

    const ids = coletas.filter((c) => c.mtr_id === mtrId).map((c) => c.id)
    if (ids.length === 0) {
      await loadData()
      return true
    }

    if (!opts?.skipConfirm) {
      const ok = window.confirm(
        `Serão excluídas ${ids.length} coleta(s) vinculada(s) a esta MTR.\n\nDeseja continuar?`
      )
      if (!ok) return false
    }

    for (const coletaId of ids) {
      // Desvincular vínculos mais comuns (best-effort).
      try {
        await supabase.from('programacoes').update({ coleta_id: null }).eq('coleta_id', coletaId)
      } catch {
        /* ignore */
      }
      try {
        await supabase.from('controle_massa').update({ coleta_id: null }).eq('coleta_id', coletaId)
      } catch {
        /* ignore */
      }

      const { error } = await supabase.from('coletas').delete().eq('id', coletaId)
      if (error) {
        alert(`Erro ao excluir coleta:\n${buildSupabaseErrorMessage(error)}`)
        await loadData()
        return false
      }
    }

    setColetas((prev) => prev.filter((c) => c.mtr_id !== mtrId))
    await loadData()
    if (!opts?.suppressSuccessAlert) {
      alert('Coleta(s) excluída(s) com sucesso.')
    }
    return true
  }

  function closeForm() {
    setShowForm(false)
    resetForm()
  }

  function handlePrint() {
    if (!selectedMTR) return
    if (avisosImpressao.length > 0) {
      const ok = window.confirm(
        `O manifesto ainda não está completo para impressão ideal. Itens a rever: ${avisosImpressao.join('; ')}.\n\nDeseja imprimir mesmo assim?`
      )
      if (!ok) return
    }
    window.print()
  }

  const totalVinculadas = mtrs.filter((item) => !!item.programacao_id).length

  const selectedProgramacao = selectedMTR?.programacao_id
    ? programacaoMap.get(selectedMTR.programacao_id)
    : null

  const selectedColeta = selectedMTR ? coletaMapByMtrId.get(selectedMTR.id) : null
  const duplicateMTR = getDuplicateMTRForSelectedProgramacao()

  const detalhesMtrSelecionada = useMemo(() => {
    if (!selectedMTR) return null
    const coleta = coletaMapByMtrId.get(selectedMTR.id)
    const mot = coleta?.motorista_nome || coleta?.motorista || ''
    const placa = coleta?.placa || ''
    const prog = selectedMTR.programacao_id ? programacaoMap.get(selectedMTR.programacao_id) : null
    return mergeDetalhesParaDocumento(selectedMTR, mot, placa, { tipoCaminhao: prog?.tipo_caminhao })
  }, [selectedMTR, coletaMapByMtrId, programacaoMap])

  const avisosImpressao = useMemo(() => {
    if (!selectedMTR || !detalhesMtrSelecionada) return []
    return avisosImpressaoMtr(selectedMTR, detalhesMtrSelecionada)
  }, [selectedMTR, detalhesMtrSelecionada])

  return (
    <MainLayout>
      <style>{`
        .mtr-page {
          padding: 28px;
          min-height: 100%;
          background: linear-gradient(180deg, #eef3f9 0%, #f7fafc 100%);
        }

        .mtr-topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }

        .mtr-topbar-left h1 {
          margin: 0;
          font-size: 26px;
          line-height: 1.15;
          color: #0f172a;
          font-weight: 800;
        }

        .mtr-topbar-right {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .btn {
          border: none;
          border-radius: 12px;
          padding: 11px 16px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .btn:hover {
          transform: translateY(-1px);
        }

        .btn-primary {
          background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
          color: #ffffff;
          box-shadow: 0 10px 24px rgba(22, 163, 74, 0.18);
        }

        .btn-secondary {
          background: #1e293b;
          color: #ffffff;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.16);
        }

        .btn-light {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #dbe4ee;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
        }

        .mtr-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 22px;
        }

        .stat-card {
          background: #ffffff;
          border: 1px solid #e5edf5;
          border-radius: 18px;
          padding: 18px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }

        .stat-label {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          margin-bottom: 10px;
        }

        .stat-value {
          font-size: 28px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1;
        }

        .stat-help {
          margin-top: 8px;
          font-size: 13px;
          color: #64748b;
        }

        .mtr-grid {
          display: grid;
          grid-template-columns: 420px minmax(0, 1fr);
          gap: 22px;
          align-items: start;
        }

        .panel {
          background: #ffffff;
          border: 1px solid #e5edf5;
          border-radius: 22px;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }

        .panel-header {
          padding: 20px 22px 16px;
          border-bottom: 1px solid #eef3f8;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }

        .panel-header h2 {
          margin: 0;
          font-size: 22px;
          color: #0f172a;
          font-weight: 800;
        }

        .panel-header p {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 14px;
        }

        .panel-body {
          padding: 18px 20px 20px;
        }

        .mtr-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .mtr-list-item {
          border: 1px solid #e8eef5;
          border-radius: 16px;
          padding: 16px;
          background: #fbfdff;
          transition: all 0.2s ease;
        }

        .mtr-list-item:hover {
          border-color: #cfe0d3;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          transform: translateY(-1px);
        }

        .mtr-list-item.selected {
          border-color: #16a34a;
          background: linear-gradient(180deg, #f3fff7 0%, #fbfffc 100%);
          box-shadow: 0 10px 28px rgba(22, 163, 74, 0.10);
        }

        .mtr-list-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .mtr-number {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }

        .mtr-client {
          margin: 4px 0 0;
          font-size: 14px;
          color: #475569;
        }

        .mtr-meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .mtr-meta-box {
          background: #ffffff;
          border: 1px solid #edf2f7;
          border-radius: 12px;
          padding: 10px 12px;
          min-width: 0;
        }

        .mtr-meta-label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 5px;
        }

        .mtr-meta-value {
          font-size: 14px;
          color: #0f172a;
          font-weight: 700;
          line-height: 1.2;
          min-width: 0;
        }

        .table-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .mini-btn {
          border: 1px solid #d9e3ee;
          background: #ffffff;
          color: #0f172a;
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: 0.2s;
        }

        .mini-btn:hover {
          background: #f8fafc;
        }

        .mini-btn-danger {
          border-color: #fecaca;
          color: #b91c1c;
          background: #fff5f5;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 7px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .status-rascunho {
          background: #fff7ed;
          color: #c2410c;
          border: 1px solid #fed7aa;
        }

        .status-emitido {
          background: #f0fdf4;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }

        .status-cancelado {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .flow-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          white-space: normal;
          word-break: break-word;
          overflow-wrap: anywhere;
          text-align: center;
          width: 100%;
          max-width: 100%;
          line-height: 1.2;
          box-sizing: border-box;
        }

        .flow-green {
          background: #ecfdf5;
          color: #166534;
          border: 1px solid #bbf7d0;
        }

        .flow-blue {
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
        }

        .flow-yellow {
          background: #fffbeb;
          color: #b45309;
          border: 1px solid #fde68a;
        }

        .flow-gray {
          background: #f8fafc;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .alert-box {
          border-radius: 14px;
          padding: 12px 14px;
          margin-bottom: 14px;
          font-size: 13px;
          font-weight: 700;
        }

        .alert-warning {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
        }

        .alert-info {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
        }

        .document-wrapper {
          min-height: 780px;
          background:
            linear-gradient(180deg, rgba(22,163,74,0.04) 0%, rgba(255,255,255,0) 120px),
            #f7fafc;
          border: 1px dashed #d8e3ec;
          border-radius: 20px;
          padding: 18px;
        }

        /* Manifesto estilo planilha: aproveitar altura útil (pré-visualização). */
        .document-wrapper--mtr-excel {
          min-height: min(1100px, calc(100dvh - 240px));
        }

        .document-empty {
          min-height: 720px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px dashed #d8e3ec;
          border-radius: 18px;
          background: rgba(255,255,255,0.7);
          color: #64748b;
          font-size: 15px;
          text-align: center;
          padding: 24px;
        }

        .document-shell {
          background: #ffffff;
          border: 1px solid #dbe6ef;
          border-radius: 20px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
          overflow: hidden;
        }

        .document-green-bar {
          height: 8px;
          background: linear-gradient(90deg, #16a34a 0%, #15803d 100%);
        }

        .document-content {
          padding: 20px;
        }

        .document-top {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 230px;
          gap: 16px;
          align-items: start;
          padding-bottom: 14px;
          border-bottom: 1px solid #e5edf5;
        }

        .document-left-logo {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
          min-width: 0;
        }

        .document-left-logo img {
          width: 170px;
          height: auto;
          object-fit: contain;
          display: block;
          margin-bottom: 8px;
        }

        .document-left-subtitle {
          color: #64748b;
          font-size: 13px;
          line-height: 1.25;
          font-weight: 600;
        }

        .document-left-subtitle p {
          margin: 0;
        }

        .document-left-subtitle p + p {
          margin-top: 3px;
        }

        .document-number-box {
          border: 2px solid #16a34a;
          border-radius: 16px;
          overflow: hidden;
          background: #ffffff;
        }

        .document-number-label {
          background: linear-gradient(90deg, #16a34a 0%, #15803d 100%);
          color: #ffffff;
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 800;
          text-align: center;
          letter-spacing: 0.6px;
        }

        .document-number-value {
          padding: 14px 10px;
          font-size: 22px;
          font-weight: 900;
          text-align: center;
          color: #0f172a;
          letter-spacing: 0.2px;
          line-height: 1.05;
          word-break: break-word;
        }

        .document-meta {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 14px 0 12px;
        }

        .meta-card {
          background: #f8fbff;
          border: 1px solid #e5edf5;
          border-radius: 12px;
          padding: 10px 11px;
        }

        .meta-label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 800;
          letter-spacing: 0.4px;
          margin-bottom: 5px;
        }

        .meta-value {
          font-size: 14px;
          color: #0f172a;
          font-weight: 800;
          line-height: 1.2;
        }

        .document-body-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          align-items: start;
        }

        .document-column {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
        }

        .document-section {
          border: 1px solid #e5edf5;
          border-radius: 14px;
          overflow: hidden;
          background: #ffffff;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .document-section-title {
          background: linear-gradient(180deg, #f2fbf5 0%, #ecfdf5 100%);
          color: #166534;
          font-size: 12px;
          font-weight: 800;
          padding: 10px 12px;
          border-bottom: 1px solid #dcefe2;
          letter-spacing: 0.3px;
        }

        .document-section-body {
          padding: 10px 12px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 10px;
        }

        .document-line {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .document-line.full {
          grid-column: 1 / -1;
        }

        .line-label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 800;
          letter-spacing: 0.4px;
        }

        .line-value {
          font-size: 13px;
          color: #0f172a;
          font-weight: 700;
          word-break: break-word;
          background: #f8fafc;
          border: 1px solid #eef2f7;
          border-radius: 10px;
          padding: 8px 9px;
          min-height: 16px;
          line-height: 1.2;
        }

        .line-value.compact {
          max-height: 48px;
          overflow: hidden;
        }

        .signatures {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .signature-box {
          background: #fbfdff;
          border: 1px solid #e5edf5;
          border-radius: 12px;
          padding: 18px 10px 10px;
          text-align: center;
          min-height: 54px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .signature-line {
          border-top: 1px solid #94a3b8;
          padding-top: 7px;
          font-size: 11px;
          font-weight: 800;
          color: #334155;
          width: 100%;
        }

        .document-footer {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed #cbd5e1;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 11px;
          color: #64748b;
        }

        .mtr-modelo-pdf {
          max-width: 720px;
          margin: 0 auto;
          font-size: 13px;
          color: #0f172a;
          line-height: 1.45;
        }

        /* Pré-visualização (tela) — manter o mesmo layout da impressão */
        .mtr-excel {
          max-width: 980px;
          margin: 0 auto;
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
          font-size: 12px;
          line-height: 1.35;
          background: #fff;
        }

        .mtr-excel__header {
          display: grid;
          grid-template-columns: minmax(120px, 180px) 1fr minmax(11.5rem, 32%);
          align-items: start;
          gap: 10px 12px;
          margin-bottom: 8px;
        }

        .mtr-excel__logo img {
          max-height: 30px;
          width: auto;
        }

        .mtr-excel__title {
          text-align: center;
          font-weight: 800;
          font-size: 12px;
          align-self: center;
        }

        .mtr-excel__mtrno {
          text-align: right;
          font-size: 11px;
          align-self: center;
        }

        .mtr-excel__mtrno-label {
          font-weight: 800;
          font-size: 11px;
          color: #334155;
          margin-bottom: 2px;
        }

        .mtr-excel__mtrno-value {
          font-size: clamp(1.5rem, 3.2vw, 2rem);
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: 0.03em;
          color: #0f172a;
          border: 2px solid #0f172a;
          border-radius: 10px;
          padding: 6px 10px;
          display: inline-block;
          min-width: 5.5ch;
          text-align: center;
          box-sizing: border-box;
        }

        .mtr-excel__table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #111;
        }

        .mtr-excel__table td {
          border: 1px solid #111;
          padding: 7px 9px;
          vertical-align: top;
        }

        /* Área neutra no fim da folha: preenche espaço sem alterar o conteúdo legal acima. */
        td.mtr-excel__stretch {
          border: 1px solid #111;
          border-top: none;
          min-height: clamp(72px, 14vh, 200px);
          padding: clamp(16px, 3.5vh, 48px) 10px !important;
          vertical-align: top;
          background: #ffffff;
        }

        .mtr-excel__sec {
          font-weight: 800;
          background: #2f2f2f;
          color: #ffffff;
          letter-spacing: 0.03em;
        }

        .mtr-excel__doc-footer {
          margin-top: 10px;
          padding: 8px 4px 0;
          font-size: 9px;
          line-height: 1.35;
          color: #334155;
          text-align: center;
        }

        .mtr-excel__doc-footer-line {
          margin: 0 0 4px;
        }

        .mtr-excel__inner {
          width: 100%;
          border-collapse: collapse;
          margin: 0;
        }

        .mtr-excel__inner td {
          border: 1px solid #111;
          padding: 5px 7px;
          font-size: 11px;
        }

        .mtr-excel__k {
          font-weight: 800;
          width: 13%;
          white-space: nowrap;
        }

        .mtr-excel__v {
          font-weight: 500;
          word-break: break-word;
        }

        .mtr-excel__throw td,
        .mtr-excel__th {
          background: #111;
          color: #fff;
          font-weight: 800;
          text-align: center;
        }

        .mtr-excel__signrow {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1.2fr 0.6fr;
          gap: 12px;
          min-height: 52px;
          align-items: end;
        }

        .mtr-mp-header {
          text-align: center;
          margin-bottom: 18px;
        }

        .mtr-mp-logo {
          height: 40px;
          width: auto;
          display: block;
          margin: 0 auto 10px;
          object-fit: contain;
        }

        .mtr-mp-title {
          margin: 0 0 8px;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .mtr-mp-meta {
          margin: 4px 0 0;
          font-size: 12px;
          color: #334155;
        }

        .mtr-mp-block {
          margin-bottom: 14px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .mtr-mp-h3 {
          margin: 0 0 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #166534;
          border-bottom: 1px solid #bbf7d0;
          padding-bottom: 4px;
        }

        .mtr-mp-line {
          margin: 0 0 6px;
          font-size: 12px;
        }

        .mtr-mp-k {
          font-weight: 700;
          color: #475569;
        }

        .mtr-mp-obs {
          white-space: pre-wrap;
          min-height: 40px;
        }

        .mtr-mp-sign {
          margin-top: 20px;
          text-align: center;
          font-size: 11px;
          color: #64748b;
        }

        .mtr-mp-sign-line {
          border-bottom: 1px solid #0f172a;
          max-width: 280px;
          margin: 0 auto 6px;
          min-height: 28px;
        }

        .mtr-mp-footer {
          margin-top: 12px;
          font-size: 10px;
          color: #64748b;
          text-align: center;
        }

        .loading-box,
        .empty-state {
          border: 1px dashed #dbe4ee;
          border-radius: 16px;
          padding: 26px 18px;
          text-align: center;
          color: #64748b;
          background: #fbfdff;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          left: var(--sidebar-width);
          background: rgba(2, 6, 23, 0.60);
          backdrop-filter: blur(6px);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 28px 16px;
          overflow-y: auto;
          z-index: 1000;
        }

        .modal-card {
          width: 100%;
          max-width: 1180px;
          background: #ffffff;
          border: 1px solid #dbe4ee;
          border-radius: 24px;
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.22);
          overflow: hidden;
        }

        .modal-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          padding: 22px 24px;
          border-bottom: 1px solid #e8eef5;
          background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
        }

        .modal-head h3 {
          margin: 0;
          color: #0f172a;
          font-size: 24px;
          font-weight: 800;
        }

        .modal-head p {
          margin: 7px 0 0;
          color: #64748b;
          font-size: 14px;
        }

        .close-btn {
          background: #ffffff;
          border: 1px solid #dbe4ee;
          color: #0f172a;
          border-radius: 12px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-full {
          grid-column: 1 / -1;
        }

        .field label {
          font-size: 13px;
          font-weight: 800;
          color: #334155;
        }

        .field input,
        .field select,
        .field textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid #dbe4ee;
          background: #f8fbff;
          color: #0f172a;
          padding: 13px 14px;
          font-size: 14px;
          outline: none;
          transition: all 0.2s ease;
        }

        .field input:focus,
        .field select:focus,
        .field textarea:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.10);
          background: #ffffff;
        }

        .field textarea {
          min-height: 130px;
          resize: vertical;
        }

        .helper {
          color: #64748b;
          font-size: 12px;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          flex-wrap: wrap;
        }

        .input-inline {
          display: grid;
          grid-template-columns: 1fr 110px;
          gap: 8px;
        }

        .field-info-box {
          border-radius: 12px;
          padding: 10px 12px;
          background: #f8fbff;
          border: 1px solid #dbe4ee;
          color: #475569;
          font-size: 13px;
          line-height: 1.35;
        }

        @media (max-width: 1200px) {
          .mtr-grid {
            grid-template-columns: 1fr;
          }

          .mtr-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .document-body-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 980px) {
          .document-top {
            grid-template-columns: 1fr;
          }

          .document-left-logo {
            justify-content: flex-start;
          }

          .document-left-logo img {
            width: 150px;
          }
        }

        @media (max-width: 900px) {
          .mtr-meta {
            grid-template-columns: 1fr;
          }

          .document-meta {
            grid-template-columns: 1fr;
          }

          .document-section-body {
            grid-template-columns: 1fr;
          }

          .signatures {
            grid-template-columns: 1fr;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .mtr-page {
            padding: 16px;
          }

          .mtr-stats {
            grid-template-columns: 1fr;
          }

          .document-content {
            padding: 16px;
          }

          .document-left-logo img {
            width: 135px;
          }

          .document-left-subtitle {
            font-size: 12px;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 7mm;
          }

          html,
          body {
            width: 100% !important;
            min-height: auto !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Só o manifesto importa: esconder cromado do app (sidebar empurrava o PDF para a direita). */
          .layout-sidebar,
          .layout-header {
            display: none !important;
          }

          .layout-root {
            display: block !important;
          }

          .layout-main {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .layout-main-scroll,
          .layout-main-scroll-inner {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            max-width: 100% !important;
          }

          .mtr-context-banner {
            display: none !important;
          }

          body * {
            visibility: hidden;
          }

          .print-area,
          .print-area * {
            visibility: visible;
          }

          /* Tira o manifesto do fluxo da página (evita canto inferior direito / coluna 2 da grid). */
          .print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            margin: 0 !important;
            padding: 0 !important;
            z-index: 999999 !important;
            display: block !important;
            background: #ffffff !important;
            box-sizing: border-box !important;
          }

          .print-area .document-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-area .document-shell.mtr-modelo-pdf-shell {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }

          .print-area .document-content.mtr-modelo-pdf {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }

          .print-area .mtr-mp-logo {
            height: 34px !important;
            width: auto !important;
            display: block !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          /* Layout “planilha” (modelo MTR exemplo.xlsx) */
          .mtr-excel {
            font-family: Arial, Helvetica, sans-serif !important;
            color: #000 !important;
            font-size: 10px !important;
            line-height: 1.15 !important;
          }

          .mtr-excel__header {
            display: grid !important;
            grid-template-columns: minmax(100px, 150px) 1fr minmax(10rem, 30%) !important;
            align-items: start !important;
            gap: 6px 8px !important;
            margin-bottom: 4px !important;
          }

          .mtr-excel__logo img {
            max-height: 30px !important;
            width: auto !important;
          }

          .mtr-excel__title {
            text-align: center !important;
            font-weight: 800 !important;
            font-size: 11px !important;
            align-self: center !important;
          }

          .mtr-excel__mtrno {
            text-align: right !important;
            font-size: 9px !important;
            align-self: center !important;
          }

          .mtr-excel__mtrno-label {
            font-weight: 800 !important;
            font-size: 9px !important;
            color: #334155 !important;
            margin-bottom: 1px !important;
          }

          .mtr-excel__mtrno-value {
            font-size: 19pt !important;
            font-weight: 900 !important;
            line-height: 1 !important;
            letter-spacing: 0.04em !important;
            color: #000 !important;
            border: 2px solid #000 !important;
            border-radius: 8px !important;
            padding: 4px 8px !important;
            display: inline-block !important;
            min-width: 5.5ch !important;
            text-align: center !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .mtr-excel__table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 1px solid #111 !important;
          }

          .mtr-excel__table td {
            border: 1px solid #111 !important;
            padding: 4px 6px !important;
            vertical-align: top !important;
          }

          /* Espaço “filler” na pré-visualização — na impressão empurra assinaturas para fora da folha. */
          tr.mtr-excel__stretch-wrap {
            display: none !important;
          }

          td.mtr-excel__stretch {
            min-height: 0 !important;
            height: 0 !important;
            padding: 0 !important;
            border: none !important;
            overflow: hidden !important;
            visibility: hidden !important;
          }

          .mtr-excel__sec {
            font-weight: 800 !important;
            background: #2f2f2f !important;
            color: #ffffff !important;
            letter-spacing: 0.03em !important;
          }

          .mtr-excel__doc-footer {
            font-size: 8px !important;
            line-height: 1.25 !important;
          }

          .mtr-excel__k {
            font-weight: 800 !important;
            width: 13% !important;
            white-space: nowrap !important;
          }

          .mtr-excel__v {
            font-weight: 500 !important;
          }

          .mtr-excel__throw td,
          .mtr-excel__th {
            background: #111 !important;
            color: #fff !important;
            font-weight: 800 !important;
            text-align: center !important;
          }

          .mtr-excel__v {
            word-break: break-word !important;
          }

          .mtr-excel__inner {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          .mtr-excel__inner td {
            border: 1px solid #111 !important;
            padding: 3px 5px !important;
            font-size: 8px !important;
          }

          .mtr-excel__signrow {
            margin-top: 6px !important;
            display: grid !important;
            grid-template-columns: 1fr 1.15fr 0.55fr !important;
            gap: 6px !important;
            font-size: 8px !important;
            line-height: 1.2 !important;
          }

          tr.mtr-excel__avoid-print-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .no-print,
          .mtr-topbar,
          .mtr-stats,
          .panel:first-child,
          .alert-box {
            display: none !important;
          }

          .mtr-page,
          .mtr-page.page-shell {
            padding: 0 !important;
            background: #ffffff !important;
            min-height: auto !important;
            max-width: 100% !important;
            margin: 0 !important;
          }

          .mtr-grid {
            display: block !important;
            grid-template-columns: 1fr !important;
            gap: 0 !important;
          }

          .panel {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }

          .panel-header {
            display: none !important;
          }

          .panel-body {
            padding: 0 !important;
          }

          .document-wrapper {
            padding: 0 !important;
            background: #ffffff !important;
            border: none !important;
            min-height: auto !important;
            border-radius: 0 !important;
          }

          .document-shell {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }

          .document-green-bar {
            height: 5px !important;
          }

          /* Não limitar o modelo PDF a 720px — deve usar a largura da folha. */
          .document-content:not(.mtr-modelo-pdf) {
            padding: 10px 12px !important;
            max-width: 720px !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          .mtr-grid > .panel:last-child {
            width: 100% !important;
            max-width: 100% !important;
          }

          .document-top {
            grid-template-columns: minmax(0, 1fr) 180px !important;
            gap: 10px !important;
            padding-bottom: 8px !important;
            border-bottom: 1px solid #dbe4ee !important;
          }

          .document-left-logo img {
            width: 120px !important;
            margin-bottom: 4px !important;
          }

          .document-left-subtitle {
            font-size: 10px !important;
            line-height: 1.15 !important;
          }

          .document-left-subtitle p + p {
            margin-top: 2px !important;
          }

          .document-number-box {
            border-width: 1.5px !important;
            border-radius: 10px !important;
          }

          .document-number-label {
            padding: 6px 8px !important;
            font-size: 9px !important;
            letter-spacing: 0.3px !important;
          }

          .document-number-value {
            padding: 8px 6px !important;
            font-size: 16px !important;
            line-height: 1 !important;
          }

          .document-meta {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 6px !important;
            margin: 8px 0 !important;
          }

          .meta-card {
            padding: 6px 7px !important;
            border-radius: 8px !important;
          }

          .meta-label {
            font-size: 8px !important;
            margin-bottom: 3px !important;
          }

          .meta-value {
            font-size: 11px !important;
            line-height: 1.1 !important;
          }

          .document-body-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .document-column {
            gap: 8px !important;
          }

          .document-section {
            border-radius: 10px !important;
          }

          .document-section-title {
            font-size: 10px !important;
            padding: 6px 8px !important;
            letter-spacing: 0.2px !important;
          }

          .document-section-body {
            padding: 6px 8px !important;
            gap: 5px 6px !important;
          }

          .document-line {
            gap: 3px !important;
          }

          .line-label {
            font-size: 8px !important;
            letter-spacing: 0.2px !important;
          }

          .line-value {
            font-size: 10px !important;
            padding: 5px 6px !important;
            min-height: 12px !important;
            border-radius: 7px !important;
            line-height: 1.1 !important;
          }

          .line-value.compact {
            max-height: 34px !important;
          }

          .signatures {
            gap: 6px !important;
            margin-top: 8px !important;
          }

          .signature-box {
            min-height: 38px !important;
            padding: 10px 6px 6px !important;
            border-radius: 10px !important;
          }

          .signature-line {
            padding-top: 5px !important;
            font-size: 9px !important;
          }

          .document-footer {
            margin-top: 6px !important;
            padding-top: 6px !important;
            gap: 8px !important;
            font-size: 9px !important;
            line-height: 1.1 !important;
          }
        }
      `}</style>

      <div className="mtr-page page-shell">
        <div className="mtr-topbar">
          <div className="mtr-topbar-left">
            <h1>Manifesto e ligação às coletas</h1>
            <p className="page-header__lead" style={{ margin: '6px 0 0' }}>
              Manifesto ligado à programação; a coleta segue no fluxo a partir daqui.
            </p>
            {usuarioCargo ? (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Perfil: <span style={{ color: '#0f172a' }}>{usuarioCargo}</span>
                {!podeMutarMtr ? ' · somente consulta' : ' · pode criar e editar'}
              </p>
            ) : null}
          </div>

          <div className="mtr-topbar-right">
            <button
              className="btn btn-primary"
              onClick={openNewForm}
              disabled={!podeMutarMtr}
              title={!podeMutarMtr ? 'Apenas operacional ou administrador' : undefined}
              style={{ opacity: podeMutarMtr ? 1 : 0.55 }}
            >
              Nova MTR
            </button>
            <button className="btn btn-secondary" onClick={loadData}>
              Atualizar lista
            </button>
            {selectedMTR && (
              <button className="btn btn-light" onClick={handlePrint}>
                Imprimir documento
              </button>
            )}
          </div>
        </div>

        <div className="mtr-stats">
          <div className="stat-card">
            <div className="stat-label">Total de MTRs</div>
            <div className="stat-value">{mtrs.length}</div>
            <div className="stat-help">Cadastradas no sistema.</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Vinculadas à programação</div>
            <div className="stat-value">{totalVinculadas}</div>
            <div className="stat-help">Com programação vinculada.</div>
          </div>
        </div>

        {temParametrosContexto && (
          <div
            className="mtr-context-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '14px',
              marginBottom: '18px',
              fontSize: '14px',
              border: '1px solid',
              ...(itemContextoResolvido
                ? { background: '#f0fdf4', borderColor: '#bbf7d0' }
                : { background: '#fffbeb', borderColor: '#fcd34d' }),
            }}
          >
            <div style={{ flex: '1', minWidth: '220px' }}>
              <strong style={{ color: '#0f172a' }}>Veio de outra tela</strong>
              {itemContextoResolvido ? (
                <span style={{ color: '#475569' }}>
                  {' '}
                  · {itemContextoResolvido.numero} · {itemContextoResolvido.cliente}
                  {itemContextoResolvido.data_emissao
                    ? ` · Emissão ${formatDate(itemContextoResolvido.data_emissao)}`
                    : ''}
                </span>
              ) : (
                <span style={{ color: '#92400e' }}>
                  {' '}
                  · Nenhuma MTR encontrada para esse link.
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-light"
              style={{ fontSize: '13px', padding: '8px 14px', color: '#64748b' }}
              onClick={limparContextoUrl}
            >
              Limpar contexto
            </button>
          </div>
        )}

        <div className="mtr-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Lista de MTRs</h2>
              <p>Gerencie, visualize, edite e imprima os manifestos cadastrados.</p>
            </div>

            <div className="panel-body">
              {loading ? (
                <div className="loading-box">Carregando MTRs...</div>
              ) : mtrs.length === 0 ? (
                <div className="empty-state">Nenhuma MTR cadastrada até o momento.</div>
              ) : (
                <div className="mtr-list">
                  {mtrs.map((item) => {
                    const isSelected = selectedMTR?.id === item.id
                    const linkedProgramacao = item.programacao_id ? programacaoMap.get(item.programacao_id) : null
                    const linkedColeta = coletaMapByMtrId.get(item.id)

                    return (
                      <div
                        key={item.id}
                        id={`mtr-row-${item.id}`}
                        className={`mtr-list-item ${isSelected ? 'selected' : ''}`}
                      >
                        <div className="mtr-list-top">
                          <div>
                            <p className="mtr-number">{item.numero}</p>
                            <p className="mtr-client">{item.cliente}</p>
                          </div>
                        </div>

                        <div className="mtr-meta">
                          <div className="mtr-meta-box">
                            <div className="mtr-meta-label">Programação vinculada</div>
                            <div className="mtr-meta-value">
                              {linkedProgramacao ? getProgramacaoLabel(linkedProgramacao) : '-'}
                            </div>
                          </div>

                          <div className="mtr-meta-box">
                            <div className="mtr-meta-label">Coleta gerada</div>
                            <div className="mtr-meta-value">
                              {linkedColeta ? (
                                <span className={classeEtapaColeta(linkedColeta)}>
                                  {linkedColeta.numero || linkedColeta.id}
                                </span>
                              ) : (
                                '-'
                              )}
                            </div>
                          </div>
                        </div>

                        {formatarLancadoPorResumo(item.criado_por_nome, item.created_at) ? (
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#64748b',
                              lineHeight: 1.35,
                              marginBottom: '10px',
                            }}
                          >
                            {formatarLancadoPorResumo(item.criado_por_nome, item.created_at)}
                          </div>
                        ) : null}

                        <div className="table-actions">
                          <button className="mini-btn" onClick={() => setSelectedMTR(item)}>
                            Visualizar
                          </button>
                          <button
                            className="mini-btn"
                            onClick={() => openEditForm(item)}
                            disabled={!podeMutarMtr}
                            style={{ opacity: podeMutarMtr ? 1 : 0.5 }}
                          >
                            Editar
                          </button>
                          <button
                            className="mini-btn mini-btn-danger"
                            onClick={() => handleDelete(item)}
                            disabled={!podeMutarMtr}
                            style={{ opacity: podeMutarMtr ? 1 : 0.5 }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Visualização do documento</h2>
              <p>Visualize e imprima o manifesto selecionado na lista.</p>
            </div>

            <div className="panel-body">
              {selectedProgramacao && (
                <div className="alert-box alert-info">
                  Programação vinculada: <strong>{getProgramacaoLabel(selectedProgramacao)}</strong>
                </div>
              )}

              {selectedColeta && (
                <div className="alert-box alert-info">
                  Coleta gerada: <strong>{selectedColeta.numero || selectedColeta.id}</strong> • Cliente:{' '}
                  <strong>{selectedColeta.cliente || '-'}</strong> • Etapa atual:{' '}
                  <strong>{etiquetaEtapaColeta(selectedColeta)}</strong>
                  {podeMutarMtr ? (
                    <span style={{ marginLeft: 10 }}>
                      <button
                        type="button"
                        className="mini-btn mini-btn-danger"
                        onClick={() => selectedMTR && void handleDeleteColetasDaMtr(selectedMTR.id)}
                        style={{ marginLeft: 10 }}
                      >
                        Excluir coleta(s)
                      </button>
                    </span>
                  ) : null}
                </div>
              )}

              {selectedMTR && avisosImpressao.length > 0 ? (
                <div className="alert-box alert-warning" style={{ marginBottom: 12 }}>
                  <strong>Conferência antes de imprimir:</strong> {avisosImpressao.join('; ')}.
                </div>
              ) : null}

              <div
                className={`document-wrapper print-area${selectedMTR ? ' document-wrapper--mtr-excel' : ''}`}
              >
                {selectedMTR && detalhesMtrSelecionada ? (
                  <div className="document-shell mtr-modelo-pdf-shell">
                    <div className="document-green-bar" />

                    <div className="document-content mtr-modelo-pdf">
                      {(() => {
                        const d = detalhesMtrSelecionada
                        const motoristaDoc = d.transportador.motorista?.trim() || ''
                        const placaDoc = d.transportador.placa?.trim() || ''
                        const telefonesDoc = d.transportador.telefones_gerais?.trim() || ''
                        return (
                          <>
                            <div className="mtr-excel">
                              <div className="mtr-excel__header">
                                <div className="mtr-excel__logo">
                                  <img src={BRAND_LOGO_MARK} alt="RG Ambiental" />
                                </div>
                                <div className="mtr-excel__title">
                                  <div className="mtr-excel__title-main">MTR - MANIFESTO PARA TRANSPORTE DE RESÍDUOS</div>
                                </div>
                                <div className="mtr-excel__mtrno">
                                  <div className="mtr-excel__mtrno-label">Nº MTR:</div>
                                  <div className="mtr-excel__mtrno-value">{selectedMTR.numero}</div>
                                </div>
                              </div>

                              <table className="mtr-excel__table">
                                <tbody>
                                  <tr>
                                    <td className="mtr-excel__sec" colSpan={6}>1. GERADOR</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Atividade:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.atividade)}</td>
                                    <td className="mtr-excel__k">Nº CADRI:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.cadri)}</td>
                                    <td className="mtr-excel__k">CNPJ:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.cnpj)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Razão Social:</td>
                                    <td className="mtr-excel__v" colSpan={3}>{mtrTextoCelula(selectedMTR.gerador)}</td>
                                    <td className="mtr-excel__k">I.E:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.ie)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Endereço de coleta:</td>
                                    <td className="mtr-excel__v" colSpan={3}>{mtrTextoCelula(selectedMTR.endereco)}</td>
                                    <td className="mtr-excel__k">Bairro:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.bairro)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Município:</td>
                                    <td className="mtr-excel__v">
                                      {mtrTextoCelula((d.gerador.cidade || selectedMTR.cidade || '').trim())}
                                    </td>
                                    <td className="mtr-excel__k">CEP:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.cep)}</td>
                                    <td className="mtr-excel__k">Estado:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.estado)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Responsável:</td>
                                    <td className="mtr-excel__v" colSpan={3}>{mtrTextoCelula(d.gerador.responsavel)}</td>
                                    <td className="mtr-excel__k">Telefone:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.gerador.telefone)}</td>
                                  </tr>

                                  <tr>
                                    <td className="mtr-excel__sec" colSpan={6}>2. DESCRIÇÃO DOS RESÍDUOS</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={6} style={{ padding: 0, borderBottom: 'none' }}>
                                      <table className="mtr-excel__inner">
                                        <tbody>
                                          <tr className="mtr-excel__throw">
                                            <td className="mtr-excel__th">Fonte de Origem</td>
                                            <td className="mtr-excel__th" colSpan={2}>
                                              Caracterização dos resíduos
                                            </td>
                                            <td className="mtr-excel__th">Estado Físico</td>
                                            <td className="mtr-excel__th">Tipo de Acondicionamento</td>
                                            <td className="mtr-excel__th">Qtde aprox.</td>
                                            <td className="mtr-excel__th">Nº ONU</td>
                                          </tr>
                                          <tr>
                                            <td className="mtr-excel__v">{mtrTextoCelula(d.residuo.fonte_origem)}</td>
                                            <td className="mtr-excel__v" colSpan={2}>
                                              {mtrTextoCelula(d.residuo.caracterizacao || selectedMTR.tipo_residuo)}
                                            </td>
                                            <td className="mtr-excel__v">{mtrTextoCelula(d.residuo.estado_fisico)}</td>
                                            <td className="mtr-excel__v">{mtrTextoCelula(d.residuo.acondicionamento)}</td>
                                            <td className="mtr-excel__v">{mtrTextoCelula(d.residuo.quantidade_aproximada)}</td>
                                            <td className="mtr-excel__v">{mtrTextoCelula(d.residuo.onu)}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                  <tr className="mtr-excel__throw">
                                    <td colSpan={6}>DESCRIÇÕES ADICIONAIS DOS RESÍDUOS ACIMA</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__v" colSpan={6}>
                                      {mtrTextoCelula(d.blocos.descricoes_adicionais_residuos)}
                                    </td>
                                  </tr>
                                  <tr className="mtr-excel__throw">
                                    <td colSpan={6}>
                                      INSTRUÇÕES ESPECIAIS DE MANUSEIO E INFORMAÇÕES ADICIONAIS
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__v" colSpan={6}>
                                      {mtrTextoCelula(d.blocos.instrucoes_manuseio)}
                                    </td>
                                  </tr>

                                  <tr>
                                    <td className="mtr-excel__sec" colSpan={6}>3. TRANSPORTADOR</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Atividade:</td>
                                    <td className="mtr-excel__v" colSpan={3}>
                                      {mtrTextoCelula(d.transportador.atividade || selectedMTR.transportador)}
                                    </td>
                                    <td className="mtr-excel__k">CNPJ:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.cnpj)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Razão Social:</td>
                                    <td className="mtr-excel__v" colSpan={3}>
                                      {mtrTextoCelula(
                                        (d.transportador.razao_social || selectedMTR.transportador || '').trim()
                                      )}
                                    </td>
                                    <td className="mtr-excel__k">I.E:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.ie)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Endereço:</td>
                                    <td className="mtr-excel__v" colSpan={3}>{mtrTextoCelula(d.transportador.endereco)}</td>
                                    <td className="mtr-excel__k">Bairro:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.bairro)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Município:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.municipio)}</td>
                                    <td className="mtr-excel__k">CEP:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.cep)}</td>
                                    <td className="mtr-excel__k">Estado:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.estado)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Responsável:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.responsavel)}</td>
                                    <td className="mtr-excel__k">Telefone:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.telefone)}</td>
                                    <td className="mtr-excel__k">Email:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.transportador.email)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Motorista:</td>
                                    <td className="mtr-excel__v" colSpan={3}>{mtrTextoCelula(motoristaDoc)}</td>
                                    <td className="mtr-excel__k">Placa do Veículo:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(placaDoc)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k" colSpan={1}>
                                      Telefones:
                                    </td>
                                    <td className="mtr-excel__v" colSpan={5}>
                                      {mtrTextoCelula(telefonesDoc)}
                                    </td>
                                  </tr>

                                  <tr>
                                    <td className="mtr-excel__sec" colSpan={6}>
                                      4. UNIDADE DESTINATÁRIA (INSTALAÇÃO RECEPTORA)
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Atividade:</td>
                                    <td className="mtr-excel__v" colSpan={3}>
                                      {mtrTextoCelula(d.destinatario.atividade || selectedMTR.destinador)}
                                    </td>
                                    <td className="mtr-excel__k">L.O:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.lo)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Razão Social:</td>
                                    <td className="mtr-excel__v" colSpan={3}>
                                      {mtrTextoCelula(
                                        (d.destinatario.razao_social || selectedMTR.destinador || '').trim()
                                      )}
                                    </td>
                                    <td className="mtr-excel__k">CNPJ:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.cnpj)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Endereço:</td>
                                    <td className="mtr-excel__v" colSpan={3}>{mtrTextoCelula(d.destinatario.endereco)}</td>
                                    <td className="mtr-excel__k">Bairro:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.bairro)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Município:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.municipio)}</td>
                                    <td className="mtr-excel__k">CEP:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.cep)}</td>
                                    <td className="mtr-excel__k">Estado:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.estado)}</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__k">Responsável:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.responsavel)}</td>
                                    <td className="mtr-excel__k">Telefone:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.telefone)}</td>
                                    <td className="mtr-excel__k">I.E:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(d.destinatario.ie)}</td>
                                  </tr>

                                  <tr>
                                    <td className="mtr-excel__sec" colSpan={6}>5. CERTIFICAÇÃO DO GERADOR</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__v" colSpan={6}>
                                      Eu, por meio deste manifesto, declaro que os resíduos acima listados estão integralmente e corretamente descritos pelo nome, classificados, embalados e rotulados seguindo as normas vigentes e estão sob os aspectos em condições adequadas para transporte de acordo com os regulamentos nacionais e internacionais vigentes.
                                    </td>
                                  </tr>

                                  <tr className="mtr-excel__avoid-print-break">
                                    <td className="mtr-excel__sec" colSpan={6}>6. RESPONSÁVEIS</td>
                                  </tr>
                                  <tr className="mtr-excel__throw mtr-excel__avoid-print-break">
                                    <td className="mtr-excel__th" colSpan={2}>
                                      a) Gerador
                                    </td>
                                    <td className="mtr-excel__th" colSpan={2}>
                                      b) Transportador
                                    </td>
                                    <td className="mtr-excel__th" colSpan={2}>
                                      c) Instalação receptora
                                    </td>
                                  </tr>
                                  <tr className="mtr-excel__avoid-print-break">
                                    <td className="mtr-excel__k">Nome:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(selectedMTR.gerador)}</td>
                                    <td className="mtr-excel__k">Nome:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(selectedMTR.transportador)}</td>
                                    <td className="mtr-excel__k">Nome:</td>
                                    <td className="mtr-excel__v">{mtrTextoCelula(selectedMTR.destinador)}</td>
                                  </tr>
                                  <tr className="mtr-excel__avoid-print-break">
                                    <td className="mtr-excel__k">Assinatura:</td>
                                    <td className="mtr-excel__v">&nbsp;</td>
                                    <td className="mtr-excel__k">Assinatura:</td>
                                    <td className="mtr-excel__v">&nbsp;</td>
                                    <td className="mtr-excel__k">Assinatura:</td>
                                    <td className="mtr-excel__v">&nbsp;</td>
                                  </tr>
                                  <tr className="mtr-excel__avoid-print-break">
                                    <td className="mtr-excel__k">Data:</td>
                                    <td className="mtr-excel__v">____/____/________</td>
                                    <td className="mtr-excel__k">Data:</td>
                                    <td className="mtr-excel__v">____/____/________</td>
                                    <td className="mtr-excel__k">Data:</td>
                                    <td className="mtr-excel__v">____/____/________</td>
                                  </tr>

                                  <tr>
                                    <td className="mtr-excel__sec" colSpan={6}>7. COMUNICAÇÃO DE DISCREPÂNCIAS</td>
                                  </tr>
                                  <tr>
                                    <td className="mtr-excel__v" colSpan={6}>
                                      Em caso de divergência entre a quantidade ou a qualidade dos resíduos recebidos e o
                                      discriminado neste Manifesto, contatar:{' '}
                                      <strong>{mtrTextoCelula(d.conformidade.telefone_discrepancias)}</strong>.
                                    </td>
                                  </tr>

                                  <tr>
                                    <td className="mtr-excel__sec" colSpan={6}>
                                      8. CERTIFICAÇÃO DA INSTALAÇÃO RECEPTORA
                                    </td>
                                  </tr>
                                  <tr className="mtr-excel__avoid-print-break">
                                    <td className="mtr-excel__v" colSpan={6}>
                                      Certificação de recebimento do material perigoso descrito neste manifesto, na quantidade
                                      e tipo discriminados, exceto quando ocorrer o disposto na Seção 7 (Comunicação de
                                      discrepâncias), acima.
                                      <div className="mtr-excel__signrow" style={{ marginTop: 10 }}>
                                        <span>Nome: ___________________________</span>
                                        <span>Assinatura: ______________________________</span>
                                        <span>Data: ____/____/________</span>
                                      </div>
                                    </td>
                                  </tr>
                                  <tr className="mtr-excel__stretch-wrap" aria-hidden="true">
                                    <td className="mtr-excel__stretch" colSpan={6} />
                                  </tr>
                                </tbody>
                              </table>
                              <div className="mtr-excel__doc-footer">
                                <p className="mtr-excel__doc-footer-line">{MTR_RODAPE_VIAS}</p>
                                <p className="mtr-excel__doc-footer-line">
                                  Documento emitido pelo Sistema RG Ambiental · {officialSiteUrl('/mtr')}
                                </p>
                                {formatarLancadoPorResumo(selectedMTR.criado_por_nome, selectedMTR.created_at) ? (
                                  <p className="mtr-excel__doc-footer-line">
                                    {formatarLancadoPorResumo(selectedMTR.criado_por_nome, selectedMTR.created_at)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="document-empty">
                    Selecione uma MTR na lista para visualizar o documento aqui.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {showForm && (
          <div className="modal-overlay no-print">
            <div className="modal-card">
              <div className="modal-head">
                <div>
                  <h3>{editingId ? 'Editar MTR' : 'Nova MTR'}</h3>
                  <p>Agora a MTR nasce da programação. A coleta será criada depois, a partir desta MTR.</p>
                </div>

                <button className="close-btn" onClick={closeForm}>
                  Fechar
                </button>
              </div>

              <div className="panel-body">
                {duplicateMTR && (
                  <div className="alert-box alert-warning">
                    Atenção: a programação selecionada já possui uma MTR vinculada: <strong>{duplicateMTR.numero}</strong>
                  </div>
                )}

                {editingId && formatarLancadoPorResumo(mtrDevCriadoPorNome, mtrEdicaoCreatedAtIso) ? (
                  <div className="field-info-box" style={{ marginBottom: 4 }}>
                    <strong style={{ color: '#334155' }}>Auditoria:</strong>{' '}
                    {formatarLancadoPorResumo(mtrDevCriadoPorNome, mtrEdicaoCreatedAtIso)}
                  </div>
                ) : null}

                {editingId && cargoEhDesenvolvedor(usuarioCargo) ? (
                  <div className="field field-full">
                    <label htmlFor="mtr-criado-por-nome-dev">Corrigir nome do autor do lançamento (apenas Desenvolvedor)</label>
                    <input
                      id="mtr-criado-por-nome-dev"
                      type="text"
                      value={mtrDevCriadoPorNome}
                      onChange={(e) => setMtrDevCriadoPorNome(e.target.value)}
                      placeholder="Nome em «Lançado por …»"
                    />
                    <span className="helper">A data/hora do registo não é alterada aqui.</span>
                  </div>
                ) : null}

                <form onSubmit={handleSave}>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="mtr-programacao-calendar">Programação vinculada</label>
                      <ProgramacaoCalendarPicker
                        id="mtr-programacao-calendar"
                        value={form.programacao_id}
                        options={programacoes}
                        onChange={(id) => void handleProgramacaoChange(id)}
                        getLabel={getProgramacaoLabel}
                        placeholder="Selecione a data da programação"
                      />
                      <span className="helper">
                        Abra o calendário, clique no dia que tem programação (dias destacados em verde, com o número de programações no canto) e escolha uma na lista que aparece. Se a programação já tiver MTR, o sistema abre a MTR existente.
                      </span>
                    </div>

                    <div className="field">
                      <label>Número da MTR</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <input
                          style={{ flex: '1 1 220px', minWidth: 0, width: '100%', boxSizing: 'border-box' }}
                          value={form.numero}
                          onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))}
                          placeholder="Ex.: MTR-20260405-190930 ou 2650/2026"
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setForm((prev) => ({ ...prev, numero: generateMTRNumber() }))}
                        >
                          Gerar
                        </button>
                        <button
                          type="button"
                          className="btn btn-light"
                          title="Número estilo manifesto físico (sequencial por ano)"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              numero: generateMTRNumberSequencialAno(mtrs.map((m) => m.numero)),
                            }))
                          }
                        >
                          Nº / ano
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <label>Informações da programação</label>
                      <div className="field-info-box">
                        {form.programacao_id && programacaoMap.get(form.programacao_id) ? (
                          <>
                            <div><strong>Programação:</strong> {programacaoMap.get(form.programacao_id)?.numero || 'Sem número'}</div>
                            <div><strong>Cliente:</strong> {programacaoMap.get(form.programacao_id)?.cliente || '-'}</div>
                            <div><strong>Data:</strong> {formatDate(programacaoMap.get(form.programacao_id)?.data_programada)}</div>
                            <div><strong>Tipo de caminhão:</strong> {programacaoMap.get(form.programacao_id)?.tipo_caminhao || '-'}</div>
                            <div><strong>Status:</strong> {programacaoMap.get(form.programacao_id)?.status_programacao || '-'}</div>
                          </>
                        ) : (
                          <>Selecione uma programação para carregar as informações automáticas.</>
                        )}
                      </div>
                    </div>

                    <div className="field">
                      <label>Data de emissão</label>
                      <input
                        type="date"
                        value={form.data_emissao}
                        onChange={(e) => setForm((prev) => ({ ...prev, data_emissao: e.target.value }))}
                      />
                    </div>

                    <div className="field">
                      <label>Cliente</label>
                      <input
                        value={form.cliente}
                        onChange={(e) => setForm((prev) => ({ ...prev, cliente: e.target.value }))}
                        placeholder="Cliente"
                      />
                    </div>

                    <div className="field">
                      <label>Gerador</label>
                      <input
                        value={form.gerador}
                        onChange={(e) => setForm((prev) => ({ ...prev, gerador: e.target.value }))}
                        placeholder="Gerador"
                      />
                    </div>

                    <div className="field field-full">
                      <label>Endereço de Coleta</label>
                      <input
                        value={form.endereco}
                        onChange={(e) => setForm((prev) => ({ ...prev, endereco: e.target.value }))}
                        placeholder="Endereço de Coleta"
                      />
                    </div>

                    <div className="field">
                      <label>Cidade (obrigatório — município/UF)</label>
                      <input
                        value={form.cidade}
                        onChange={(e) => {
                          const v = e.target.value
                          setForm((prev) => ({
                            ...prev,
                            cidade: v,
                            detalhes: {
                              ...(prev.detalhes ?? detalhesVazios()),
                              gerador: {
                                ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                cidade: v,
                              },
                            },
                          }))
                        }}
                        placeholder="Ex.: Araçariguama — SP"
                      />
                    </div>

                    <div className="field">
                      <label>Tipo de resíduo / serviço</label>
                      <input
                        value={form.tipo_residuo}
                        onChange={(e) => setForm((prev) => ({ ...prev, tipo_residuo: e.target.value }))}
                        placeholder="Tipo de resíduo"
                      />
                    </div>

                    <div className="field">
                      <label>Quantidade (opcional)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.quantidade ?? ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            quantidade: e.target.value === '' ? null : Number(e.target.value),
                          }))
                        }
                        placeholder="—"
                      />
                    </div>

                    <div className="field">
                      <label>Unidade (opcional)</label>
                      <select
                        value={form.unidade || 'kg'}
                        onChange={(e) => setForm((prev) => ({ ...prev, unidade: e.target.value }))}
                      >
                        <option value="">—</option>
                        <option value="kg">kg</option>
                        <option value="ton">ton</option>
                        <option value="m³">m³</option>
                        <option value="un">un</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>Transportador</label>
                      <input
                        value={form.transportador}
                        onChange={(e) => setForm((prev) => ({ ...prev, transportador: e.target.value }))}
                        placeholder="Transportador"
                      />
                    </div>

                    <div className="field">
                      <label>Destinador</label>
                      <input
                        value={form.destinador}
                        onChange={(e) => setForm((prev) => ({ ...prev, destinador: e.target.value }))}
                        placeholder="Destinador"
                      />
                    </div>

                    <div className="field field-full">
                      <label>Campos do modelo MTR (completo)</label>
                      <div
                        className="field-info-box"
                        style={{
                          marginTop: 8,
                          border: '1px solid #f59e0b',
                          background: '#fffbeb',
                          color: '#92400e',
                          fontWeight: 800,
                        }}
                      >
                        Atenção: estes campos são usados na impressão do MTR. Preencha antes de finalizar.
                      </div>

                      <details
                        open
                        style={{
                          marginTop: 10,
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          padding: '10px 12px',
                          background: '#ffffff',
                        }}
                      >
                        <summary
                          style={{
                            cursor: 'pointer',
                            fontWeight: 900,
                            color: '#0f172a',
                            listStyle: 'none',
                          }}
                        >
                          Preencher campos do layout (Gerador / Resíduo / Transportador / Destinatário)
                        </summary>
                        <div className="field-info-box" style={{ marginTop: 10 }}>
                          Estes campos espelham o modelo de MTR (planilha) e são usados na impressão do documento.
                        </div>

                        <datalist id="mtr-atividade-sugestoes">
                          {MTR_ATIVIDADE_SUGESTOES.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                        <datalist id="mtr-placas-frota">
                          {caminhoesPlacas.map((c) => (
                            <option key={c.id} value={c.placa} />
                          ))}
                        </datalist>

                        <div className="form-grid" style={{ marginTop: 12 }}>
                          <div className="field field-full">
                            <div style={{ fontWeight: 800 }}>1. Gerador</div>
                          </div>
                          <div className="field">
                            <label>Atividade</label>
                            <input
                              list="mtr-atividade-sugestoes"
                              value={form.detalhes?.gerador.atividade ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      atividade: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Nº CADRI</label>
                            <input
                              value={form.detalhes?.gerador.cadri ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      cadri: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>CNPJ</label>
                            <input
                              value={form.detalhes?.gerador.cnpj ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      cnpj: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>I.E</label>
                            <input
                              value={form.detalhes?.gerador.ie ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      ie: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field field-full">
                            <label>Bairro</label>
                            <input
                              value={form.detalhes?.gerador.bairro ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      bairro: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field field-full">
                            <label>Cidade</label>
                            <input
                              value={form.detalhes?.gerador.cidade ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      cidade: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>CEP</label>
                            <input
                              value={form.detalhes?.gerador.cep ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      cep: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Estado</label>
                            <input
                              value={form.detalhes?.gerador.estado ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      estado: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Responsável</label>
                            <input
                              value={form.detalhes?.gerador.responsavel ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      responsavel: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Telefone</label>
                            <input
                              value={form.detalhes?.gerador.telefone ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    gerador: {
                                      ...(prev.detalhes?.gerador ?? detalhesVazios().gerador),
                                      telefone: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>

                          <div className="field field-full">
                            <div style={{ fontWeight: 800 }}>2. Descrição dos resíduos</div>
                          </div>
                          <div className="field">
                            <label>Fonte de origem</label>
                            <input
                              value={form.detalhes?.residuo.fonte_origem ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    residuo: {
                                      ...(prev.detalhes?.residuo ?? detalhesVazios().residuo),
                                      fonte_origem: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Caracterização</label>
                            <input
                              value={form.detalhes?.residuo.caracterizacao ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    residuo: {
                                      ...(prev.detalhes?.residuo ?? detalhesVazios().residuo),
                                      caracterizacao: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Estado físico</label>
                            <input
                              value={form.detalhes?.residuo.estado_fisico ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    residuo: {
                                      ...(prev.detalhes?.residuo ?? detalhesVazios().residuo),
                                      estado_fisico: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Tipo de acondicionamento</label>
                            <input
                              value={form.detalhes?.residuo.acondicionamento ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    residuo: {
                                      ...(prev.detalhes?.residuo ?? detalhesVazios().residuo),
                                      acondicionamento: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Qtde aproximada</label>
                            <input
                              value={form.detalhes?.residuo.quantidade_aproximada ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    residuo: {
                                      ...(prev.detalhes?.residuo ?? detalhesVazios().residuo),
                                      quantidade_aproximada: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Nº ONU</label>
                            <input
                              value={form.detalhes?.residuo.onu ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    residuo: {
                                      ...(prev.detalhes?.residuo ?? detalhesVazios().residuo),
                                      onu: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>

                          <div className="field field-full">
                            <div style={{ fontWeight: 800 }}>Blocos adicionais e discrepâncias</div>
                          </div>
                          <div className="field field-full">
                            <label>Descrições adicionais dos resíduos (impresso na MTR)</label>
                            <textarea
                              rows={2}
                              value={form.detalhes?.blocos.descricoes_adicionais_residuos ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    blocos: {
                                      ...(prev.detalhes?.blocos ?? detalhesVazios().blocos),
                                      descricoes_adicionais_residuos: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field field-full">
                            <label>Instruções especiais de manuseio (impresso na MTR)</label>
                            <textarea
                              rows={2}
                              value={form.detalhes?.blocos.instrucoes_manuseio ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    blocos: {
                                      ...(prev.detalhes?.blocos ?? detalhesVazios().blocos),
                                      instrucoes_manuseio: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field field-full">
                            <label>Telefone para comunicação de discrepâncias (Seção 7)</label>
                            <input
                              value={form.detalhes?.conformidade.telefone_discrepancias ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    conformidade: {
                                      ...(prev.detalhes?.conformidade ?? detalhesVazios().conformidade),
                                      telefone_discrepancias: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>

                          <div className="field field-full">
                            <div style={{ fontWeight: 800 }}>3. Transportador</div>
                          </div>
                          <div className="field field-full">
                            <label>Razão social (impresso)</label>
                            <input
                              value={form.detalhes?.transportador.razao_social ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      razao_social: e.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder="Ex.: igual ao campo Transportador acima"
                            />
                          </div>
                          <div className="field">
                            <label>Atividade</label>
                            <input
                              value={form.detalhes?.transportador.atividade ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      atividade: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>CNPJ</label>
                            <input
                              value={form.detalhes?.transportador.cnpj ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      cnpj: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>I.E</label>
                            <input
                              value={form.detalhes?.transportador.ie ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      ie: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field field-full">
                            <label>Endereço</label>
                            <input
                              value={form.detalhes?.transportador.endereco ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      endereco: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Município</label>
                            <input
                              value={form.detalhes?.transportador.municipio ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      municipio: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Bairro</label>
                            <input
                              value={form.detalhes?.transportador.bairro ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      bairro: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>CEP</label>
                            <input
                              value={form.detalhes?.transportador.cep ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      cep: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Estado</label>
                            <input
                              value={form.detalhes?.transportador.estado ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      estado: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Email</label>
                            <input
                              value={form.detalhes?.transportador.email ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      email: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Responsável</label>
                            <input
                              value={form.detalhes?.transportador.responsavel ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      responsavel: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Telefone</label>
                            <input
                              value={form.detalhes?.transportador.telefone ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      telefone: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Motorista</label>
                            <input
                              value={form.detalhes?.transportador.motorista ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      motorista: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Placa do veículo</label>
                            <input
                              list="mtr-placas-frota"
                              value={form.detalhes?.transportador.placa ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      placa: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field field-full">
                            <label>Telefones (rodapé)</label>
                            <input
                              value={form.detalhes?.transportador.telefones_gerais ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    transportador: {
                                      ...(prev.detalhes?.transportador ?? detalhesVazios().transportador),
                                      telefones_gerais: e.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder="Ex.: (11) 4204-1186 / 4204-1249"
                            />
                          </div>

                          <div className="field field-full">
                            <div style={{ fontWeight: 800 }}>4. Unidade destinatária (instalação receptora)</div>
                          </div>
                          <div className="field field-full">
                            <label>Razão social (impresso)</label>
                            <input
                              value={form.detalhes?.destinatario.razao_social ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      razao_social: e.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder="Ex.: igual ao campo Destinador acima"
                            />
                          </div>
                          <div className="field">
                            <label>Atividade</label>
                            <input
                              value={form.detalhes?.destinatario.atividade ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      atividade: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>L.O</label>
                            <input
                              value={form.detalhes?.destinatario.lo ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      lo: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>CNPJ</label>
                            <input
                              value={form.detalhes?.destinatario.cnpj ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      cnpj: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>I.E</label>
                            <input
                              value={form.detalhes?.destinatario.ie ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      ie: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field field-full">
                            <label>Endereço</label>
                            <input
                              value={form.detalhes?.destinatario.endereco ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      endereco: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Município</label>
                            <input
                              value={form.detalhes?.destinatario.municipio ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      municipio: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Bairro</label>
                            <input
                              value={form.detalhes?.destinatario.bairro ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      bairro: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>CEP</label>
                            <input
                              value={form.detalhes?.destinatario.cep ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      cep: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Estado</label>
                            <input
                              value={form.detalhes?.destinatario.estado ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      estado: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Responsável</label>
                            <input
                              value={form.detalhes?.destinatario.responsavel ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      responsavel: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Telefone</label>
                            <input
                              value={form.detalhes?.destinatario.telefone ?? ''}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  detalhes: {
                                    ...(prev.detalhes ?? detalhesVazios()),
                                    destinatario: {
                                      ...(prev.detalhes?.destinatario ?? detalhesVazios().destinatario),
                                      telefone: e.target.value,
                                    },
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </details>
                    </div>

                    <div className="field field-full">
                      <label>Observações</label>
                      <textarea
                        value={form.observacoes}
                        onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                        placeholder="Observações do manifesto"
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn btn-light" onClick={closeForm}>
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={saving || !podeMutarMtr}
                      title={!podeMutarMtr ? 'Apenas operacional ou administrador' : undefined}
                    >
                      {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar MTR'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}