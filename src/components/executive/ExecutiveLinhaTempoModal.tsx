import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ETAPA_LABEL_CURTO,
  ETAPAS_FLUXO_ORDER,
  formatarEtapaParaUI,
  formatarFaseFluxoOficialParaUI,
  indiceEtapaFluxo,
  normalizarEtapaColeta,
  type EtapaFluxo,
} from '../../lib/fluxoEtapas'

export type ExecutiveLinhaTempoColeta = {
  id: string
  numero: string
  cliente: string
  cidade: string
  data_agendada: string | null
  fluxo_status: string | null
  etapa_operacional: string | null
  mtr_id: string | null
  created_at: string
}

type Props = {
  open: boolean
  onClose: () => void
  coletas: ExecutiveLinhaTempoColeta[]
  periodoLabel: string
}

const FASES = [
  { id: 0, label: 'Programação e MTR', hint: 'Da agenda à entrega na logística' },
  { id: 1, label: 'Logística e coleta', hint: 'Designação, tara e execução' },
  { id: 2, label: 'Pesagem', hint: 'Bruto e controle de massa' },
  { id: 3, label: 'Conferência e aprovação', hint: 'Docs, ticket e envio à diretoria' },
  { id: 4, label: 'Fecho operacional', hint: 'Aprovado até finalizado' },
]

function parseDataRef(c: ExecutiveLinhaTempoColeta): string | null {
  const d = c.data_agendada?.trim()
  if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const cr = c.created_at
  if (cr) return cr.slice(0, 10)
  return null
}

function formatarDataCurta(iso?: string | null) {
  if (!iso) return '—'
  const limpa = iso.includes('T') ? iso.split('T')[0] : iso
  const p = limpa.split('-')
  if (p.length !== 3) return iso
  return `${p[2]}/${p[1]}/${p[0]}`
}

function faseIndexParaEtapa(etapa: EtapaFluxo): number {
  const i = indiceEtapaFluxo(etapa)
  if (i <= indiceEtapaFluxo('MTR_ENTREGUE_LOGISTICA')) return 0
  if (i <= indiceEtapaFluxo('COLETA_REALIZADA')) return 1
  if (i <= indiceEtapaFluxo('CONTROLE_PESAGEM_LANCADO')) return 2
  if (i <= indiceEtapaFluxo('ENVIADO_APROVACAO')) return 3
  return 4
}

const corCompleto = '#0d9488'
const corAtual = '#0f766e'
const corFuturo = '#e2e8f0'
const corLinha = '#cbd5e1'

