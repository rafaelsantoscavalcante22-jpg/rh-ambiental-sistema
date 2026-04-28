import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import {
  REGIOES_ORDEM,
  type RegiaoNome,
  clienteEstaAtivo,
  resolverRegiao,
  resolverUfSigla,
} from '../lib/brasilRegioes'
import { BrasilMapaEstados } from '../components/posvenda/BrasilMapaEstados'
import { CarteiraStatusHistorico } from '../components/posvenda/CarteiraStatusHistorico'

type ClienteRow = {
  id: string
  nome: string
  razao_social: string
  cidade: string | null
  estado: string | null
  status: string | null
  email: string | null
  telefone: string | null
  email_nf: string | null
  validade: string | null
  created_at?: string | null
  status_ativo_desde?: string | null
  status_inativo_desde?: string | null
}

type MotivoPrioridade =
  | 'inativo'
  | 'sem_operacao'
  | 'licenca_vencida'
  | 'licenca_proxima'
  | 'contato_incompleto'

const COLETAS_PAGE = 1000
const COLETAS_MAX_ROWS = 80_000

const cardBase: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 800,
  color: '#334155',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '10px 12px',
  fontSize: '13px',
  color: '#334155',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle',
}

function parseValidade(data: string | null): Date | null {
  if (!data) return null
  const limpa = data.includes('T') ? data.split('T')[0] : data
  const partes = limpa.split('-').map((x) => Number(x))
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) return null
  const [y, m, d] = partes
  return new Date(y, m - 1, d)
}

function diasAte(fim: Date, hoje: Date) {
  const ms = fim.getTime() - hoje.getTime()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

function contatoIncompleto(c: ClienteRow) {
  const em = (c.email ?? '').trim()
  const tel = (c.telefone ?? '').trim()
  return em === '' || tel === ''
}

function pontuacaoMotivo(m: MotivoPrioridade): number {
  switch (m) {
    case 'inativo':
      return 100
    case 'sem_operacao':
      return 85
    case 'licenca_vencida':
      return 75
    case 'licenca_proxima':
      return 55
    case 'contato_incompleto':
      return 40
    default:
      return 0
  }
}

function etiquetaMotivo(m: MotivoPrioridade): string {
  switch (m) {
    case 'inativo':
      return 'Inativo'
    case 'sem_operacao':
      return 'Ativo sem coleta'
    case 'licenca_vencida':
      return 'Licença vencida'
    case 'licenca_proxima':
      return 'Licença ≤ 30 dias'
    case 'contato_incompleto':
      return 'Contacto incompleto'
    default:
      return ''
  }
}

async function carregarClienteIdsComColeta(): Promise<Set<string>> {
  const set = new Set<string>()
  for (let from = 0; from < COLETAS_MAX_ROWS; from += COLETAS_PAGE) {
    const { data, error } = await supabase
      .from('coletas')
      .select('cliente_id')
      .not('cliente_id', 'is', null)
      .range(from, from + COLETAS_PAGE - 1)

    if (error) {
      console.warn('Pós-venda: erro ao ler coletas', error)
      break
    }
    if (!data?.length) break
    for (const row of data) {
      const id = row.cliente_id as string | null
      if (id) set.add(id)
    }
    if (data.length < COLETAS_PAGE) break
  }
  return set
}

/** Colunas opcionais podem não existir até migrações SQL serem aplicadas — tenta do mais completo ao mínimo. */
const POS_VENDA_SELECT_CANDIDATES = [
  'id, nome, razao_social, cidade, estado, status, email, telefone, email_nf, validade, created_at, status_ativo_desde, status_inativo_desde',
  'id, nome, razao_social, cidade, estado, status, email, telefone, email_nf, validade, created_at',
  'id, nome, razao_social, cidade, estado, status, email, telefone, email_nf, validade',
] as const

async function carregarClientesPosVenda(): Promise<ClienteRow[]> {
  let lastMessage = ''
  for (const sel of POS_VENDA_SELECT_CANDIDATES) {
    const PAGE_SIZE = 1000
    const MAX_ROWS = 10_000
    const acc: Record<string, unknown>[] = []

    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, MAX_ROWS - 1)
      const { data, error } = await supabase
        .from('clientes')
        .select(sel)
        .order('nome', { ascending: true })
        .range(from, to)

      if (error) {
        lastMessage = error.message
        console.warn('[Pós-venda] select clientes falhou:', sel.slice(0, 80), error.message)
        acc.length = 0
        break
      }

      const rows = (data || []) as unknown as Record<string, unknown>[]
      if (rows.length === 0) break
      acc.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }

    if (acc.length > 0) {
      if (acc.length >= MAX_ROWS) {
        console.warn(`[Pós-venda] Cap de ${MAX_ROWS} clientes atingido; lista pode estar truncada.`)
      }
      return acc.map((row) => ({
        ...row,
        created_at: (row.created_at as string | null | undefined) ?? null,
        status_ativo_desde: (row.status_ativo_desde as string | null | undefined) ?? null,
        status_inativo_desde: (row.status_inativo_desde as string | null | undefined) ?? null,
      })) as ClienteRow[]
    }
  }
  throw new Error(
    lastMessage ||
      'Não foi possível ler a tabela clientes. Verifique permissões e se o projeto Supabase está correto.'
  )
}

