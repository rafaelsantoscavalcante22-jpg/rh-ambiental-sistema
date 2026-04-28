import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComprovanteDescarteRow, ComprovanteDescarteFiltros, ComprovanteFotoExtraItem } from '../lib/comprovantesDescarteTypes'
import { normalizarRow } from '../lib/comprovantesDescarteUtils'

export const BUCKET_COMPROVANTES_DESCARTE = 'comprovantes-descarte'

const SELECT_ROW = `
  id,
  codigo_remessa,
  data_remessa,
  cadri,
  tipo_efluente,
  linha_tratamento,
  numero_mtr,
  volume,
  acondicionamento,
  gerador_razao_social,
  gerador_nome_fantasia,
  gerador_endereco,
  gerador_responsavel,
  gerador_telefone,
  gerador_contrato,
  transportador_razao_social,
  transportador_telefone,
  placa,
  motorista_nome,
  motorista_cnh,
  transportador_responsavel_assinatura_nome,
  transportador_responsavel_assinatura_data,
  destinatario_razao_social,
  destinatario_endereco,
  destinatario_telefone,
  destinatario_responsavel_assinatura_nome,
  destinatario_responsavel_assinatura_data,
  peso_entrada,
  data_entrada,
  peso_saida,
  data_saida,
  peso_liquido,
  foto_entrada_url,
  foto_saida_url,
  fotos_extras,
  foto_entrada_nome_arquivo,
  foto_saida_nome_arquivo,
  foto_entrada_conferida,
  foto_entrada_observacao_conferencia,
  foto_saida_conferida,
  foto_saida_observacao_conferencia,
  foto_entrada_ocr_meta,
  foto_saida_ocr_meta,
  observacoes,
  coleta_id,
  mtr_id,
  controle_massa_id,
  faturamento_liberado,
  status_documento,
  created_at,
  updated_at,
  created_by,
  updated_by
`

function aplicarFiltrosLista(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  f: ComprovanteDescarteFiltros
) {
  let query = q
  const cr = f.codigoRemessa.trim()
  if (cr) query = query.ilike('codigo_remessa', `%${cr}%`)
  const nm = f.numeroMtr.trim()
  if (nm) query = query.ilike('numero_mtr', `%${nm}%`)
  const g = f.gerador.trim()
  if (g) query = query.ilike('gerador_razao_social', `%${g}%`)
  const mot = f.motorista.trim()
  if (mot) query = query.ilike('motorista_nome', `%${mot}%`)
  const pl = f.placa.trim()
  if (pl) query = query.ilike('placa', `%${pl}%`)
  if (f.dataInicio.trim()) query = query.gte('data_remessa', f.dataInicio.trim())
  if (f.dataFim.trim()) query = query.lte('data_remessa', f.dataFim.trim())
  const st = f.statusDocumento.trim()
  if (st) query = query.eq('status_documento', st)
  return query
}

export type ListaComprovantesResultado = {
  rows: ComprovanteDescarteRow[]
  total: number
  resumo: {
    totalPesoLiquido: number
    finalizados: number
    rascunhos: number
    liberadosFaturamento: number
  }
}

const PAGE_SIZE_DEFAULT = 25
const STATS_CAP = 8000

export async function listarComprovantesDescarte(
  supabase: SupabaseClient,
  filtros: ComprovanteDescarteFiltros,
  page: number,
  pageSize = PAGE_SIZE_DEFAULT
): Promise<{ data: ListaComprovantesResultado | null; error: Error | null }> {
  const from = Math.max(0, (page - 1) * pageSize)
  const to = from + pageSize - 1

  const base = aplicarFiltrosLista(
    supabase.from('comprovantes_descarte').select(SELECT_ROW, { count: 'exact' }),
    filtros
  )
    .order('created_at', { ascending: false })
    .range(from, to)

  const { data, error, count } = await base

  if (error) {
    return { data: null, error: new Error(error.message) }
  }

  const rows = (data ?? []).map((r: Record<string, unknown>) => normalizarRow(r))

  const statsQuery = aplicarFiltrosLista(
    supabase
      .from('comprovantes_descarte')
      .select('peso_liquido, status_documento, faturamento_liberado')
      .limit(STATS_CAP),
    filtros
  )

  const { data: statsRows, error: statsErr } = await statsQuery

  const resumo = {
    totalPesoLiquido: 0,
    finalizados: 0,
    rascunhos: 0,
    liberadosFaturamento: 0,
  }

  if (!statsErr && statsRows) {
    type StatsRow = {
      peso_liquido: number | null
      status_documento: string
      faturamento_liberado: boolean
    }
    for (const s of statsRows as StatsRow[]) {
      if (s.peso_liquido != null && !Number.isNaN(Number(s.peso_liquido))) {
        resumo.totalPesoLiquido += Number(s.peso_liquido)
      }
      if (s.status_documento === 'finalizado' || s.status_documento === 'aprovado_faturamento') {
        resumo.finalizados += 1
      }
      if (s.status_documento === 'rascunho') resumo.rascunhos += 1
      if (s.faturamento_liberado) resumo.liberadosFaturamento += 1
    }
  }

  return {
    data: {
      rows,
      total: count ?? rows.length,
      resumo,
    },
    error: null,
  }
}

