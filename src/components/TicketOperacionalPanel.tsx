import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  etapaTicketJaRegistradoNoFluxo,
  formatarEtapaParaUI,
  formatarFaseFluxoOficialParaUI,
  type EtapaFluxo,
} from '../lib/fluxoEtapas'
import { cargoPodeEditarTicketOperacional } from '../lib/workflowPermissions'
import { mensagemErroSupabase as mensagemErroSupabaseBase } from '../lib/supabaseErrors'
import { BRAND_LOGO_MARK } from '../lib/brandLogo'

export type TicketColetaSnapshot = {
  id: string
  numero: string
  cliente: string
  etapaFluxo: EtapaFluxo
  mtr_id: string | null
  programacao_id: string | null
  cliente_id: string | null
  placa: string
  motorista: string
  tipo_residuo: string
  peso_tara: number | null
  peso_bruto: number | null
  peso_liquido: number | null
}

export type TipoTicketOperacional = 'entrada' | 'saida' | 'frete'

function normalizarTipoTicket(raw: string | null | undefined): TipoTicketOperacional {
  if (raw === 'frete') return 'frete'
  if (raw === 'entrada') return 'entrada'
  return 'saida'
}

function montarParamsColeta(c: TicketColetaSnapshot) {
  const p = new URLSearchParams()
  p.set('coleta', c.id)
  if (c.mtr_id) p.set('mtr', c.mtr_id)
  if (c.programacao_id) p.set('programacao', c.programacao_id)
  if (c.cliente_id) p.set('cliente', c.cliente_id)
  return p
}

function mensagemErroSupabase(err: unknown): string {
  return mensagemErroSupabaseBase(err, 'Erro desconhecido ao salvar.')
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '18px',
  padding: '22px 24px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  marginBottom: '18px',
}

function formatPesoBr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n))
}

