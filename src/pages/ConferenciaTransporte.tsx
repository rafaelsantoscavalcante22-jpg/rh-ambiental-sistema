import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import {
  CHECKLIST_MOTORISTA_ITENS,
  mesclarRespostasChecklistMotorista,
  respostasChecklistMotoristaIniciais,
  serializarRespostasMotoristaParaGravar,
  type RespostasChecklistMotorista,
} from '../lib/checklistMotoristaItens'
import { idsContextoFromSearchParams, resolverColetaPorContextoUrl } from '../lib/coletaContextoUrl'
import { formatarEtapaParaUI, normalizarEtapaColeta, type EtapaFluxo } from '../lib/fluxoEtapas'
import { COLETAS_DROPDOWN_MAX_ROWS } from '../lib/coletasQueryLimits'
import { queryColetasListaResumoFluxo } from '../lib/coletasSelectSeguimento'
import { cargoPodeMutarChecklistTransporte } from '../lib/workflowPermissions'
import type { RespostaConferenciaTransporte } from '../lib/conferenciaTransporteChecklist'

type ColetaResumo = {
  id: string
  numero: string
  cliente: string
  etapaFluxo: EtapaFluxo
  mtr_id: string | null
  programacao_id: string | null
  cliente_id: string | null
  placa: string
  motorista: string
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

const thStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  padding: '8px 10px',
  fontWeight: 700,
  fontSize: '11px',
  textAlign: 'center',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#475569',
  background: '#f8fafc',
}

const tdOkNaoStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  padding: '6px 8px',
  textAlign: 'center',
  width: '56px',
  verticalAlign: 'middle',
  background: '#fff',
}

const tdItemStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  padding: '8px 12px',
  fontSize: '13px',
  verticalAlign: 'middle',
  background: '#fff',
}

