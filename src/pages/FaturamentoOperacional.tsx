import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { resolverColetaPorContextoUrl, idsContextoFromSearchParams } from '../lib/coletaContextoUrl'
import { formatarEtapaParaUI, normalizarEtapaColeta, type EtapaFluxo } from '../lib/fluxoEtapas'
import { cargoPodeEmitirFaturamento } from '../lib/workflowPermissions'
import type { FaturamentoResumoViewRow } from '../lib/faturamentoResumo'
import { fetchVwFaturamentoResumoPaginated } from '../lib/faturamentoResumoFetch'
import {
  coletaConferenciaPendente,
  coletaConferenciaProntaParaFaturar,
  coletaHistoricoFaturamentoEmitido,
  coletaNaFilaFaturamento,
} from '../lib/faturamentoOperacionalFila'
import { FaturamentoResumoCards } from '../components/faturamento/FaturamentoResumoCards'
import { FaturamentoFilaColetas } from '../components/faturamento/FaturamentoFilaColetas'
import { FaturamentoHistoricoColetas } from '../components/faturamento/FaturamentoHistoricoColetas'
import { FaturamentoRelatoriosPanel } from '../components/faturamento/FaturamentoRelatoriosPanel'
import { FaturamentoModalRegisto } from '../components/faturamento/FaturamentoModalRegisto'

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

function viewRowToColetaResumo(r: FaturamentoResumoViewRow): ColetaResumo {
  const etapaFluxo = normalizarEtapaColeta({
    fluxo_status: r.fluxo_status,
    etapa_operacional: r.etapa_operacional,
  })
  return {
    id: r.coleta_id,
    numero: String(r.numero_coleta ?? r.numero ?? r.coleta_id),
    cliente: r.cliente_nome || '—',
    etapaFluxo,
    mtr_id: r.mtr_id,
    programacao_id: r.programacao_id,
    cliente_id: r.cliente_id,
    placa: r.placa ?? '',
    motorista: r.motorista ?? '',
  }
}

const ACCENT = '#0d9488'

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '20px 22px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
  marginBottom: '18px',
}

