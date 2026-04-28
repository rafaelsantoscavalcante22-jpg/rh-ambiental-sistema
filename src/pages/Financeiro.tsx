import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../lib/coletasQueryLimits'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import {
  cargoPodeAlterarValorContaTravada,
  cargoPodeEditarCobranca,
  cargoPodeEmitirFaturamento,
} from '../lib/workflowPermissions'
import {
  COLETAS_OR_FINANCEIRO_QUERY,
  coletaVisivelListaFinanceiro,
  isVencidoFinanceiro,
} from '../lib/financeiroColetas'
import {
  exportarCsvFinanceiro,
  mapFaturamentoViewRow,
  type FaturamentoResumoViewRow,
  type FinanceiroListaItem,
} from '../lib/faturamentoResumo'
import { registrarBaixaContaReceber, upsertContaReceber } from '../services/financeiroReceber'
import { FinanceiroConferenciaDetalhe } from '../components/financeiro/FinanceiroConferenciaDetalhe'
import { FaturamentoFilaColetas } from '../components/faturamento/FaturamentoFilaColetas'
import { FaturamentoHistoricoColetas } from '../components/faturamento/FaturamentoHistoricoColetas'
import { FaturamentoRelatoriosPanel } from '../components/faturamento/FaturamentoRelatoriosPanel'
import { FaturamentoModalRegisto } from '../components/faturamento/FaturamentoModalRegisto'
import { FinanceiroFaturamentoCards } from '../components/faturamento/FinanceiroFaturamentoCards'
import { fetchContasReceberByColetaIds } from '../lib/contasReceberFetch'
import { fetchVwFaturamentoResumoPaginated } from '../lib/faturamentoResumoFetch'
import {
  coletaHistoricoFaturamentoEmitido,
  coletaNaFilaFaturamento,
} from '../lib/faturamentoOperacionalFila'
import { mensagemErroSupabase } from '../lib/supabaseErrors'

type StatusPagamento = 'Pendente' | 'Parcial' | 'Pago'

type DocumentoFinRow = {
  id: string
  nome_documento: string
  data_vencimento: string
  coleta_id: string | null
  observacoes: string | null
  created_at: string
}

type RelatorioFiltro = 'todos' | 'recebimentos' | 'pendencias'

const STATUS_OPTIONS: StatusPagamento[] = ['Pendente', 'Parcial', 'Pago']

const DIAS_ALERTA_DOC = 30

type ContaReceberRow = {
  id: string
  referencia_coleta_id: string
  valor: number
  valor_pago?: number | null
  valor_travado?: boolean | null
  data_vencimento: string | null
  status_pagamento: string | null
  observacoes: string | null
  nf_enviada_em?: string | null
  nf_envio_observacao?: string | null
}