export function ExecutiveLinhaTempoModal({ open, onClose, coletas, periodoLabel }: Props) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
  const [busca, setBusca] = useState('')
  const [sóEmCurso, setSóEmCurso] = useState(true)
  const [faseFiltro, setFaseFiltro] = useState<number | null>(null)
  const [modo, setModo] = useState<'lista' | 'colunas'>('lista')
  const [etapaColuna, setEtapaColuna] = useState<EtapaFluxo | null>(null)

  const passaToolbar = useCallback(
    (row: ExecutiveLinhaTempoColeta, etapa: EtapaFluxo) => {
      if (sóEmCurso && etapa === 'FINALIZADO') return false
      if (faseFiltro !== null && faseIndexParaEtapa(etapa) !== faseFiltro) return false
      const t = busca.trim().toLowerCase()
      if (!t) return true
      const n = String(row.numero || '').toLowerCase()
      const cl = String(row.cliente || '').toLowerCase()
      const cid = String(row.cidade || '').toLowerCase()
      return n.includes(t) || cl.includes(t) || cid.includes(t)
    },
    [busca, sóEmCurso, faseFiltro]
  )

  const resetLocal = useCallback(() => {
    setBusca('')
    setSóEmCurso(true)
    setFaseFiltro(null)
    setModo('lista')
    setEtapaColuna(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => resetLocal(), 0)
    return () => window.clearTimeout(id)
  }, [open, resetLocal])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const id = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [open])

  const coletasComEtapa = useMemo(() => {
    return coletas.map((c) => ({
      row: c,
      etapa: normalizarEtapaColeta({ fluxo_status: c.fluxo_status, etapa_operacional: c.etapa_operacional }),
    }))
  }, [coletas])

  const contagemPorFase = useMemo(() => {
    const arr = [0, 0, 0, 0, 0]
    for (const { etapa } of coletasComEtapa) {
      arr[faseIndexParaEtapa(etapa)] += 1
    }
    return arr
  }, [coletasComEtapa])

  const filtradas = useMemo(
    () => coletasComEtapa.filter(({ row, etapa }) => passaToolbar(row, etapa)),
    [coletasComEtapa, passaToolbar]
  )

  const etapasParaColunas = useMemo(() => {
    const m = new Map<EtapaFluxo, ExecutiveLinhaTempoColeta[]>()
    for (const { row, etapa } of coletasComEtapa) {
      if (!passaToolbar(row, etapa)) continue
      const list = m.get(etapa) ?? []
      list.push(row)
      m.set(etapa, list)
    }
    return ETAPAS_FLUXO_ORDER.filter((e) => (m.get(e)?.length ?? 0) > 0).map((e) => ({
      etapa: e,
      items: m.get(e)!,
    }))
  }, [coletasComEtapa, passaToolbar])

  const filtradasOrdenadas = useMemo(() => {
    return [...filtradas].sort((a, b) => {
      const da = parseDataRef(a.row) || ''
      const db = parseDataRef(b.row) || ''
      return db.localeCompare(da)
    })
  }, [filtradas])

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!open || etapasParaColunas.length === 0) {
        setEtapaColuna(null)
        return
      }
      setEtapaColuna((prev) => {
        if (prev && etapasParaColunas.some((x) => x.etapa === prev)) return prev
        return etapasParaColunas[0]!.etapa
      })
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, etapasParaColunas])

  if (!open) return null

  const total = coletas.length
  const mostrando = filtradasOrdenadas.length

  const node = (
    <div
      className="exec-linha-tempo-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="exec-linha-tempo-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exec-linha-tempo-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="exec-linha-tempo-head">
          <div className="exec-linha-tempo-head__text">
            <p className="exec-linha-tempo-eyebrow">Painel executivo</p>
            <h2 id="exec-linha-tempo-title" className="exec-linha-tempo-title">
              Linha do tempo das coletas
            </h2>
            <p className="exec-linha-tempo-sub">
              Período e filtros atuais do dashboard · <strong>{periodoLabel}</strong>
            </p>
            <p className="exec-linha-tempo-meta">
              {mostrando} de {total} coleta{total === 1 ? '' : 's'} no recorte
            </p>
          </div>
          <button type="button" className="exec-linha-tempo-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="exec-linha-tempo-fases" role="list">
          {FASES.map((f, idx) => {
            const q = contagemPorFase[idx] ?? 0
            const ativo = faseFiltro === idx
            return (
              <button
                key={f.id}
                type="button"
                role="listitem"
                className={`exec-linha-tempo-fase${ativo ? ' exec-linha-tempo-fase--on' : ''}`}
                onClick={() => setFaseFiltro(ativo ? null : idx)}
                title={f.hint}
              >
                <span className="exec-linha-tempo-fase__n">{q}</span>
                <span className="exec-linha-tempo-fase__lab">{f.label}</span>
                <span className="exec-linha-tempo-fase__hint">{f.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="exec-linha-tempo-toolbar">
          <input
            type="search"
            className="exec-linha-tempo-search"
            placeholder="Buscar por número, cliente ou cidade…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar coletas"
          />
          <label className="exec-linha-tempo-toggle">
            <input type="checkbox" checked={sóEmCurso} onChange={(e) => setSóEmCurso(e.target.checked)} />
            <span>Ocultar finalizadas</span>
          </label>
          <div className="exec-linha-tempo-seg">
            <button
              type="button"
              className={modo === 'lista' ? 'exec-linha-tempo-seg__btn exec-linha-tempo-seg__btn--on' : 'exec-linha-tempo-seg__btn'}
              onClick={() => setModo('lista')}
            >
              Por coleta
            </button>
            <button
              type="button"
              className={modo === 'colunas' ? 'exec-linha-tempo-seg__btn exec-linha-tempo-seg__btn--on' : 'exec-linha-tempo-seg__btn'}
              onClick={() => setModo('colunas')}
            >
              Por etapa
            </button>
          </div>
        </div>

        {modo === 'lista' ? (
          <div className="exec-linha-tempo-scroll">
            {filtradasOrdenadas.length === 0 ? (
              <div className="exec-linha-tempo-empty">Nenhuma coleta corresponde aos filtros.</div>
            ) : (
              filtradasOrdenadas.map(({ row, etapa }) => (
                <ColetaTimelineCard
                  key={row.id}
                  row={row}
                  etapa={etapa}
                  onOpenMtr={() => {
                    onClose()
                    void navigate(`/mtr/${row.id}`)
                  }}
                />
              ))
            )}
          </div>
        ) : (
          <div className="exec-linha-tempo-colunas-wrap">
            <div className="exec-linha-tempo-colunas-tabs" role="tablist" aria-label="Etapa do fluxo">
              {etapasParaColunas.map(({ etapa, items }) => (
                <button
                  key={etapa}
                  type="button"
                  role="tab"
                  aria-selected={etapaColuna === etapa}
                  className={
                    etapaColuna === etapa
                      ? 'exec-linha-tempo-col-tab exec-linha-tempo-col-tab--on'
                      : 'exec-linha-tempo-col-tab'
                  }
                  onClick={() => setEtapaColuna(etapa)}
                >
                  <span className="exec-linha-tempo-col-tab__lab">{formatarFaseFluxoOficialParaUI(etapa)}</span>
                  <span className="exec-linha-tempo-col-tab__n">{items.length}</span>
                </button>
              ))}
            </div>
            <div className="exec-linha-tempo-colunas-body">
              {etapaColuna && etapasParaColunas.find((x) => x.etapa === etapaColuna) ? (
                etapasParaColunas
                  .find((x) => x.etapa === etapaColuna)!
                  .items.slice()
                  .sort((a, b) => {
                    const da = parseDataRef(a) || ''
                    const db = parseDataRef(b) || ''
                    return db.localeCompare(da)
                  })
                  .map((row) => {
                    const etapa = normalizarEtapaColeta({
                      fluxo_status: row.fluxo_status,
                      etapa_operacional: row.etapa_operacional,
                    })
                    return (
                      <ColetaTimelineCard
                        key={row.id}
                        row={row}
                        etapa={etapa}
                        compact
                        onOpenMtr={() => {
                          onClose()
                          void navigate(`/mtr/${row.id}`)
                        }}
                      />
                    )
                  })
              ) : (
                <div className="exec-linha-tempo-empty">Sem coletas neste recorte.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(node, document.body)
}

function ColetaTimelineCard({
  row,
  etapa,
  compact,
  onOpenMtr,
}: {
  row: ExecutiveLinhaTempoColeta
  etapa: EtapaFluxo
  compact?: boolean
  onOpenMtr: () => void
}) {
  const idxAtual = indiceEtapaFluxo(etapa)
  const dataRef = formatarDataCurta(parseDataRef(row))

  return (
    <article
      className={compact ? 'exec-linha-tempo-card exec-linha-tempo-card--compact' : 'exec-linha-tempo-card'}
      aria-label={`Coleta ${row.numero || '—'}, ${formatarFaseFluxoOficialParaUI(etapa)} (${formatarEtapaParaUI(etapa)})`}
    >
      <div className="exec-linha-tempo-card__top">
        <div>
          <div className="exec-linha-tempo-card__num">Coleta {row.numero || '—'}</div>
          <div className="exec-linha-tempo-card__cli">{row.cliente || '—'}</div>
          <div className="exec-linha-tempo-card__meta">
            {row.cidade || '—'} · Ref. {dataRef}
            {!row.mtr_id ? <span className="exec-linha-tempo-badge exec-linha-tempo-badge--warn">Sem MTR</span> : null}
          </div>
        </div>
        <div className="exec-linha-tempo-card__acts">
          <span className="exec-linha-tempo-pill" title={formatarEtapaParaUI(etapa)}>
            {formatarFaseFluxoOficialParaUI(etapa)}
          </span>
          <button type="button" className="exec-linha-tempo-linkbtn" onClick={onOpenMtr}>
            Abrir MTR
          </button>
        </div>
      </div>
      <div className="exec-linha-tempo-track-wrap">
        <div className="exec-linha-tempo-track" aria-hidden="true">
          {ETAPAS_FLUXO_ORDER.map((codigo, i) => {
            const done = i < idxAtual
            const cur = i === idxAtual
            const label = ETAPA_LABEL_CURTO[codigo]
            return (
              <div key={codigo} className="exec-linha-tempo-step" title={label}>
                <div
                  className="exec-linha-tempo-step__rail"
                  style={{
                    background: i === 0 ? 'transparent' : idxAtual >= i ? corCompleto : corLinha,
                    opacity: i === 0 ? 0 : 1,
                  }}
                />
                <div
                  className="exec-linha-tempo-step__dot"
                  style={{
                    background: done ? corCompleto : cur ? corAtual : '#fff',
                    borderColor: cur ? corAtual : done ? corCompleto : corFuturo,
                    boxShadow: cur ? '0 0 0 3px rgba(13, 148, 136, 0.25)' : undefined,
                  }}
                />
                {!compact ? (
                  <span className={`exec-linha-tempo-step__lab${cur ? ' exec-linha-tempo-step__lab--on' : ''}`}>
                    {label.length > 14 ? `${label.slice(0, 12)}…` : label}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </article>
  )
}