export default function FaturamentoOperacional() {
  const [searchParams, setSearchParams] = useSearchParams()
  const idsCtx = useMemo(() => idsContextoFromSearchParams(searchParams), [searchParams])

  const [linhasView, setLinhasView] = useState<FaturamentoResumoViewRow[]>([])
  const [carregandoVista, setCarregandoVista] = useState(true)
  const [erroVista, setErroVista] = useState('')
  const [cargo, setCargo] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [modalColetaId, setModalColetaId] = useState<string | null>(null)

  const podeMutar = cargoPodeEmitirFaturamento(cargo)

  const carregarVista = useCallback(async () => {
    setCarregandoVista(true)
    setErroVista('')
    const { data, error } = await fetchVwFaturamentoResumoPaginated(supabase)

    if (error) {
      console.error(error)
      setErroVista(
        'Não foi possível carregar a consolidação de faturamento. Verifique se a view vw_faturamento_resumo existe e está publicada no Supabase.'
      )
      setLinhasView([])
      setCarregandoVista(false)
      return
    }

    setLinhasView(data)
    setCarregandoVista(false)
  }, [])

  useEffect(() => {
    void carregarVista()
  }, [carregarVista])

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

  const coletasResumo = useMemo(() => linhasView.map(viewRowToColetaResumo), [linhasView])

  const coletaAtiva = useMemo(
    () => resolverColetaPorContextoUrl(coletasResumo, idsCtx),
    [coletasResumo, idsCtx]
  )

  const fila = useMemo(() => {
    const f = linhasView.filter((r) => coletaNaFilaFaturamento(r))
    return f.sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      return tb - ta
    })
  }, [linhasView])

  const historicoEmitidos = useMemo(
    () => linhasView.filter((r) => coletaHistoricoFaturamentoEmitido(r)),
    [linhasView]
  )

  const qtdProntoConferencia = useMemo(
    () => linhasView.filter((r) => coletaConferenciaProntaParaFaturar(r)).length,
    [linhasView]
  )

  const qtdPendenteConferencia = useMemo(
    () => linhasView.filter((r) => coletaConferenciaPendente(r)).length,
    [linhasView]
  )

  const valorSomaProntoConferencia = useMemo(() => {
    let s = 0
    for (const r of linhasView) {
      if (!coletaConferenciaProntaParaFaturar(r)) continue
      const v = r.valor_coleta
      if (v != null && Number.isFinite(Number(v))) s += Number(v)
    }
    return s > 0
      ? s.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—'
  }, [linhasView])

  const valorEstimadoFila = useMemo(() => {
    let s = 0
    for (const r of fila) {
      const v = r.valor_coleta ?? r.faturamento_registro_valor
      if (v != null && Number.isFinite(Number(v))) s += Number(v)
    }
    return s > 0
      ? s.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—'
  }, [fila])

  const valorTotalEmitidoBase = useMemo(() => {
    let s = 0
    for (const r of historicoEmitidos) {
      const v = r.faturamento_registro_valor ?? r.valor_coleta
      if (v != null && Number.isFinite(Number(v))) s += Number(v)
    }
    return s
  }, [historicoEmitidos])

  const modalRow = useMemo(
    () => (modalColetaId ? linhasView.find((r) => r.coleta_id === modalColetaId) ?? null : null),
    [linhasView, modalColetaId]
  )

  function aoEscolherColetaUrl(id: string) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set('coleta', id)
    else p.delete('coleta')
    setSearchParams(p, { replace: true })
  }

  function abrirModalFaturar(coletaId: string) {
    aoEscolherColetaUrl(coletaId)
    setModalColetaId(coletaId)
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    setModalColetaId(null)
  }

  return (
    <MainLayout>
      <div className="page-shell">
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Faturamento
        </h1>
        <p className="page-header__lead" style={{ margin: '10px 0 0', maxWidth: 760, lineHeight: 1.65 }}>
          Consolidação de coletas já pesadas. <strong>Não cria</strong> dados operacionais: você registra valores e, ao emitir,
          a coleta segue para o <Link to="/financeiro">Financeiro</Link> para cobrança.
        </p>

        {erroVista ? (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '14px',
            }}
          >
            {erroVista}{' '}
            <button
              type="button"
              onClick={() => void carregarVista()}
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

        <div style={{ marginTop: '22px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void carregarVista()}
            disabled={carregandoVista}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontWeight: 700,
              fontSize: '13px',
              cursor: carregandoVista ? 'wait' : 'pointer',
            }}
          >
            {carregandoVista ? 'Atualizando…' : 'Atualizar dados'}
          </button>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Perfil: <strong style={{ color: '#0f172a' }}>{cargo ?? '—'}</strong>
            {!podeMutar ? ' · somente leitura' : ' · pode emitir ao Financeiro'}
          </span>
        </div>

        <div style={{ marginTop: '22px' }}>
          <FaturamentoResumoCards
            qtdProntoConferencia={qtdProntoConferencia}
            valorSomaProntoConferencia={valorSomaProntoConferencia}
            qtdPodeEmitir={fila.length}
            valorEstimadoEmitir={valorEstimadoFila}
            qtdEmitidasFinanceiro={historicoEmitidos.length}
            valorEmitidas={
              valorTotalEmitidoBase > 0
                ? valorTotalEmitidoBase.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : '—'
            }
            qtdPendenteConferencia={qtdPendenteConferencia}
          />
        </div>

        <FaturamentoFilaColetas linhas={fila} carregando={carregandoVista} onFaturar={abrirModalFaturar} />

        {coletaAtiva ? (
          <div style={cardStyle}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Contexto (URL)</div>
            <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.55 }}>
              Coleta <strong>{coletaAtiva.numero}</strong> · {coletaAtiva.cliente} · etapa{' '}
              <strong>{formatarEtapaParaUI(coletaAtiva.etapaFluxo)}</strong>
            </p>
            <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <Link
                to={`/controle-massa?${montarParamsColeta(coletaAtiva).toString()}`}
                style={{ color: ACCENT, fontWeight: 700, fontSize: '14px' }}
              >
                Pesagem e Ticket →
              </Link>
              <Link
                to={`/aprovacao?${montarParamsColeta(coletaAtiva).toString()}`}
                style={{ color: '#2563eb', fontWeight: 700, fontSize: '14px' }}
              >
                Aprovação →
              </Link>
              <button
                type="button"
                onClick={() => abrirModalFaturar(coletaAtiva.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: ACCENT,
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Abrir faturamento desta coleta
              </button>
            </div>
          </div>
        ) : null}

        <FaturamentoHistoricoColetas todasLinhas={linhasView} />
        <FaturamentoRelatoriosPanel linhas={linhasView} />
      </div>

      <FaturamentoModalRegisto
        open={modalAberto}
        row={modalRow}
        podeMutar={podeMutar}
        onClose={fecharModal}
        onGravado={() => void carregarVista()}
      />
    </MainLayout>
  )
}
