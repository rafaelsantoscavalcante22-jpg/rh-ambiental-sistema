import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { limparSessionDraftKey, useCadastroFormDraft } from '../lib/useCadastroFormDraft'
import { cargoPodeEmitirFaturamento } from '../lib/workflowPermissions'
import type { RegraPrecoRow } from '../services/pricing'

type ClienteOpt = { id: string; nome: string; razao_social: string | null }

type FormState = {
  cliente_id: string
  tipo_residuo: string
  tipo_servico: string
  valor_por_kg: string
  valor_minimo: string
  valor_fixo: string
  valor_transporte_por_kg: string
  valor_tratamento_por_kg: string
  taxa_adicional_fixa: string
  ativo: boolean
}

const formInicial: FormState = {
  cliente_id: '',
  tipo_residuo: '',
  tipo_servico: 'COLETA',
  valor_por_kg: '',
  valor_minimo: '0',
  valor_fixo: '',
  valor_transporte_por_kg: '',
  valor_tratamento_por_kg: '',
  taxa_adicional_fixa: '',
  ativo: true,
}

const FATURAMENTO_REGRAS_DRAFT_KEY = 'rg-ambiental-faturamento-regras-draft'

function parseNumeroOpcional(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function FaturamentoRegrasPreco() {
  const [cargo, setCargo] = useState<string | null>(null)
  const [clientes, setClientes] = useState<ClienteOpt[]>([])
  const [regras, setRegras] = useState<RegraPrecoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(formInicial)

  const podeMutar = cargoPodeEmitirFaturamento(cargo)

  const regrasDraftData = useMemo(() => ({ form, editandoId }), [form, editandoId])
  useCadastroFormDraft({
    storageKey: FATURAMENTO_REGRAS_DRAFT_KEY,
    open: podeMutar,
    data: regrasDraftData,
    onRestore: (d) => {
      setForm(d.form)
      setEditandoId(d.editandoId)
    },
  })

  const carregarTudo = useCallback(async () => {
    setLoading(true)
    setErro('')
    setOk('')
    try {
      const [cliRes, regrasRes] = await Promise.all([
        supabase.from('clientes').select('id, nome, razao_social').order('nome', { ascending: true }).limit(5000),
        supabase.from('faturamento_precos_regras').select('*').order('updated_at', { ascending: false }).limit(500),
      ])

      if (cliRes.error) throw cliRes.error
      if (regrasRes.error) throw regrasRes.error

      setClientes((cliRes.data || []) as ClienteOpt[])
      setRegras((regrasRes.data || []) as RegraPrecoRow[])
    } catch (e) {
      console.error(e)
      setErro(e instanceof Error ? e.message : 'Erro ao carregar regras de preço.')
      setClientes([])
      setRegras([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void carregarTudo()
  }, [carregarTudo])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setCargo(null)
        return
      }
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      if (!cancelled) setCargo(data?.cargo ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const mapaClientes = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clientes) {
      const rot = (c.razao_social || '').trim()
      m.set(c.id, rot ? `${c.nome} · ${rot}` : c.nome)
    }
    return m
  }, [clientes])

  function iniciarNova() {
    limparSessionDraftKey(FATURAMENTO_REGRAS_DRAFT_KEY)
    setEditandoId(null)
    setForm(formInicial)
    setErro('')
    setOk('')
  }

  function iniciarEdicao(r: RegraPrecoRow) {
    setEditandoId(r.id)
    setForm({
      cliente_id: r.cliente_id ?? '',
      tipo_residuo: (r.tipo_residuo ?? '').trim(),
      tipo_servico: (r.tipo_servico ?? 'COLETA').trim() || 'COLETA',
      valor_por_kg: r.valor_por_kg != null ? String(r.valor_por_kg) : '',
      valor_minimo: r.valor_minimo != null ? String(r.valor_minimo) : '0',
      valor_fixo: r.valor_fixo != null ? String(r.valor_fixo) : '',
      valor_transporte_por_kg: r.valor_transporte_por_kg != null ? String(r.valor_transporte_por_kg) : '',
      valor_tratamento_por_kg: r.valor_tratamento_por_kg != null ? String(r.valor_tratamento_por_kg) : '',
      taxa_adicional_fixa: r.taxa_adicional_fixa != null ? String(r.taxa_adicional_fixa) : '',
      ativo: r.ativo !== false,
    })
    setErro('')
    setOk('')
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!podeMutar) {
      setErro('Sem permissão para alterar regras.')
      return
    }

    const tipoRes = form.tipo_residuo.trim()
    if (!tipoRes) {
      setErro('Preencha o tipo de resíduo (use * para regra geral).')
      return
    }

    const payload = {
      cliente_id: form.cliente_id.trim() ? form.cliente_id.trim() : null,
      tipo_residuo: tipoRes,
      tipo_servico: form.tipo_servico.trim() || 'COLETA',
      valor_por_kg: parseNumeroOpcional(form.valor_por_kg),
      valor_minimo: parseNumeroOpcional(form.valor_minimo) ?? 0,
      valor_fixo: parseNumeroOpcional(form.valor_fixo),
      valor_transporte_por_kg: parseNumeroOpcional(form.valor_transporte_por_kg),
      valor_tratamento_por_kg: parseNumeroOpcional(form.valor_tratamento_por_kg),
      taxa_adicional_fixa: parseNumeroOpcional(form.taxa_adicional_fixa),
      ativo: form.ativo,
      updated_at: new Date().toISOString(),
    }

    setSalvando(true)
    setErro('')
    setOk('')
    try {
      if (editandoId) {
        const { error } = await supabase.from('faturamento_precos_regras').update(payload).eq('id', editandoId)
        if (error) throw error
        setOk('Regra atualizada.')
      } else {
        const { error } = await supabase.from('faturamento_precos_regras').insert({
          ...payload,
          created_at: new Date().toISOString(),
        })
        if (error) throw error
        setOk('Regra criada.')
        iniciarNova()
      }
      await carregarTudo()
    } catch (err) {
      console.error(err)
      setErro(err instanceof Error ? err.message : 'Erro ao gravar regra.')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    if (!podeMutar) return
    if (!window.confirm('Remover esta regra de preço?')) return
    setErro('')
    setOk('')
    try {
      const { error } = await supabase.from('faturamento_precos_regras').delete().eq('id', id)
      if (error) throw error
      setOk('Regra removida.')
      if (editandoId === id) iniciarNova()
      await carregarTudo()
    } catch (e) {
      console.error(e)
      setErro(e instanceof Error ? e.message : 'Erro ao remover.')
    }
  }

  return (
    <MainLayout>
      <div className="page-shell">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Contratos e tabelas de preço
            </h1>
            <p className="page-header__lead" style={{ margin: '10px 0 0', maxWidth: 820, lineHeight: 1.65 }}>
              Cadastro de contratos e regras para <strong>sugestão automática</strong> no modal de faturamento. Prioridade:{' '}
              <strong>cliente + resíduo</strong> → <strong>cliente</strong> → <strong>geral por resíduo</strong> → manual.
            </p>
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              Perfil: <span style={{ color: '#0f172a' }}>{cargo ?? '—'}</span>
              {!podeMutar ? ' · somente consulta' : ' · pode criar e editar'}
            </p>
          </div>
          <Link
            to="/faturamento"
            style={{
              padding: '10px 16px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontWeight: 800,
              fontSize: '13px',
              color: '#0f172a',
              textDecoration: 'none',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          >
            Voltar ao Faturamento
          </Link>
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
              fontWeight: 600,
            }}
          >
            {erro}
          </div>
        ) : null}
        {ok ? (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#ecfdf5',
              border: '1px solid #bbf7d0',
              color: '#15803d',
              fontWeight: 600,
            }}
          >
            {ok}
          </div>
        ) : null}

        <div style={{ marginTop: '22px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: '18px' }}>
          <form
            onSubmit={(ev) => void salvar(ev)}
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '18px',
              padding: '18px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
              {editandoId ? 'Editar regra' : 'Nova regra'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                Cliente (opcional — vazio = regra geral)
                <select
                  value={form.cliente_id}
                  onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}
                  disabled={!podeMutar || loading}
                  style={{
                    marginTop: '6px',
                    width: '100%',
                    height: '42px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    padding: '0 12px',
                    fontSize: '14px',
                    background: '#fff',
                  }}
                >
                  <option value="">— Geral (sem cliente) —</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {mapaClientes.get(c.id) ?? c.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                Tipo de resíduo
                <input
                  value={form.tipo_residuo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_residuo: e.target.value }))}
                  disabled={!podeMutar}
                  placeholder="Ex.: Lodo · use * para qualquer resíduo"
                  style={{
                    marginTop: '6px',
                    width: '100%',
                    height: '42px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    padding: '0 12px',
                    fontSize: '14px',
                  }}
                />
              </label>

              <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                Tipo de serviço
                <input
                  value={form.tipo_servico}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_servico: e.target.value }))}
                  disabled={!podeMutar}
                  placeholder="COLETA"
                  style={{
                    marginTop: '6px',
                    width: '100%',
                    height: '42px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    padding: '0 12px',
                    fontSize: '14px',
                  }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  Valor por kg
                  <input
                    value={form.valor_por_kg}
                    onChange={(e) => setForm((f) => ({ ...f, valor_por_kg: e.target.value }))}
                    disabled={!podeMutar}
                    style={campoNum}
                  />
                </label>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  Mínimo
                  <input
                    value={form.valor_minimo}
                    onChange={(e) => setForm((f) => ({ ...f, valor_minimo: e.target.value }))}
                    disabled={!podeMutar}
                    style={campoNum}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  Fixo (opcional)
                  <input
                    value={form.valor_fixo}
                    onChange={(e) => setForm((f) => ({ ...f, valor_fixo: e.target.value }))}
                    disabled={!podeMutar}
                    style={campoNum}
                  />
                </label>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  Taxa adicional fixa
                  <input
                    value={form.taxa_adicional_fixa}
                    onChange={(e) => setForm((f) => ({ ...f, taxa_adicional_fixa: e.target.value }))}
                    disabled={!podeMutar}
                    style={campoNum}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  Transporte / kg
                  <input
                    value={form.valor_transporte_por_kg}
                    onChange={(e) => setForm((f) => ({ ...f, valor_transporte_por_kg: e.target.value }))}
                    disabled={!podeMutar}
                    style={campoNum}
                  />
                </label>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                  Tratamento / kg
                  <input
                    value={form.valor_tratamento_por_kg}
                    onChange={(e) => setForm((f) => ({ ...f, valor_tratamento_por_kg: e.target.value }))}
                    disabled={!podeMutar}
                    style={campoNum}
                  />
                </label>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                  disabled={!podeMutar}
                  style={{ width: '18px', height: '18px', accentColor: '#0f766e' }}
                />
                Regra ativa
              </label>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="submit"
                disabled={!podeMutar || salvando}
                style={{
                  padding: '12px 18px',
                  borderRadius: '12px',
                  border: 'none',
                  background: podeMutar ? '#0f766e' : '#94a3b8',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: podeMutar && !salvando ? 'pointer' : 'not-allowed',
                }}
              >
                {salvando ? 'A gravar…' : editandoId ? 'Guardar alterações' : 'Criar regra'}
              </button>
              <button
                type="button"
                onClick={() => iniciarNova()}
                disabled={salvando}
                style={{
                  padding: '12px 18px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Limpar
              </button>
            </div>
          </form>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '18px',
              padding: '18px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Regras cadastradas</div>
              <button
                type="button"
                onClick={() => void carregarTudo()}
                disabled={loading}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'A carregar…' : 'Atualizar'}
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '720px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={th}>Ativo</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Resíduo</th>
                    <th style={th}>Serviço</th>
                    <th style={th}>R$/kg</th>
                    <th style={th}>Mín.</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '18px', color: '#64748b' }}>
                        A carregar…
                      </td>
                    </tr>
                  ) : regras.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '18px', color: '#64748b' }}>
                        Ainda não há regras. Crie a primeira à esquerda.
                      </td>
                    </tr>
                  ) : (
                    regras.map((r) => {
                      const cid = r.cliente_id ? String(r.cliente_id) : ''
                      const cli = cid ? mapaClientes.get(cid) ?? '—' : 'Geral'
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid #eef2f7' }}>
                          <td style={td}>{r.ativo === false ? 'Não' : 'Sim'}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{cli}</td>
                          <td style={td}>{(r.tipo_residuo ?? '').trim() || '—'}</td>
                          <td style={td}>{(r.tipo_servico ?? '').trim() || '—'}</td>
                          <td style={td}>{r.valor_por_kg != null ? String(r.valor_por_kg) : '—'}</td>
                          <td style={td}>{r.valor_minimo != null ? String(r.valor_minimo) : '—'}</td>
                          <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => iniciarEdicao(r)}
                              disabled={!podeMutar}
                              style={btnGhost}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void remover(r.id)}
                              disabled={!podeMutar}
                              style={{ ...btnGhost, color: '#991b1b', borderColor: '#fecaca' }}
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

const campoNum: CSSProperties = {
  marginTop: '6px',
  width: '100%',
  height: '42px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  padding: '0 12px',
  fontSize: '14px',
  boxSizing: 'border-box',
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px',
  color: '#0f172a',
  fontWeight: 800,
}

const td: CSSProperties = {
  padding: '10px',
  verticalAlign: 'middle',
  color: '#334155',
}

const btnGhost: CSSProperties = {
  padding: '6px 10px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  background: '#fff',
  fontWeight: 700,
  fontSize: '12px',
  cursor: 'pointer',
  marginLeft: '6px',
}
