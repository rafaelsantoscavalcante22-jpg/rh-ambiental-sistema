import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { cargoPodeEditarCobranca } from '../lib/workflowPermissions'
import { mensagemErroSupabase } from '../lib/supabaseErrors'

type ContaRow = {
  id: string
  valor: number
  valor_pago: number
  valor_travado: boolean | null
  status_pagamento: string
  data_vencimento: string | null
  data_emissao: string
  nf_enviada_em: string | null
  referencia_coleta_id: string
  cliente_id: string | null
  coleta_numero: string
  cliente_nome: string
}

function inicioDiaMs(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function formatCurrency(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, da] = iso.slice(0, 10).split('-')
  if (!y || !m || !da) return iso
  return `${da}/${m}/${y}`
}

export default function FinanceiroContasReceber() {
  const [linhas, setLinhas] = useState<ContaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [cargo, setCargo] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<'' | 'Pendente' | 'Parcial' | 'Pago'>('')
  const [filtroFaixa, setFiltroFaixa] = useState<'todos' | 'vencido' | '7d' | 'sem_venc'>('todos')
  const [busca, setBusca] = useState('')

  const podeMutar = cargoPodeEditarCobranca(cargo)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const selectCr =
        'id, valor, valor_pago, valor_travado, status_pagamento, data_vencimento, data_emissao, nf_enviada_em, referencia_coleta_id, cliente_id'

      const { data: cr, error: e1 } = await supabase
        .from('contas_receber')
        .select(selectCr)
        .order('data_vencimento', { ascending: true, nullsFirst: false })
        .limit(4000)

      if (e1) throw e1

      const list = (cr || []) as Record<string, unknown>[]
      const refIds = [...new Set(list.map((r) => String(r.referencia_coleta_id || '')).filter(Boolean))]
      const cliIds = [
        ...new Set(list.map((r) => r.cliente_id as string | null).filter(Boolean) as string[]),
      ]

      const cmap = new Map<string, { numero: string }>()
      const IN_CHUNK = 300
      if (refIds.length > 0) {
        const fatias: string[][] = []
        for (let i = 0; i < refIds.length; i += IN_CHUNK) {
          fatias.push(refIds.slice(i, i + IN_CHUNK))
        }
        const colunas = await Promise.all(
          fatias.map((slice) =>
            supabase.from('coletas').select('id, numero').in('id', slice)
          )
        )
        for (const { data: cols, error: e2 } of colunas) {
          if (!e2 && cols) {
            for (const c of cols as { id: string; numero: string }[]) {
              cmap.set(c.id, { numero: c.numero })
            }
          }
        }
      }

      const clmap = new Map<string, string>()
      if (cliIds.length > 0) {
        const fatiasCli: string[][] = []
        for (let i = 0; i < cliIds.length; i += IN_CHUNK) {
          fatiasCli.push(cliIds.slice(i, i + IN_CHUNK))
        }
        const clientesRes = await Promise.all(
          fatiasCli.map((slice) =>
            supabase.from('clientes').select('id, nome').in('id', slice)
          )
        )
        for (const { data: cls, error: e3 } of clientesRes) {
          if (!e3 && cls) {
            for (const c of cls as { id: string; nome: string }[]) {
              clmap.set(c.id, c.nome)
            }
          }
        }
      }

      const out: ContaRow[] = list.map((r) => {
        const ref = String(r.referencia_coleta_id || '')
        const cid = (r.cliente_id as string | null) || null
        return {
          id: String(r.id),
          valor: Number(r.valor) || 0,
          valor_pago: Number(r.valor_pago) || 0,
          valor_travado: r.valor_travado === true,
          status_pagamento: String(r.status_pagamento || 'Pendente'),
          data_vencimento: (r.data_vencimento as string | null) || null,
          data_emissao: String(r.data_emissao || '').slice(0, 10),
          nf_enviada_em: (r.nf_enviada_em as string | null) || null,
          referencia_coleta_id: ref,
          cliente_id: cid,
          coleta_numero: cmap.get(ref)?.numero ?? ref.slice(0, 8),
          cliente_nome: cid ? clmap.get(cid) ?? '—' : '—',
        }
      })

      setLinhas(out)
    } catch (e) {
      setErro(mensagemErroSupabase(e, 'Erro ao carregar contas a receber.'))
      setLinhas([])
    } finally {
      setLoading(false)
    }
  }, [])

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

  const hojeMs = useMemo(() => inicioDiaMs(new Date().toISOString()), [])

  const filtradas = useMemo(() => {
    let list = linhas
    const t = busca.trim().toLowerCase()
    if (t) {
      list = list.filter(
        (r) =>
          r.coleta_numero.toLowerCase().includes(t) ||
          r.cliente_nome.toLowerCase().includes(t) ||
          r.referencia_coleta_id.toLowerCase().includes(t)
      )
    }
    if (filtroStatus) {
      list = list.filter((r) => r.status_pagamento === filtroStatus)
    }
    if (filtroFaixa !== 'todos') {
      list = list.filter((r) => {
        const saldo = r.valor - r.valor_pago
        if (saldo <= 0 || r.status_pagamento === 'Pago') return false
        const v = r.data_vencimento
        if (filtroFaixa === 'sem_venc') return !v
        if (!v) return false
        const vm = inicioDiaMs(v)
        if (filtroFaixa === 'vencido') return vm < hojeMs
        const alvo = hojeMs + 7 * 86400000
        return vm >= hojeMs && vm <= alvo
      })
    }
    return list
  }, [linhas, busca, filtroStatus, filtroFaixa, hojeMs])

  const resumo = useMemo(() => {
    let saldoAberto = 0
    let saldoVencido = 0
    for (const r of linhas) {
      if (r.status_pagamento === 'Pago' || r.status_pagamento === 'Cancelado') continue
      const saldo = r.valor - r.valor_pago
      if (saldo <= 0) continue
      saldoAberto += saldo
      const v = r.data_vencimento
      if (v && inicioDiaMs(v) < hojeMs) saldoVencido += saldo
    }
    return { saldoAberto, saldoVencido, qtd: linhas.length }
  }, [linhas, hojeMs])

  function exportarCsv() {
    const header = [
      'coleta',
      'cliente',
      'valor',
      'valor_pago',
      'saldo',
      'status',
      'vencimento',
      'emissao',
      'travado',
      'nf_enviada',
    ]
    const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
    const body = filtradas
      .map((r) => {
        const saldo = r.valor - r.valor_pago
        return [
          esc(r.coleta_numero),
          esc(r.cliente_nome),
          esc(r.valor),
          esc(r.valor_pago),
          esc(saldo),
          esc(r.status_pagamento),
          esc(r.data_vencimento || ''),
          esc(r.data_emissao),
          esc(r.valor_travado ? 'sim' : 'não'),
          esc(r.nf_enviada_em || ''),
        ].join(';')
      })
      .join('\r\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + header.join(';') + '\r\n' + body], {
      type: 'text/csv;charset=utf-8;',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `contas-receber-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <MainLayout>
      <div className="page-shell">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
              Títulos, vencimentos e saldos
            </h1>
            <p className="page-header__lead" style={{ margin: '8px 0 0', maxWidth: 720 }}>
              Relatório por título: saldos em aberto, vencidos e faixa de vencimento. Use a{' '}
              <Link to="/financeiro">cobrança por coleta</Link> para alterar vencimento, NF e baixas.
            </p>
            {podeMutar ? null : (
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                Seu perfil: consulta. Alterações em cobrança exigem Financeiro ou Administrador.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <button
              type="button"
              onClick={() => void carregar()}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={exportarCsv}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid #0f172a',
                background: '#0f172a',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {erro ? (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
            }}
          >
            {erro}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginTop: '22px',
          }}
        >
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              background: '#fff',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Títulos carregados</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px' }}>{resumo.qtd}</div>
          </div>
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '14px',
              border: '1px solid #fde68a',
              background: '#fffbeb',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>Saldo em aberto</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px', color: '#b45309' }}>
              {formatCurrency(resumo.saldoAberto)}
            </div>
          </div>
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '14px',
              border: '1px solid #fecaca',
              background: '#fef2f2',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b' }}>Saldo vencido (aberto)</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px', color: '#b91c1c' }}>
              {formatCurrency(resumo.saldoVencido)}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Busca</div>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cliente, nº coleta…"
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                minWidth: '220px',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Status</div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
              style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
            >
              <option value="">Todos</option>
              <option value="Pendente">Pendente</option>
              <option value="Parcial">Parcial</option>
              <option value="Pago">Pago</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
              Envelhecimento
            </div>
            <select
              value={filtroFaixa}
              onChange={(e) => setFiltroFaixa(e.target.value as typeof filtroFaixa)}
              style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
            >
              <option value="todos">Todos (com saldo)</option>
              <option value="vencido">Vencidos</option>
              <option value="7d">A vencer em 7 dias</option>
              <option value="sem_venc">Sem data vencimento</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '18px' }}>
          {loading ? (
            <p style={{ color: '#64748b' }}>A carregar…</p>
          ) : (
            <table
              style={{
                width: '100%',
                minWidth: '920px',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>Coleta</th>
                  <th style={{ padding: '10px 8px' }}>Cliente</th>
                  <th style={{ padding: '10px 8px' }}>Valor</th>
                  <th style={{ padding: '10px 8px' }}>Pago</th>
                  <th style={{ padding: '10px 8px' }}>Saldo</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                  <th style={{ padding: '10px 8px' }}>Venc.</th>
                  <th style={{ padding: '10px 8px' }}>Trav.</th>
                  <th style={{ padding: '10px 8px' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '24px', color: '#64748b' }}>
                      Nenhuma linha com estes filtros.
                    </td>
                  </tr>
                ) : (
                  filtradas.map((r) => {
                    const saldo = r.valor - r.valor_pago
                    const vencMs = r.data_vencimento ? inicioDiaMs(r.data_vencimento) : null
                    const vencido = vencMs != null && saldo > 0 && vencMs < hojeMs
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>{r.coleta_numero}</td>
                        <td style={{ padding: '10px 8px' }}>{r.cliente_nome}</td>
                        <td style={{ padding: '10px 8px' }}>{formatCurrency(r.valor)}</td>
                        <td style={{ padding: '10px 8px' }}>{formatCurrency(r.valor_pago)}</td>
                        <td
                          style={{
                            padding: '10px 8px',
                            fontWeight: 700,
                            color: saldo > 0 ? '#b45309' : '#15803d',
                          }}
                        >
                          {formatCurrency(saldo)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{r.status_pagamento}</td>
                        <td style={{ padding: '10px 8px', color: vencido ? '#b91c1c' : undefined }}>
                          {formatDate(r.data_vencimento)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{r.valor_travado ? 'sim' : '—'}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <Link
                            to={`/financeiro?coleta=${encodeURIComponent(r.referencia_coleta_id)}`}
                            style={{ fontWeight: 700, color: '#0d9488' }}
                          >
                            Cobrança
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
