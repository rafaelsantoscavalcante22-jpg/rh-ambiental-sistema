import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import {
  CHECKLIST_MOTORISTA_ITENS,
  mesclarRespostasChecklistMotorista,
  respostasChecklistMotoristaIniciais,
  serializarRespostasMotoristaParaGravar,
  type RespostaChecklistItem,
  type RespostasChecklistMotorista,
} from '../lib/checklistMotoristaItens'
import { idsContextoFromSearchParams, resolverColetaPorContextoUrl } from '../lib/coletaContextoUrl'
import {
  formatarEtapaParaUI,
  formatarFaseFluxoOficialParaUI,
  normalizarEtapaColeta,
  type EtapaFluxo,
} from '../lib/fluxoEtapas'
import { COLETAS_DROPDOWN_MAX_ROWS } from '../lib/coletasQueryLimits'
import { queryColetasListaResumoFluxo } from '../lib/coletasSelectSeguimento'
import { cargoPodeEditarChecklistTransporte } from '../lib/workflowPermissions'
import { BRAND_LOGO_MARK } from '../lib/brandLogo'
import ChecklistTransporte from '../components/ChecklistTransporte'
import { RgReportPdfIcon } from '../components/ui/RgReportPdfIcon'
import { useSessionObjectDraft } from '../lib/usePageSessionPersistence'
import {
  extrairFolhaBrutaDeRespostas,
  folhaConferenciaVazia,
  folhaPrefillParaColeta,
  incorporarFolhaNasRespostas,
  mesclarFolhaConferenciaTransporte,
  ROTAS_CONFERENCIA_LINHAS,
  type FolhaConferenciaTransporte,
} from '../lib/conferenciaTransporteFolha'
import { ConferenciaTransporteFolhaPrintView } from '../components/ConferenciaTransporteFolhaPrint'

type ColetaResumo = {
  id: string
  numero: string
  cliente: string
  etapaFluxo: EtapaFluxo
  mtr_id: string | null
  /** Número da MTR (carregado à parte para pesquisa e rótulo). */
  mtr_numero: string
  programacao_id: string | null
  cliente_id: string | null
  placa: string
  motorista: string
  /** Ticket operacional / numeração interna, quando existir na coleta. */
  ticket_numero: string
}

function textoColetaParaBusca(c: ColetaResumo): string {
  const fase = formatarFaseFluxoOficialParaUI(c.etapaFluxo)
  const etapa = formatarEtapaParaUI(c.etapaFluxo)
  return [
    c.numero,
    c.cliente,
    c.mtr_numero,
    c.placa,
    c.motorista,
    fase,
    etapa,
    c.mtr_id ?? '',
    c.id,
  ]
    .join(' ')
    .toLowerCase()
}

/** Cada palavra da pesquisa tem de aparecer em algum campo (nº, nome, MTR, placa…). */
function coletaCorrespondePesquisa(c: ColetaResumo, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const hay = textoColetaParaBusca(c)
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.every((t) => hay.includes(t))
}

function montarParamsColeta(c: ColetaResumo) {
  const p = new URLSearchParams()
  p.set('coleta', c.id)
  if (c.mtr_id) p.set('mtr', c.mtr_id)
  if (c.programacao_id) p.set('programacao', c.programacao_id)
  if (c.cliente_id) p.set('cliente', c.cliente_id)
  return p
}

/** Cor de destaque única (identidade verde RG / fluxo operacional). */
const ACCENT = '#0d9488'

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  borderTop: `4px solid ${ACCENT}`,
  padding: '24px 28px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
  marginBottom: '22px',
}

/** Campos de texto pequenos na folha (ecrã). */
const inpFolha: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
}

