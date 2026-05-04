import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { idsContextoFromSearchParams, resolverColetaPorContextoUrl } from '../lib/coletaContextoUrl'
import { supabase } from '../lib/supabase'
import {
  etapaAprovacaoJaRegistradaNoFluxo,
  formatarEtapaParaUI,
  formatarFaseFluxoOficialParaUI,
  normalizarEtapaColeta,
  type EtapaFluxo,
} from '../lib/fluxoEtapas'
import { COLETAS_DROPDOWN_MAX_ROWS } from '../lib/coletasQueryLimits'
import { queryColetasListaResumoFluxo } from '../lib/coletasSelectSeguimento'
import { cargoPodeDecidirAprovacaoDiretoria } from '../lib/workflowPermissions'

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
  cidade: string
  tipo_residuo: string
  peso_liquido: string
  data_agendada: string
}

function montarParamsColeta(c: ColetaResumo) {
  const p = new URLSearchParams()
  p.set('coleta', c.id)
  if (c.mtr_id) p.set('mtr', c.mtr_id)
  if (c.programacao_id) p.set('programacao', c.programacao_id)
  if (c.cliente_id) p.set('cliente', c.cliente_id)
  return p
}

function formatarDataAgendada(iso: string) {
  if (!iso || iso.length < 10) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function formatarPesoDisplay(s: string) {
  if (!s?.trim()) return '—'
  const n = Number(s.replace(',', '.'))
  if (Number.isNaN(n)) return `${s} kg`
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '18px',
  padding: '22px 24px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  marginBottom: '18px',
}

type DecisaoTipo = 'aprovado' | 'ajuste_solicitado'

export default function AprovacaoDiretoria() {
  const [searchParams, setSearchParams] = useSearchParams()
  const idsCtx = useMemo(() => idsContextoFromSearchParams(searchParams), [searchParams])

  const [coletas, setColetas] = useState<ColetaResumo[]>([])
  const [carregandoColetas, setCarregandoColetas] = useState(true)
  const [cargo, setCargo] = useState<string | null>(null)

  const [ultimaDecisaoId, setUltimaDecisaoId] = useState<string | null>(null)
  const [decisaoGravada, setDecisaoGravada] = useState<DecisaoTipo | null>(null)
  const [observacoesGravadas, setObservacoesGravadas] = useState('')
  const [decididoEm, setDecididoEm] = useState<string | null>(null)

  const [recadoAprovar, setRecadoAprovar] = useState('')
  const [recadoReprovar, setRecadoReprovar] = useState('')

  const [carregandoRegisto, setCarregandoRegisto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [preReq, setPreReq] = useState<{ ticket: boolean }>({ ticket: false })
  const [carregandoPreReq, setCarregandoPreReq] = useState(false)

  const podeMutar = cargoPodeDecidirAprovacaoDiretoria(cargo)

  const coletaAtiva = useMemo(
    () => resolverColetaPorContextoUrl(coletas, idsCtx),
    [coletas, idsCtx]
  )

  const fluxoJaAvancou =
    coletaAtiva && etapaAprovacaoJaRegistradaNoFluxo(coletaAtiva.etapaFluxo)

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
      const peso = item.peso_liquido
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
        cidade: String(item.cidade ?? ''),
        tipo_residuo: String(item.tipo_residuo ?? ''),
        peso_liquido: peso != null && peso !== '' ? String(peso) : '',
        data_agendada: String(item.data_agendada ?? '').slice(0, 10),
      }
    })

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

  const carregarRegisto = useCallback(async (coletaId: string) => {
    setCarregandoRegisto(true)
    setErro('')
    setMensagem('')

    const { data, error } = await supabase
      .from('aprovacoes_diretoria')
      .select('id, decisao, observacoes, decidido_em')
      .eq('coleta_id', coletaId)
      .order('decidido_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(error)
      setErro('Não foi possível carregar a aprovação.')
      setUltimaDecisaoId(null)
      setDecisaoGravada(null)
      setObservacoesGravadas('')
      setDecididoEm(null)
      setCarregandoRegisto(false)
      return
    }

    if (data) {
      setUltimaDecisaoId(data.id)
      const d = data.decisao === 'ajuste_solicitado' ? 'ajuste_solicitado' : 'aprovado'
      setDecisaoGravada(d)
      const obs = data.observacoes ?? ''
      setObservacoesGravadas(obs)
      setDecididoEm(data.decidido_em ?? null)
      if (d === 'aprovado') {
        setRecadoAprovar(obs)
        setRecadoReprovar('')
      } else {
        setRecadoReprovar(obs)
        setRecadoAprovar('')
      }
    } else {
      setUltimaDecisaoId(null)
      setDecisaoGravada(null)
      setObservacoesGravadas('')
      setDecididoEm(null)
      setRecadoAprovar('')
      setRecadoReprovar('')
    }
    setCarregandoRegisto(false)
  }, [])

  useEffect(() => {
    if (coletaAtiva) {
      queueMicrotask(() => {
        void carregarRegisto(coletaAtiva.id)
      })
    } else {
      queueMicrotask(() => {
        setUltimaDecisaoId(null)
        setDecisaoGravada(null)
        setObservacoesGravadas('')
        setDecididoEm(null)
      })
    }
  }, [coletaAtiva, carregarRegisto])

  useEffect(() => {
    if (!coletaAtiva) {
      queueMicrotask(() => {
        setPreReq({ ticket: false })
      })
      return
    }
    let cancel = false
    ;(async () => {
      setCarregandoPreReq(true)
      try {
        const res = await supabase
          .from('tickets_operacionais')
          .select('id')
          .eq('coleta_id', coletaAtiva.id)
          .limit(1)
          .maybeSingle()
        if (cancel) return
        if (res.error) console.error(res.error)
        setPreReq({ ticket: Boolean(res.data?.id) })
      } finally {
        if (!cancel) setCarregandoPreReq(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [coletaAtiva])

  function aoEscolherColeta(id: string) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set('coleta', id)
    else p.delete('coleta')
    setSearchParams(p, { replace: true })
    setMensagem('')
    setErro('')
  }

  async function registrarDecisao(decisao: DecisaoTipo, observacoes: string) {
    if (!coletaAtiva || !podeEditarFormulario) return

    setSalvando(true)
    setErro('')
    setMensagem('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const agora = new Date().toISOString()

    try {
      const { error: insErr } = await supabase.from('aprovacoes_diretoria').insert({
        coleta_id: coletaAtiva.id,
        decisao,
        observacoes: observacoes.trim() || null,
        decidido_em: agora,
        decidido_por: user?.id ?? null,
      })
      if (insErr) throw insErr

      const proximaEtapa: EtapaFluxo = decisao === 'aprovado' ? 'ARQUIVADO' : 'TICKET_GERADO'

      const { error: errColeta } = await supabase
        .from('coletas')
        .update({
          fluxo_status: proximaEtapa,
          etapa_operacional: proximaEtapa,
        })
        .eq('id', coletaAtiva.id)

      if (errColeta) {
        console.error(errColeta)
        setErro(
          'Decisão gravada, mas não foi possível atualizar a etapa da coleta. Peça apoio a um administrador.'
        )
      } else {
        setMensagem(
          decisao === 'aprovado'
            ? 'Aprovado. A coleta foi arquivada e ficou aguardando faturamento.'
            : 'Ajuste solicitado. A coleta voltou para «Ticket gerado» para correções operacionais.'
        )
        await carregarColetas()
        await carregarRegisto(coletaAtiva.id)
      }
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
    Boolean(ultimaDecisaoId) &&
    !carregandoRegisto

  return (
    <MainLayout>
      <div className="page-shell">
        <header style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Decisão sobre o pacote da coleta
          </h1>
          <p className="page-header__lead" style={{ margin: '8px 0 0', maxWidth: 720 }}>
            Decisão sobre o pacote (ticket + contexto) após o ticket operacional e antes do faturamento.
          </p>
        </header>

        <div style={seletorBarStyle}>
          <label style={seletorLabelStyle} htmlFor="aprov-coleta-select">
            Coleta
          </label>
          <select
            id="aprov-coleta-select"
            value={coletaAtiva?.id ?? ''}
            onChange={(e) => aoEscolherColeta(e.target.value)}
            disabled={carregandoColetas}
            style={seletorSelectStyle}
          >
            <option value="">
              {carregandoColetas ? 'A carregar…' : 'Escolher coleta ou usar link com ?coleta='}
            </option>
            {opcoesSelect.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero} — {c.cliente || 'Cliente'} · {formatarFaseFluxoOficialParaUI(c.etapaFluxo)} (
                {formatarEtapaParaUI(c.etapaFluxo)})
              </option>
            ))}
          </select>
        </div>

        {!coletaAtiva ? (
          <div style={emptyStateStyle}>
            <p style={{ margin: 0, fontSize: 15, color: '#64748b' }}>
              Seleccione uma coleta ou abra esta página a partir do Controle de Massa com os parâmetros na URL.
            </p>
          </div>
        ) : null}

        {coletaAtiva ? (
          <>
            <section style={heroStyle}>
              <div style={heroTopRowStyle}>
                <div>
                  <span style={heroNumeroStyle}>Coleta {coletaAtiva.numero}</span>
                  <h2 style={heroClienteStyle}>{coletaAtiva.cliente || 'Cliente'}</h2>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 10,
                      padding: '6px 12px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                      color: '#047857',
                      border: '1px solid #6ee7b7',
                    }}
                  >
                    {formatarFaseFluxoOficialParaUI(coletaAtiva.etapaFluxo)} (
                    {formatarEtapaParaUI(coletaAtiva.etapaFluxo)})
                  </span>
                </div>
                <div style={ticketPillStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Ticket operacional
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                    {carregandoPreReq ? '…' : preReq.ticket ? 'Registado' : 'Sem registo'}
                  </span>
                  <Link
                    to={`/controle-massa?${montarParamsColeta(coletaAtiva).toString()}#ticket-operacional-anchor`}
                    style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', marginTop: 6 }}
                  >
                    Ver ticket →
                  </Link>
                </div>
              </div>

              <div style={gridResumoStyle}>
                <div style={cellResumoStyle}>
                  <span style={cellLab}>Data agendada</span>
                  <span style={cellVal}>{formatarDataAgendada(coletaAtiva.data_agendada)}</span>
                </div>
                <div style={cellResumoStyle}>
                  <span style={cellLab}>Local</span>
                  <span style={cellVal}>{coletaAtiva.cidade?.trim() || '—'}</span>
                </div>
                <div style={cellResumoStyle}>
                  <span style={cellLab}>Resíduo / serviço</span>
                  <span style={cellVal}>{coletaAtiva.tipo_residuo?.trim() || '—'}</span>
                </div>
                <div style={cellResumoStyle}>
                  <span style={cellLab}>Peso líquido</span>
                  <span style={cellVal}>{formatarPesoDisplay(coletaAtiva.peso_liquido)}</span>
                </div>
                <div style={cellResumoStyle}>
                  <span style={cellLab}>Placa</span>
                  <span style={cellVal}>{coletaAtiva.placa?.trim() || '—'}</span>
                </div>
                <div style={cellResumoStyle}>
                  <span style={cellLab}>Motorista</span>
                  <span style={cellVal}>{coletaAtiva.motorista?.trim() || '—'}</span>
                </div>
              </div>

              <div style={linksRowStyle}>
                <Link style={linkMassaStyle} to={`/controle-massa?${montarParamsColeta(coletaAtiva).toString()}`}>
                  Controle de Massa
                </Link>
                <Link style={linkFatStyle} to={`/faturamento?${montarParamsColeta(coletaAtiva).toString()}`}>
                  Faturamento
                </Link>
                <Link style={linkMtrStyle} to={`/mtr?${montarParamsColeta(coletaAtiva).toString()}`}>
                  MTR
                </Link>
              </div>
            </section>

            {mostrarResumo && !carregandoRegisto ? (
              <div
                style={{
                  ...ultimaDecisaoBaseStyle,
                  ...(decisaoGravada === 'ajuste_solicitado'
                    ? ultimaDecisaoReprovacaoStyle
                    : decisaoGravada === 'aprovado'
                      ? ultimaDecisaoAprovacaoStyle
                      : ultimaDecisaoNeutraStyle),
                }}
              >
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Última decisão</div>
                {decisaoGravada ? (
                  <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>
                    <strong>{decisaoGravada === 'aprovado' ? 'Aprovado' : 'Ajuste solicitado'}</strong>
                  </p>
                ) : null}
                {observacoesGravadas ? (
                  <p style={{ margin: '10px 0 0', fontSize: 14, color: '#334155', whiteSpace: 'pre-wrap' }}>
                    {observacoesGravadas}
                  </p>
                ) : null}
                {decididoEm ? (
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: '#64748b' }}>
                    {new Date(decididoEm).toLocaleString('pt-BR')}
                  </p>
                ) : null}
                {!podeEditarFormulario ? (
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: '#64748b' }}>
                    {fluxoJaAvancou
                      ? 'O fluxo já seguiu (faturamento / financeiro).'
                      : 'Sem permissão para decidir nesta vista.'}
                  </p>
                ) : null}
              </div>
            ) : null}

            {podeEditarFormulario ? (
              <section style={decisaoSectionStyle}>
                <h3 style={decisaoTituloStyle}>Decisão</h3>

                {carregandoRegisto ? (
                  <p style={{ color: '#64748b', margin: 0 }}>A carregar registo…</p>
                ) : (
                  <>
                    <div style={duasColunasStyle}>
                      <div style={colunaAcaoStyle}>
                        <button
                          type="button"
                          disabled={!podeMutar || salvando}
                          onClick={() => void registrarDecisao('aprovado', recadoAprovar)}
                          style={btnAprovarStyle}
                        >
                          Aprovar
                        </button>
                        <p style={acaoHintStyle}>Segue para arquivo e faturamento.</p>
                        <label style={recadoLabelStyle} htmlFor="recado-aprovar">
                          Recado do diretor (opcional)
                        </label>
                        <textarea
                          id="recado-aprovar"
                          value={recadoAprovar}
                          onChange={(e) => setRecadoAprovar(e.target.value)}
                          readOnly={!podeMutar}
                          rows={4}
                          placeholder="Condicionantes, notas internas…"
                          style={textareaAcaoStyle}
                        />
                      </div>
                      <div style={colunaAcaoStyle}>
                        <button
                          type="button"
                          disabled={!podeMutar || salvando}
                          onClick={() => void registrarDecisao('ajuste_solicitado', recadoReprovar)}
                          style={btnReprovarStyle}
                        >
                          Reprovar para ajuste
                        </button>
                        <p style={acaoHintStyle}>Reabre na etapa «Ticket gerado» para correções.</p>
                        <label style={recadoLabelStyle} htmlFor="recado-reprovar">
                          Recado do diretor (opcional)
                        </label>
                        <textarea
                          id="recado-reprovar"
                          value={recadoReprovar}
                          onChange={(e) => setRecadoReprovar(e.target.value)}
                          readOnly={!podeMutar}
                          rows={4}
                          placeholder="O que deve ser corrigido…"
                          style={textareaAcaoStyle}
                        />
                      </div>
                    </div>

                    {erro ? <p style={{ color: '#dc2626', fontSize: 14, margin: '16px 0 0' }}>{erro}</p> : null}
                    {mensagem ? (
                      <p style={{ color: '#15803d', fontSize: 14, margin: '16px 0 0', fontWeight: 600 }}>{mensagem}</p>
                    ) : null}
                    {salvando ? (
                      <p style={{ color: '#64748b', fontSize: 13, margin: '12px 0 0' }}>A gravar decisão…</p>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}

            {!podeEditarFormulario && !ultimaDecisaoId && !carregandoRegisto ? (
              <div style={{ ...cardStyle, color: '#64748b', marginTop: 16 }}>
                Sem decisão registada para esta coleta nesta etapa.
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </MainLayout>
  )
}

const seletorBarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  marginBottom: 20,
  padding: '14px 18px',
  background: '#ffffff',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
}

const seletorLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const seletorSelectStyle: CSSProperties = {
  flex: '1 1 280px',
  minWidth: 200,
  maxWidth: 560,
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  background: '#fff',
}

const emptyStateStyle: CSSProperties = {
  ...cardStyle,
  textAlign: 'center',
  padding: '32px 24px',
}

const heroStyle: CSSProperties = {
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
  border: '1px solid #e2e8f0',
  borderRadius: 18,
  padding: '24px 26px',
  marginBottom: 20,
  boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
}

const heroTopRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 20,
  marginBottom: 22,
  paddingBottom: 22,
  borderBottom: '1px solid #eef2f7',
}

const heroNumeroStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const heroClienteStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 24,
  fontWeight: 800,
  color: '#0f172a',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
}

const ticketPillStyle: CSSProperties = {
  padding: '14px 18px',
  borderRadius: 14,
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  minWidth: 160,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
}

const gridResumoStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 14,
}

const cellResumoStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  background: '#ffffff',
  border: '1px solid #f1f5f9',
}

const cellLab: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 6,
}

const cellVal: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#1e293b',
  lineHeight: 1.35,
  wordBreak: 'break-word',
}

const linksRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 20,
}

const linkMassaStyle: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  background: '#ecfdf5',
  color: '#047857',
  border: '1px solid #a7f3d0',
}

const linkFatStyle: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  background: '#eff6ff',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
}

const linkMtrStyle: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  background: '#f8fafc',
  color: '#334155',
  border: '1px solid #e2e8f0',
}

const ultimaDecisaoBaseStyle: CSSProperties = {
  ...cardStyle,
  marginBottom: 18,
}

const ultimaDecisaoAprovacaoStyle: CSSProperties = {
  background: '#f0fdf4',
  borderColor: '#bbf7d0',
}

const ultimaDecisaoReprovacaoStyle: CSSProperties = {
  background: '#fef2f2',
  borderColor: '#fecaca',
}

const ultimaDecisaoNeutraStyle: CSSProperties = {
  background: '#f8fafc',
  borderColor: '#e2e8f0',
}

const decisaoSectionStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 18,
  padding: '26px 24px',
  boxShadow: '0 2px 16px rgba(15, 23, 42, 0.05)',
}

const decisaoTituloStyle: CSSProperties = {
  margin: '0 0 20px',
  fontSize: 17,
  fontWeight: 800,
  color: '#0f172a',
}

const duasColunasStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
  gap: 22,
}

const colunaAcaoStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
}

const btnAprovarStyle: CSSProperties = {
  width: '100%',
  padding: '16px 20px',
  fontSize: 16,
  fontWeight: 800,
  borderRadius: 14,
  border: 'none',
  cursor: 'pointer',
  background: 'linear-gradient(180deg, #059669 0%, #047857 100%)',
  color: '#ffffff',
  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
}

const btnReprovarStyle: CSSProperties = {
  width: '100%',
  padding: '16px 20px',
  fontSize: 16,
  fontWeight: 800,
  borderRadius: 14,
  border: 'none',
  cursor: 'pointer',
  background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
  color: '#ffffff',
  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
}

const acaoHintStyle: CSSProperties = {
  margin: '10px 0 14px',
  fontSize: 12,
  color: '#64748b',
  lineHeight: 1.45,
}

const recadoLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  marginBottom: 8,
}

const textareaAcaoStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 14,
  resize: 'vertical',
  minHeight: 100,
  lineHeight: 1.45,
  background: '#fafbfc',
}
