import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { resolverColetaPorContextoUrl, idsContextoFromSearchParams } from '../lib/coletaContextoUrl'
import { COLETAS_DROPDOWN_MAX_ROWS } from '../lib/coletasQueryLimits'
import { queryColetasListaResumoFluxo } from '../lib/coletasSelectSeguimento'
import { payloadFaturamentoEmitidoEnviaAoFinanceiro } from '../lib/coletaFluxoAtualizacao'
import {
  etapaFaturamentoJaRegistradoNoFluxo,
  formatarEtapaParaUI,
  normalizarEtapaColeta,
  type EtapaFluxo,
} from '../lib/fluxoEtapas'
import { cargoPodeMutarFaturamentoFluxo } from '../lib/workflowPermissions'

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

type StatusFat = 'pendente' | 'emitido' | 'cancelado'

function montarParamsColeta(c: ColetaResumo) {
  const p = new URLSearchParams()
  p.set('coleta', c.id)
  if (c.mtr_id) p.set('mtr', c.mtr_id)
  if (c.programacao_id) p.set('programacao', c.programacao_id)
  if (c.cliente_id) p.set('cliente', c.cliente_id)
  return p
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '18px',
  padding: '22px 24px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  marginBottom: '18px',
}

function parseValor(s: string): number | null {
  const t = s.replace(',', '.').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function FaturamentoOperacional() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const idsCtx = useMemo(() => idsContextoFromSearchParams(searchParams), [searchParams])

  const [coletas, setColetas] = useState<ColetaResumo[]>([])
  const [carregandoColetas, setCarregandoColetas] = useState(true)
  const [cargo, setCargo] = useState<string | null>(null)

  const [registroId, setRegistroId] = useState<string | null>(null)
  const [valorStr, setValorStr] = useState('')
  const [referenciaNf, setReferenciaNf] = useState('')
  const [status, setStatus] = useState<StatusFat>('pendente')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const [carregandoRegisto, setCarregandoRegisto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [preReq, setPreReq] = useState<{ aprovacaoOk: boolean }>({ aprovacaoOk: false })
  const [carregandoPreReq, setCarregandoPreReq] = useState(false)

  const podeMutar = cargoPodeMutarFaturamentoFluxo(cargo)

  const coletaAtiva = useMemo(
    () => resolverColetaPorContextoUrl(coletas, idsCtx),
    [coletas, idsCtx]
  )

  const fluxoFaturadoOuAlem =
    coletaAtiva && etapaFaturamentoJaRegistradoNoFluxo(coletaAtiva.etapaFluxo)

  const podeEditarFormulario = Boolean(coletaAtiva && podeMutar)

  const carregarColetas = useCallback(async () => {
    setCarregandoColetas(true)
    const { data, error } = await queryColetasListaResumoFluxo(COLETAS_DROPDOWN_MAX_ROWS)

    if (error) {
      console.error(error)
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

  const carregarRegisto = useCallback(async (coletaId: string) => {
    setCarregandoRegisto(true)
    setErro('')
    setMensagem('')

    const { data, error } = await supabase
      .from('faturamento_registros')
      .select('id, valor, referencia_nf, status, updated_at')
      .eq('coleta_id', coletaId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(error)
      setErro('Não foi possível carregar o faturamento.')
      setRegistroId(null)
      setValorStr('')
      setReferenciaNf('')
      setStatus('pendente')
      setUpdatedAt(null)
      setCarregandoRegisto(false)
      return
    }

    if (data) {
      setRegistroId(data.id)
      setValorStr(data.valor != null ? String(data.valor) : '')
      setReferenciaNf(data.referencia_nf ?? '')
      const st = data.status === 'emitido' || data.status === 'cancelado' ? data.status : 'pendente'
      setStatus(st)
      setUpdatedAt(data.updated_at ?? null)
    } else {
      setRegistroId(null)
      setValorStr('')
      setReferenciaNf('')
      setStatus('pendente')
      setUpdatedAt(null)
    }
    setCarregandoRegisto(false)
  }, [])

  useEffect(() => {
    if (coletaAtiva) {
      void carregarRegisto(coletaAtiva.id)
    } else {
      setRegistroId(null)
      setValorStr('')
      setReferenciaNf('')
      setStatus('pendente')
      setUpdatedAt(null)
    }
  }, [coletaAtiva, carregarRegisto])

  useEffect(() => {
    if (!coletaAtiva) {
      setPreReq({ aprovacaoOk: false })
      return
    }
    let cancel = false
    ;(async () => {
      setCarregandoPreReq(true)
      try {
        const res = await supabase
          .from('aprovacoes_diretoria')
          .select('id, decisao')
          .eq('coleta_id', coletaAtiva.id)
          .order('decidido_em', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancel) return
        if (res.error) console.error(res.error)
        const row = res.data as { id: string; decisao: string | null } | null
        setPreReq({ aprovacaoOk: Boolean(row?.id && row.decisao === 'aprovado') })
      } finally {
        if (!cancel) setCarregandoPreReq(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [coletaAtiva?.id])

  function aoEscolherColeta(id: string) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set('coleta', id)
    else p.delete('coleta')
    setSearchParams(p, { replace: true })
    setMensagem('')
    setErro('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!coletaAtiva || !podeEditarFormulario) return

    const valorNum = parseValor(valorStr)

    setSalvando(true)
    setErro('')
    setMensagem('')

    const agora = new Date().toISOString()

    try {
      const payload = {
        valor: valorNum,
        referencia_nf: referenciaNf.trim() || null,
        status,
        updated_at: agora,
      }

      if (registroId) {
        const { error } = await supabase.from('faturamento_registros').update(payload).eq('id', registroId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('faturamento_registros')
          .insert({
            coleta_id: coletaAtiva.id,
            ...payload,
          })
          .select('id')
          .single()
        if (error) throw error
        if (data?.id) setRegistroId(data.id)
      }

      if (status === 'emitido') {
        const { error: errColeta } = await supabase
          .from('coletas')
          .update(payloadFaturamentoEmitidoEnviaAoFinanceiro({ valorColeta: valorNum }))
          .eq('id', coletaAtiva.id)

        if (errColeta) {
          console.error(errColeta)
          setErro(
            'Registo gravado, mas não foi possível atualizar a etapa da coleta. Peça apoio a um administrador.'
          )
        } else {
          setMensagem(
            'Faturamento com estado «Emitido». A coleta foi enviada ao financeiro («No financeiro»).'
          )
          await carregarColetas()
          navigate(`/financeiro?${montarParamsColeta(coletaAtiva).toString()}`)
        }
      } else {
        setMensagem(
          status === 'cancelado'
            ? 'Registo guardado como cancelado (etapa da coleta inalterada).'
            : 'Registo guardado em pendente (etapa da coleta inalterada).'
        )
        await carregarColetas()
      }

      await carregarRegisto(coletaAtiva.id)
    } catch (err: unknown) {
      console.error(err)
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const opcoesSelect = useMemo(() => {
    const sorted = [...coletas].sort((a, b) =>
      String(b.numero).localeCompare(String(a.numero), undefined, { numeric: true })
    )
    if (coletaAtiva && !sorted.some((c) => c.id === coletaAtiva.id)) return [coletaAtiva, ...sorted]
    return sorted
  }, [coletas, coletaAtiva])

  const mostrarResumo =
    Boolean(coletaAtiva) &&
    Boolean(registroId) &&
    !carregandoRegisto

  const labelStatus: Record<StatusFat, string> = {
    pendente: 'Pendente',
    emitido: 'Emitido',
    cancelado: 'Cancelado',
  }

  return (
    <MainLayout>
      <div className="page-shell">
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>Faturamento</h1>
        <p className="page-header__lead" style={{ margin: '8px 0 0', maxWidth: 720 }}>
          Registo de <strong>valor e referência</strong>. Ao marcar como emitido, a coleta passa a{' '}
          <strong>«No financeiro»</strong> e aparece na página Financeiro para cobrança e vencimento.
        </p>

        <div style={cardStyle}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Coleta</div>
          <select
            value={coletaAtiva?.id ?? ''}
            onChange={(e) => aoEscolherColeta(e.target.value)}
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
                {c.numero} — {c.cliente || 'Cliente'} · {formatarEtapaParaUI(c.etapaFluxo)}
              </option>
            ))}
          </select>

          {coletaAtiva ? (
            <div style={{ marginTop: '16px', fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
              <div>
                <strong>Etapa:</strong> {formatarEtapaParaUI(coletaAtiva.etapaFluxo)}
              </div>
              <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  Referência rápida
                </div>
                <div style={{ fontSize: '13px', color: '#334155', display: 'grid', gap: '6px' }}>
                  <div>
                    <strong>Aprovação:</strong>{' '}
                    {carregandoPreReq ? '…' : preReq.aprovacaoOk ? 'há aprovação' : 'sem aprovação'} ·{' '}
                    <Link to={`/aprovacao?${montarParamsColeta(coletaAtiva).toString()}`} style={{ fontWeight: 700 }}>
                      Abrir
                    </Link>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '10px' }}>
                <Link
                  to={`/controle-massa?${montarParamsColeta(coletaAtiva).toString()}`}
                  style={{ color: '#16a34a', fontWeight: 700 }}
                >
                  Abrir Controle de Massa com este contexto →
                </Link>
                {' · '}
                <Link
                  to={`/financeiro?${montarParamsColeta(coletaAtiva).toString()}`}
                  style={{ color: '#2563eb', fontWeight: 700 }}
                >
                  Ir para Financeiro →
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {coletaAtiva ? (
          <>
            {mostrarResumo ? (
              <div style={{ ...cardStyle, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>Registo de faturamento</div>
                <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>
                  <strong>Estado:</strong> {labelStatus[status]}
                </p>
                {valorStr ? (
                  <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#334155' }}>
                    <strong>Valor:</strong> {valorStr}
                  </p>
                ) : null}
                {referenciaNf ? (
                  <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#334155' }}>
                    <strong>Ref. NF:</strong> {referenciaNf}
                  </p>
                ) : null}
                {updatedAt ? (
                  <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Atualizado: {new Date(updatedAt).toLocaleString('pt-BR')}
                  </p>
                ) : null}
                {fluxoFaturadoOuAlem ? (
                  <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Etapa da coleta já em faturamento concluído ou além; alterações aqui são limitadas ao perfil e à
                    etapa.
                  </p>
                ) : null}
                {!podeEditarFormulario ? (
                  <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Sem permissão para editar ou etapa não permite alteração aqui.
                  </p>
                ) : null}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} style={cardStyle}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Dados</div>

                {carregandoRegisto ? (
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
                        Valor (opcional)
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorStr}
                        onChange={(e) => (podeEditarFormulario ? setValorStr(e.target.value) : undefined)}
                        readOnly={!podeEditarFormulario}
                        placeholder="Ex.: 1234.56"
                        style={{
                          width: '100%',
                          maxWidth: 280,
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
                        Referência NF (opcional)
                      </div>
                      <input
                        type="text"
                        value={referenciaNf}
                        onChange={(e) => (podeEditarFormulario ? setReferenciaNf(e.target.value) : undefined)}
                        readOnly={!podeEditarFormulario}
                        placeholder="Número ou chave"
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
                        Estado
                      </div>
                      <select
                        value={status}
                        onChange={(e) => {
                          if (podeEditarFormulario) setStatus(e.target.value as StatusFat)
                        }}
                        disabled={!podeEditarFormulario}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          fontSize: '14px',
                          maxWidth: 320,
                        }}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="emitido">Emitido (envia a coleta ao Financeiro)</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
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
                      {salvando ? 'A gravar…' : registroId ? 'Atualizar registo' : 'Gravar faturamento'}
                    </button>
                  </>
                )}
              </form>

            {!mostrarResumo && !carregandoRegisto ? (
              <div style={{ ...cardStyle, color: '#64748b' }}>
                Sem registo de faturamento para esta coleta ainda. Pode criar o registo no formulário acima.
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ ...cardStyle, color: '#64748b' }}>
            Escolha uma coleta ou abra a página a partir do Controle de Massa com os parâmetros na URL.
          </div>
        )}
      </div>
    </MainLayout>
  )
}