function hojeBr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Rótulos no PDF alinhados ao modelo (ex.: EPIs sem apóstrofo). */
function rotuloItemImpressao(label: string) {
  return label.replace(/EPI's/g, 'EPIs')
}

function LinhaCheck({
  item,
  valor,
  onChange,
  disabled,
  radioGroupPrefix = 'ct',
}: {
  item: { id: string; label: string }
  valor: RespostaConferenciaTransporte | null
  onChange: (id: string, v: RespostaConferenciaTransporte | null) => void
  disabled: boolean
  /** Prefixo único para o grupo de rádio de cada linha. */
  radioGroupPrefix?: string
}) {
  const name = `${radioGroupPrefix}-${item.id}`
  return (
    <tr>
      <td style={tdOkNaoStyle}>
        <input
          type="radio"
          name={name}
          checked={valor === 'ok'}
          disabled={disabled}
          onChange={() => onChange(item.id, 'ok')}
          aria-label={`${item.label} OK`}
        />
      </td>
      <td style={tdOkNaoStyle}>
        <input
          type="radio"
          name={name}
          checked={valor === 'nao'}
          disabled={disabled}
          onChange={() => onChange(item.id, 'nao')}
          aria-label={`${item.label} Não`}
        />
      </td>
      <td style={tdItemStyle}>{item.label}</td>
    </tr>
  )
}

export default function ConferenciaTransporte() {
  const [searchParams, setSearchParams] = useSearchParams()
  const idsCtx = useMemo(() => idsContextoFromSearchParams(searchParams), [searchParams])

  const [coletas, setColetas] = useState<ColetaResumo[]>([])
  const [carregandoColetas, setCarregandoColetas] = useState(true)
  const [cargo, setCargo] = useState<string | null>(null)
  const [erroListaColetas, setErroListaColetas] = useState('')

  const [checklistMotoristaId, setChecklistMotoristaId] = useState<string | null>(null)
  const [respostasMotorista, setRespostasMotorista] = useState<RespostasChecklistMotorista>(() =>
    respostasChecklistMotoristaIniciais()
  )
  const [observacoesMotorista, setObservacoesMotorista] = useState('')
  const [carregandoChecklistMotorista, setCarregandoChecklistMotorista] = useState(false)
  const [salvandoMotorista, setSalvandoMotorista] = useState(false)
  const [mensagemMotorista, setMensagemMotorista] = useState('')
  const [erroMotorista, setErroMotorista] = useState('')

  const podeMutar = cargoPodeMutarChecklistTransporte(cargo)
  const coletaAtiva = useMemo(
    () => resolverColetaPorContextoUrl(coletas, idsCtx),
    [coletas, idsCtx]
  )
  const podeEditarMotorista = Boolean(coletaAtiva && podeMutar)

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

    const lista: ColetaResumo[] = ((data as Record<string, unknown>[]) || []).map((item) => {
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
        programacao_id: item.programacao_id != null ? String(item.programacao_id) : null,
        cliente_id: item.cliente_id != null ? String(item.cliente_id) : null,
        placa: String(item.placa ?? ''),
        motorista: String(item.motorista_nome ?? item.motorista ?? ''),
      }
    })
    setColetas(lista)
    setCarregandoColetas(false)
  }, [])

  useEffect(() => {
    void carregarColetas()
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

  const carregarChecklistMotorista = useCallback(async (coletaId: string) => {
    setCarregandoChecklistMotorista(true)
    setErroMotorista('')
    setMensagemMotorista('')
    const { data, error } = await supabase
      .from('checklist_transporte')
      .select('id, respostas, observacoes')
      .eq('coleta_id', coletaId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(error)
      setErroMotorista('Não foi possível carregar o checklist do motorista.')
      setChecklistMotoristaId(null)
      setRespostasMotorista(respostasChecklistMotoristaIniciais())
      setObservacoesMotorista('')
      setCarregandoChecklistMotorista(false)
      return
    }

    if (data) {
      setChecklistMotoristaId(data.id)
      setRespostasMotorista(mesclarRespostasChecklistMotorista(data.respostas))
      setObservacoesMotorista(data.observacoes ?? '')
    } else {
      setChecklistMotoristaId(null)
      setRespostasMotorista(respostasChecklistMotoristaIniciais())
      setObservacoesMotorista('')
    }
    setCarregandoChecklistMotorista(false)
  }, [])

  useEffect(() => {
    if (coletaAtiva) void carregarChecklistMotorista(coletaAtiva.id)
    else {
      setChecklistMotoristaId(null)
      setRespostasMotorista(respostasChecklistMotoristaIniciais())
      setObservacoesMotorista('')
    }
  }, [coletaAtiva, carregarChecklistMotorista])

  function aoEscolherColeta(id: string) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set('coleta', id)
    else p.delete('coleta')
    setSearchParams(p, { replace: true })
    setMensagemMotorista('')
    setErroMotorista('')
  }

  function setRespostaMotoristaItem(id: string, v: RespostaConferenciaTransporte | null) {
    if (!podeEditarMotorista) return
    setRespostasMotorista((prev) => ({ ...prev, [id]: v }))
  }

  function imprimirDocumentoUnificado() {
    requestAnimationFrame(() => window.print())
  }

  async function handleSubmitMotorista(e: FormEvent) {
    e.preventDefault()
    if (!coletaAtiva || !podeEditarMotorista) return

    const todosPreenchidos = CHECKLIST_MOTORISTA_ITENS.every((i) => {
      const v = respostasMotorista[i.id]
      return v === 'ok' || v === 'nao'
    })
    if (!todosPreenchidos) {
      const ok = window.confirm(
        'Ainda há itens sem marcação (OK ou NÃO) no checklist do motorista. Deseja gravar mesmo assim?'
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
    const payloadBase = {
      coleta_id: coletaAtiva.id,
      respostas: serializarRespostasMotoristaParaGravar(respostasMotorista) as unknown as Record<
        string,
        unknown
      >,
      observacoes: observacoesMotorista.trim() || null,
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
            preenchido_por: payloadBase.preenchido_por,
            updated_at: payloadBase.updated_at,
          })
          .eq('id', existente.id)
        if (error) throw error
        setChecklistMotoristaId(existente.id)
        setMensagemMotorista('Checklist do motorista atualizado.')
      } else {
        const { data, error } = await supabase
          .from('checklist_transporte')
          .insert({
            coleta_id: payloadBase.coleta_id,
            respostas: payloadBase.respostas,
            observacoes: payloadBase.observacoes,
            preenchido_por: payloadBase.preenchido_por,
          })
          .select('id')
          .single()
        if (error) throw error
        if (data?.id) setChecklistMotoristaId(data.id)
        setMensagemMotorista('Checklist do motorista gravado.')
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

  const motoristaItensRespondidos = useMemo(
    () =>
      CHECKLIST_MOTORISTA_ITENS.filter((i) => {
        const v = respostasMotorista[i.id]
        return v === 'ok' || v === 'nao'
      }).length,
    [respostasMotorista]
  )

  function renderTabelaMotorista(itens: { id: string; label: string }[]) {
    return (
      <div className="conf-trans-table-wrap">
        <table
          className="conf-trans-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            fontSize: '13px',
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>OK</th>
              <th style={thStyle}>NÃO</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>ITENS</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <LinhaCheck
                key={item.id}
                item={item}
                valor={respostasMotorista[item.id] ?? null}
                onChange={setRespostaMotoristaItem}
                disabled={!podeEditarMotorista}
                radioGroupPrefix="mot"
              />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

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
            max-width: 720px !important;
            width: 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            text-align: center !important;
            box-sizing: border-box !important;
          }
          .ct-print-mtr-body {
            text-align: left !important;
            max-width: 680px !important;
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
          <img className="conf-trans-hero-logo" src="/logo-rg.png" alt="RG Ambiental" />
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
          <p style={{ margin: '14px auto 0', maxWidth: 580, fontSize: '15px', color: '#64748b', lineHeight: 1.6 }}>
            Fluxo em <strong>2 passos</strong>: escolha a coleta e marque <strong>OK</strong> ou <strong>NÃO</strong> em cada
            item do checklist do motorista. O PDF segue o mesmo layout, centrado na página.
          </p>
          {coletaAtiva ? (
            <div style={{ marginTop: 22 }}>
              <button
                type="button"
                onClick={imprimirDocumentoUnificado}
                style={{
                  padding: '12px 32px',
                  borderRadius: '12px',
                  border: 'none',
                  background: ACCENT,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.35)',
                }}
              >
                Imprimir PDF
              </button>
            </div>
          ) : null}
        </header>

        <div className="conf-trans-stepper" role="navigation" aria-label="Etapas da conferência">
          <span className="conf-trans-step-num">1</span> Coleta
          <span className="conf-trans-step-sep" aria-hidden>
            →
          </span>
          <span className="conf-trans-step-num">2</span> CHECK LIST — OK / NÃO
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#fff',
                  background: ACCENT,
                  borderRadius: 10,
                  padding: '5px 11px',
                  lineHeight: 1,
                }}
              >
                1
              </span>
              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 17 }}>Coleta</span>
            </div>
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
              }}
            >
              {carregandoColetas ? 'A carregar…' : 'Atualizar lista'}
            </button>
          </div>
          <select
            value={coletaAtiva?.id ?? ''}
            onChange={(e) => aoEscolherColeta(e.target.value)}
            disabled={carregandoColetas}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              background: '#fff',
            }}
          >
            <option value="">{carregandoColetas ? 'Carregando…' : 'Selecione a coleta'}</option>
            {opcoesSelect.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero} — {c.cliente || 'Cliente'} · {formatarEtapaParaUI(c.etapaFluxo)}
              </option>
            ))}
          </select>
          {coletaAtiva ? (
            <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#64748b' }}>
              <strong>Etapa:</strong> {formatarEtapaParaUI(coletaAtiva.etapaFluxo)} · <strong>Placa:</strong>{' '}
              {coletaAtiva.placa || '—'} · <strong>Motorista:</strong> {coletaAtiva.motorista || '—'} ·{' '}
              <Link to={`/controle-massa?${montarParamsColeta(coletaAtiva).toString()}`} style={{ fontWeight: 700 }}>
                Controle de Massa
              </Link>
            </p>
          ) : null}
        </div>

        {coletaAtiva ? (
          <form onSubmit={handleSubmitMotorista} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#fff',
                  background: ACCENT,
                  borderRadius: 10,
                  padding: '5px 11px',
                  lineHeight: 1,
                }}
              >
                2
              </span>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 17 }}>
                  CHECK LIST MOTORISTA — OK / NÃO
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
                  CONFERIR ABAIXO, MARCANDO COM UM X OS ITENS VERIFICADOS. Use <strong>OK</strong> ou{' '}
                  <strong>NÃO</strong> em cada linha. Os dados são gravados ao clicar em «Gravar».
                </p>
              </div>
            </div>
            {carregandoChecklistMotorista ? (
              <p style={{ color: '#64748b' }}>A carregar checklist do motorista…</p>
            ) : (
              <>
                {!podeMutar ? (
                  <p style={{ color: '#92400e', fontSize: '14px', marginBottom: '12px' }}>
                    O seu perfil só pode consultar. Operação e logística preenchem o checklist.
                  </p>
                ) : null}
                <div className="conf-trans-checklist-unico">{renderTabelaMotorista(CHECKLIST_MOTORISTA_ITENS)}</div>
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                    Observações (checklist motorista)
                  </div>
                  <textarea
                    value={observacoesMotorista}
                    onChange={(e) => (podeEditarMotorista ? setObservacoesMotorista(e.target.value) : undefined)}
                    readOnly={!podeEditarMotorista}
                    rows={3}
                    placeholder="Notas adicionais (opcional)"
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      resize: 'vertical',
                      opacity: podeEditarMotorista ? 1 : 0.85,
                    }}
                  />
                </div>
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
                    {salvandoMotorista ? 'A gravar…' : checklistMotoristaId ? 'Atualizar checklist motorista' : 'Gravar checklist motorista'}
                  </button>
                </div>
              </>
            )}
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
            Escolha uma coleta acima para preencher o CHECK LIST (OK / NÃO).
          </div>
        ) : null}
      </div>

      {coletaAtiva ? (
        <div className="ct-print-unificado">
          <div
            className="ct-print-unificado-inner"
            style={{
              fontFamily: 'system-ui, "Segoe UI", sans-serif',
              color: '#0f172a',
              fontSize: '10px',
              lineHeight: 1.35,
              width: '100%',
              margin: '0 auto',
            }}
          >
            <div className="ct-print-mtr-body">
              <div style={{ marginBottom: 12, width: '100%', textAlign: 'center' }}>
                <img
                  src="/logo-rg.png"
                  alt=""
                  style={{
                    height: 28,
                    width: 'auto',
                    maxWidth: '100%',
                    display: 'inline-block',
                  }}
                />
              </div>
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '16px', letterSpacing: '0.05em' }}>
                RG Ambiental
              </div>
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '13px', marginTop: '8px', color: '#0f172a' }}>
                CHECK LIST — OK / NÃO
              </div>
              <div
                style={{
                  textAlign: 'center',
                  fontWeight: 500,
                  fontSize: '10px',
                  marginTop: '8px',
                  marginBottom: '12px',
                  color: '#475569',
                  maxWidth: 520,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  lineHeight: 1.45,
                }}
              >
                CONFERIR ABAIXO, MARCANDO COM UM X OS ITENS VERIFICADOS. Use OK ou NÃO em cada linha.
              </div>
              <div
                style={{
                  border: '1px solid #94a3b8',
                  borderRadius: '4px',
                  padding: '10px 12px',
                  marginBottom: '14px',
                  fontSize: '10px',
                  background: '#fff',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left' }}>
                  <div>
                    <strong>Cliente:</strong> {coletaAtiva.cliente || '—'}
                  </div>
                  <div>
                    <strong>Data:</strong> {hojeBr()}
                  </div>
                  <div>
                    <strong>Veículo / Placa:</strong> {coletaAtiva.placa || '—'}
                  </div>
                  <div>
                    <strong>Motorista:</strong> {coletaAtiva.motorista || '—'}
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong>Coleta nº:</strong> {coletaAtiva.numero}
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong>Etapa (fluxo):</strong> {formatarEtapaParaUI(coletaAtiva.etapaFluxo)}
                  </div>
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      marginTop: 4,
                      paddingTop: 8,
                      borderTop: '1px solid #e2e8f0',
                      color: '#475569',
                    }}
                  >
                    Itens com OK ou NÃO:{' '}
                    <strong>
                      {motoristaItensRespondidos}/{CHECKLIST_MOTORISTA_ITENS.length}
                    </strong>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid #94a3b8',
                  marginBottom: '12px',
                  printColorAdjust: 'exact',
                  WebkitPrintColorAdjust: 'exact',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '9px',
                    tableLayout: 'fixed',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th
                        style={{
                          ...thStyle,
                          border: '1px solid #94a3b8',
                          width: '52%',
                          fontSize: '9px',
                          textAlign: 'left',
                          paddingLeft: 10,
                        }}
                      >
                        ITENS
                      </th>
                      <th style={{ ...thStyle, border: '1px solid #94a3b8', width: '24%', fontSize: '9px' }}>OK</th>
                      <th style={{ ...thStyle, border: '1px solid #94a3b8', width: '24%', fontSize: '9px' }}>NÃO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHECKLIST_MOTORISTA_ITENS.map((item) => {
                      const mot = respostasMotorista[item.id] ?? null
                      return (
                        <tr key={`pdf-mot-${item.id}`}>
                          <td
                            style={{
                              border: '1px solid #cbd5e1',
                              padding: '6px 10px',
                              wordBreak: 'break-word',
                              background: '#fff',
                              fontSize: '9px',
                              color: '#0f172a',
                              textAlign: 'left',
                            }}
                          >
                            {rotuloItemImpressao(item.label)}
                          </td>
                          <td style={{ ...tdOkNaoStyle, border: '1px solid #cbd5e1', fontSize: '9px' }}>
                            {mot === 'ok' ? 'X' : ''}
                          </td>
                          <td style={{ ...tdOkNaoStyle, border: '1px solid #cbd5e1', fontSize: '9px' }}>
                            {mot === 'nao' ? 'X' : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  marginTop: '8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  minHeight: '36px',
                  marginBottom: '12px',
                  textAlign: 'left',
                  fontSize: '10px',
                }}
              >
                <strong>Observações:</strong> {observacoesMotorista.trim() || '—'}
              </div>

              <p style={{ marginTop: '8px', fontSize: '9px', color: '#475569', textAlign: 'justify' }}>
                O motorista declara que recebeu o veículo e conferiu os itens de segurança e equipamentos obrigatórios,
                ficando ciente de que danos, multas ou ausência de equipamentos poderão ser de sua responsabilidade,
                conforme procedimento interno.
              </p>
              <div style={{ maxWidth: 280, margin: '24px auto 0', textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #0f172a', minHeight: '32px' }} />
                <div style={{ fontSize: '9px', marginTop: '6px' }}>Assinatura do motorista</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </MainLayout>
  )
}
