import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { cargoPodeEditarCobranca } from '../lib/workflowPermissions'
import { mensagemErroSupabase } from '../lib/supabaseErrors'

const STORAGE_BUCKET = 'contas-pagar-anexos'

type StatusExibicao = 'Pendente' | 'Pago' | 'Atrasado'

type ContaPagarAnexo = {
  id: string
  storage_path: string
  nome_arquivo: string
  content_type: string | null
  tamanho_bytes: number | null
  created_at: string
}

type ContaPagarRow = {
  id: string
  fornecedor: string
  descricao: string
  valor: number
  data_vencimento: string
  categoria: string
  status: 'Pendente' | 'Pago'
  observacoes: string | null
  created_at: string
  updated_at: string
  contas_pagar_anexos?: ContaPagarAnexo[]
}

const CATEGORIAS_SUGESTAO = [
  'Geral',
  'Fornecedores',
  'Serviços',
  'Impostos',
  'Folha',
  'Utilidades',
  'Combustível',
  'Manutenção',
  'Outros',
]

function inicioDiaUtc(isoDate: string): number {
  const d = `${isoDate.slice(0, 10)}T12:00:00Z`
  return new Date(d).setUTCHours(0, 0, 0, 0)
}

function hojeUtcMidnight(): number {
  const n = new Date()
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())
}