function mensagemErroCarregamento(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  if (e instanceof Error) return e.message
  return 'Erro ao carregar dados.'
}

type KpisPosVenda = {
  total: number
  ativos: number
  inativos: number
  ativosSemColeta: number
  contatoFalta: number
  licVencida: number
  lic30: number
}

function contarClientesComAlertaPosVenda(
  clientes: ClienteRow[],
  idsComColeta: Set<string> | null,
  hoje: Date
): number {
  let n = 0
  const comColeta = idsComColeta
  for (const c of clientes) {
    let tem = false
    if (!clienteEstaAtivo(c.status)) tem = true
    else if (comColeta && !comColeta.has(c.id)) tem = true
    else if (contatoIncompleto(c)) tem = true
    else {
      const v = parseValidade(c.validade)
      if (v) {
        const dias = diasAte(v, hoje)
        if (dias < 0 || dias <= 30) tem = true
      }
    }
    if (tem) n++
  }
  return n
}

function montarTextoResumoPosVendaPdf(
  kpis: KpisPosVenda,
  contagensRegiao: Record<RegiaoNome, number>,
  totalComAlerta: number
): string {
  const { total, ativos, inativos, ativosSemColeta, contatoFalta, licVencida, lic30 } = kpis
  const pctA = total > 0 ? Math.round((ativos / total) * 1000) / 10 : 0
  const pctI = total > 0 ? Math.round((inativos / total) * 1000) / 10 : 0
  if (total === 0) {
    return 'Não há clientes na carteira para sintetizar.'
  }
  const partes: string[] = []
  partes.push(
    `Carteira com ${total} cliente${total === 1 ? '' : 's'}: ${ativos} ativo${ativos === 1 ? '' : 's'} (${pctA}%) e ${inativos} inativo${inativos === 1 ? '' : 's'} (${pctI}%).`
  )
  if (ativos > 0 && ativosSemColeta > 0) {
    partes.push(
      `Dos ativos, ${ativosSemColeta} ainda não têm coleta registada no sistema — foco comercial ou operacional para primeira operação.`
    )
  }
  if (contatoFalta > 0) {
    partes.push(`${contatoFalta} cadastro${contatoFalta === 1 ? '' : 's'} com contacto incompleto (e-mail ou telefone).`)
  }
  if (licVencida > 0 || lic30 > 0) {
    partes.push(
      `Licenças: ${licVencida} vencida${licVencida === 1 ? '' : 's'} e ${lic30} com vencimento em até 30 dias.`
    )
  }
  if (totalComAlerta > 0) {
    partes.push(
      `${totalComAlerta} cliente${totalComAlerta === 1 ? '' : 's'} com pelo menos um critério de pós-venda (ver tabela de prioridades neste relatório).`
    )
  } else {
    partes.push('Nenhum cliente acumula os alertas monitorados neste painel.')
  }
  const comUf = total - (contagensRegiao['Sem região'] ?? 0)
  if (comUf < total) {
    partes.push(
      `${total - comUf} cliente${total - comUf === 1 ? '' : 's'} sem UF válida no cadastro — impacta o mapa e totais regionais.`
    )
  }
  return partes.join(' ')
}