function formatDate(date: string) {
  if (!date) return '-'

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

function formatCurrency(value: string) {
  if (!value) return 'R$ 0,00'

  const numero = Number(value)
  if (Number.isNaN(numero)) return 'R$ 0,00'

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatPeso(value: string) {
  if (!value) return '-'

  const numero = Number(value)
  if (Number.isNaN(numero)) return '-'

  return `${numero.toLocaleString('pt-BR')} kg`
}

/** Dias até a data (meia-noite local); negativo = já passou. */
function diasAte(dataIso: string): number | null {
  const d = (dataIso ?? '').trim()
  if (!d) return null
  const alvo = new Date(`${d.slice(0, 10)}T12:00:00`)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

/** Alerta visual para vencimento da coleta nos próximos 30 dias (e ainda não pago). */
function alertaColetaVencimento30(
  dataVencimento: string,
  statusPagamento: StatusPagamento | ''
): 'critico' | null {
  if (!dataVencimento || statusPagamento === 'Pago') return null
  const d = diasAte(dataVencimento)
  if (d === null) return null
  if (d < 0) return null
  if (d <= DIAS_ALERTA_DOC) return 'critico'
  return null
}

function alertaDocumento30(dataVencimento: string): 'vencido' | 'critico' | null {
  const d = diasAte(dataVencimento)
  if (d === null) return null
  if (d < 0) return 'vencido'
  if (d <= DIAS_ALERTA_DOC) return 'critico'
  return null
}

function isoPrimeiroDiaMes(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function isoHoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioDiaMs(isoDate: string): number {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function fimDiaInclusiveMs(isoDate: string): number {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

function resolverFinanceiroItem(
  itens: FinanceiroListaItem[],
  ids: {
    coleta: string | null
    mtr: string | null
    programacao: string | null
    cliente: string | null
  }
): FinanceiroListaItem | null {
  if (ids.coleta) {
    const x = itens.find((i) => i.id === ids.coleta)
    if (x) return x
  }
  if (ids.mtr) {
    const x = itens.find((i) => i.mtrId && i.mtrId === ids.mtr)
    if (x) return x
  }
  if (ids.programacao) {
    const x = itens.find((i) => i.programacaoId && i.programacaoId === ids.programacao)
    if (x) return x
  }
  if (ids.cliente) {
    const x = itens.find((i) => i.clienteId && i.clienteId === ids.cliente)
    if (x) return x
  }
  return null
}

function getStatusStyle(status: StatusPagamento | '') {
  switch (status) {
    case 'Pendente':
      return { backgroundColor: '#fef3c7', color: '#b45309' }
    case 'Parcial':
      return { backgroundColor: '#dbeafe', color: '#1d4ed8' }
    case 'Pago':
      return { backgroundColor: '#dcfce7', color: '#15803d' }
    default:
      return { backgroundColor: '#fee2e2', color: '#dc2626' }
  }
}

function itemEhRecebimento(i: FinanceiroListaItem) {
  return i.statusPagamento === 'Pago'
}

function itemEhPendencia(i: FinanceiroListaItem) {
  return i.statusPagamento !== 'Pago'
}

export default function Financeiro() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlColetaId = searchParams.get('coleta')
  const urlMtrId = searchParams.get('mtr')
  const urlProgramacaoId = searchParams.get('programacao')
  const urlClienteId = searchParams.get('cliente')
  const urlSomenteVencidos = searchParams.get('vencidos')
  const prevContextoScrollKeyRef = useRef<string>('')

  const [itens, setItens] = useState<FinanceiroListaItem[]>([])
  const [busca, setBusca] = useState('')
  const [filtroClienteId, setFiltroClienteId] = useState('')
  const [dataInicioFiltro, setDataInicioFiltro] = useState('')
  const [dataFimFiltro, setDataFimFiltro] = useState('')
  const [filtroStatusConferencia, setFiltroStatusConferencia] = useState<
    'todos' | 'PRONTO_PARA_FATURAR' | 'PENDENTE'
  >('todos')
  const [filtroStatusPagamentoLista, setFiltroStatusPagamentoLista] = useState<
    '' | StatusPagamento
  >('')
  const [detalheAbertoId, setDetalheAbertoId] = useState<string | null>(null)
  const buscaDebounced = useDebouncedValue(busca, 350)
  const [somenteVencidos, setSomenteVencidos] = useState(false)
  const [relatorioFiltro, setRelatorioFiltro] = useState<RelatorioFiltro>('todos')
  const [pageTab, setPageTab] = useState(1)
  const [pageSizeTab, setPageSizeTab] = useState(DEFAULT_PAGE_SIZE)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [loading, setLoading] = useState(false)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [salvandoBaixaId, setSalvandoBaixaId] = useState<string | null>(null)
  const [usuarioCargo, setUsuarioCargo] = useState<string | null>(null)

  const [linhasVistaFat, setLinhasVistaFat] = useState<FaturamentoResumoViewRow[]>([])
  const [erroVistaFat, setErroVistaFat] = useState('')
  const [fatModalAberto, setFatModalAberto] = useState(false)
  const [fatModalColetaId, setFatModalColetaId] = useState<string | null>(null)
  const [fatPeriodoDe, setFatPeriodoDe] = useState(isoPrimeiroDiaMes)
  const [fatPeriodoAte, setFatPeriodoAte] = useState(isoHoje)

  const [documentos, setDocumentos] = useState<DocumentoFinRow[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [docNome, setDocNome] = useState('')
  const [docVenc, setDocVenc] = useState('')
  const [docColetaId, setDocColetaId] = useState('')
  const [salvandoDoc, setSalvandoDoc] = useState(false)

  const podeMutarFinanceiro = cargoPodeEditarCobranca(usuarioCargo)
  const podeMutarFaturamento = cargoPodeEmitirFaturamento(usuarioCargo)
  const podeAlterarValorTravado = cargoPodeAlterarValorContaTravada(usuarioCargo)

  const temParametrosContexto = !!(
    urlColetaId ||
    urlMtrId ||
    urlProgramacaoId ||
    urlClienteId
  )

  const itemContextoResolvido = useMemo(
    () =>
      resolverFinanceiroItem(itens, {
        coleta: urlColetaId,
        mtr: urlMtrId,
        programacao: urlProgramacaoId,
        cliente: urlClienteId,
      }),
    [itens, urlColetaId, urlMtrId, urlProgramacaoId, urlClienteId]
  )

  useEffect(() => {
    const t = (urlSomenteVencidos || '').trim().toLowerCase()
    if (!t) return
    if (t === '1' || t === 'true' || t === 'sim' || t === 'yes') setSomenteVencidos(true)
  }, [urlSomenteVencidos])

  function limparContextoUrl() {
    setSearchParams({}, { replace: true })
    prevContextoScrollKeyRef.current = ''
  }

  function montarParamsFluxo(item: FinanceiroListaItem) {
    const p = new URLSearchParams()
    p.set('coleta', item.id)
    if (item.mtrId) p.set('mtr', item.mtrId)
    if (item.programacaoId) p.set('programacao', item.programacaoId)
    if (item.clienteId) p.set('cliente', item.clienteId)
    return p
  }

  function irProgramacao(item: FinanceiroListaItem) {
    navigate(`/programacao?${montarParamsFluxo(item).toString()}`)
  }
  function irMtr(item: FinanceiroListaItem) {
    navigate(`/mtr?${montarParamsFluxo(item).toString()}`)
  }
  function irControleMassa(item: FinanceiroListaItem) {
    navigate(`/controle-massa?${montarParamsFluxo(item).toString()}`)
  }

  const carregarFinanceiro = useCallback(async () => {
    const { data: rowsView, error } = await fetchVwFaturamentoResumoPaginated(supabase, {
      orFilter: COLETAS_OR_FINANCEIRO_QUERY,
    })

    if (error) throw error

    const filtradas = (rowsView as FaturamentoResumoViewRow[]).filter((row) =>
      coletaVisivelListaFinanceiro({
        fluxo_status: row.fluxo_status,
        etapa_operacional: row.etapa_operacional,
        liberado_financeiro: row.liberado_financeiro,
        coleta_observacoes: row.coleta_observacoes,
      })
    )

    const base = filtradas.map(mapFaturamentoViewRow)

    const ids = base.map((i) => i.id).filter(Boolean)
    const selectCr =
      'id, referencia_coleta_id, valor, valor_pago, valor_travado, data_vencimento, status_pagamento, observacoes, nf_enviada_em, nf_envio_observacao'

    if (ids.length > 0) {
      try {
        const crMap = await fetchContasReceberByColetaIds<ContaReceberRow>(supabase, ids, selectCr)
        if (crMap.size > 0) {
          setItens(
            base.map((item) => {
              const cr = crMap.get(item.id)
              if (!cr) return item
              const st = cr.status_pagamento
              const statusPagamento: StatusPagamento | '' =
                st === 'Pendente' || st === 'Parcial' || st === 'Pago' ? st : item.statusPagamento
              const obs = (item.observacoesColeta || '').trim()
              const obsCr = (cr.observacoes || '').trim()
              return {
                ...item,
                contaReceberId: cr.id ? String(cr.id) : item.contaReceberId,
                valorColeta: Number.isFinite(Number(cr.valor)) ? String(cr.valor) : item.valorColeta,
                valorPago:
                  cr.valor_pago != null && Number.isFinite(Number(cr.valor_pago))
                    ? String(cr.valor_pago)
                    : item.valorPago,
                valorTravado: cr.valor_travado === true || item.valorTravado,
                dataVencimento: cr.data_vencimento ? String(cr.data_vencimento) : item.dataVencimento,
                statusPagamento,
                observacoesColeta: obs || !obsCr ? item.observacoesColeta : obsCr,
                nfEnviadaEm: cr.nf_enviada_em ? String(cr.nf_enviada_em) : item.nfEnviadaEm,
                nfEnvioObs: (cr.nf_envio_observacao ?? '').trim() || item.nfEnvioObs,
              }
            })
          )
          return
        }
      } catch (e) {
        console.warn('Financeiro: contas_receber em lote falhou; lista sem enriquecimento.', e)
      }
    }

    setItens(base)
  }, [])

  const carregarVistaFaturamento = useCallback(async () => {
    setErroVistaFat('')
    const { data, error } = await fetchVwFaturamentoResumoPaginated(supabase)
    if (error) {
      setErroVistaFat(
        error.message ||
          'Não foi possível carregar a consolidação para faturamento. Verifique a view vw_faturamento_resumo no Supabase.'
      )
      setLinhasVistaFat([])
      return
    }
    setLinhasVistaFat(data)
  }, [])

  const carregarDocumentos = useCallback(async () => {
    setLoadingDocs(true)
    try {
      const { data, error } = await supabase
        .from('financeiro_documentos')
        .select('id, nome_documento, data_vencimento, coleta_id, observacoes, created_at')
        .order('data_vencimento', { ascending: true })

      if (error) throw error
      setDocumentos((data || []) as DocumentoFinRow[])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      setErro('')
      await Promise.all([carregarFinanceiro(), carregarDocumentos(), carregarVistaFaturamento()])
    } catch (error) {
      setErro(mensagemErroSupabase(error, 'Erro ao carregar financeiro.'))
    } finally {
      setLoading(false)
    }
  }, [carregarFinanceiro, carregarDocumentos, carregarVistaFaturamento])

  useEffect(() => {
    void carregarDados()
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
    if (loading || !temParametrosContexto || !itemContextoResolvido) return

    const scrollKey = [urlColetaId, urlMtrId, urlProgramacaoId, urlClienteId].join('|')
    if (prevContextoScrollKeyRef.current === scrollKey) return
    prevContextoScrollKeyRef.current = scrollKey

    const id = itemContextoResolvido.id
    window.setTimeout(() => {
      document.getElementById(`fin-row-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 160)
  }, [
    loading,
    temParametrosContexto,
    itemContextoResolvido,
    urlColetaId,
    urlMtrId,
    urlProgramacaoId,
    urlClienteId,
  ])

  function handleCampo(
    id: string,
    campo: keyof Pick<
      FinanceiroListaItem,
      | 'valorColeta'
      | 'statusPagamento'
      | 'dataVencimento'
      | 'numeroNf'
      | 'confirmacaoRecebimento'
      | 'observacoesColeta'
    >,
    valor: string | boolean
  ) {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item))
    )
  }

  async function salvarItem(item: FinanceiroListaItem) {
    if (!podeMutarFinanceiro) {
      setErro('Seu perfil não pode alterar cobrança. Apenas financeiro ou administrador.')
      return
    }
    try {
      setErro('')
      setSucesso('')
      setSalvandoId(item.id)

      const hojeIso = new Date().toISOString().slice(0, 10)
      const valorNumRaw = Number(item.valorColeta)
      const valorNum =
        Number.isFinite(valorNumRaw) && valorNumRaw > 0 ? valorNumRaw : null
      const temContaReceber = !!item.contaReceberId

      if (temContaReceber || valorNum != null) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        const vUpsert = valorNum ?? (Number(item.valorColeta) || 0)
        const { error: crErr } = await upsertContaReceber(supabase, {
          cliente_id: item.clienteId || null,
          valor: vUpsert,
          data_emissao: hojeIso,
          data_vencimento: item.dataVencimento || null,
          referencia_coleta_id: item.id,
          observacoes: item.observacoesColeta.trim() || null,
          origem: 'financeiro',
          permitirAlterarValorTravado: podeAlterarValorTravado,
          status_pagamento_ui: item.statusPagamento,
          usuario_id_auditoria: user?.id ?? null,
        })
        if (crErr) throw crErr
      }

      const valorColetaPayload =
        Number.isFinite(Number(item.valorColeta)) && Number(item.valorColeta) > 0
          ? Number(item.valorColeta)
          : null

      const payload = {
        valor_coleta: valorColetaPayload,
        status_pagamento: item.statusPagamento || null,
        data_vencimento: item.dataVencimento || null,
        numero_nf: item.numeroNf.trim() || null,
        observacoes: item.observacoesColeta.trim() || null,
        confirmacao_recebimento: item.confirmacaoRecebimento,
        ...(item.statusPagamento === 'Pago'
          ? {
              etapa_operacional: 'FINALIZADO',
              fluxo_status: 'FINALIZADO',
              status_processo: 'FINALIZADO',
              liberado_financeiro: true,
            }
          : {}),
      }

      const { error } = await supabase.from('coletas').update(payload).eq('id', item.id)

      if (error) throw error

      setSucesso(`Financeiro da coleta ${item.numero} atualizado com sucesso.`)
      await carregarFinanceiro()
    } catch (error) {
      setErro(mensagemErroSupabase(error, 'Erro ao atualizar item financeiro.'))
    } finally {
      setSalvandoId(null)
    }
  }

  async function marcarPagamentoRapido(item: FinanceiroListaItem, sp: StatusPagamento) {
    const next: FinanceiroListaItem = { ...item, statusPagamento: sp }
    setItens((prev) => prev.map((x) => (x.id === item.id ? next : x)))
    await salvarItem(next)
  }

  async function registrarBaixaDetalhe(item: FinanceiroListaItem, valorStr: string, obs: string) {
    if (!podeMutarFinanceiro) return
    const v = Number(String(valorStr).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) {
      setErro('Informe um valor de baixa válido.')
      return
    }
    try {
      setErro('')
      setSucesso('')
      setSalvandoBaixaId(item.id)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { error } = await registrarBaixaContaReceber(supabase, {
        referencia_coleta_id: item.id,
        valor_baixa: v,
        observacao: obs.trim() || null,
        usuario_id: user?.id ?? null,
      })
      if (error) throw error
      setSucesso(`Baixa de ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registada.`)
      await carregarFinanceiro()
    } catch (e) {
      setErro(mensagemErroSupabase(e, 'Erro ao registar baixa.'))
    } finally {
      setSalvandoBaixaId(null)
    }
  }

  async function adicionarDocumento(e: React.FormEvent) {
    e.preventDefault()
    if (!podeMutarFinanceiro) {
      setErro('Sem permissão para registar documentos.')
      return
    }
    const nome = docNome.trim()
    const venc = docVenc.trim()
    if (!nome || !venc) {
      setErro('Preencha nome do documento e data de vencimento.')
      return
    }
    setSalvandoDoc(true)
    setErro('')
    try {
      const { error } = await supabase.from('financeiro_documentos').insert({
        nome_documento: nome,
        data_vencimento: venc,
        coleta_id: docColetaId || null,
      })
      if (error) throw error
      setDocNome('')
      setDocVenc('')
      setDocColetaId('')
      setSucesso('Documento registado.')
      await carregarDocumentos()
    } catch (err) {
      setErro(mensagemErroSupabase(err, 'Erro ao guardar documento.'))
    } finally {
      setSalvandoDoc(false)
    }
  }

  async function removerDocumento(id: string) {
    if (!podeMutarFinanceiro) return
    if (!window.confirm('Remover este documento da lista?')) return
    setErro('')
    try {
      const { error } = await supabase.from('financeiro_documentos').delete().eq('id', id)
      if (error) throw error
      await carregarDocumentos()
    } catch (err) {
      setErro(mensagemErroSupabase(err, 'Erro ao remover.'))
    }
  }

  const opcoesClienteFiltro = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of itens) {
      if (i.clienteId && !map.has(i.clienteId)) map.set(i.clienteId, i.cliente)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [itens])

  const itensComFiltrosPlaneamento = useMemo(() => {
    let list = itens
    if (filtroClienteId) {
      list = list.filter((i) => i.clienteId === filtroClienteId)
    }
    if (dataInicioFiltro.trim()) {
      list = list.filter((i) => (i.dataAgendada || '') >= dataInicioFiltro.trim())
    }
    if (dataFimFiltro.trim()) {
      list = list.filter((i) => (i.dataAgendada || '') <= dataFimFiltro.trim())
    }
    if (filtroStatusConferencia !== 'todos') {
      list = list.filter((i) => i.statusConferencia === filtroStatusConferencia)
    }
    if (filtroStatusPagamentoLista) {
      list = list.filter((i) => i.statusPagamento === filtroStatusPagamentoLista)
    }
    return list
  }, [
    itens,
    filtroClienteId,
    dataInicioFiltro,
    dataFimFiltro,
    filtroStatusConferencia,
    filtroStatusPagamentoLista,
  ])

  const itensAposBusca = useMemo(() => {
    const termo = buscaDebounced.trim().toLowerCase()

    if (!termo) return itensComFiltrosPlaneamento

    return itensComFiltrosPlaneamento.filter((item) => {
      return (
        item.numero.toLowerCase().includes(termo) ||
        item.cliente.toLowerCase().includes(termo) ||
        item.tipoResiduo.toLowerCase().includes(termo) ||
        item.cidade.toLowerCase().includes(termo) ||
        item.statusPagamento.toLowerCase().includes(termo) ||
        item.numeroNf.toLowerCase().includes(termo) ||
        item.nfEnvioObs.toLowerCase().includes(termo) ||
        item.pendenciasResumo.toLowerCase().includes(termo)
      )
    })
  }, [buscaDebounced, itensComFiltrosPlaneamento])

  const itensFiltrados = useMemo(() => {
    if (!somenteVencidos) return itensAposBusca
    return itensAposBusca.filter((item) =>
      isVencidoFinanceiro(item.dataVencimento, item.statusPagamento)
    )
  }, [itensAposBusca, somenteVencidos])

  const itensRelatorio = useMemo(() => {
    if (relatorioFiltro === 'recebimentos') return itensFiltrados.filter(itemEhRecebimento)
    if (relatorioFiltro === 'pendencias') return itensFiltrados.filter(itemEhPendencia)
    return itensFiltrados
  }, [itensFiltrados, relatorioFiltro])

  const itensPagina = useMemo(() => {
    const start = (pageTab - 1) * pageSizeTab
    return itensRelatorio.slice(start, start + pageSizeTab)
  }, [itensRelatorio, pageTab, pageSizeTab])

  const totalPaginasFin =
    itensRelatorio.length > 0 ? Math.max(1, Math.ceil(itensRelatorio.length / pageSizeTab)) : 1

  useEffect(() => {
    setPageTab(1)
  }, [
    buscaDebounced,
    pageSizeTab,
    somenteVencidos,
    relatorioFiltro,
    filtroClienteId,
    dataInicioFiltro,
    dataFimFiltro,
    filtroStatusConferencia,
    filtroStatusPagamentoLista,
  ])

  useEffect(() => {
    if (pageTab > totalPaginasFin) setPageTab(totalPaginasFin)
  }, [pageTab, totalPaginasFin])

  const totalLiberadas = useMemo(() => itens.length, [itens])

  const totalSemValor = useMemo(
    () => itens.filter((item) => !item.valorColeta || Number(item.valorColeta) <= 0).length,
    [itens]
  )

  const totalSemVencimento = useMemo(
    () => itens.filter((item) => !item.dataVencimento).length,
    [itens]
  )

  const totalPago = useMemo(
    () => itens.filter((item) => item.statusPagamento === 'Pago').length,
    [itens]
  )

  const itensListaVencidos = useMemo(
    () =>
      itens.filter((item) => isVencidoFinanceiro(item.dataVencimento, item.statusPagamento)),
    [itens]
  )

  const totalVencidos = itensListaVencidos.length

  const valorTotalVencidos = useMemo(() => {
    return itensListaVencidos.reduce((acc, item) => {
      const valor = Number(item.valorColeta || 0)
      return acc + (Number.isNaN(valor) ? 0 : valor)
    }, 0)
  }, [itensListaVencidos])

  const valorTotal = useMemo(() => {
    return itens.reduce((acc, item) => {
      const valor = Number(item.valorColeta || 0)
      return acc + (Number.isNaN(valor) ? 0 : valor)
    }, 0)
  }, [itens])

  const valorRecebimentos = useMemo(() => {
    return itens
      .filter((i) => i.statusPagamento === 'Pago')
      .reduce((acc, item) => {
        const valor = Number(item.valorColeta || 0)
        return acc + (Number.isNaN(valor) ? 0 : valor)
      }, 0)
  }, [itens])

  /** Valores ainda não recebidos (Pendente, Parcial ou sem status) — relatório «Saídas / em aberto». */
  const valorSaidasEmAberto = useMemo(() => {
    return itens
      .filter((i) => i.statusPagamento !== 'Pago')
      .reduce((acc, item) => {
        const valor = Number(item.valorColeta || 0)
        return acc + (Number.isNaN(valor) ? 0 : valor)
      }, 0)
  }, [itens])

  const documentosComAlerta = useMemo(() => {
    return documentos.filter((d) => alertaDocumento30(d.data_vencimento) !== null).length
  }, [documentos])

  const filaFaturamento = useMemo(() => {
    const f = linhasVistaFat.filter((r) => coletaNaFilaFaturamento(r))
    return f.sort((a, b) => {
      const da = new Date(a.data_execucao || a.data_agendada || a.created_at).getTime()
      const db = new Date(b.data_execucao || b.data_agendada || b.created_at).getTime()
      if (da !== db) return da - db
      const na = a.numero_coleta ?? Number.MAX_SAFE_INTEGER
      const nb = b.numero_coleta ?? Number.MAX_SAFE_INTEGER
      return na - nb
    })
  }, [linhasVistaFat])

  const totalAFaturarNum = useMemo(() => {
    let s = 0
    for (const r of filaFaturamento) {
      const v = r.valor_coleta ?? r.faturamento_registro_valor
      if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) s += Number(v)
    }
    return s
  }, [filaFaturamento])

  const totalAFaturarFmt =
    totalAFaturarNum > 0
      ? totalAFaturarNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—'

  const historicoBaseFat = useMemo(
    () => linhasVistaFat.filter((r) => coletaHistoricoFaturamentoEmitido(r)),
    [linhasVistaFat]
  )

  const historicoPeriodoFat = useMemo(() => {
    const t0 = fatPeriodoDe ? inicioDiaMs(fatPeriodoDe) : null
    const t1 = fatPeriodoAte ? fimDiaInclusiveMs(fatPeriodoAte) : null
    return historicoBaseFat.filter((r) => {
      const refData = r.data_execucao || r.created_at
      if (!refData) return t0 == null && t1 == null
      const ts = new Date(refData).getTime()
      if (t0 != null && ts < t0) return false
      if (t1 != null && ts > t1) return false
      return true
    })
  }, [historicoBaseFat, fatPeriodoDe, fatPeriodoAte])

  const totalFaturadoPeriodoNum = useMemo(() => {
    return historicoPeriodoFat.reduce((acc, r) => {
      const v = r.faturamento_registro_valor ?? r.valor_coleta
      if (v == null || !Number.isFinite(Number(v))) return acc
      return acc + Number(v)
    }, 0)
  }, [historicoPeriodoFat])

  const totalFaturadoPeriodoFmt =
    totalFaturadoPeriodoNum > 0
      ? totalFaturadoPeriodoNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—'

  const totalPendenteCobrancaFmt = valorSaidasEmAberto.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

  const fatModalRow = useMemo(
    () => (fatModalColetaId ? linhasVistaFat.find((r) => r.coleta_id === fatModalColetaId) ?? null : null),
    [linhasVistaFat, fatModalColetaId]
  )

  function abrirModalFaturamento(coletaId: string) {
    setFatModalColetaId(coletaId)
    setFatModalAberto(true)
  }

  function fecharModalFaturamento() {
    setFatModalAberto(false)
    setFatModalColetaId(null)
  }

  const itemDetalhe = useMemo(
    () => (detalheAbertoId ? itens.find((i) => i.id === detalheAbertoId) ?? null : null),
    [itens, detalheAbertoId]
  )

  return (
    <MainLayout>
      <div className="page-shell">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', color: '#0f172a', fontWeight: 800 }}>
            Faturamento, cobrança e documentos
          </h1>
          <p className="page-header__lead" style={{ margin: '6px 0 0', maxWidth: '920px' }}>
            Primeiro consolide o <strong>faturamento</strong> (coletas já pesadas no fluxo); em seguida utilize a
            cobrança para NF, vencimentos e recebimentos. Conferência (MTR, pesos, ticket, aprovação) e documentos com
            vencimento (alerta aos {DIAS_ALERTA_DOC} dias).
          </p>
          {usuarioCargo ? (
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
              Perfil: <span style={{ color: '#0f172a' }}>{usuarioCargo}</span>
              {!podeMutarFaturamento ? ' · faturamento: consulta' : ' · faturamento: pode emitir'}
              {!podeMutarFinanceiro ? ' · cobrança: consulta' : ' · cobrança: editar e salvar'}
            </p>
          ) : null}
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '16px 18px',
            borderRadius: '16px',
            minWidth: '260px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '6px' }}>
            Valor total informado
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a' }}>
            {valorTotal.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </div>
        </div>
      </div>

      <section style={{ marginBottom: '28px' }} aria-label="Faturamento">
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Faturamento
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#64748b', maxWidth: '920px', lineHeight: 1.6 }}>
            Após programação, MTR, coleta e controle de massa, registe aqui o valor e confirme: a coleta passa ao bloco
            de cobrança abaixo. Não são criados dados operacionais nesta etapa.
          </p>
          {erroVistaFat ? (
            <div
              style={{
                marginTop: '12px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '14px',
              }}
            >
              {erroVistaFat}
            </div>
          ) : null}
        </div>

        <FinanceiroFaturamentoCards
          totalAFaturarFmt={totalAFaturarFmt}
          totalFaturadoPeriodoFmt={totalFaturadoPeriodoFmt}
          totalPendenteCobrancaFmt={totalPendenteCobrancaFmt}
          qtdColetasPendentesFila={filaFaturamento.length}
          periodoDe={fatPeriodoDe}
          periodoAte={fatPeriodoAte}
          onPeriodoDeChange={setFatPeriodoDe}
          onPeriodoAteChange={setFatPeriodoAte}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => void carregarDados()}
            disabled={loading}
            style={{ ...botaoSecundarioStyle, padding: '10px 16px', fontSize: '13px' }}
          >
            {loading ? 'A atualizar…' : 'Atualizar dados'}
          </button>
        </div>

        <FaturamentoFilaColetas
          linhas={filaFaturamento}
          carregando={loading}
          onFaturar={abrirModalFaturamento}
          titulo="Coletas prontas para faturamento"
          subtitulo="Só aparecem coletas com peso líquido, etapa válida após a pesagem, aprovação e ainda sem emissão ao Financeiro. Use «Faturar» para preencher o valor e confirmar."
          mensagemVazia="Nenhuma coleta pronta para faturamento."
          rotuloBotao="Faturar"
        />

        <FaturamentoHistoricoColetas todasLinhas={linhasVistaFat} />
        <FaturamentoRelatoriosPanel linhas={linhasVistaFat} />
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ ...cardResumoStyle, borderTop: '4px solid #15803d' }}>
          <div style={cardResumoTituloStyle}>Relatório — Recebimentos</div>
          <div style={cardResumoValorStyle}>
            {valorRecebimentos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            Soma dos valores com pagamento «Pago»
          </div>
        </div>
        <div style={{ ...cardResumoStyle, borderTop: '4px solid #b45309' }}>
          <div style={cardResumoTituloStyle}>Relatório — Saídas (em aberto)</div>
          <div style={{ ...cardResumoValorStyle }}>
            {valorSaidasEmAberto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            Pendente, Parcial ou sem status (não recebido)
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Liberadas</div>
          <div style={cardResumoValorStyle}>{totalLiberadas}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Sem valor</div>
          <div style={cardResumoValorStyle}>{totalSemValor}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Sem vencimento</div>
          <div style={cardResumoValorStyle}>{totalSemVencimento}</div>
        </div>

        <div style={cardResumoStyle}>
          <div style={cardResumoTituloStyle}>Pagas</div>
          <div style={cardResumoValorStyle}>{totalPago}</div>
        </div>

        <div
          style={{
            ...cardResumoStyle,
            borderLeft: '4px solid #dc2626',
            background: 'linear-gradient(180deg, #fffefe 0%, #ffffff 100%)',
          }}
        >
          <div style={cardResumoTituloStyle}>Vencidos</div>
          <div style={cardResumoValorStyle}>{totalVencidos}</div>
          <div
            style={{
              marginTop: '10px',
              fontSize: '15px',
              fontWeight: 700,
              color: '#b91c1c',
            }}
          >
            {valorTotalVencidos.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}{' '}
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
              (soma dos valores)
            </span>
          </div>
        </div>
      </div>

      {documentosComAlerta > 0 ? (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            borderRadius: '12px',
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            color: '#92400e',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          Atenção: {documentosComAlerta} documento(s) com vencimento em até {DIAS_ALERTA_DOC} dias ou já vencidos —
          ver secção «Documentos» abaixo.
        </div>
      ) : null}

      {erro && <div style={erroStyle}>{erro}</div>}
      {sucesso && <div style={sucessoStyle}>{sucesso}</div>}

      {temParametrosContexto && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '14px 16px',
            borderRadius: '14px',
            marginBottom: '20px',
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
                · Coleta {itemContextoResolvido.numero} · {itemContextoResolvido.cliente} ·{' '}
                {itemContextoResolvido.faseFluxoOficial} ({itemContextoResolvido.etapaOperacional})
              </span>
            ) : (
              <span style={{ color: '#92400e' }}>
                {' '}
                · Nada nesta lista bate com o link (só entram coletas já liberadas para o financeiro).
              </span>
            )}
          </div>
          {itemContextoResolvido ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                style={botaoContextoNavStyle}
                onClick={() => irProgramacao(itemContextoResolvido)}
              >
                Programação
              </button>
              <button type="button" style={botaoContextoNavStyle} onClick={() => irMtr(itemContextoResolvido)}>
                MTR
              </button>
              <button
                type="button"
                style={botaoContextoNavStyle}
                onClick={() => irControleMassa(itemContextoResolvido)}
              >
                Controle de massa
              </button>
            </div>
          ) : null}
          <button type="button" style={botaoLimparContextoStyle} onClick={limparContextoUrl}>
            Limpar contexto
          </button>
        </div>
      )}

      <div style={cardPrincipalStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '18px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: 800 }}>
              Cobrança
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Valor, vencimento, NF, confirmação de recebimento e status. Filtros de relatório aplicam-se à tabela.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Buscar número, cliente, cidade, NF..."
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              style={{ ...inputStyle, maxWidth: '380px' }}
            />

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <input
                type="checkbox"
                checked={somenteVencidos}
                onChange={(e) => setSomenteVencidos(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#dc2626' }}
              />
              Só vencidos
            </label>

            <button
              type="button"
              style={botaoSecundarioStyle}
              onClick={carregarDados}
              disabled={loading}
            >
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px',
            marginBottom: '14px',
            alignItems: 'end',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Cliente</div>
            <select
              value={filtroClienteId}
              onChange={(e) => setFiltroClienteId(e.target.value)}
              style={{ ...inputStyle, padding: '10px 12px' }}
            >
              <option value="">Todos</option>
              {opcoesClienteFiltro.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Período de</div>
            <input
              type="date"
              value={dataInicioFiltro}
              onChange={(e) => setDataInicioFiltro(e.target.value)}
              style={{ ...inputStyle, padding: '10px 12px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>até</div>
            <input
              type="date"
              value={dataFimFiltro}
              onChange={(e) => setDataFimFiltro(e.target.value)}
              style={{ ...inputStyle, padding: '10px 12px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
              Conferência
            </div>
            <select
              value={filtroStatusConferencia}
              onChange={(e) =>
                setFiltroStatusConferencia(
                  e.target.value as 'todos' | 'PRONTO_PARA_FATURAR' | 'PENDENTE'
                )
              }
              style={{ ...inputStyle, padding: '10px 12px' }}
            >
              <option value="todos">Todos</option>
              <option value="PRONTO_PARA_FATURAR">Pronto para faturar</option>
              <option value="PENDENTE">Pendente</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Pagamento</div>
            <select
              value={filtroStatusPagamentoLista}
              onChange={(e) =>
                setFiltroStatusPagamentoLista(e.target.value as '' | StatusPagamento)
              }
              style={{ ...inputStyle, padding: '10px 12px' }}
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '16px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Vista:</span>
          {(
            [
              ['todos', 'Todos'],
              ['recebimentos', 'Só recebimentos (Pago)'],
              ['pendencias', 'Só em aberto (não pago)'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setRelatorioFiltro(val)}
              style={{
                padding: '8px 14px',
                borderRadius: '999px',
                border: relatorioFiltro === val ? '2px solid #0f172a' : '1px solid #cbd5e1',
                background: relatorioFiltro === val ? '#f1f5f9' : '#fff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                color: '#0f172a',
              }}
            >
              {label}
            </button>
          ))}
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1', margin: '0 4px' }}>|</span>
          <button
            type="button"
            style={botaoSecundarioStyle}
            onClick={() => exportarCsvFinanceiro(itensRelatorio, 'financeiro-vista')}
          >
            Exportar CSV (vista)
          </button>
          <button
            type="button"
            style={botaoSecundarioStyle}
            onClick={() =>
              exportarCsvFinanceiro(
                itensRelatorio.filter((i) => i.statusConferencia === 'PENDENTE'),
                'pendentes-conferencia'
              )
            }
          >
            CSV pendentes conferência
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Nº</th>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Local</th>
                <th style={thStyle}>Peso</th>
                <th style={thStyle}>Valor</th>
                <th style={thStyle}>Venc.</th>
                <th style={thStyle}>NF</th>
                <th style={thStyle}>Conf. fluxo</th>
                <th style={thStyle}>Conf. receb.</th>
                <th style={thStyle}>Pagamento</th>
                <th style={thStyle}>Ação</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={emptyTdStyle}>
                    Carregando itens financeiros...
                  </td>
                </tr>
              ) : itensRelatorio.length === 0 ? (
                <tr>
                  <td colSpan={12} style={emptyTdStyle}>
                    {itens.length === 0
                      ? 'Nenhuma coleta na lista de cobrança.'
                      : itensAposBusca.length === 0
                        ? 'Nenhum resultado para a busca.'
                        : somenteVencidos
                          ? 'Nenhuma coleta vencida com este filtro de busca.'
                          : relatorioFiltro !== 'todos'
                            ? 'Nenhuma coleta neste filtro de relatório.'
                            : 'Nenhuma coleta na lista de cobrança.'}
                  </td>
                </tr>
              ) : (
                itensPagina.map((item) => {
                  const vencido = isVencidoFinanceiro(item.dataVencimento, item.statusPagamento)
                  const semValor = !item.valorColeta || Number(item.valorColeta) <= 0
                  const semVencimento = !item.dataVencimento
                  const emDestaque =
                    !!itemContextoResolvido && item.id === itemContextoResolvido.id
                  const alertaVenc = alertaColetaVencimento30(item.dataVencimento, item.statusPagamento)
                  const dias = diasAte(item.dataVencimento)

                  return (
                    <tr
                      key={item.id}
                      id={`fin-row-${item.id}`}
                      onClick={(e) => {
                        const el = e.target as HTMLElement
                        if (el.closest('input, select, button, textarea, label')) return
                        setDetalheAbertoId((prev) => (prev === item.id ? null : item.id))
                      }}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        ...(emDestaque
                          ? { background: '#f0fdf4', outline: '2px solid #22c55e', outlineOffset: '-2px' }
                          : detalheAbertoId === item.id
                            ? { background: '#eff6ff' }
                            : item.statusConferencia === 'PRONTO_PARA_FATURAR'
                              ? { background: '#f0fdf4' }
                              : { background: '#fff5f5' }),
                      }}
                    >
                      <td style={tdStyle}>{item.numero}</td>
                      <td style={tdStyle}>{item.cliente}</td>
                      <td style={tdStyle}>{formatDate(item.dataAgendada)}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{item.cidade}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {item.tipoResiduo}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#0f766e',
                            marginTop: '4px',
                          }}
                          title={item.etapaOperacional}
                        >
                          {item.faseFluxoOficial}
                        </div>
                      </td>
                      <td style={tdStyle}>{formatPeso(item.pesoLiquido)}</td>

                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={item.valorColeta}
                          onChange={(event) =>
                            handleCampo(item.id, 'valorColeta', event.target.value)
                          }
                          placeholder="Ex: 850"
                          disabled={
                            !podeMutarFinanceiro ||
                            (item.valorTravado && !podeAlterarValorTravado)
                          }
                          title={
                            item.valorTravado && !podeAlterarValorTravado
                              ? 'Valor travado após faturamento. Só administrador altera.'
                              : undefined
                          }
                          style={{
                            ...inputTabelaStyle,
                            opacity:
                              podeMutarFinanceiro &&
                              !(item.valorTravado && !podeAlterarValorTravado)
                                ? 1
                                : 0.65,
                          }}
                        />
                        <div style={subInfoStyle}>{formatCurrency(item.valorColeta)}</div>
                        {Number(item.valorColeta) > 0 ? (
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#64748b',
                              marginTop: '4px',
                              lineHeight: 1.35,
                            }}
                          >
                            Pago {formatCurrency(item.valorPago || '0')} · Saldo{' '}
                            {formatCurrency(
                              String(
                                Math.max(
                                  0,
                                  Number(item.valorColeta) - Number(item.valorPago || 0)
                                )
                              )
                            )}
                          </div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <input
                          type="date"
                          value={item.dataVencimento}
                          onChange={(event) =>
                            handleCampo(item.id, 'dataVencimento', event.target.value)
                          }
                          disabled={!podeMutarFinanceiro}
                          style={{
                            ...inputTabelaStyle,
                            opacity: podeMutarFinanceiro ? 1 : 0.65,
                          }}
                        />
                        {alertaVenc === 'critico' && dias !== null && dias >= 0 ? (
                          <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#c2410c' }}>
                            Vence em {dias} dia(s) — atenção
                          </div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <input
                          type="text"
                          value={item.numeroNf}
                          onChange={(e) => handleCampo(item.id, 'numeroNf', e.target.value)}
                          placeholder="Nº NF"
                          disabled={!podeMutarFinanceiro}
                          style={{
                            ...inputTabelaStyle,
                            opacity: podeMutarFinanceiro ? 1 : 0.65,
                          }}
                        />
                        {item.nfEnviadaEm ? (
                          <div
                            style={{
                              marginTop: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#0f766e',
                              lineHeight: 1.35,
                            }}
                            title={item.nfEnvioObs || undefined}
                          >
                            NF enviada: {formatDateTime(item.nfEnviadaEm)}
                          </div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...badgeBaseStyle,
                            ...(item.statusConferencia === 'PRONTO_PARA_FATURAR'
                              ? { backgroundColor: '#dcfce7', color: '#15803d' }
                              : { backgroundColor: '#fee2e2', color: '#b91c1c' }),
                          }}
                        >
                          {item.statusConferencia === 'PRONTO_PARA_FATURAR' ? 'Pronto' : 'Pend.'}
                        </span>
                        {item.pendenciasResumo ? (
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#64748b',
                              marginTop: '6px',
                              maxWidth: '160px',
                              lineHeight: 1.3,
                            }}
                          >
                            {item.pendenciasResumo}
                          </div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: podeMutarFinanceiro ? 'pointer' : 'default',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={item.confirmacaoRecebimento}
                            disabled={!podeMutarFinanceiro}
                            onChange={(e) =>
                              handleCampo(item.id, 'confirmacaoRecebimento', e.target.checked)
                            }
                            style={{ width: '18px', height: '18px', accentColor: '#15803d' }}
                          />
                          Confirmado
                        </label>
                      </td>

                      <td style={tdStyle}>
                        <select
                          value={item.statusPagamento}
                          onChange={(event) =>
                            handleCampo(item.id, 'statusPagamento', event.target.value)
                          }
                          disabled={!podeMutarFinanceiro}
                          style={{
                            ...inputTabelaStyle,
                            opacity: podeMutarFinanceiro ? 1 : 0.65,
                          }}
                        >
                          <option value="">Selecione</option>
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        <div style={{ marginTop: '8px' }}>
                          <span
                            style={{
                              ...badgeBaseStyle,
                              ...getStatusStyle(item.statusPagamento),
                            }}
                          >
                            {item.statusPagamento || 'Sem status'}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                            marginTop: '8px',
                          }}
                        >
                          {semValor && <span style={alertaPendenteStyle}>Sem valor</span>}
                          {semVencimento && (
                            <span style={alertaPendenteStyle}>Sem vencimento</span>
                          )}
                          {vencido && <span style={alertaVencidoStyle}>Vencido</span>}
                          {!semValor && !semVencimento && !vencido && (
                            <span style={alertaOkStyle}>OK</span>
                          )}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={{
                            ...botaoSalvarStyle,
                            opacity: salvandoId === item.id || !podeMutarFinanceiro ? 0.55 : 1,
                            cursor:
                              salvandoId === item.id || !podeMutarFinanceiro
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                          title={
                            !podeMutarFinanceiro
                              ? 'Apenas financeiro ou administrador pode salvar.'
                              : undefined
                          }
                          onClick={() => void salvarItem(item)}
                          disabled={salvandoId === item.id || !podeMutarFinanceiro}
                        >
                          {salvandoId === item.id ? 'Salvando...' : 'Salvar'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {itemDetalhe ? (
          <FinanceiroConferenciaDetalhe
            item={itemDetalhe}
            podeMutar={podeMutarFinanceiro}
            observacaoEdit={itemDetalhe.observacoesColeta}
            onChangeObservacao={(v) => handleCampo(itemDetalhe.id, 'observacoesColeta', v)}
            onMarcarPago={() => void marcarPagamentoRapido(itemDetalhe, 'Pago')}
            onMarcarPendente={() => void marcarPagamentoRapido(itemDetalhe, 'Pendente')}
            onIrProgramacao={() => irProgramacao(itemDetalhe)}
            onIrMtr={() => irMtr(itemDetalhe)}
            onIrControleMassa={() => irControleMassa(itemDetalhe)}
            onGuardar={() => void salvarItem(itemDetalhe)}
            salvando={salvandoId === itemDetalhe.id}
            podeAlterarValorTravado={podeAlterarValorTravado}
            registrandoBaixa={salvandoBaixaId === itemDetalhe.id}
            onRegistrarBaixa={(v, o) => void registrarBaixaDetalhe(itemDetalhe, v, o)}
          />
        ) : null}

        {!loading && itensRelatorio.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              {itensRelatorio.length} coleta(s) nesta vista
              {somenteVencidos ? ' vencida(s)' : ''}
              {buscaDebounced.trim() ? ' · busca ativa' : ''} · mostrando{' '}
              {(pageTab - 1) * pageSizeTab + 1}–{Math.min(pageTab * pageSizeTab, itensRelatorio.length)}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Por página
                <select
                  value={pageSizeTab}
                  onChange={(e) => setPageSizeTab(Number(e.target.value))}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pageTab <= 1}
                onClick={() => setPageTab((p) => Math.max(1, p - 1))}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: pageTab <= 1 ? '#f1f5f9' : '#ffffff',
                  cursor: pageTab <= 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                Anterior
              </button>
              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                Página {pageTab} / {totalPaginasFin}
              </span>
              <button
                type="button"
                disabled={pageTab >= totalPaginasFin}
                onClick={() => setPageTab((p) => Math.min(totalPaginasFin, p + 1))}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: pageTab >= totalPaginasFin ? '#f1f5f9' : '#ffffff',
                  cursor: pageTab >= totalPaginasFin ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                Seguinte
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ ...cardPrincipalStyle, marginBottom: 0 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a', fontWeight: 800 }}>
          Documentos (vencimentos)
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
          Controlo de documentos com <strong>nome</strong> e <strong>data de vencimento</strong>. Alerta visual até{' '}
          {DIAS_ALERTA_DOC} dias antes (e vencidos).
        </p>

        <form
          onSubmit={adicionarDocumento}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            alignItems: 'end',
            marginBottom: '18px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
              Nome do documento
            </div>
            <input
              value={docNome}
              onChange={(e) => setDocNome(e.target.value)}
              disabled={!podeMutarFinanceiro}
              placeholder="Ex.: Licença ambiental"
              style={{ ...inputStyle, padding: '10px 12px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
              Data vencimento
            </div>
            <input
              type="date"
              value={docVenc}
              onChange={(e) => setDocVenc(e.target.value)}
              disabled={!podeMutarFinanceiro}
              style={{ ...inputStyle, padding: '10px 12px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
              Coleta (opcional)
            </div>
            <select
              value={docColetaId}
              onChange={(e) => setDocColetaId(e.target.value)}
              disabled={!podeMutarFinanceiro}
              style={{ ...inputStyle, padding: '10px 12px' }}
            >
              <option value="">—</option>
              {itens.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} — {c.cliente}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!podeMutarFinanceiro || salvandoDoc}
            style={{
              ...botaoSalvarStyle,
              opacity: !podeMutarFinanceiro || salvandoDoc ? 0.55 : 1,
              height: '42px',
            }}
          >
            {salvandoDoc ? 'A guardar…' : 'Adicionar documento'}
          </button>
        </form>

        {loadingDocs ? (
          <p style={{ color: '#64748b' }}>A carregar documentos…</p>
        ) : documentos.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '14px' }}>Nenhum documento registado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: '720px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Documento</th>
                  <th style={thStyle}>Vencimento</th>
                  <th style={thStyle}>Coleta</th>
                  <th style={thStyle}>Alerta</th>
                  <th style={thStyle}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((d) => {
                  const al = alertaDocumento30(d.data_vencimento)
                  const dias = diasAte(d.data_vencimento)
                  const coletaRef = d.coleta_id
                    ? itens.find((x) => x.id === d.coleta_id)
                    : null
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={tdStyle}>{d.nome_documento}</td>
                      <td style={tdStyle}>{formatDate(d.data_vencimento)}</td>
                      <td style={tdStyle}>
                        {coletaRef ? `${coletaRef.numero} · ${coletaRef.cliente}` : '—'}
                      </td>
                      <td style={tdStyle}>
                        {al === 'vencido' ? (
                          <span style={alertaVencidoStyle}>Vencido</span>
                        ) : al === 'critico' && dias !== null ? (
                          <span style={alertaPendenteStyle}>
                            {dias === 0 ? 'Hoje' : `Em ${dias} dia(s)`}
                          </span>
                        ) : (
                          <span style={alertaOkStyle}>OK</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => void removerDocumento(d.id)}
                          disabled={!podeMutarFinanceiro}
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: podeMutarFinanceiro ? 'pointer' : 'not-allowed',
                            opacity: podeMutarFinanceiro ? 1 : 0.5,
                          }}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      <FaturamentoModalRegisto
        open={fatModalAberto}
        row={fatModalRow}
        podeMutar={podeMutarFaturamento}
        onClose={fecharModalFaturamento}
        onGravado={() => void carregarDados()}
        navegarAposEmitir={false}
      />
    </MainLayout>
  )
}

const cardResumoStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
}

const cardResumoTituloStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '14px',
  marginBottom: '8px',
}

const cardResumoValorStyle: CSSProperties = {
  color: '#0f172a',
  fontSize: '30px',
  fontWeight: 800,
}

const cardPrincipalStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
  marginBottom: '24px',
}

const erroStyle: CSSProperties = {
  marginBottom: '20px',
  padding: '14px 16px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#b91c1c',
  borderRadius: '12px',
}

const sucessoStyle: CSSProperties = {
  marginBottom: '20px',
  padding: '14px 16px',
  backgroundColor: '#ecfdf5',
  border: '1px solid #bbf7d0',
  color: '#15803d',
  borderRadius: '12px',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1320px',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '14px 12px',
  fontSize: '14px',
  color: '#475569',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
}

const tdStyle: CSSProperties = {
  padding: '14px 12px',
  fontSize: '14px',
  color: '#0f172a',
  verticalAlign: 'top',
}

const emptyTdStyle: CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  color: '#64748b',
  fontSize: '14px',
}

const badgeBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  fontSize: '14px',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
}

const inputTabelaStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
}

const subInfoStyle: CSSProperties = {
  marginTop: '6px',
  fontSize: '12px',
  color: '#64748b',
}

const botaoSalvarStyle: CSSProperties = {
  backgroundColor: '#22c55e',
  color: '#052e16',
  border: 'none',
  borderRadius: '10px',
  padding: '10px 14px',
  fontSize: '13px',
  fontWeight: 800,
  cursor: 'pointer',
}

const botaoSecundarioStyle: CSSProperties = {
  backgroundColor: '#e5e7eb',
  color: '#111827',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoContextoNavStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#0f172a',
  border: '1px solid #86efac',
  borderRadius: '10px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const botaoLimparContextoStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#64748b',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
}

const alertaPendenteStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  backgroundColor: '#fef3c7',
  color: '#b45309',
}

const alertaVencidoStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  backgroundColor: '#fee2e2',
  color: '#dc2626',
}

const alertaOkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  backgroundColor: '#dcfce7',
  color: '#15803d',
}
