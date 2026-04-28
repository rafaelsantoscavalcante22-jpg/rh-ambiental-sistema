import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import type { ComprovanteDescarteFiltros, ComprovanteDescarteRow } from '../lib/comprovantesDescarteTypes'
import {
  STATUS_COMPROVANTE_LABEL,
  formatarPesoExibicao,
} from '../lib/comprovantesDescarteUtils'
import { listarComprovantesDescarte, excluirComprovanteDescarte } from '../services/comprovantesDescarte'
import { cargoPodeMutarComprovanteDescarte } from '../lib/workflowPermissions'

const FILTROS_VAZIOS: ComprovanteDescarteFiltros = {
  codigoRemessa: '',
  numeroMtr: '',
  gerador: '',
  motorista: '',
  placa: '',
  dataInicio: '',
  dataFim: '',
  statusDocumento: '',
}

function chipClass(status: string) {
  if (status === 'rascunho') return 'cd-chip cd-chip--rascunho'
  if (status === 'em_conferencia') return 'cd-chip cd-chip--conf'
  if (status === 'aprovado_faturamento') return 'cd-chip cd-chip--fat'
  return 'cd-chip'
}

function formatarDataCriacao(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default function ComprovantesDescarte() {
  const [filtros, setFiltros] = useState<ComprovanteDescarteFiltros>(FILTROS_VAZIOS)
  const [filtrosAplicados, setFiltrosAplicados] =
    useState<ComprovanteDescarteFiltros>(FILTROS_VAZIOS)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [linhas, setLinhas] = useState<ComprovanteDescarteRow[]>([])
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState({
    totalPesoLiquido: 0,
    finalizados: 0,
    rascunhos: 0,
    liberadosFaturamento: 0,
  })
  const [cargo, setCargo] = useState<string | null>(null)

  const podeMutar = cargoPodeMutarComprovanteDescarte(cargo)
  const pageSize = 25

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    const { data, error } = await listarComprovantesDescarte(
      supabase,
      filtrosAplicados,
      page,
      pageSize
    )
    if (error || !data) {
      setErro(error?.message ?? 'Falha ao carregar comprovantes.')
      setLinhas([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLinhas(data.rows)
    setTotal(data.total)
    setResumo(data.resumo)
    setLoading(false)
  }, [filtrosAplicados, page])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setCargo(null)
        return
      }
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      setCargo(data?.cargo ?? null)
    })()
  }, [])

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))

  const resumoFmt = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(resumo.totalPesoLiquido),
    [resumo.totalPesoLiquido]
  )

  async function handleExcluir(row: ComprovanteDescarteRow) {
    if (!podeMutar) return
    const ok = window.confirm(
      `Excluir comprovante ${(row.codigo_remessa ?? '').trim() || row.id}? Esta ação não pode ser desfeita.`
    )
    if (!ok) return
    const { error } = await excluirComprovanteDescarte(supabase, row.id)
    if (error) {
      window.alert(error.message)
      return
    }
    void carregar()
  }

  return (
    <MainLayout>
      <div className="cd-page">
        <div className="cd-page__hero">
          <div>
            <h1 className="cd-page__title">Registo e imagens de descarte</h1>
            <p className="cd-page__lead">
              Registo técnico da comprovação do descarte, com rastreio de pesagem, intervenientes e
              imagens de suporte para auditoria e faturamento.
            </p>
          </div>
          {podeMutar ? (
            <Link to="/comprovantes-descarte/novo" className="cd-btn">
              Novo comprovante
            </Link>
          ) : null}
        </div>

        <div className="cd-summary-grid">
          <div className="cd-summary-card">
            <div className="cd-summary-card__label">Total (filtro)</div>
            <div className="cd-summary-card__value">{total}</div>
          </div>
          <div className="cd-summary-card">
            <div className="cd-summary-card__label">Peso líquido acumulado</div>
            <div className="cd-summary-card__value">{resumoFmt} kg</div>
          </div>
          <div className="cd-summary-card">
            <div className="cd-summary-card__label">Finalizados / aprovados</div>
            <div className="cd-summary-card__value">{resumo.finalizados}</div>
          </div>
          <div className="cd-summary-card">
            <div className="cd-summary-card__label">Rascunhos</div>
            <div className="cd-summary-card__value">{resumo.rascunhos}</div>
          </div>
          <div className="cd-summary-card">
            <div className="cd-summary-card__label">Liberados p/ faturamento</div>
            <div className="cd-summary-card__value">{resumo.liberadosFaturamento}</div>
          </div>
        </div>

        <div className="cd-filters">
          <div className="cd-filters__grid">
            <div>
              <label className="cd-label" htmlFor="cd-f-cod">
                Código da remessa
              </label>
              <input
                id="cd-f-cod"
                className="cd-input"
                value={filtros.codigoRemessa}
                onChange={(e) => setFiltros((p) => ({ ...p, codigoRemessa: e.target.value }))}
              />
            </div>
            <div>
              <label className="cd-label" htmlFor="cd-f-mtr">
                Número MTR
              </label>
              <input
                id="cd-f-mtr"
                className="cd-input"
                value={filtros.numeroMtr}
                onChange={(e) => setFiltros((p) => ({ ...p, numeroMtr: e.target.value }))}
              />
            </div>
            <div>
              <label className="cd-label" htmlFor="cd-f-ger">
                Gerador / cliente
              </label>
              <input
                id="cd-f-ger"
                className="cd-input"
                value={filtros.gerador}
                onChange={(e) => setFiltros((p) => ({ ...p, gerador: e.target.value }))}
              />
            </div>
            <div>
              <label className="cd-label" htmlFor="cd-f-mot">
                Motorista
              </label>
              <input
                id="cd-f-mot"
                className="cd-input"
                value={filtros.motorista}
                onChange={(e) => setFiltros((p) => ({ ...p, motorista: e.target.value }))}
              />
            </div>
            <div>
              <label className="cd-label" htmlFor="cd-f-placa">
                Placa
              </label>
              <input
                id="cd-f-placa"
                className="cd-input"
                value={filtros.placa}
                onChange={(e) => setFiltros((p) => ({ ...p, placa: e.target.value }))}
              />
            </div>
            <div>
              <label className="cd-label" htmlFor="cd-f-di">
                Data inicial
              </label>
              <input
                id="cd-f-di"
                type="date"
                className="cd-input"
                value={filtros.dataInicio}
                onChange={(e) => setFiltros((p) => ({ ...p, dataInicio: e.target.value }))}
              />
            </div>
            <div>
              <label className="cd-label" htmlFor="cd-f-df">
                Data final
              </label>
              <input
                id="cd-f-df"
                type="date"
                className="cd-input"
                value={filtros.dataFim}
                onChange={(e) => setFiltros((p) => ({ ...p, dataFim: e.target.value }))}
              />
            </div>
            <div>
              <label className="cd-label" htmlFor="cd-f-st">
                Status
              </label>
              <select
                id="cd-f-st"
                className="cd-select"
                value={filtros.statusDocumento}
                onChange={(e) => setFiltros((p) => ({ ...p, statusDocumento: e.target.value }))}
              >
                <option value="">Todos</option>
                <option value="rascunho">Rascunho</option>
                <option value="em_conferencia">Em conferência</option>
                <option value="finalizado">Finalizado</option>
                <option value="aprovado_faturamento">Aprovado p/ faturamento</option>
              </select>
            </div>
          </div>
          <div className="cd-filters__actions no-print">
            <button
              type="button"
              className="cd-btn"
              onClick={() => {
                setFiltrosAplicados(filtros)
                setPage(1)
              }}
            >
              Aplicar filtros
            </button>
            <button
              type="button"
              className="cd-btn cd-btn--secondary"
              onClick={() => {
                setFiltros(FILTROS_VAZIOS)
                setFiltrosAplicados(FILTROS_VAZIOS)
                setPage(1)
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>

        {erro ? (
          <p className="cd-erro-msg" style={{ marginBottom: 12 }}>
            {erro}
          </p>
        ) : null}

        <div className="cd-table-wrap">
          <table className="cd-table">
            <thead>
              <tr>
                <th>Código remessa</th>
                <th>Data remessa</th>
                <th>MTR</th>
                <th>Gerador</th>
                <th>Motorista</th>
                <th>Placa</th>
                <th>Peso líq.</th>
                <th>Status</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    A carregar…
                  </td>
                </tr>
              ) : linhas.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    Nenhum comprovante encontrado.
                  </td>
                </tr>
              ) : (
                linhas.map((r) => (
                  <tr key={r.id}>
                    <td>{(r.codigo_remessa ?? '').trim() || '—'}</td>
                    <td>
                      {r.data_remessa
                        ? new Intl.DateTimeFormat('pt-BR').format(new Date(r.data_remessa))
                        : '—'}
                    </td>
                    <td>{(r.numero_mtr ?? '').trim() || '—'}</td>
                    <td>{(r.gerador_razao_social ?? '').trim() || '—'}</td>
                    <td>{(r.motorista_nome ?? '').trim() || '—'}</td>
                    <td>{(r.placa ?? '').trim().toUpperCase() || '—'}</td>
                    <td>{formatarPesoExibicao(r.peso_liquido)}</td>
                    <td>
                      <span className={chipClass(r.status_documento)}>
                        {STATUS_COMPROVANTE_LABEL[r.status_documento]}
                      </span>
                    </td>
                    <td>{formatarDataCriacao(r.created_at)}</td>
                    <td>
                      <div className="cd-actions-row no-print">
                        <Link to={`/comprovantes-descarte/${r.id}`} className="cd-btn cd-btn--ghost">
                          Ver
                        </Link>
                        {podeMutar ? (
                          <Link
                            to={`/comprovantes-descarte/${r.id}/editar`}
                            className="cd-btn cd-btn--secondary"
                          >
                            Editar
                          </Link>
                        ) : null}
                        <Link
                          to={`/comprovantes-descarte/${r.id}#imprimir`}
                          className="cd-btn cd-btn--secondary"
                        >
                          Imprimir
                        </Link>
                        {podeMutar ? (
                          <button
                            type="button"
                            className="cd-btn cd-btn--danger"
                            onClick={() => void handleExcluir(r)}
                          >
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="cd-pagination no-print">
          <span>
            Página {page} / {totalPaginas}
          </span>
          <button
            type="button"
            className="cd-btn cd-btn--secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <button
            type="button"
            className="cd-btn cd-btn--secondary"
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => p + 1)}
          >
            Seguinte
          </button>
        </div>
      </div>
    </MainLayout>
  )
}