function formatDataHoraBr(iso: string | null | undefined): { data: string; hora: string } {
  if (!iso) return { data: '—', hora: '—' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { data: '—', hora: '—' }
  return {
    data: d.toLocaleDateString('pt-BR'),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

export type TicketOperacionalPanelProps = {
  variant: 'page' | 'embedded'
  coletaAtiva: TicketColetaSnapshot | null
  cargo: string | null
  coletasOpcoes?: TicketColetaSnapshot[]
  carregandoColetas?: boolean
  onTrocarColeta?: (id: string) => void
  onEtapaColetaAlterada?: () => void
  /** Esconde o select de coleta (fluxo integrado ao formulário de pesagem). */
  ocultarSeletorColeta?: boolean
}

export function TicketOperacionalPanel({
  variant,
  coletaAtiva,
  cargo,
  coletasOpcoes = [],
  carregandoColetas = false,
  onTrocarColeta,
  onEtapaColetaAlterada,
  ocultarSeletorColeta = false,
}: TicketOperacionalPanelProps) {
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipoTicket, setTipoTicket] = useState<TipoTicketOperacional>('saida')
  const [criadoEm, setCriadoEm] = useState<string | null>(null)

  const [carregandoTicket, setCarregandoTicket] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [enviandoAprovacao, setEnviandoAprovacao] = useState(false)
  const [editandoTicketGerado, setEditandoTicketGerado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  const [mtrNumeroImpressao, setMtrNumeroImpressao] = useState('')
  const [empresaTransporteImpressao, setEmpresaTransporteImpressao] = useState('RG AMBIENTAL TRANSPORTES.')
  const [balanceiroImpressao, setBalanceiroImpressao] = useState('—')
  const [horaEntradaImpressao, setHoraEntradaImpressao] = useState('—')
  const [horaSaidaImpressao, setHoraSaidaImpressao] = useState('—')
  const [preReqPesagem, setPreReqPesagem] = useState(false)
  const [carregandoPreReq, setCarregandoPreReq] = useState(false)

  const podeMutar = cargoPodeEditarTicketOperacional(cargo)

  const podeEnviarAprovacao = Boolean(coletaAtiva && ticketId && podeMutar)

  const fluxoAlemDoTicket =
    coletaAtiva && etapaTicketJaRegistradoNoFluxo(coletaAtiva.etapaFluxo)

  const reeditarNaEtapaTicketGerado =
    Boolean(coletaAtiva?.etapaFluxo === 'TICKET_GERADO' && editandoTicketGerado && podeMutar)

  const podeEditarFormulario = Boolean(coletaAtiva && podeMutar)

  const carregarDadosImpressao = useCallback(async (coleta: TicketColetaSnapshot) => {
    setMtrNumeroImpressao('')
    setEmpresaTransporteImpressao('RG AMBIENTAL TRANSPORTES.')
    setBalanceiroImpressao('—')
    setHoraEntradaImpressao('—')
    setHoraSaidaImpressao('—')

    if (coleta.mtr_id) {
      const { data } = await supabase.from('mtrs').select('numero').eq('id', coleta.mtr_id).maybeSingle()
      if (data?.numero) setMtrNumeroImpressao(String(data.numero))
    }

    const { data: reg } = await supabase
      .from('controle_massa')
      .select(
        'id, coleta_id, empresa, cliente, balanceiro, balanceiro_nome, usuario_balanceiro, hora_entrada, hora_saida, peso_tara, peso_bruto, peso_liquido, placa, motorista, ajudante, created_at'
      )
      .eq('coleta_id', coleta.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (reg && typeof reg === 'object') {
      const r = reg as Record<string, unknown>
      const emp = r.empresa ?? r.cliente
      if (typeof emp === 'string' && emp.trim()) {
        setEmpresaTransporteImpressao(emp.trim())
      }
      const bal = r.balanceiro ?? r.balanceiro_nome ?? r.usuario_balanceiro
      if (typeof bal === 'string' && bal.trim()) setBalanceiroImpressao(bal.trim())
      const dh = (r.created_at ?? r.data ?? r.updated_at) as string | undefined
      const { data: dStr, hora: hStr } = formatDataHoraBr(dh)
      if (dStr !== '—') {
        setHoraEntradaImpressao(hStr)
        setHoraSaidaImpressao(hStr)
      }
    }
  }, [])

  useEffect(() => {
    if (coletaAtiva) {
      queueMicrotask(() => {
        void carregarDadosImpressao(coletaAtiva)
      })
    }
  }, [coletaAtiva, carregarDadosImpressao])

  useEffect(() => {
    if (!coletaAtiva) {
      queueMicrotask(() => setPreReqPesagem(false))
      return
    }
    let cancel = false
    queueMicrotask(() => setCarregandoPreReq(true))
    void Promise.resolve(
      supabase
        .from('controle_massa')
        .select('id')
        .eq('coleta_id', coletaAtiva.id)
        .limit(1)
        .maybeSingle()
    )
      .then((cmRes) => {
        if (cancel) return
        if (cmRes.error) console.error(cmRes.error)
        setPreReqPesagem(Boolean(cmRes.data?.id))
      })
      .finally(() => {
        if (!cancel) setCarregandoPreReq(false)
      })
    return () => {
      cancel = true
    }
  }, [coletaAtiva])

  const carregarTicket = useCallback(async (coletaId: string) => {
    setCarregandoTicket(true)
    setErro('')
    setMensagem('')

    type LinhaTicketDb = {
      id: string
      numero: string | null
      descricao: string | null
      tipo_ticket?: string | null
      created_at?: string | null
    }

    const aplicarLinha = (data: LinhaTicketDb) => {
      setTicketId(data.id)
      setNumero(data.numero ?? '')
      setDescricao(data.descricao ?? '')
      setTipoTicket(normalizarTipoTicket(data.tipo_ticket as string | null))
      setCriadoEm(data.created_at ?? null)
    }

    let rows: LinhaTicketDb[] | null = null
    let error: { message?: string } | null = null

    const q1 = await supabase
      .from('tickets_operacionais')
      .select('id, numero, descricao, tipo_ticket, created_at')
      .eq('coleta_id', coletaId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (q1.error) {
      const q2 = await supabase
        .from('tickets_operacionais')
        .select('id, numero, descricao, tipo_ticket, created_at')
        .eq('coleta_id', coletaId)
        .limit(1)
      rows = (q2.data as LinhaTicketDb[] | undefined) ?? null
      error = q2.error
    } else {
      rows = (q1.data as LinhaTicketDb[] | undefined) ?? null
      error = q1.error
    }

    if (error) {
      console.error(error)
      setErro('Não foi possível carregar o ticket.')
      setTicketId(null)
      setNumero('')
      setDescricao('')
      setTipoTicket('saida')
      setCriadoEm(null)
      setCarregandoTicket(false)
      return
    }

    const data = rows?.[0]

    if (data) {
      aplicarLinha(data)
    } else {
      setTicketId(null)
      setNumero('')
      setDescricao('')
      setTipoTicket('saida')
      setCriadoEm(null)
    }
    setCarregandoTicket(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => setEditandoTicketGerado(false))
  }, [coletaAtiva?.id])

  useEffect(() => {
    if (coletaAtiva) {
      queueMicrotask(() => {
        void carregarTicket(coletaAtiva.id)
      })
    } else {
      queueMicrotask(() => {
        setTicketId(null)
        setNumero('')
        setDescricao('')
        setTipoTicket('saida')
        setCriadoEm(null)
      })
    }
  }, [coletaAtiva, carregarTicket])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!coletaAtiva || !podeEditarFormulario) return

    const n = numero.trim()
    const d = descricao.trim()
    if (!n && !d) {
      setErro('Indique pelo menos o número ou a descrição do ticket.')
      return
    }

    setSalvando(true)
    setErro('')
    setMensagem('')

    const notificarErecarregar = async () => {
      try {
        onEtapaColetaAlterada?.()
      } catch (e) {
        console.error(e)
      }
      await carregarTicket(coletaAtiva.id).catch((e) => console.error(e))
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const jaEmTicketGerado = coletaAtiva.etapaFluxo === 'TICKET_GERADO'

      const { data: jaExiste, error: errBusca } = await supabase
        .from('tickets_operacionais')
        .select('id')
        .eq('coleta_id', coletaAtiva.id)
        .limit(1)

      if (errBusca) throw errBusca

      const idExistente = ticketId || jaExiste?.[0]?.id

      const payloadTicket = {
        numero: n || null,
        descricao: d || null,
        tipo_ticket: tipoTicket,
        created_by: user?.id ?? null,
      }

      if (idExistente) {
        const { error } = await supabase
          .from('tickets_operacionais')
          .update(payloadTicket)
          .eq('id', idExistente)
        if (error) throw error
        setTicketId(idExistente)
      } else {
        const { data: inseridos, error: errIns } = await supabase
          .from('tickets_operacionais')
          .insert({
            coleta_id: coletaAtiva.id,
            ...payloadTicket,
          })
          .select('id')

        if (errIns) throw errIns

        const novoId = inseridos?.[0]?.id
        if (novoId) {
          setTicketId(novoId)
        } else {
          const { data: deNovo, error: errFetch } = await supabase
            .from('tickets_operacionais')
            .select('id')
            .eq('coleta_id', coletaAtiva.id)
            .limit(1)
          if (errFetch) throw errFetch
          if (deNovo?.[0]?.id) setTicketId(deNovo[0].id)
        }
      }

      if (jaEmTicketGerado) {
        setEditandoTicketGerado(false)
        setMensagem('Ticket atualizado.')
        await notificarErecarregar()
      } else {
        const { error: errColeta } = await supabase
          .from('coletas')
          .update({
            fluxo_status: 'TICKET_GERADO',
            etapa_operacional: 'TICKET_GERADO',
          })
          .eq('id', coletaAtiva.id)

        if (errColeta) {
          console.error(errColeta)
          setErro(
            `Ticket gravado, mas a etapa da coleta não atualizou: ${mensagemErroSupabase(errColeta)}`
          )
          await notificarErecarregar()
        } else {
          setMensagem('Ticket registado. A coleta avançou para «Ticket gerado». Pode enviar para aprovação.')
          await notificarErecarregar()
        }
      }
    } catch (err: unknown) {
      console.error(err)
      setErro(mensagemErroSupabase(err))
    } finally {
      setSalvando(false)
    }
  }

  async function handleEnviarAprovacao() {
    if (!coletaAtiva || !podeEnviarAprovacao) return
    const ok = window.confirm(
      'Enviar este pacote (ticket + contexto) para aprovação da diretoria? A coleta passará a «Em aprovação».'
    )
    if (!ok) return

    setEnviandoAprovacao(true)
    setErro('')
    setMensagem('')

    try {
      const { error } = await supabase
        .from('coletas')
        .update({
          fluxo_status: 'ENVIADO_APROVACAO',
          etapa_operacional: 'ENVIADO_APROVACAO',
        })
        .eq('id', coletaAtiva.id)

      if (error) throw error
      setMensagem('Coleta enviada para aprovação. Abra «Aprovação» para a diretoria decidir.')
      onEtapaColetaAlterada?.()
    } catch (err: unknown) {
      console.error(err)
      setErro(mensagemErroSupabase(err))
    } finally {
      setEnviandoAprovacao(false)
    }
  }

  const opcoesSelect = useMemo(() => {
    const sorted = [...coletasOpcoes].sort((a, b) =>
      String(b.numero).localeCompare(String(a.numero), undefined, { numeric: true })
    )
    if (coletaAtiva && !sorted.some((c) => c.id === coletaAtiva.id)) return [coletaAtiva, ...sorted]
    return sorted
  }, [coletasOpcoes, coletaAtiva])

  const mostrarResumoTicket =
    Boolean(coletaAtiva) &&
    Boolean(ticketId) &&
    !editandoTicketGerado &&
    !carregandoTicket &&
    variant === 'page'

  function handleImprimirTicket() {
    window.print()
  }

  const dataTicketBr = criadoEm
    ? new Date(criadoEm).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')

  const tituloImpressao =
    tipoTicket === 'frete' ? 'FRETE' : tipoTicket === 'entrada' ? 'ENTRADA' : 'SAÍDA'

  const labelTipoTicket: Record<TipoTicketOperacional, string> = {
    entrada: 'Entrada',
    saida: 'Saída',
    frete: 'Frete',
  }

  return (
    <>
      <style>{`
        @media screen {
          .ticket-print-root { display: none !important; }
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
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
          /* Mesmo critério da página MTR: só o documento importa, sem sidebar/cabeçalho. */
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
            visibility: hidden;
          }
          .ticket-print-root,
          .ticket-print-root * {
            visibility: visible;
          }
          .ticket-print-root {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            min-height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            z-index: 999999 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
          }
          .ticket-print-col {
            width: 100% !important;
            max-width: 82mm !important;
            margin: 0 auto !important;
            flex-shrink: 0 !important;
          }
          .ticket-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div id="ticket-operacional-anchor" className="ticket-no-print">
        {variant === 'embedded' && coletaAtiva && ticketId ? (
          <div
            style={{
              marginBottom: '18px',
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 55%, #ecfdf5 100%)',
              border: '1px solid #6ee7b7',
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.12)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#047857',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '6px',
                }}
              >
                Ticket pronto para impressão
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                {numero.trim() ? `N.º ${numero.trim()}` : `Coleta ${coletaAtiva.numero}`}
                <span style={{ color: '#64748b', fontWeight: 600 }}> · </span>
                {coletaAtiva.cliente || '—'}
              </div>
              <div style={{ fontSize: '12px', color: '#047857', marginTop: '6px', fontWeight: 600 }}>
                {labelTipoTicket[tipoTicket]} · Revise os dados abaixo se precisar e imprima
              </div>
            </div>
            <button
              type="button"
              onClick={handleImprimirTicket}
              style={{
                padding: '14px 26px',
                borderRadius: '14px',
                border: 'none',
                background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(5, 150, 105, 0.4)',
                flexShrink: 0,
              }}
            >
              Imprimir ticket
            </button>
          </div>
        ) : null}

        {variant === 'page' ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '8px',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
                Registo e impressão do ticket interno
              </h1>
              <p className="page-header__lead" style={{ margin: '8px 0 0', maxWidth: 720 }}>
                <strong>Seguimento:</strong> após a pesagem no módulo Pesagem e Ticket — registo do{' '}
                <strong>ticket interno</strong> (distinto da MTR). Depois siga para faturamento/financeiro no menu.
              </p>
            </div>
            {coletaAtiva && ticketId ? (
              <button
                type="button"
                onClick={handleImprimirTicket}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Imprimir ticket
              </button>
            ) : null}
          </div>
        ) : (
          <div style={{ marginBottom: '14px' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              {ocultarSeletorColeta ? 'Ticket desta pesagem' : 'Ticket operacional'}
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b', lineHeight: 1.45 }}>
              {ocultarSeletorColeta ? (
                <>
                  Após salvar a pesagem, o ticket é gerado automaticamente. Ajuste <strong>tipo</strong>,{' '}
                  <strong>número</strong> ou <strong>descrição</strong> se precisar e use{' '}
                  <strong>Gravar ticket</strong> antes de imprimir.
                </>
              ) : (
                <>
                  Escolha a coleta abaixo, defina o <strong>tipo</strong> (<strong>saída</strong> ou{' '}
                  <strong>frete</strong>), preencha os dados e grave — gera o ticket para impressão e segue o
                  fluxo até aprovação e faturamento.
                </>
              )}
            </p>
          </div>
        )}

        {variant === 'page' ? (
          <div style={cardStyle}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Coleta</div>
            <select
              value={coletaAtiva?.id ?? ''}
              onChange={(e) => onTrocarColeta?.(e.target.value)}
              disabled={carregandoColetas}
              style={{
                width: '100%',
                maxWidth: 480,
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
            >
              <option value="">
                {carregandoColetas ? 'Carregando…' : 'Selecione a coleta (ou use ?coleta= na URL)'}
              </option>
              {opcoesSelect.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} — {c.cliente || 'Cliente'} · {formatarFaseFluxoOficialParaUI(c.etapaFluxo)} (
                  {formatarEtapaParaUI(c.etapaFluxo)})
                </option>
              ))}
            </select>

            {coletaAtiva ? (
              <div style={{ marginTop: '16px', fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
                <div>
                  <strong>Fase:</strong> {formatarFaseFluxoOficialParaUI(coletaAtiva.etapaFluxo)}{' '}
                  <span style={{ color: '#94a3b8' }}>({formatarEtapaParaUI(coletaAtiva.etapaFluxo)})</span>
                </div>
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>Referência rápida</div>
                  <div style={{ fontSize: '13px', color: '#334155' }}>
                    <strong>Pesagem:</strong>{' '}
                    {carregandoPreReq ? '…' : preReqPesagem ? 'há registo' : 'sem registo'} ·{' '}
                    <Link to={`/controle-massa?${montarParamsColeta(coletaAtiva).toString()}`} style={{ fontWeight: 700 }}>
                      Controle de Massa
                    </Link>
                  </div>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <Link
                    to={`/aprovacao?${montarParamsColeta(coletaAtiva).toString()}`}
                    style={{ color: '#2563eb', fontWeight: 700 }}
                  >
                    Ir para Aprovação →
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        ) : ocultarSeletorColeta && coletaAtiva ? (
          <div
            style={{
              ...cardStyle,
              padding: '14px 18px',
              background: '#f8fafc',
              borderStyle: 'dashed',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
              Coleta ativa
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              {coletaAtiva.numero} · {coletaAtiva.cliente || '—'}
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#475569' }}>
              <strong>Fase:</strong> {formatarFaseFluxoOficialParaUI(coletaAtiva.etapaFluxo)}{' '}
              <span style={{ color: '#94a3b8' }}>({formatarEtapaParaUI(coletaAtiva.etapaFluxo)})</span>
              {' · '}
              <strong>Pesagem:</strong>{' '}
              {carregandoPreReq ? '…' : preReqPesagem ? 'registrada' : 'sem registo'}
            </div>
          </div>
        ) : (
          <div style={{ ...cardStyle, padding: '16px 18px' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>Coleta para o ticket</div>
            <select
              value={coletaAtiva?.id ?? ''}
              onChange={(e) => onTrocarColeta?.(e.target.value)}
              disabled={carregandoColetas || !onTrocarColeta}
              style={{
                width: '100%',
                maxWidth: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
            >
              <option value="">
                {carregandoColetas
                  ? 'A carregar coletas…'
                  : 'Escolha a coleta para gerar o ticket (ou use o formulário de pesagem acima)'}
              </option>
              {opcoesSelect.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} — {c.cliente || 'Cliente'} · {formatarFaseFluxoOficialParaUI(c.etapaFluxo)} (
                  {formatarEtapaParaUI(c.etapaFluxo)})
                </option>
              ))}
            </select>
            {coletaAtiva ? (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                <div>
                  <strong>Fase:</strong> {formatarFaseFluxoOficialParaUI(coletaAtiva.etapaFluxo)}{' '}
                  <span style={{ color: '#94a3b8' }}>({formatarEtapaParaUI(coletaAtiva.etapaFluxo)})</span>
                </div>
                <div style={{ marginTop: '6px', color: '#64748b' }}>
                  <strong>Pesagem no sistema:</strong>{' '}
                  {carregandoPreReq ? '…' : preReqPesagem ? 'há registo — pode gravar o ticket' : 'sem registo — pode gravar o ticket na mesma ou lançar pesagem acima'}
                </div>
              </div>
            ) : (
              <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#64748b', lineHeight: 1.45 }}>
                Depois de escolher a coleta, defina <strong>tipo</strong> (saída / frete), número e texto e use{' '}
                <strong>Gravar ticket</strong>.
              </p>
            )}
          </div>
        )}

        {coletaAtiva ? (
          <>
            {mostrarResumoTicket ? (
              <div style={{ ...cardStyle, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>Ticket</div>
                <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>
                  <strong>Tipo:</strong> {labelTipoTicket[tipoTicket]}
                </p>
                {numero ? (
                  <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#334155' }}>
                    <strong>Número:</strong> {numero}
                  </p>
                ) : null}
                {descricao ? (
                  <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#334155', whiteSpace: 'pre-wrap' }}>
                    <strong>Descrição:</strong> {descricao}
                  </p>
                ) : null}
                {criadoEm ? (
                  <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Registo: {new Date(criadoEm).toLocaleString('pt-BR')}
                  </p>
                ) : null}
                {fluxoAlemDoTicket && coletaAtiva.etapaFluxo !== 'TICKET_GERADO' ? (
                  <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#64748b' }}>
                    O fluxo já avançou (aprovação / faturamento).
                  </p>
                ) : null}

                {coletaAtiva.etapaFluxo === 'TICKET_GERADO' ? (
                  <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {!podeMutar ? (
                      <p style={{ color: '#92400e', fontSize: '14px', width: '100%', margin: 0 }}>
                        O seu perfil só pode consultar.
                      </p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditandoTicketGerado(true)}
                          style={{
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: 'pointer',
                          }}
                        >
                          Editar ticket
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleEnviarAprovacao()}
                          disabled={enviandoAprovacao || !podeEnviarAprovacao}
                          style={{
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: 'none',
                            background: podeEnviarAprovacao ? '#7c3aed' : '#94a3b8',
                            color: '#fff',
                            fontWeight: 800,
                            fontSize: '14px',
                            cursor: podeEnviarAprovacao && !enviandoAprovacao ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {enviandoAprovacao ? 'A enviar…' : 'Enviar para aprovação'}
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} style={cardStyle}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Dados do ticket</div>

              {reeditarNaEtapaTicketGerado ? (
                <button
                  type="button"
                  onClick={() => setEditandoTicketGerado(false)}
                  style={{
                    marginBottom: '12px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar edição
                </button>
              ) : null}

              {carregandoTicket ? (
                <p style={{ color: '#64748b' }}>A carregar…</p>
              ) : (
                <>
                  {!podeMutar ? (
                    <p style={{ color: '#92400e', fontSize: '14px', marginBottom: '12px' }}>
                      O seu perfil só pode consultar.
                    </p>
                  ) : null}

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                      Tipo de ticket
                    </div>
                    <select
                      value={tipoTicket}
                      onChange={(e) =>
                        podeEditarFormulario
                          ? setTipoTicket(normalizarTipoTicket(e.target.value))
                          : undefined
                      }
                      disabled={!podeEditarFormulario}
                      style={{
                        width: '100%',
                        maxWidth: 320,
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        opacity: podeEditarFormulario ? 1 : 0.85,
                      }}
                    >
                      <option value="entrada">Entrada</option>
                      <option value="saida">Saída</option>
                      <option value="frete">Frete</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                      Número (opcional)
                    </div>
                    <input
                      type="text"
                      value={numero}
                      onChange={(e) => (podeEditarFormulario ? setNumero(e.target.value) : undefined)}
                      readOnly={!podeEditarFormulario}
                      placeholder="Ex.: referência interna"
                      style={{
                        width: '100%',
                        maxWidth: 400,
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        opacity: podeEditarFormulario ? 1 : 0.85,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                      Descrição
                    </div>
                    <textarea
                      value={descricao}
                      onChange={(e) => (podeEditarFormulario ? setDescricao(e.target.value) : undefined)}
                      readOnly={!podeEditarFormulario}
                      rows={4}
                      placeholder="Resumo do pedido, volumes, observações relevantes…"
                      style={{
                        width: '100%',
                        maxWidth: 560,
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        resize: 'vertical',
                        opacity: podeEditarFormulario ? 1 : 0.85,
                      }}
                    />
                  </div>

                  {erro ? (
                    <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '12px' }}>{erro}</p>
                  ) : null}
                  {mensagem ? (
                    <p style={{ color: '#15803d', fontSize: '14px', marginTop: '12px', fontWeight: 600 }}>
                      {mensagem}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={!podeEditarFormulario || salvando}
                    style={{
                      marginTop: '18px',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      background: podeEditarFormulario ? '#2563eb' : '#94a3b8',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: podeEditarFormulario && !salvando ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {salvando
                      ? 'A gravar…'
                      : ticketId && coletaAtiva?.etapaFluxo === 'TICKET_GERADO'
                        ? 'Guardar alterações'
                        : ticketId
                          ? 'Atualizar e avançar etapa'
                          : 'Gravar ticket'}
                  </button>
                </>
              )}
            </form>
          </>
        ) : variant === 'page' ? (
          <div style={{ ...cardStyle, color: '#64748b' }}>
            Escolha uma coleta ou abra a página a partir do Controle de Massa com os parâmetros na URL.
          </div>
        ) : null}
      </div>

      {coletaAtiva && ticketId ? (
        <div className="ticket-print-root">
          <div
            className="ticket-print-col"
            style={{
              maxWidth: '82mm',
              width: 'min(82mm, 100%)',
              margin: '0 auto',
              fontFamily: 'Consolas, ui-monospace, monospace',
              fontSize: '11px',
              lineHeight: 1.45,
              color: '#000',
            }}
          >
            <div style={{ marginBottom: '8px', width: '100%' }}>
              <img
                src={BRAND_LOGO_MARK}
                alt=""
                style={{
                  height: '24px',
                  width: 'auto',
                  maxWidth: '100%',
                  display: 'block',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              />
            </div>
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '18px', letterSpacing: '0.12em' }}>
              {tituloImpressao}
            </div>
            <div style={{ marginTop: '12px', borderTop: '1px dashed #999', paddingTop: '8px' }} />
            <LinhaTicket k="Nº Ticket" v={numero.trim() || coletaAtiva.numero} />
            <LinhaTicket k="Data" v={dataTicketBr} />
            <LinhaTicket k="MTR" v={mtrNumeroImpressao || '—'} />
            <div style={{ marginTop: '10px', fontWeight: 700 }}>EMPRESA</div>
            <div>{coletaAtiva.cliente || '—'}</div>
            <div style={{ marginTop: '10px', fontWeight: 700 }}>RESIDUO</div>
            <div>{coletaAtiva.tipo_residuo || '—'}</div>
            <div style={{ marginTop: '12px', borderTop: '1px dashed #999', paddingTop: '8px' }} />
            <LinhaTicket k="Peso Bruto" v={formatPesoBr(coletaAtiva.peso_bruto)} />
            <LinhaTicket k="Tara" v={formatPesoBr(coletaAtiva.peso_tara)} />
            <LinhaTicket k="Peso Liquido" v={formatPesoBr(coletaAtiva.peso_liquido)} />
            <div style={{ marginTop: '12px', borderTop: '1px dashed #999', paddingTop: '8px' }} />
            <LinhaTicket k="Balanceiro" v={balanceiroImpressao} />
            <LinhaTicket k="Motorista" v={coletaAtiva.motorista || '—'} />
            <LinhaTicket k="PLACA" v={coletaAtiva.placa || '—'} />
            <div style={{ marginTop: '10px', fontWeight: 700 }}>EMPRESA</div>
            <div>{empresaTransporteImpressao}</div>
            <div style={{ marginTop: '10px', fontWeight: 700 }}>Obs.</div>
            <div style={{ whiteSpace: 'pre-wrap', minHeight: '36px' }}>{descricao.trim() || '—'}</div>
            <div style={{ marginTop: '12px', borderTop: '1px dashed #999', paddingTop: '8px' }} />
            <LinhaTicket k="Hora Entrada" v={horaEntradaImpressao} />
            <LinhaTicket k="Hora Saída" v={horaSaidaImpressao} />
          </div>
        </div>
      ) : null}
    </>
  )
}

function LinhaTicket({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
      <span style={{ fontWeight: 700 }}>{k}:</span>
      <span style={{ textAlign: 'right', flex: 1 }}>{v}</span>
    </div>
  )
}