function statusExibicao(row: ContaPagarRow): StatusExibicao {
  if (row.status === 'Pago') return 'Pago'
  const v = row.data_vencimento?.slice(0, 10)
  if (!v) return 'Pendente'
  if (inicioDiaUtc(v) < hojeUtcMidnight()) return 'Atrasado'
  return 'Pendente'
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

function parseValorBR(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function valorCampoParaString(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sanitizarNomeArquivo(nome: string): string {
  return nome.replace(/[^\w.\-()\s]/g, '_').slice(0, 180) || 'arquivo'
}

type FormState = {
  fornecedor: string
  descricao: string
  valorStr: string
  data_vencimento: string
  categoria: string
  status: 'Pendente' | 'Pago'
  observacoes: string
}

const formVazio: FormState = {
  fornecedor: '',
  descricao: '',
  valorStr: '',
  data_vencimento: '',
  categoria: 'Geral',
  status: 'Pendente',
  observacoes: '',
}

export default function FinanceiroContasPagar() {
  const [linhas, setLinhas] = useState<ContaPagarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [cargo, setCargo] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusExibicao>('')
  const [vencDe, setVencDe] = useState('')
  const [vencAte, setVencAte] = useState('')
  const [busca, setBusca] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(formVazio)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [salvando, setSalvando] = useState(false)

  const podeMutar = cargoPodeEditarCobranca(cargo)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data, error: e } = await supabase
        .from('contas_pagar')
        .select(
          `
          id,
          fornecedor,
          descricao,
          valor,
          data_vencimento,
          categoria,
          status,
          observacoes,
          created_at,
          updated_at,
          contas_pagar_anexos (
            id,
            storage_path,
            nome_arquivo,
            content_type,
            tamanho_bytes,
            created_at
          )
        `
        )
        .order('data_vencimento', { ascending: true })

      if (e) throw e
      const rows = (data || []) as unknown as ContaPagarRow[]
      setLinhas(
        rows.map((r) => ({
          ...r,
          contas_pagar_anexos: Array.isArray(r.contas_pagar_anexos) ? r.contas_pagar_anexos : [],
        }))
      )
    } catch (err) {
      setErro(mensagemErroSupabase(err, 'Erro ao carregar contas a pagar.'))
      setLinhas([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void carregar()
    })
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

  const hojeMs = useMemo(() => hojeUtcMidnight(), [])

  const inicioMes = useMemo(() => {
    const n = new Date()
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)
  }, [])

  const fimMes = useMemo(() => {
    const n = new Date()
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)
  }, [])

  const resumoGlobal = useMemo(() => {
    let aPagarMes = 0
    let totalAtraso = 0
    for (const r of linhas) {
      if (r.status !== 'Pendente') continue
      const vMs = inicioDiaUtc(r.data_vencimento.slice(0, 10))
      if (vMs >= inicioMes && vMs <= fimMes) {
        aPagarMes += Number(r.valor) || 0
      }
      if (vMs < hojeMs) {
        totalAtraso += Number(r.valor) || 0
      }
    }
    return { aPagarMes, totalAtraso, qtd: linhas.length }
  }, [linhas, inicioMes, fimMes, hojeMs])

  const filtradas = useMemo(() => {
    let list = linhas
    const t = busca.trim().toLowerCase()
    if (t) {
      list = list.filter(
        (r) =>
          r.fornecedor.toLowerCase().includes(t) ||
          r.descricao.toLowerCase().includes(t) ||
          r.categoria.toLowerCase().includes(t)
      )
    }
    if (filtroStatus) {
      list = list.filter((r) => statusExibicao(r) === filtroStatus)
    }
    if (vencDe.trim()) {
      const d0 = vencDe.slice(0, 10)
      list = list.filter((r) => r.data_vencimento.slice(0, 10) >= d0)
    }
    if (vencAte.trim()) {
      const d1 = vencAte.slice(0, 10)
      list = list.filter((r) => r.data_vencimento.slice(0, 10) <= d1)
    }
    return list
  }, [linhas, busca, filtroStatus, vencDe, vencAte])

  function abrirNovo() {
    setEditingId(null)
    setForm(formVazio)
    setPendingFiles([])
    setFormOpen(true)
  }

  function abrirEditar(row: ContaPagarRow) {
    setEditingId(row.id)
    setForm({
      fornecedor: row.fornecedor,
      descricao: row.descricao,
      valorStr: valorCampoParaString(Number(row.valor) || 0),
      data_vencimento: row.data_vencimento.slice(0, 10),
      categoria: row.categoria || 'Geral',
      status: row.status,
      observacoes: row.observacoes ?? '',
    })
    setPendingFiles([])
    setFormOpen(true)
  }

  function fecharForm() {
    if (salvando) return
    setFormOpen(false)
    setEditingId(null)
    setForm(formVazio)
    setPendingFiles([])
  }

  async function uploadAnexos(contaId: string, files: File[]) {
    for (const file of files) {
      const safe = sanitizarNomeArquivo(file.name)
      const path = `${contaId}/${Date.now()}_${safe}`
      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      })
      if (upErr) throw upErr
      const { error: insErr } = await supabase.from('contas_pagar_anexos').insert({
        conta_pagar_id: contaId,
        storage_path: path,
        nome_arquivo: file.name,
        content_type: file.type || null,
        tamanho_bytes: file.size,
      })
      if (insErr) throw insErr
    }
    void user
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!podeMutar) {
      alert('Sem permissão para lançar contas a pagar.')
      return
    }
    const valor = parseValorBR(form.valorStr)
    if (valor == null) {
      alert('Informe um valor válido (ex.: 1.234,56).')
      return
    }
    if (!form.fornecedor.trim() || !form.descricao.trim()) {
      alert('Preencha fornecedor e descrição.')
      return
    }
    if (!form.data_vencimento) {
      alert('Informe a data de vencimento.')
      return
    }

    setSalvando(true)
    setErro('')
    try {
      const payload = {
        fornecedor: form.fornecedor.trim(),
        descricao: form.descricao.trim(),
        valor,
        data_vencimento: form.data_vencimento,
        categoria: form.categoria.trim() || 'Geral',
        status: form.status,
        observacoes: form.observacoes.trim() || null,
      }

      let contaId = editingId
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (editingId) {
        const { error: uErr } = await supabase.from('contas_pagar').update(payload).eq('id', editingId)
        if (uErr) throw uErr
      } else {
        const { data: ins, error: iErr } = await supabase
          .from('contas_pagar')
          .insert({
            ...payload,
            ...(user?.id ? { created_by: user.id } : {}),
          })
          .select('id')
          .single()
        if (iErr) throw iErr
        contaId = String((ins as { id: string }).id)
      }

      if (pendingFiles.length > 0 && contaId) {
        await uploadAnexos(contaId, pendingFiles)
      }

      fecharForm()
      await carregar()
    } catch (err) {
      setErro(mensagemErroSupabase(err, 'Erro ao guardar.'))
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(row: ContaPagarRow) {
    if (!podeMutar) return
    if (!window.confirm(`Remover lançamento «${row.descricao.slice(0, 60)}»?`)) return
    setErro('')
    try {
      const paths = (row.contas_pagar_anexos || []).map((a) => a.storage_path).filter(Boolean)
      if (paths.length > 0) {
        const { error: stErr } = await supabase.storage.from(STORAGE_BUCKET).remove(paths)
        if (stErr) console.warn(stErr)
      }
      const { error: dErr } = await supabase.from('contas_pagar').delete().eq('id', row.id)
      if (dErr) throw dErr
      await carregar()
    } catch (err) {
      setErro(mensagemErroSupabase(err, 'Erro ao remover.'))
    }
  }

  async function handleRemoverAnexo(row: ContaPagarRow, anexo: ContaPagarAnexo) {
    if (!podeMutar) return
    if (!window.confirm(`Remover anexo «${anexo.nome_arquivo}»?`)) return
    setErro('')
    try {
      const { error: stErr } = await supabase.storage.from(STORAGE_BUCKET).remove([anexo.storage_path])
      if (stErr) throw stErr
      const { error: dErr } = await supabase.from('contas_pagar_anexos').delete().eq('id', anexo.id)
      if (dErr) throw dErr
      await carregar()
    } catch (err) {
      setErro(mensagemErroSupabase(err, 'Erro ao remover anexo.'))
    }
  }

  async function handleBaixarAnexo(anexo: ContaPagarAnexo) {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(anexo.storage_path, 3600)
      if (error) throw error
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      alert(mensagemErroSupabase(err, 'Não foi possível abrir o anexo.'))
    }
  }

  function exportarCsv() {
    const header = ['fornecedor', 'descricao', 'valor', 'vencimento', 'categoria', 'status_exibicao', 'status_bd']
    const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
    const body = filtradas
      .map((r) =>
        [
          esc(r.fornecedor),
          esc(r.descricao),
          esc(r.valor),
          esc(r.data_vencimento),
          esc(r.categoria),
          esc(statusExibicao(r)),
          esc(r.status),
        ].join(';')
      )
      .join('\r\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + header.join(';') + '\r\n' + body], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `contas-pagar-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 700,
    color: '#64748b',
    marginBottom: '4px',
    display: 'block',
  }

  return (
    <MainLayout>
      <div className="page-shell">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>Contas a pagar</h1>
            <p className="page-header__lead" style={{ margin: '8px 0 0', maxWidth: 720 }}>
              Lançamentos de despesas e fornecedores. Títulos pendentes com vencimento ultrapassado aparecem como{' '}
              <strong>Atrasado</strong> e destacados em vermelho. Integrado ao{' '}
              <Link to="/financeiro">Financeiro</Link> e à{' '}
              <Link to="/financeiro/contas-receber">cobrança (contas a receber)</Link>.
            </p>
            {!podeMutar ? (
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                Seu perfil: consulta. Inclusão e edição exigem Financeiro, Faturamento (conforme política) ou
                Administrador.
              </p>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {podeMutar ? (
              <button
                type="button"
                onClick={abrirNovo}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#0d9488',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Novo lançamento
              </button>
            ) : null}
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
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Lançamentos</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px' }}>{resumoGlobal.qtd}</div>
          </div>
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '14px',
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1' }}>A pagar no mês (pendentes)</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px', color: '#0c4a6e' }}>
              {formatCurrency(resumoGlobal.aPagarMes)}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
              Soma dos pendentes com vencimento no mês corrente (calendário UTC).
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
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b' }}>Total em atraso (pendentes)</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px', color: '#b91c1c' }}>
              {formatCurrency(resumoGlobal.totalAtraso)}
            </div>
          </div>
        </div>

        {formOpen ? (
          <div
            style={{
              marginTop: '24px',
              padding: '20px',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                {editingId ? 'Editar lançamento' : 'Novo lançamento'}
              </h2>
              <button
                type="button"
                onClick={fecharForm}
                disabled={salvando}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontWeight: 600,
                  cursor: salvando ? 'wait' : 'pointer',
                }}
              >
                Fechar
              </button>
            </div>
            <form onSubmit={(ev) => void handleSalvar(ev)}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Fornecedor</label>
                  <input
                    value={form.fornecedor}
                    onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.value }))}
                    style={inputStyle}
                    required
                    disabled={!podeMutar}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Valor (R$)</label>
                  <input
                    value={form.valorStr}
                    onChange={(e) => setForm((f) => ({ ...f, valorStr: e.target.value }))}
                    style={inputStyle}
                    placeholder="0,00"
                    inputMode="decimal"
                    disabled={!podeMutar}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Vencimento</label>
                  <input
                    type="date"
                    value={form.data_vencimento}
                    onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value }))}
                    style={inputStyle}
                    required
                    disabled={!podeMutar}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Categoria</label>
                  <input
                    value={form.categoria}
                    onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                    style={inputStyle}
                    list="contas-pagar-categorias"
                    disabled={!podeMutar}
                  />
                  <datalist id="contas-pagar-categorias">
                    {CATEGORIAS_SUGESTAO.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as 'Pendente' | 'Pago' }))
                    }
                    style={{ ...inputStyle, cursor: podeMutar ? 'pointer' : 'not-allowed' }}
                    disabled={!podeMutar}
                  >
                    <option value="Pendente">Pendente</option>
                    <option value="Pago">Pago</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '14px' }}>
                <label style={labelStyle}>Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
                  required
                  disabled={!podeMutar}
                />
              </div>
              <div style={{ marginTop: '14px' }}>
                <label style={labelStyle}>Observações (opcional)</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  style={{ ...inputStyle, minHeight: '56px', resize: 'vertical' }}
                  disabled={!podeMutar}
                />
              </div>
              {podeMutar ? (
                <div style={{ marginTop: '14px' }}>
                  <label style={labelStyle}>Anexos (boletos, NF-e, etc.)</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
                    style={{ fontSize: '14px' }}
                  />
                  {pendingFiles.length > 0 ? (
                    <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
                      {pendingFiles.length} ficheiro(s) serão enviados ao guardar.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {editingId && podeMutar ? (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ ...labelStyle, marginBottom: '8px' }}>Anexos atuais</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#334155' }}>
                    {(linhas.find((l) => l.id === editingId)?.contas_pagar_anexos || []).map((a) => (
                      <li key={a.id} style={{ marginBottom: '6px' }}>
                        <button
                          type="button"
                          onClick={() => void handleBaixarAnexo(a)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0d9488',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {a.nome_arquivo}
                        </button>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => {
                            const row = linhas.find((l) => l.id === editingId)
                            if (row) void handleRemoverAnexo(row, a)
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#b91c1c',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                        >
                          remover
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {podeMutar ? (
                <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
                  <button
                    type="submit"
                    disabled={salvando}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      background: '#0f172a',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: salvando ? 'wait' : 'pointer',
                    }}
                  >
                    {salvando ? 'A guardar…' : 'Guardar'}
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        ) : null}

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
            <div style={labelStyle}>Busca</div>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Fornecedor, descrição, categoria…"
              style={{ ...inputStyle, minWidth: '220px' }}
            />
          </div>
          <div>
            <div style={labelStyle}>Status</div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
              style={{ ...inputStyle, minWidth: '160px', cursor: 'pointer' }}
            >
              <option value="">Todos</option>
              <option value="Pendente">Pendente</option>
              <option value="Atrasado">Atrasado</option>
              <option value="Pago">Pago</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>Vencimento de</div>
            <input
              type="date"
              value={vencDe}
              onChange={(e) => setVencDe(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Vencimento até</div>
            <input
              type="date"
              value={vencAte}
              onChange={(e) => setVencAte(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '18px' }}>
          {loading ? (
            <p style={{ color: '#64748b' }}>A carregar…</p>
          ) : (
            <table
              style={{
                width: '100%',
                minWidth: '960px',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>Fornecedor</th>
                  <th style={{ padding: '10px 8px' }}>Descrição</th>
                  <th style={{ padding: '10px 8px' }}>Valor</th>
                  <th style={{ padding: '10px 8px' }}>Venc.</th>
                  <th style={{ padding: '10px 8px' }}>Categoria</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                  <th style={{ padding: '10px 8px' }}>Anexos</th>
                  <th style={{ padding: '10px 8px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '24px', color: '#64748b' }}>
                      Nenhum lançamento com estes filtros.
                    </td>
                  </tr>
                ) : (
                  filtradas.map((r) => {
                    const st = statusExibicao(r)
                    const atrasadoVisual = st === 'Atrasado'
                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: atrasadoVisual ? '#fef2f2' : undefined,
                        }}
                      >
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>{r.fornecedor}</td>
                        <td style={{ padding: '10px 8px', maxWidth: '280px' }}>{r.descricao}</td>
                        <td style={{ padding: '10px 8px' }}>{formatCurrency(Number(r.valor) || 0)}</td>
                        <td
                          style={{
                            padding: '10px 8px',
                            color: atrasadoVisual ? '#b91c1c' : undefined,
                            fontWeight: atrasadoVisual ? 700 : undefined,
                          }}
                        >
                          {formatDate(r.data_vencimento)}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{r.categoria}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                st === 'Pago' ? '#15803d' : st === 'Atrasado' ? '#b91c1c' : '#b45309',
                            }}
                          >
                            {st}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {(r.contas_pagar_anexos || []).length === 0 ? (
                            '—'
                          ) : (
                            <span style={{ fontWeight: 600 }}>{r.contas_pagar_anexos!.length}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(r.contas_pagar_anexos || []).slice(0, 1).map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => void handleBaixarAnexo(a)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  border: '1px solid #99f6e4',
                                  background: '#ccfbf1',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                              >
                                Ver anexo
                              </button>
                            ))}
                            {podeMutar ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => abrirEditar(r)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    border: 'none',
                                    background: '#16a34a',
                                    color: '#fff',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleExcluir(r)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    border: '1px solid #fecaca',
                                    background: '#fff',
                                    color: '#b91c1c',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Excluir
                                </button>
                              </>
                            ) : null}
                          </div>
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