export async function obterComprovanteDescartePorId(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: ComprovanteDescarteRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('comprovantes_descarte')
    .select(SELECT_ROW)
    .eq('id', id)
    .maybeSingle()

  if (error) return { data: null, error: new Error(error.message) }
  if (!data) return { data: null, error: null }
  return { data: normalizarRow(data as Record<string, unknown>), error: null }
}

export async function criarRascunhoComprovanteDescarte(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: ComprovanteDescarteRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('comprovantes_descarte')
    .insert({
      status_documento: 'rascunho',
      faturamento_liberado: false,
      created_by: userId,
      updated_by: userId,
      fotos_extras: [],
    })
    .select(SELECT_ROW)
    .single()

  if (error) return { data: null, error: new Error(error.message) }
  return { data: normalizarRow(data as Record<string, unknown>), error: null }
}

export type ComprovanteDescartePayload = {
  codigo_remessa?: string | null
  data_remessa?: string | null
  cadri?: string | null
  tipo_efluente?: string | null
  linha_tratamento?: string | null
  numero_mtr?: string | null
  volume?: string | null
  acondicionamento?: string | null
  gerador_razao_social?: string | null
  gerador_nome_fantasia?: string | null
  gerador_endereco?: string | null
  gerador_responsavel?: string | null
  gerador_telefone?: string | null
  gerador_contrato?: string | null
  transportador_razao_social?: string | null
  transportador_telefone?: string | null
  placa?: string | null
  motorista_nome?: string | null
  motorista_cnh?: string | null
  transportador_responsavel_assinatura_nome?: string | null
  transportador_responsavel_assinatura_data?: string | null
  destinatario_razao_social?: string | null
  destinatario_endereco?: string | null
  destinatario_telefone?: string | null
  destinatario_responsavel_assinatura_nome?: string | null
  destinatario_responsavel_assinatura_data?: string | null
  peso_entrada?: number | null
  data_entrada?: string | null
  peso_saida?: number | null
  data_saida?: string | null
  foto_entrada_url?: string | null
  foto_saida_url?: string | null
  fotos_extras?: ComprovanteFotoExtraItem[]
  foto_entrada_nome_arquivo?: string | null
  foto_saida_nome_arquivo?: string | null
  foto_entrada_conferida?: boolean
  foto_entrada_observacao_conferencia?: string | null
  foto_saida_conferida?: boolean
  foto_saida_observacao_conferencia?: string | null
  foto_entrada_ocr_meta?: Record<string, unknown>
  foto_saida_ocr_meta?: Record<string, unknown>
  observacoes?: string | null
  coleta_id?: string | null
  mtr_id?: string | null
  controle_massa_id?: string | null
  faturamento_liberado?: boolean
  status_documento?: string
}