function finalYAutotable(doc: jsPDF): number {
  const d = doc as jsPDF & { lastAutoTable?: { finalY: number } }
  return d.lastAutoTable?.finalY ?? 40
}

function gerarPdfRelatorioPosVenda(input: {
  kpis: KpisPosVenda
  contagensRegiao: Record<RegiaoNome, number>
  contagensPorUf: Record<string, number>
  prioridades: { cliente: ClienteRow; motivos: MotivoPrioridade[] }[]
  totalComAlerta: number
}) {
  const { kpis, contagensRegiao, contagensPorUf, prioridades, totalComAlerta } = input
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const margem = 40
  const larguraTexto = 515
  let y = 44

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Relatório — Pós-venda', margem, y)
  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const agora = new Date()
  const dataHora = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(agora)
  doc.text(`Gerado em: ${dataHora}`, margem, y)
  y += 14
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  const notaLinhas = doc.splitTextToSize(
    'Indicadores baseados no cadastro de clientes, coletas registadas no sistema e validade de licença. Mapa e gráficos não são reproduzidos no PDF.',
    larguraTexto
  )
  doc.text(notaLinhas, margem, y)
  doc.setTextColor(0, 0, 0)
  y += notaLinhas.length * 11 + 14

  const resumo = montarTextoResumoPosVendaPdf(kpis, contagensRegiao, totalComAlerta)
  doc.setFontSize(10)
  const linhasResumo = doc.splitTextToSize(resumo, larguraTexto)
  doc.text(linhasResumo, margem, y)
  y += linhasResumo.length * 12 + 18

  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: [
      ['Total na carteira', String(kpis.total)],
      ['Clientes ativos', String(kpis.ativos)],
      ['Clientes inativos', String(kpis.inativos)],
      ['Ativos sem coleta registada', String(kpis.ativosSemColeta)],
      ['Contacto incompleto', String(kpis.contatoFalta)],
      ['Licença vencida', String(kpis.licVencida)],
      ['Licença ≤ 30 dias', String(kpis.lic30)],
      ['Clientes com ≥1 alerta (pós-venda)', String(totalComAlerta)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    margin: { left: margem, right: margem },
  })

  y = finalYAutotable(doc) + 22
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Distribuição por região', margem, y)
  y += 16

  const corpoRegiao: string[][] = REGIOES_ORDEM.filter((r) => r !== 'Sem região').map((r) => [
    r,
    String(contagensRegiao[r]),
  ])
  corpoRegiao.push(['Sem região / UF', String(contagensRegiao['Sem região'])])

  autoTable(doc, {
    startY: y,
    head: [['Região', 'Clientes']],
    body: corpoRegiao,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    margin: { left: margem, right: margem },
  })

  y = finalYAutotable(doc) + 22
  if (y > 720) {
    doc.addPage()
    y = 44
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Principais UFs (volume)', margem, y)
  y += 16

  const topUfs = Object.entries(contagensPorUf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
  autoTable(doc, {
    startY: y,
    head: [['UF', 'Clientes']],
    body: topUfs.length ? topUfs.map(([uf, n]) => [uf, String(n)]) : [['—', 'Nenhuma UF válida no cadastro']],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    margin: { left: margem, right: margem },
  })

  y = finalYAutotable(doc) + 22
  if (y > 680) {
    doc.addPage()
    y = 44
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Fila de prioridades (até 60 linhas)', margem, y)
  y += 16

  const corpoPrioridades =
    prioridades.length > 0
      ? prioridades.map((p) => [
          (p.cliente.nome || p.cliente.razao_social || '—').slice(0, 80),
          [p.cliente.cidade, p.cliente.estado].filter(Boolean).join(' / ') || '—',
          p.motivos.map(etiquetaMotivo).join('; '),
          p.cliente.status || 'Ativo',
        ])
      : [['—', '—', 'Nenhum alerta nos critérios do painel.', '—']]

  autoTable(doc, {
    startY: y,
    head: [['Cliente', 'Cidade / UF', 'Situação', 'Status cadastro']],
    body: corpoPrioridades,
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
    margin: { left: margem, right: margem },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 95 },
      2: { cellWidth: 175 },
      3: { cellWidth: 75 },
    },
  })

  const iso = agora.toISOString().slice(0, 10)
  doc.save(`relatorio-pos-venda_${iso}.pdf`)
}

export default function PosVenda() {
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [idsComColeta, setIdsComColeta] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const [lista, coletaIds] = await Promise.all([carregarClientesPosVenda(), carregarClienteIdsComColeta()])

      setClientes(lista)
      setIdsComColeta(coletaIds)
    } catch (e) {
      setErro(mensagemErroCarregamento(e))
      setClientes([])
      setIdsComColeta(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void carregar()
    })
  }, [carregar])

  const hoje = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const kpis = useMemo(() => {
    const total = clientes.length
    let ativos = 0
    let inativos = 0
    let ativosSemColeta = 0
    let contatoFalta = 0
    let licVencida = 0
    let lic30 = 0
    const comColeta = idsComColeta

    for (const c of clientes) {
      const ativo = clienteEstaAtivo(c.status)
      if (ativo) ativos++
      else inativos++

      if (ativo && comColeta && !comColeta.has(c.id)) ativosSemColeta++

      if (contatoIncompleto(c)) contatoFalta++

      const v = parseValidade(c.validade)
      if (v) {
        const dias = diasAte(v, hoje)
        if (dias < 0) licVencida++
        else if (dias <= 30) lic30++
      }
    }

    return {
      total,
      ativos,
      inativos,
      ativosSemColeta,
      contatoFalta,
      licVencida,
      lic30,
    }
  }, [clientes, idsComColeta, hoje])

  const contagensRegiao = useMemo(() => {
    const acc: Record<RegiaoNome, number> = {
      Norte: 0,
      Nordeste: 0,
      'Centro-Oeste': 0,
      Sudeste: 0,
      Sul: 0,
      'Sem região': 0,
    }
    for (const c of clientes) {
      acc[resolverRegiao(c.estado)]++
    }
    return acc
  }, [clientes])

  const contagensPorUf = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const c of clientes) {
      const uf = resolverUfSigla(c.estado)
      if (!uf) continue
      acc[uf] = (acc[uf] ?? 0) + 1
    }
    return acc
  }, [clientes])

  const destaquesRegiao = useMemo(() => {
    const porRegiao: Record<RegiaoNome, ClienteRow[]> = {
      Norte: [],
      Nordeste: [],
      'Centro-Oeste': [],
      Sudeste: [],
      Sul: [],
      'Sem região': [],
    }
    for (const c of clientes) {
      porRegiao[resolverRegiao(c.estado)].push(c)
    }
    const comColeta = idsComColeta
    function score(c: ClienteRow): number {
      let s = 0
      if (!clienteEstaAtivo(c.status)) s += 100
      if (clienteEstaAtivo(c.status) && comColeta && !comColeta.has(c.id)) s += 50
      if (contatoIncompleto(c)) s += 25
      const v = parseValidade(c.validade)
      if (v) {
        const d = diasAte(v, hoje)
        if (d < 0) s += 40
        else if (d <= 30) s += 20
      }
      return s
    }
    const out: Record<RegiaoNome, string[]> = {
      Norte: [],
      Nordeste: [],
      'Centro-Oeste': [],
      Sudeste: [],
      Sul: [],
      'Sem região': [],
    }
    for (const r of REGIOES_ORDEM) {
      if (r === 'Sem região') continue
      const lista = [...porRegiao[r]].sort((a, b) => score(b) - score(a)).slice(0, 5)
      out[r] = lista.map((c) => c.nome || c.razao_social || '—')
    }
    return out
  }, [clientes, idsComColeta, hoje])

  const prioridades = useMemo(() => {
    const comColeta = idsComColeta
    type Linha = {
      cliente: ClienteRow
      motivos: MotivoPrioridade[]
      score: number
    }
    const linhas: Linha[] = []

    for (const c of clientes) {
      const motivos: MotivoPrioridade[] = []
      if (!clienteEstaAtivo(c.status)) motivos.push('inativo')
      if (clienteEstaAtivo(c.status) && comColeta && !comColeta.has(c.id)) motivos.push('sem_operacao')
      if (contatoIncompleto(c)) motivos.push('contato_incompleto')
      const v = parseValidade(c.validade)
      if (v) {
        const dias = diasAte(v, hoje)
        if (dias < 0) motivos.push('licenca_vencida')
        else if (dias <= 30) motivos.push('licenca_proxima')
      }
      if (motivos.length === 0) continue
      const score = Math.max(...motivos.map(pontuacaoMotivo))
      linhas.push({ cliente: c, motivos, score })
    }

    linhas.sort((a, b) => b.score - a.score || a.cliente.nome.localeCompare(b.cliente.nome))
    return linhas.slice(0, 60)
  }, [clientes, idsComColeta, hoje])

  const handleGerarPdfRelatorio = useCallback(() => {
    try {
      const totalComAlerta = contarClientesComAlertaPosVenda(clientes, idsComColeta, hoje)
      gerarPdfRelatorioPosVenda({
        kpis,
        contagensRegiao,
        contagensPorUf,
        prioridades: prioridades.map(({ cliente, motivos }) => ({ cliente, motivos })),
        totalComAlerta,
      })
    } catch (err) {
      console.error('Erro ao gerar PDF pós-venda:', err)
      alert('Não foi possível gerar o PDF. Tente novamente.')
    }
  }, [clientes, idsComColeta, hoje, kpis, contagensRegiao, contagensPorUf, prioridades])

  const pieData = useMemo(
    () => [
      { name: 'Ativos', value: kpis.ativos },
      { name: 'Inativos', value: kpis.inativos },
    ],
    [kpis.ativos, kpis.inativos]
  )

  const chartUid = useId().replace(/:/g, '')
  const pctAtivos =
    kpis.total > 0 ? Math.round((kpis.ativos / kpis.total) * 1000) / 10 : 0
  const pctInativos =
    kpis.total > 0 ? Math.round((kpis.inativos / kpis.total) * 1000) / 10 : 0

  return (
    <MainLayout>
      <div className="page-shell">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {erro ? (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '14px 16px',
                borderRadius: '12px',
                fontWeight: 600,
              }}
            >
              {erro}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '20px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '26px',
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                Carteira e acompanhamento pós-venda
              </h1>
              <p className="page-header__lead" style={{ margin: '6px 0 0', maxWidth: '720px' }}>
                Painel para acompanhamento comercial e operacional: carteira por região, saúde do
                cadastro e prioridades de contacto. Os indicadores de <strong>coleta</strong>{' '}
                assumem clientes que já tenham pelo menos uma coleta registada no sistema.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Link
                to="/clientes"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#0f172a',
                  color: '#ffffff',
                  borderRadius: '12px',
                  height: '48px',
                  padding: '0 18px',
                  fontWeight: 800,
                  fontSize: '14px',
                  textDecoration: 'none',
                }}
              >
                Ir para Clientes
              </Link>
              <button
                type="button"
                onClick={() => void carregar()}
                disabled={loading}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  height: '48px',
                  padding: '0 18px',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.85 : 1,
                }}
              >
                {loading ? 'A atualizar…' : 'Atualizar'}
              </button>
              <button
                type="button"
                onClick={handleGerarPdfRelatorio}
                disabled={loading || !!erro || kpis.total === 0}
                title={
                  kpis.total === 0
                    ? 'Carregue a carteira para gerar o relatório'
                    : 'Descarregar PDF com indicadores, regiões, UFs e fila de prioridades'
                }
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  height: '48px',
                  padding: '0 18px',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: loading || !!erro || kpis.total === 0 ? 'not-allowed' : 'pointer',
                  opacity: loading || !!erro || kpis.total === 0 ? 0.55 : 1,
                }}
              >
                Gerar PDF do relatório
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
              A carregar indicadores…
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '12px',
                }}
              >
                {[
                  { lab: 'Total na carteira', val: kpis.total },
                  { lab: 'Clientes ativos', val: kpis.ativos },
                  { lab: 'Clientes inativos', val: kpis.inativos },
                  {
                    lab: 'Ativos sem coleta registada',
                    val: kpis.ativosSemColeta,
                    hint: 'Cadastro ativo sem nenhuma coleta no sistema — oportunidade ou conta a desenvolver.',
                  },
                  {
                    lab: 'Contacto incompleto',
                    val: kpis.contatoFalta,
                    hint: 'Falta e-mail ou telefone no cadastro.',
                  },
                  { lab: 'Licença vencida', val: kpis.licVencida },
                  { lab: 'Licença ≤ 30 dias', val: kpis.lic30 },
                ].map((k) => (
                  <div key={k.lab} style={cardBase} title={'hint' in k ? k.hint : undefined}>
                    <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{k.lab}</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                      {k.val}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 460px)',
                  gap: '16px',
                  alignItems: 'stretch',
                }}
                className="pos-venda-grid"
              >
                <div style={{ ...cardBase, padding: '18px' }}>
                  <h2
                    style={{
                      margin: '0 0 4px',
                      fontSize: '18px',
                      fontWeight: 800,
                      color: '#0f172a',
                    }}
                  >
                    Visão geral da carteira
                  </h2>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
                    Proporção de clientes ativos e inativos no cadastro.
                  </p>
                  <div style={{ position: 'relative', width: '100%', height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <defs>
                          <linearGradient id={`${chartUid}-ativo`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#4ade80" />
                            <stop offset="100%" stopColor="#15803d" />
                          </linearGradient>
                          <linearGradient id={`${chartUid}-inativo`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#e2e8f0" />
                            <stop offset="100%" stopColor="#64748b" />
                          </linearGradient>
                        </defs>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="48%"
                          innerRadius="42%"
                          outerRadius="72%"
                          paddingAngle={3}
                          cornerRadius={4}
                          stroke="#ffffff"
                          strokeWidth={2}
                        >
                          <Cell fill={`url(#${chartUid}-ativo)`} />
                          <Cell fill={`url(#${chartUid}-inativo)`} />
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => {
                            const v = Number(value)
                            const pct =
                              kpis.total > 0 ? Math.round((v / kpis.total) * 1000) / 10 : 0
                            return [`${v} (${pct}%)`, String(name)]
                          }}
                          contentStyle={{
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={28}
                          formatter={(value) => (
                            <span style={{ color: '#475569', fontWeight: 600, fontSize: '13px' }}>
                              {value}
                            </span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '44%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        pointerEvents: 'none',
                        lineHeight: 1.15,
                      }}
                    >
                      <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a' }}>
                        {pctAtivos}%
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                        ativos
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                        {pctInativos}% inativos
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: '14px',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'stretch',
                    }}
                  >
                    <div
                      style={{
                        flex: Math.max(1, kpis.ativos),
                        minWidth: '8%',
                        background: 'linear-gradient(90deg, #4ade80, #15803d)',
                        borderRadius: '8px',
                        minHeight: '10px',
                      }}
                      title={`Ativos: ${kpis.ativos}`}
                    />
                    <div
                      style={{
                        flex: Math.max(1, kpis.inativos),
                        minWidth: '8%',
                        background: 'linear-gradient(90deg, #e2e8f0, #64748b)',
                        borderRadius: '8px',
                        minHeight: '10px',
                      }}
                      title={`Inativos: ${kpis.inativos}`}
                    />
                  </div>

                  <CarteiraStatusHistorico
                    clientes={clientes.map((c) => ({
                      id: c.id,
                      status: c.status,
                      created_at: c.created_at ?? null,
                      status_ativo_desde: c.status_ativo_desde ?? null,
                      status_inativo_desde: c.status_inativo_desde ?? null,
                    }))}
                    hoje={hoje}
                  />

                  <div
                    style={{
                      marginTop: '12px',
                      padding: '12px 14px',
                      background: '#f8fafc',
                      borderRadius: '12px',
                      fontSize: '13px',
                      color: '#475569',
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: '#0f172a' }}>Como ler:</strong> inativos podem ser
                    arquivo comercial; ativos sem coleta são foco de desenvolvimento de negócio ou
                    reativação com a operação RG.
                  </div>
                </div>

                <div style={{ ...cardBase, padding: '18px' }}>
                  <h2
                    style={{
                      margin: '0 0 4px',
                      fontSize: '18px',
                      fontWeight: 800,
                      color: '#0f172a',
                    }}
                  >
                    Brasil por UF
                  </h2>
                  <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
                    Mapa com cores por volume de clientes com UF válida; abaixo, totais e destaques
                    por macro-região (ordenados por prioridade de pós-venda).
                  </p>
                  <BrasilMapaEstados
                    contagensPorUf={contagensPorUf}
                    contagensRegiao={contagensRegiao}
                    destaques={destaquesRegiao}
                  />
                </div>
              </div>

              <div style={cardBase}>
                <div style={{ marginBottom: '14px' }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '18px',
                      fontWeight: 800,
                      color: '#0f172a',
                    }}
                  >
                    Fila de prioridades (pós-venda)
                  </h2>
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Clientes que requerem atenção: inativos, sem operação registada, licença ou
                    contacto. Até 60 linhas, ordenadas por urgência.
                  </p>
                </div>
                {prioridades.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    Nenhum alerta neste momento — carteira consistente com os critérios acima.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={thStyle}>Cliente</th>
                          <th style={thStyle}>Cidade / UF</th>
                          <th style={thStyle}>Situação</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prioridades.map(({ cliente: c, motivos }) => (
                          <tr key={c.id}>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                {c.nome || c.razao_social}
                              </div>
                              {c.razao_social && c.nome ? (
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{c.razao_social}</div>
                              ) : null}
                            </td>
                            <td style={tdStyle}>
                              {[c.cidade, c.estado].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {motivos.map((m) => (
                                  <span
                                    key={m}
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      padding: '4px 8px',
                                      borderRadius: '999px',
                                      background:
                                        m === 'inativo'
                                          ? '#fee2e2'
                                          : m === 'sem_operacao'
                                            ? '#ffedd5'
                                            : m === 'licenca_vencida'
                                              ? '#fecaca'
                                              : m === 'licenca_proxima'
                                                ? '#fef9c3'
                                                : '#e0f2fe',
                                      color:
                                        m === 'inativo'
                                          ? '#991b1b'
                                          : m === 'sem_operacao'
                                            ? '#9a3412'
                                            : m === 'licenca_vencida'
                                              ? '#b91c1c'
                                              : m === 'licenca_proxima'
                                                ? '#854d0e'
                                                : '#0369a1',
                                    }}
                                  >
                                    {etiquetaMotivo(m)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={tdStyle}>{c.status || 'Ativo'}</td>
                            <td style={tdStyle}>
                              <Link
                                to="/clientes"
                                style={{
                                  display: 'inline-block',
                                  background: '#16a34a',
                                  color: '#fff',
                                  fontWeight: 700,
                                  fontSize: '12px',
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  textDecoration: 'none',
                                }}
                              >
                                Abrir cadastro
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 960px) {
          .pos-venda-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </MainLayout>
  )
}