function hojeBr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function ConferenciaTransporte() {
  const [searchParams, setSearchParams] = useSearchParams()
  const idsCtx = useMemo(() => idsContextoFromSearchParams(searchParams), [searchParams])

  const [coletas, setColetas] = useState<ColetaResumo[]>([])
  const [carregandoColetas, setCarregandoColetas] = useState(true)
  const [cargo, setCargo] = useState<string | null>(null)
  const [erroListaColetas, setErroListaColetas] = useState('')
  const [pesquisaColeta, setPesquisaColeta] = useState('')
  const pickerColetaRef = useRef<HTMLDivElement | null>(null)

  const [checklistMotoristaId, setChecklistMotoristaId] = useState<string | null>(null)
  const [respostasMotorista, setRespostasMotorista] = useState<RespostasChecklistMotorista>(() =>
    respostasChecklistMotoristaIniciais()
  )
  const [folha, setFolha] = useState<FolhaConferenciaTransporte>(() => folhaConferenciaVazia())
  const [assinaturaMotorista, setAssinaturaMotorista] = useState('')
  const [assinaturaResponsavel, setAssinaturaResponsavel] = useState('')
  const [carregandoChecklistMotorista, setCarregandoChecklistMotorista] = useState(false)
  const [salvandoMotorista, setSalvandoMotorista] = useState(false)
  const [mensagemMotorista, setMensagemMotorista] = useState('')
  const [erroMotorista, setErroMotorista] = useState('')

  const [secaoColetaExpandida, setSecaoColetaExpandida] = useState(true)
  const [secaoChecklistExpandida, setSecaoChecklistExpandida] = useState(false)
  const coletaIdAnteriorAccordionRef = useRef<string | null>(null)

  const conferenciaTransporteDraft = useMemo(
    () => ({
      pesquisaColeta,
      sp: searchParams.toString(),
      respostasMotorista,
      folha,
      assinaturaMotorista,
      assinaturaResponsavel,
      secaoColetaExpandida,
      secaoChecklistExpandida,
    }),
    [
      pesquisaColeta,
      searchParams,
      respostasMotorista,
      folha,
      assinaturaMotorista,
      assinaturaResponsavel,
      secaoColetaExpandida,
      secaoChecklistExpandida,
    ]
  )

  useSessionObjectDraft({
    cacheKey: 'conferencia-transporte',
    data: conferenciaTransporteDraft,
    onRestore: (d) => {
      setPesquisaColeta(d.pesquisaColeta)
      setSearchParams(new URLSearchParams(d.sp), { replace: true })
      setRespostasMotorista(d.respostasMotorista)
      const legado = d as { folha?: FolhaConferenciaTransporte; observacoesMotorista?: string }
      let f = legado.folha ?? folhaConferenciaVazia()
      if (!f.avarias.trim() && legado.observacoesMotorista?.trim()) {
        f = { ...f, avarias: legado.observacoesMotorista.trim() }
      }
      setFolha(f)
      setAssinaturaMotorista(d.assinaturaMotorista)
      setAssinaturaResponsavel(d.assinaturaResponsavel)
      setSecaoColetaExpandida(d.secaoColetaExpandida)
      setSecaoChecklistExpandida(d.secaoChecklistExpandida)
    },
  })

  const podeMutar = cargoPodeEditarChecklistTransporte(cargo)
  const coletaAtiva = useMemo(
    () => resolverColetaPorContextoUrl(coletas, idsCtx),
    [coletas, idsCtx]
  )
  const podeEditarMotorista = Boolean(coletaAtiva && podeMutar)

  useEffect(() => {
    const id = coletaAtiva?.id ?? null
    const prev = coletaIdAnteriorAccordionRef.current
    if (id && id !== prev) {
      setSecaoColetaExpandida(false)
      setSecaoChecklistExpandida(true)
    }
    if (!id && prev) {
      setSecaoColetaExpandida(true)
      setSecaoChecklistExpandida(false)
    }
    coletaIdAnteriorAccordionRef.current = id
  }, [coletaAtiva?.id])

  const carregarColetas = useCallback(async () => {
    setCarregandoColetas(true)
    setErroListaColetas('')
    const { data, error } = await queryColetasListaResumoFluxo(COLETAS_DROPDOWN_MAX_ROWS)

    if (error) {
      console.error(error)
      setErroListaColetas(
        'Não foi possível carregar as coletas. Verifique sessão ou RLS no Supabase e tente «Atualizar».'
      )
      setColetas([])
      setCarregandoColetas(false)
      return
    }

    const listaBase: ColetaResumo[] = ((data as Record<string, unknown>[]) || []).map((item) => {
      const etapaFluxo = normalizarEtapaColeta({
        fluxo_status: item.fluxo_status as string | null,
        etapa_operacional: item.etapa_operacional as string | null,
      })
      return {
        id: String(item.id),
        numero: String(item.numero_coleta ?? item.numero ?? item.id ?? ''),
        cliente: String(item.cliente ?? item.nome_cliente ?? ''),
        etapaFluxo,
        mtr_id: item.mtr_id != null ? String(item.mtr_id) : null,
        mtr_numero: '',
        programacao_id: item.programacao_id != null ? String(item.programacao_id) : null,
        cliente_id: item.cliente_id != null ? String(item.cliente_id) : null,
        placa: String(item.placa ?? ''),
        motorista: String(item.motorista_nome ?? item.motorista ?? ''),
        ticket_numero: String(
          (item as Record<string, unknown>).ticket_numero ??
            (item as Record<string, unknown>).numero_ticket ??
            ''
        ).trim(),
      }
    })

    const mtrIds = [...new Set(listaBase.map((c) => c.mtr_id).filter((id): id is string => Boolean(id)))]
    const mtrNumeroPorId = new Map<string, string>()
    const mtrChunk = 200
    for (let i = 0; i < mtrIds.length; i += mtrChunk) {
      const slice = mtrIds.slice(i, i + mtrChunk)
      const { data: mrows, error: mErr } = await supabase.from('mtrs').select('id, numero').in('id', slice)
      if (mErr) {
        console.error(mErr)
        continue
      }
      for (const m of (mrows as { id: string; numero?: string | null }[]) || []) {
        mtrNumeroPorId.set(String(m.id), String(m.numero ?? '').trim())
      }
    }

    const lista = listaBase.map((c) => ({
      ...c,
      mtr_numero: c.mtr_id ? mtrNumeroPorId.get(c.mtr_id) ?? '' : '',
    }))
    setColetas(lista)
    setCarregandoColetas(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void carregarColetas()
    })
  }, [carregarColetas])

  useEffect(() => {
    async function carregarCargo() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setCargo(null)
        return
      }
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      setCargo(data?.cargo ?? null)
    }
    void carregarCargo()
  }, [])

  const carregarChecklistMotorista = useCallback(async (coleta: ColetaResumo | null) => {
    if (!coleta) return

    setCarregandoChecklistMotorista(true)
    setErroMotorista('')
    setMensagemMotorista('')
    const { data, error } = await supabase
      .from('checklist_transporte')
      .select('id, respostas, observacoes, assinatura_motorista, assinatura_responsavel')
      .eq('coleta_id', coleta.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(error)
      setErroMotorista('Não foi possível carregar o checklist do motorista.')
      setChecklistMotoristaId(null)
      setRespostasMotorista(respostasChecklistMotoristaIniciais())
      setFolha(folhaConferenciaVazia())
      setAssinaturaMotorista('')
      setAssinaturaResponsavel('')
      setCarregandoChecklistMotorista(false)
      return
    }

    if (data) {
      setChecklistMotoristaId(data.id)
      setRespostasMotorista(mesclarRespostasChecklistMotorista(data.respostas))
      let fMerge = mesclarFolhaConferenciaTransporte(
        extrairFolhaBrutaDeRespostas(data.respostas),
        data.observacoes
      )
      if (!fMerge.dataStr.trim()) {
        fMerge = { ...fMerge, dataStr: hojeBr() }
      }
      setFolha(fMerge)
      setAssinaturaMotorista(data.assinatura_motorista ?? '')
      setAssinaturaResponsavel(data.assinatura_responsavel ?? '')
    } else {
      setChecklistMotoristaId(null)
      setRespostasMotorista(respostasChecklistMotoristaIniciais())
      const pre = folhaPrefillParaColeta({
        dataStr: hojeBr(),
        numeroTicket: coleta.ticket_numero || '',
      })
      if (coleta.cliente) {
        pre.rotas[0] = { ...pre.rotas[0], cliente: coleta.cliente }
      }
      setFolha(pre)
      setAssinaturaMotorista('')
      setAssinaturaResponsavel('')
    }
    setCarregandoChecklistMotorista(false)
  }, [])

  useEffect(() => {
    if (coletaAtiva) {
      queueMicrotask(() => {
        void carregarChecklistMotorista(coletaAtiva)
      })
    } else {
      queueMicrotask(() => {
        setChecklistMotoristaId(null)
        setRespostasMotorista(respostasChecklistMotoristaIniciais())
        setFolha(folhaConferenciaVazia())
        setAssinaturaMotorista('')
        setAssinaturaResponsavel('')
      })
    }
  }, [coletaAtiva, carregarChecklistMotorista])

  function aoEscolherColeta(id: string) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set('coleta', id)
    else p.delete('coleta')
    setSearchParams(p, { replace: true })
    setMensagemMotorista('')
    setErroMotorista('')
    setPesquisaColeta('')
  }

  function setRespostaMotorista(id: string, valor: RespostaChecklistItem) {
    if (!podeEditarMotorista) return
    setRespostasMotorista((prev) => ({ ...prev, [id]: valor }))
  }

  function imprimirDocumentoUnificado() {
    requestAnimationFrame(() => window.print())
  }

  async function handleSubmitMotorista(e: FormEvent) {
    e.preventDefault()
    if (!coletaAtiva || !podeEditarMotorista) return

    const todosRespondidos = CHECKLIST_MOTORISTA_ITENS.every((i) => respostasMotorista[i.id] !== null)
    if (!todosRespondidos) {
      const ok = window.confirm(
        'Ainda há itens do checklist sem SIM ou NÃO. Deseja gravar mesmo assim?'
      )
      if (!ok) return
    }

    setSalvandoMotorista(true)
    setErroMotorista('')
    setMensagemMotorista('')

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const agora = new Date().toISOString()
    const respostasJson = incorporarFolhaNasRespostas(
      serializarRespostasMotoristaParaGravar(respostasMotorista),
      folha
    )
    const payloadBase = {
      coleta_id: coletaAtiva.id,
      respostas: respostasJson as unknown as Record<string, unknown>,
      observacoes: folha.avarias.trim() || null,
      assinatura_motorista: assinaturaMotorista.trim() || null,
      assinatura_responsavel: assinaturaResponsavel.trim() || null,
      preenchido_por: user?.id ?? null,
      updated_at: agora,
    }

    try {
      const { data: existente, error: errSel } = await supabase
        .from('checklist_transporte')
        .select('id')
        .eq('coleta_id', coletaAtiva.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (errSel) throw errSel

      if (existente?.id) {
        const { error } = await supabase
          .from('checklist_transporte')
          .update({
            respostas: payloadBase.respostas,
            observacoes: payloadBase.observacoes,
            assinatura_motorista: payloadBase.assinatura_motorista,
            assinatura_responsavel: payloadBase.assinatura_responsavel,
            preenchido_por: payloadBase.preenchido_por,
            updated_at: payloadBase.updated_at,
          })
          .eq('id', existente.id)
        if (error) throw error
        setChecklistMotoristaId(existente.id)
        setMensagemMotorista('Conferência de transportes atualizada.')
      } else {
        const { data, error } = await supabase
          .from('checklist_transporte')
          .insert({
            coleta_id: payloadBase.coleta_id,
            respostas: payloadBase.respostas,
            observacoes: payloadBase.observacoes,
            assinatura_motorista: payloadBase.assinatura_motorista,
            assinatura_responsavel: payloadBase.assinatura_responsavel,
            preenchido_por: payloadBase.preenchido_por,
          })
          .select('id')
          .single()
        if (error) throw error
        if (data?.id) setChecklistMotoristaId(data.id)
        setMensagemMotorista('Conferência de transportes gravada.')
      }
    } catch (err: unknown) {
      console.error(err)
      setErroMotorista(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSalvandoMotorista(false)
    }
  }

  const opcoesSelect = useMemo(() => {
    const sorted = [...coletas].sort((a, b) =>
      String(b.numero).localeCompare(String(a.numero), undefined, { numeric: true })
    )
    if (coletaAtiva && !sorted.some((c) => c.id === coletaAtiva.id)) return [coletaAtiva, ...sorted]
    return sorted
  }, [coletas, coletaAtiva])

  const opcoesColetaFiltradas = useMemo(
    () => opcoesSelect.filter((c) => coletaCorrespondePesquisa(c, pesquisaColeta)),
    [opcoesSelect, pesquisaColeta]
  )

  return (
    <MainLayout>
      <style>{`
        @media screen {
          .ct-print-unificado { display: none !important; }
          .conf-trans-screen {
            max-width: 1080px;
            margin: 0 auto;
            width: 100%;
            padding: 20px clamp(16px, 2.5vw, 32px) 56px;
            box-sizing: border-box;
          }
          .conf-trans-hero-logo {
            height: 40px;
            width: auto;
            max-width: min(220px, 80vw);
            display: block;
            margin: 0 auto 18px;
            object-fit: contain;
          }
          .conf-trans-stepper {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 8px 10px;
            margin: 0 auto 28px;
            max-width: 800px;
            padding: 14px 20px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            font-size: 13px;
            font-weight: 600;
            color: #475569;
          }
          .conf-trans-stepper .conf-trans-step-num {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 26px;
            height: 26px;
            padding: 0 8px;
            color: #fff;
            font-weight: 800;
            font-size: 12px;
            background: #0d9488;
            border-radius: 999px;
          }
          .conf-trans-stepper .conf-trans-step-sep {
            color: #cbd5e1;
            font-weight: 400;
            user-select: none;
          }
          .conf-trans-table-wrap {
            border-radius: 12px;
            overflow: auto;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .conf-trans-checklist-unico {
            max-width: 720px;
            margin-left: auto;
            margin-right: auto;
            width: 100%;
          }
          .conf-trans-coleta-picker {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .conf-trans-coleta-search {
            width: 100%;
            padding: 11px 14px;
            border-radius: 10px;
            border: 1px solid #cbd5e1;
            font-size: 14px;
            box-sizing: border-box;
            outline: none;
          }
          .conf-trans-coleta-search:focus {
            border-color: ${ACCENT};
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
          }
          .conf-trans-coleta-search:disabled {
            opacity: 0.65;
            cursor: not-allowed;
            background: #f1f5f9;
          }
          .conf-trans-coleta-list {
            max-height: min(340px, 44vh);
            overflow: auto;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            background: #f1f5f9;
          }
          .conf-trans-coleta-row {
            display: block;
            width: 100%;
            text-align: left;
            padding: 11px 14px;
            font-size: 13px;
            line-height: 1.45;
            border: none;
            border-bottom: 1px solid #e2e8f0;
            background: #fff;
            cursor: pointer;
            color: #0f172a;
          }
          .conf-trans-coleta-row:last-child {
            border-bottom: none;
          }
          .conf-trans-coleta-row:hover {
            background: #ecfdf5;
          }
          .conf-trans-coleta-row--active {
            background: #ccfbf1;
            font-weight: 700;
          }
          .conf-trans-acc-trigger {
            font: inherit;
            border: none;
            background: transparent;
            cursor: pointer;
            padding: 4px 0;
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
            min-width: 0;
            text-align: left;
            border-radius: 10px;
          }
          .conf-trans-acc-trigger:hover {
            background: rgba(13, 148, 136, 0.06);
          }
          .conf-trans-acc-trigger:focus-visible {
            outline: 2px solid ${ACCENT};
            outline-offset: 2px;
          }
          .conf-trans-acc-chevron {
            flex-shrink: 0;
            font-size: 11px;
            color: #64748b;
            transition: transform 0.2s ease;
          }
        }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html,
          body {
            width: 100% !important;
            min-height: auto !important;
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Mesmo critério da MTR: o sidebar ficava invisível mas ainda ocupava largura. */
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
          body * {
            visibility: hidden !important;
          }
          .ct-print-unificado,
          .ct-print-unificado * {
            visibility: visible !important;
          }
          .ct-print-unificado {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            margin: 0 !important;
            padding: 8mm 12mm 12mm !important;
            z-index: 999999 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            box-sizing: border-box !important;
            background: #fff !important;
            min-height: auto !important;
          }
          .ct-print-unificado-inner {
            max-width: 200mm !important;
            width: 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            text-align: left !important;
            box-sizing: border-box !important;
          }
          .ct-print-mtr-body {
            text-align: left !important;
            max-width: 100% !important;
            width: 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            box-sizing: border-box !important;
          }
          .conf-trans-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="conf-trans-no-print conf-trans-screen">
        <header style={{ textAlign: 'center', marginBottom: 24 }}>
          <img className="conf-trans-hero-logo" src={BRAND_LOGO_MARK} alt="RG Ambiental" />
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(24px, 2.5vw, 30px)',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            Conferência de transportes
          </h1>
          <p style={{ margin: '14px auto 0', maxWidth: 620, fontSize: '15px', color: '#64748b', lineHeight: 1.6 }}>
            Fluxo em <strong>2 passos</strong>: escolha a coleta e preencha a <strong>folha modelo RG Ambiental Transportes</strong>{' '}
            (dados de viagem, tabela de clientes, <strong>conferência do caminhão</strong> com SIM/NÃO, termo e assinaturas).
            O PDF segue o mesmo layout do papel.
          </p>
          {coletaAtiva ? (
            <div style={{ marginTop: 22 }}>
              <button
                type="button"
                className="rg-btn rg-btn--report"
                onClick={imprimirDocumentoUnificado}
                style={{ paddingLeft: 24, paddingRight: 24 }}
              >
                <RgReportPdfIcon className="rg-btn__icon" />
                Relatório (PDF)
              </button>
            </div>
          ) : null}
        </header>

        <div className="conf-trans-stepper" role="navigation" aria-label="Etapas da conferência">
          <span className="conf-trans-step-num">1</span> Coleta
          <span className="conf-trans-step-sep" aria-hidden>
            →
          </span>
          <span className="conf-trans-step-num">2</span> Folha de conferência (modelo RG)
        </div>

        {erroListaColetas ? (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '14px',
            }}
          >
            {erroListaColetas}{' '}
            <button
              type="button"
              onClick={() => void carregarColetas()}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #991b1b',
                background: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Tentar de novo
            </button>
          </div>
        ) : null}

        <div style={cardStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: secaoColetaExpandida ? 14 : 8,
            }}
          >
            <button
              type="button"
              className="conf-trans-acc-trigger"
              aria-expanded={secaoColetaExpandida}
              onClick={() => setSecaoColetaExpandida((v) => !v)}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#fff',
                  background: ACCENT,
                  borderRadius: 10,
                  padding: '5px 11px',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                1
              </span>
              <span className="conf-trans-acc-title" style={{ fontWeight: 800, color: '#0f172a', fontSize: 17 }}>
                Coleta
              </span>
              <span
                className="conf-trans-acc-chevron"
                style={{ transform: secaoColetaExpandida ? 'rotate(180deg)' : 'none' }}
                aria-hidden
              >
                ▼
              </span>
            </button>
            <button
              type="button"
              onClick={() => void carregarColetas()}
              disabled={carregandoColetas}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '13px',
                fontWeight: 600,
                cursor: carregandoColetas ? 'wait' : 'pointer',
                flexShrink: 0,
              }}
            >
              {carregandoColetas ? 'A carregar…' : 'Atualizar lista'}
            </button>
          </div>

          {!secaoColetaExpandida ? (
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
              {coletaAtiva ? (
                <>
                  <strong>Selecionada:</strong> {coletaAtiva.numero} — {coletaAtiva.cliente || 'Cliente'} ·{' '}
                  {coletaAtiva.mtr_numero ? `MTR ${coletaAtiva.mtr_numero}` : 'Sem MTR'}
                </>
              ) : (
                <>Clique em «Coleta» para expandir e escolher uma coleta.</>
              )}
            </p>
          ) : null}

          {secaoColetaExpandida ? (
          <>
          <div ref={pickerColetaRef} className="conf-trans-coleta-picker">
            <label
              htmlFor="conf-trans-coleta-search"
              style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block' }}
            >
              Pesquisar coleta (nº, cliente, MTR, placa, motorista, etapa)
            </label>
            <input
              id="conf-trans-coleta-search"
              type="search"
              className="conf-trans-coleta-search"
              value={pesquisaColeta}
              onChange={(e) => setPesquisaColeta(e.target.value)}
              disabled={carregandoColetas}
              placeholder="Ex.: 96999 · delta · MTR 12 · ABC1D23"
              autoComplete="off"
              spellCheck={false}
            />
            <div
              className="conf-trans-coleta-list"
              role="listbox"
              aria-label="Lista de coletas"
              aria-busy={carregandoColetas}
            >
              {carregandoColetas ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  A carregar…
                </div>
              ) : opcoesColetaFiltradas.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  Nenhuma coleta corresponde à pesquisa. Limpe o filtro ou tente outro termo.
                </div>
              ) : (
                opcoesColetaFiltradas.map((c) => {
                  const ativa = coletaAtiva?.id === c.id
                  const mtrRot = c.mtr_numero ? `MTR ${c.mtr_numero}` : 'Sem MTR'
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={ativa}
                      className={`conf-trans-coleta-row${ativa ? ' conf-trans-coleta-row--active' : ''}`}
                      onClick={() => aoEscolherColeta(c.id)}
                    >
                      <span style={{ color: '#0f766e', fontWeight: 800 }}>{c.numero}</span>
                      {' — '}
                      {c.cliente || 'Cliente'}
                      <span style={{ color: '#64748b', fontWeight: 600 }}>
                        {' · '}
                        {mtrRot}
                        {' · '}
                        {formatarFaseFluxoOficialParaUI(c.etapaFluxo)} ({formatarEtapaParaUI(c.etapaFluxo)})
                        {(c.placa || c.motorista) && (
                          <>
                            {' · '}
                            {c.placa ? <span>{c.placa}</span> : null}
                            {c.placa && c.motorista ? ' · ' : null}
                            {c.motorista ? <span>{c.motorista}</span> : null}
                          </>
                        )}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            {!carregandoColetas ? (
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                {opcoesColetaFiltradas.length} de {opcoesSelect.length} coleta(s) na lista.
                {pesquisaColeta.trim() ? (
                  <button
                    type="button"
                    onClick={() => setPesquisaColeta('')}
                    style={{
                      marginLeft: 10,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      cursor: 'pointer',
                      color: '#475569',
                    }}
                  >
                    Limpar pesquisa
                  </button>
                ) : null}
              </p>
            ) : null}
          </div>
          {coletaAtiva ? (
            <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#64748b' }}>
              <strong>Fase:</strong> {formatarFaseFluxoOficialParaUI(coletaAtiva.etapaFluxo)}{' '}
              <span style={{ color: '#94a3b8' }}>({formatarEtapaParaUI(coletaAtiva.etapaFluxo)})</span> ·{' '}
              <strong>Placa:</strong>{' '}
              {coletaAtiva.placa || '—'} · <strong>Motorista:</strong> {coletaAtiva.motorista || '—'} ·{' '}
              <Link to={`/controle-massa?${montarParamsColeta(coletaAtiva).toString()}`} style={{ fontWeight: 700 }}>
                Controle de Massa
              </Link>
            </p>
          ) : null}
          </>
          ) : null}
        </div>

        {coletaAtiva ? (
          <form onSubmit={handleSubmitMotorista} style={cardStyle}>
            <div style={{ marginBottom: secaoChecklistExpandida ? 14 : 8 }}>
              <button
                type="button"
                className="conf-trans-acc-trigger"
                style={{ width: '100%', marginBottom: secaoChecklistExpandida ? 6 : 0 }}
                aria-expanded={secaoChecklistExpandida}
                onClick={() => setSecaoChecklistExpandida((v) => !v)}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#fff',
                    background: ACCENT,
                    borderRadius: 10,
                    padding: '5px 11px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  2
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="conf-trans-acc-title"
                    style={{ fontWeight: 800, color: '#0f172a', fontSize: 17, display: 'block' }}
                  >
                    Folha de conferência (modelo papel)
                  </span>
                </span>
                <span
                  className="conf-trans-acc-chevron"
                  style={{ transform: secaoChecklistExpandida ? 'rotate(180deg)' : 'none' }}
                  aria-hidden
                >
                  ▼
                </span>
              </button>
              {!secaoChecklistExpandida ? (
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b', paddingLeft: '4px' }}>
                  Clique para expandir a folha (dados, rotas, checklist SIM/NÃO, avarias e assinaturas).
                </p>
              ) : null}
            </div>
            {secaoChecklistExpandida ? (
            <>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
              Preencha os campos como no impresso. A placa e o motorista no PDF usam os dados da coleta. Grave ao finalizar.
            </p>

            <div
              style={{
                marginBottom: 20,
                padding: '16px 18px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fafafa',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                Cabeçalho e veículo
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                <strong>Placa</strong> e <strong>motorista</strong> na impressão:{' '}
                <span style={{ color: '#0f766e' }}>{coletaAtiva.placa || '—'}</span> ·{' '}
                <span style={{ color: '#0f766e' }}>{coletaAtiva.motorista || '—'}</span>. O{' '}
                <strong>ticket nº</strong> pode ser editado (numerar a partir de 1340, conforme procedimento interno).
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Data
                  <input
                    style={inpFolha}
                    value={folha.dataStr}
                    onChange={(e) => setFolha((p) => ({ ...p, dataStr: e.target.value }))}
                    disabled={!podeEditarMotorista}
                    placeholder={hojeBr()}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Ticket nº
                  <input
                    style={inpFolha}
                    value={folha.numeroTicket}
                    onChange={(e) => setFolha((p) => ({ ...p, numeroTicket: e.target.value }))}
                    disabled={!podeEditarMotorista}
                    placeholder="ex.: 1340"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Horário saída RG
                  <input
                    style={inpFolha}
                    value={folha.horarioSaidaRg}
                    onChange={(e) => setFolha((p) => ({ ...p, horarioSaidaRg: e.target.value }))}
                    disabled={!podeEditarMotorista}
                    placeholder="__:__"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Horário chegada
                  <input
                    style={inpFolha}
                    value={folha.horarioChegada}
                    onChange={(e) => setFolha((p) => ({ ...p, horarioChegada: e.target.value }))}
                    disabled={!podeEditarMotorista}
                    placeholder="__:__"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Pedágio (1)
                  <input
                    style={inpFolha}
                    value={folha.pedagio1}
                    onChange={(e) => setFolha((p) => ({ ...p, pedagio1: e.target.value }))}
                    disabled={!podeEditarMotorista}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Pedágio (2)
                  <input
                    style={inpFolha}
                    value={folha.pedagio2}
                    onChange={(e) => setFolha((p) => ({ ...p, pedagio2: e.target.value }))}
                    disabled={!podeEditarMotorista}
                  />
                </label>
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#475569',
                    gridColumn: '1 / -1',
                  }}
                >
                  Nome do ajudante
                  <input
                    style={inpFolha}
                    value={folha.nomeAjudante}
                    onChange={(e) => setFolha((p) => ({ ...p, nomeAjudante: e.target.value }))}
                    disabled={!podeEditarMotorista}
                  />
                </label>
              </div>

              <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      {['Veículo', 'Qtd. combustível', 'Km inicial', 'Km final', 'Km total'].map((h) => (
                        <th
                          key={h}
                          style={{
                            border: '1px solid #cbd5e1',
                            padding: '8px',
                            textAlign: 'center',
                            fontWeight: 800,
                            color: '#475569',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                        <input
                          style={{ ...inpFolha, border: 'none' }}
                          value={folha.veiculo}
                          onChange={(e) => setFolha((p) => ({ ...p, veiculo: e.target.value }))}
                          disabled={!podeEditarMotorista}
                          placeholder="Tipo / modelo"
                        />
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                        <input
                          style={{ ...inpFolha, border: 'none' }}
                          value={folha.qtdCombustivel}
                          onChange={(e) => setFolha((p) => ({ ...p, qtdCombustivel: e.target.value }))}
                          disabled={!podeEditarMotorista}
                        />
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                        <input
                          style={{ ...inpFolha, border: 'none' }}
                          value={folha.kmInicial}
                          onChange={(e) => setFolha((p) => ({ ...p, kmInicial: e.target.value }))}
                          disabled={!podeEditarMotorista}
                        />
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                        <input
                          style={{ ...inpFolha, border: 'none' }}
                          value={folha.kmFinal}
                          onChange={(e) => setFolha((p) => ({ ...p, kmFinal: e.target.value }))}
                          disabled={!podeEditarMotorista}
                        />
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                        <input
                          style={{ ...inpFolha, border: 'none' }}
                          value={folha.kmTotal}
                          onChange={(e) => setFolha((p) => ({ ...p, kmTotal: e.target.value }))}
                          disabled={!podeEditarMotorista}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                Clientes / rota (5 linhas)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: 8, width: 36 }}>#</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 8 }}>Cliente</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 8 }}>Km chegada</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 8 }}>Hora entrada</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 8 }}>Hora saída</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folha.rotas.slice(0, ROTAS_CONFERENCIA_LINHAS).map((row, i) => (
                      <tr key={i}>
                        <td style={{ border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 800 }}>{i + 1}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                          <input
                            style={{ ...inpFolha, border: 'none' }}
                            value={row.cliente}
                            onChange={(e) =>
                              setFolha((p) => {
                                const rotas = p.rotas.slice()
                                rotas[i] = { ...rotas[i], cliente: e.target.value }
                                return { ...p, rotas }
                              })
                            }
                            disabled={!podeEditarMotorista}
                            placeholder={i === 2 ? 'ex.: ALMOÇO' : ''}
                          />
                        </td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                          <input
                            style={{ ...inpFolha, border: 'none' }}
                            value={row.kmChegada}
                            onChange={(e) =>
                              setFolha((p) => {
                                const rotas = p.rotas.slice()
                                rotas[i] = { ...rotas[i], kmChegada: e.target.value }
                                return { ...p, rotas }
                              })
                            }
                            disabled={!podeEditarMotorista}
                          />
                        </td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                          <input
                            style={{ ...inpFolha, border: 'none' }}
                            value={row.horaEntrada}
                            onChange={(e) =>
                              setFolha((p) => {
                                const rotas = p.rotas.slice()
                                rotas[i] = { ...rotas[i], horaEntrada: e.target.value }
                                return { ...p, rotas }
                              })
                            }
                            disabled={!podeEditarMotorista}
                          />
                        </td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 4 }}>
                          <input
                            style={{ ...inpFolha, border: 'none' }}
                            value={row.horaSaida}
                            onChange={(e) =>
                              setFolha((p) => {
                                const rotas = p.rotas.slice()
                                rotas[i] = { ...rotas[i], horaSaida: e.target.value }
                                return { ...p, rotas }
                              })
                            }
                            disabled={!podeEditarMotorista}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 8, textAlign: 'center' }}>
              Conferência do caminhão
            </div>
            <div className="conf-trans-checklist-unico">
              <ChecklistTransporte
                itens={CHECKLIST_MOTORISTA_ITENS}
                respostas={respostasMotorista}
                onRespostaChange={(id, valor) => setRespostaMotorista(id, valor)}
                assinaturaMotorista={assinaturaMotorista}
                assinaturaResponsavel={assinaturaResponsavel}
                onAssinaturaMotoristaChange={(v) =>
                  podeEditarMotorista ? setAssinaturaMotorista(v) : undefined
                }
                onAssinaturaResponsavelChange={(v) =>
                  podeEditarMotorista ? setAssinaturaResponsavel(v) : undefined
                }
                observacoes=""
                onObservacoesChange={() => {}}
                mostrarObservacoes={false}
                entreItensEAssinaturas={
                  <div style={{ marginTop: 4, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                      Avarias (termo de responsabilidade)
                    </div>
                    <textarea
                      value={folha.avarias}
                      onChange={(e) => setFolha((p) => ({ ...p, avarias: e.target.value }))}
                      readOnly={!podeEditarMotorista}
                      rows={5}
                      placeholder="Descreva avarias ou deixe em branco se não houver."
                      style={{
                        width: '100%',
                        maxWidth: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        opacity: podeEditarMotorista ? 1 : 0.85,
                      }}
                    />
                  </div>
                }
                disabled={!podeEditarMotorista}
                loading={carregandoChecklistMotorista}
              />
            </div>
            {!carregandoChecklistMotorista ? (
              <>
                {erroMotorista ? (
                  <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '12px', textAlign: 'center' }}>
                    {erroMotorista}
                  </p>
                ) : null}
                {mensagemMotorista ? (
                  <p
                    style={{
                      color: '#15803d',
                      fontSize: '14px',
                      marginTop: '12px',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    {mensagemMotorista}
                  </p>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
                  <button
                    type="submit"
                    disabled={!podeEditarMotorista || salvandoMotorista}
                    style={{
                      padding: '11px 24px',
                      borderRadius: '10px',
                      border: 'none',
                      background: podeEditarMotorista ? ACCENT : '#94a3b8',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: podeEditarMotorista && !salvandoMotorista ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {salvandoMotorista ? 'A gravar…' : checklistMotoristaId ? 'Atualizar folha' : 'Gravar folha'}
                  </button>
                </div>
              </>
            ) : null}
            </>
            ) : null}
          </form>
        ) : null}

        {!coletaAtiva ? (
          <div
            style={{
              ...cardStyle,
              color: '#64748b',
              textAlign: 'center',
              maxWidth: 480,
              margin: '0 auto',
            }}
          >
            Escolha uma coleta acima para preencher a folha de conferência.
          </div>
        ) : null}
      </div>

      {coletaAtiva ? (
        <div className="ct-print-unificado">
          <div
            className="ct-print-unificado-inner"
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#000',
              fontSize: '10pt',
              lineHeight: 1.35,
              width: '100%',
              margin: '0 auto',
            }}
          >
            <div className="ct-print-mtr-body">
              <ConferenciaTransporteFolhaPrintView
                logoSrc={BRAND_LOGO_MARK}
                coleta={{
                  numero: coletaAtiva.numero,
                  cliente: coletaAtiva.cliente,
                  placa: coletaAtiva.placa,
                  motorista: coletaAtiva.motorista,
                  mtr_numero: coletaAtiva.mtr_numero,
                }}
                folha={folha}
                dataExibicao={folha.dataStr.trim() || hojeBr()}
                respostas={respostasMotorista}
                assinaturaMotorista={assinaturaMotorista}
                assinaturaResponsavel={assinaturaResponsavel}
              />
            </div>
          </div>
        </div>
      ) : null}
    </MainLayout>
  )
}