export async function atualizarComprovanteDescarte(
  supabase: SupabaseClient,
  id: string,
  payload: ComprovanteDescartePayload,
  userId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('comprovantes_descarte')
    .update({
      ...payload,
      updated_by: userId,
    })
    .eq('id', id)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function excluirComprovanteDescarte(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('comprovantes_descarte').delete().eq('id', id)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export function caminhoStorageComprovante(
  comprovanteId: string,
  pasta: 'entrada' | 'saida' | 'extras',
  nomeArquivo: string
) {
  const seguro = nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${comprovanteId}/${pasta}/${Date.now()}_${seguro}`
}

export async function enviarImagemComprovante(
  supabase: SupabaseClient,
  comprovanteId: string,
  pasta: 'entrada' | 'saida' | 'extras',
  file: File
): Promise<{ publicUrl: string; path: string; error: Error | null }> {
  const path = caminhoStorageComprovante(comprovanteId, pasta, file.name)
  const { error } = await supabase.storage.from(BUCKET_COMPROVANTES_DESCARTE).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  if (error) return { publicUrl: '', path: '', error: new Error(error.message) }
  const { data } = supabase.storage.from(BUCKET_COMPROVANTES_DESCARTE).getPublicUrl(path)
  return { publicUrl: data.publicUrl, path, error: null }
}

export async function removerObjetoStorage(
  supabase: SupabaseClient,
  paths: string[]
): Promise<{ error: Error | null }> {
  if (paths.length === 0) return { error: null }
  const { error } = await supabase.storage.from(BUCKET_COMPROVANTES_DESCARTE).remove(paths)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

/** Extrai path interno do bucket a partir da URL pública (melhor esforço). */
export function pathFromPublicUrlComprovante(url: string): string | null {
  try {
    const marker = '/object/public/comprovantes-descarte/'
    const idx = url.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(url.slice(idx + marker.length))
  } catch {
    return null
  }
}

export type ColetaVinculoResumo = {
  id: string
  numero: string
  cliente: string
  tipo_residuo: string
  placa: string
  motorista: string
  mtr_id: string | null
  peso_liquido: number | null
}

export async function buscarColetaPorId(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: ColetaVinculoResumo | null; error: Error | null }> {
  const sel =
    'id, numero_coleta, numero, cliente, nome_cliente, tipo_residuo, placa, motorista, motorista_nome, mtr_id, peso_liquido'
  const { data, error } = await supabase.from('coletas').select(sel).eq('id', id).maybeSingle()

  if (error) {
    const fallbackSel =
      'id, numero_coleta, numero, cliente, nome_cliente, tipo_residuo, placa, motorista, motorista_nome, mtr_id, peso_liquido'
    const fallback = await supabase.from('coletas').select(fallbackSel).eq('id', id).maybeSingle()
    if (fallback.error) return { data: null, error: new Error(fallback.error.message) }
    if (!fallback.data) return { data: null, error: null }
    const row = fallback.data as Record<string, unknown>
    return {
      data: {
        id: String(row.id),
        numero: String(row.numero_coleta ?? row.numero ?? row.id ?? ''),
        cliente: String(row.cliente ?? row.nome_cliente ?? ''),
        tipo_residuo: String(row.tipo_residuo ?? ''),
        placa: String(row.placa ?? ''),
        motorista: String(row.motorista_nome ?? row.motorista ?? ''),
        mtr_id: row.mtr_id == null ? null : String(row.mtr_id),
        peso_liquido:
          row.peso_liquido === null || row.peso_liquido === undefined
            ? null
            : Number(row.peso_liquido),
      },
      error: null,
    }
  }

  if (!data) return { data: null, error: null }
  const row = data as Record<string, unknown>
  return {
    data: {
      id: String(row.id),
      numero: String(row.numero_coleta ?? row.numero ?? row.id ?? ''),
      cliente: String(row.cliente ?? row.nome_cliente ?? ''),
      tipo_residuo: String(row.tipo_residuo ?? ''),
      placa: String(row.placa ?? ''),
      motorista: String(row.motorista_nome ?? row.motorista ?? ''),
      mtr_id: row.mtr_id == null ? null : String(row.mtr_id),
      peso_liquido:
        row.peso_liquido === null || row.peso_liquido === undefined
          ? null
          : Number(row.peso_liquido),
    },
    error: null,
  }
}

export async function buscarColetasParaVinculo(
  supabase: SupabaseClient,
  limite: number
): Promise<{ data: ColetaVinculoResumo[]; error: Error | null }> {
  const sel =
    'id, numero_coleta, numero, cliente, nome_cliente, tipo_residuo, placa, motorista, motorista_nome, mtr_id, peso_liquido'
  let res = await supabase.from('coletas').select(sel).order('created_at', { ascending: false }).limit(limite)

  if (res.error) {
    // Fallback conservador: tenta um select mínimo compatível (evita payload gigante do `*`).
    res = await supabase.from('coletas').select(sel).order('id', { ascending: false }).limit(limite)
  }

  if (res.error) return { data: [], error: new Error(res.error.message) }

  const out: ColetaVinculoResumo[] = []
  for (const r of res.data ?? []) {
    const row = r as Record<string, unknown>
    out.push({
      id: String(row.id),
      numero: String(row.numero_coleta ?? row.numero ?? row.id ?? ''),
      cliente: String(row.cliente ?? row.nome_cliente ?? ''),
      tipo_residuo: String(row.tipo_residuo ?? ''),
      placa: String(row.placa ?? ''),
      motorista: String(row.motorista_nome ?? row.motorista ?? ''),
      mtr_id: row.mtr_id == null ? null : String(row.mtr_id),
      peso_liquido:
        row.peso_liquido === null || row.peso_liquido === undefined
          ? null
          : Number(row.peso_liquido),
    })
  }
  return { data: out, error: null }
}

export type MtrVinculoResumo = {
  id: string
  numero: string
  cliente: string
  gerador: string
  transportador: string
  tipo_residuo: string
  quantidade: number | null
  unidade: string | null
}

export async function buscarMtrsParaVinculo(
  supabase: SupabaseClient,
  limite: number
): Promise<{ data: MtrVinculoResumo[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('mtrs')
    .select('id, numero, cliente, gerador, transportador, tipo_residuo, quantidade, unidade')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) return { data: [], error: new Error(error.message) }

  const out: MtrVinculoResumo[] = []
  for (const r of data ?? []) {
    const row = r as Record<string, unknown>
    out.push({
      id: String(row.id),
      numero: String(row.numero ?? ''),
      cliente: String(row.cliente ?? ''),
      gerador: String(row.gerador ?? ''),
      transportador: String(row.transportador ?? ''),
      tipo_residuo: String(row.tipo_residuo ?? ''),
      quantidade:
        row.quantidade === null || row.quantidade === undefined ? null : Number(row.quantidade),
      unidade: row.unidade == null ? null : String(row.unidade),
    })
  }
  return { data: out, error: null }
}

/** Campos opcionais para autopreenchimento seguro a partir do MTR. */
export type MtrAutofillComprovante = MtrVinculoResumo & {
  gerador_endereco?: string
  gerador_responsavel?: string
  gerador_telefone?: string
  cadri?: string
  transportador_telefone?: string
  destinatario_razao?: string
  destinatario_endereco?: string
  destinatario_telefone?: string
}

export async function buscarMtrPorId(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: MtrAutofillComprovante | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('mtrs')
    .select('id, numero, cliente, gerador, transportador, tipo_residuo, quantidade, unidade, detalhes, destinador')
    .eq('id', id)
    .maybeSingle()

  if (error) return { data: null, error: new Error(error.message) }
  if (!data) return { data: null, error: null }

  const row = data as Record<string, unknown>
  const det = row.detalhes && typeof row.detalhes === 'object' ? (row.detalhes as Record<string, unknown>) : {}
  const g = det.gerador && typeof det.gerador === 'object' ? (det.gerador as Record<string, unknown>) : {}
  const t = det.transportador && typeof det.transportador === 'object' ? (det.transportador as Record<string, unknown>) : {}
  const d = det.destinatario && typeof det.destinatario === 'object' ? (det.destinatario as Record<string, unknown>) : {}

  const geradorTopo = row.gerador == null ? '' : String(row.gerador).trim()
  const geradorDet = typeof g.razao_social === 'string' ? g.razao_social.trim() : ''
  const transTopo = row.transportador == null ? '' : String(row.transportador).trim()
  const transDet = typeof t.razao_social === 'string' ? t.razao_social.trim() : ''

  const base: MtrAutofillComprovante = {
    id: String(row.id),
    numero: String(row.numero ?? ''),
    cliente: String(row.cliente ?? ''),
    gerador: geradorTopo || geradorDet,
    transportador: transTopo || transDet,
    tipo_residuo: String(row.tipo_residuo ?? ''),
    quantidade:
      row.quantidade === null || row.quantidade === undefined ? null : Number(row.quantidade),
    unidade: row.unidade == null ? null : String(row.unidade),
    gerador_endereco: typeof g.endereco === 'string' ? g.endereco : '',
    gerador_responsavel: typeof g.responsavel === 'string' ? g.responsavel : '',
    gerador_telefone: typeof g.telefone === 'string' ? g.telefone : '',
    cadri: typeof g.cadri === 'string' ? g.cadri : '',
    transportador_telefone: typeof t.telefone === 'string' ? t.telefone : '',
    destinatario_razao:
      typeof d.razao_social === 'string'
        ? d.razao_social
        : row.destinador == null
          ? ''
          : String(row.destinador),
    destinatario_endereco: typeof d.endereco === 'string' ? d.endereco : '',
    destinatario_telefone: typeof d.telefone === 'string' ? d.telefone : '',
  }

  return { data: base, error: null }
}
