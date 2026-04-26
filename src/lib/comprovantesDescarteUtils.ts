import type { ComprovanteDescarteRow, ComprovanteFotoExtraItem, StatusDocumentoComprovante } from './comprovantesDescarteTypes'

export const STATUS_COMPROVANTE_LABEL: Record<StatusDocumentoComprovante, string> = {
  rascunho: 'Rascunho',
  em_conferencia: 'Em conferência',
  finalizado: 'Finalizado',
  aprovado_faturamento: 'Aprovado p/ faturamento',
}

export function parseFotosExtras(raw: unknown): ComprovanteFotoExtraItem[] {
  if (!raw || !Array.isArray(raw)) return []
  const out: ComprovanteFotoExtraItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const url = typeof o.url === 'string' ? o.url : ''
    if (!url.trim()) continue
    out.push({
      url,
      nome_arquivo: typeof o.nome_arquivo === 'string' ? o.nome_arquivo : 'foto',
      conferida_manual: Boolean(o.conferida_manual),
      observacao_conferencia:
        typeof o.observacao_conferencia === 'string' ? o.observacao_conferencia : null,
      ocr_meta:
        o.ocr_meta && typeof o.ocr_meta === 'object'
          ? (o.ocr_meta as Record<string, unknown>)
          : null,
    })
  }
  return out
}

export function normalizarRow(row: Record<string, unknown>): ComprovanteDescarteRow {
  const status = row.status_documento
  const st: StatusDocumentoComprovante =
    status === 'em_conferencia' ||
    status === 'finalizado' ||
    status === 'aprovado_faturamento' ||
    status === 'rascunho'
      ? status
      : 'rascunho'

  return {
    id: String(row.id),
    codigo_remessa: row.codigo_remessa == null ? null : String(row.codigo_remessa),
    data_remessa: row.data_remessa == null ? null : String(row.data_remessa),
    cadri: row.cadri == null ? null : String(row.cadri),
    tipo_efluente: row.tipo_efluente == null ? null : String(row.tipo_efluente),
    linha_tratamento: row.linha_tratamento == null ? null : String(row.linha_tratamento),
    numero_mtr: row.numero_mtr == null ? null : String(row.numero_mtr),
    volume: row.volume == null ? null : String(row.volume),
    acondicionamento: row.acondicionamento == null ? null : String(row.acondicionamento),

    gerador_razao_social:
      row.gerador_razao_social == null ? null : String(row.gerador_razao_social),
    gerador_nome_fantasia:
      row.gerador_nome_fantasia == null ? null : String(row.gerador_nome_fantasia),
    gerador_endereco: row.gerador_endereco == null ? null : String(row.gerador_endereco),
    gerador_responsavel:
      row.gerador_responsavel == null ? null : String(row.gerador_responsavel),
    gerador_telefone: row.gerador_telefone == null ? null : String(row.gerador_telefone),
    gerador_contrato: row.gerador_contrato == null ? null : String(row.gerador_contrato),

    transportador_razao_social:
      row.transportador_razao_social == null ? null : String(row.transportador_razao_social),
    transportador_telefone:
      row.transportador_telefone == null ? null : String(row.transportador_telefone),
    placa: row.placa == null ? null : String(row.placa),
    motorista_nome: row.motorista_nome == null ? null : String(row.motorista_nome),
    motorista_cnh: row.motorista_cnh == null ? null : String(row.motorista_cnh),
    transportador_responsavel_assinatura_nome:
      row.transportador_responsavel_assinatura_nome == null
        ? null
        : String(row.transportador_responsavel_assinatura_nome),
    transportador_responsavel_assinatura_data:
      row.transportador_responsavel_assinatura_data == null
        ? null
        : String(row.transportador_responsavel_assinatura_data),

    destinatario_razao_social:
      row.destinatario_razao_social == null ? null : String(row.destinatario_razao_social),
    destinatario_endereco:
      row.destinatario_endereco == null ? null : String(row.destinatario_endereco),
    destinatario_telefone:
      row.destinatario_telefone == null ? null : String(row.destinatario_telefone),
    destinatario_responsavel_assinatura_nome:
      row.destinatario_responsavel_assinatura_nome == null
        ? null
        : String(row.destinatario_responsavel_assinatura_nome),
    destinatario_responsavel_assinatura_data:
      row.destinatario_responsavel_assinatura_data == null
        ? null
        : String(row.destinatario_responsavel_assinatura_data),

    peso_entrada:
      row.peso_entrada === null || row.peso_entrada === undefined
        ? null
        : Number(row.peso_entrada),
    data_entrada: row.data_entrada == null ? null : String(row.data_entrada),
    peso_saida:
      row.peso_saida === null || row.peso_saida === undefined ? null : Number(row.peso_saida),
    data_saida: row.data_saida == null ? null : String(row.data_saida),
    peso_liquido:
      row.peso_liquido === null || row.peso_liquido === undefined
        ? null
        : Number(row.peso_liquido),

    foto_entrada_url: row.foto_entrada_url == null ? null : String(row.foto_entrada_url),
    foto_saida_url: row.foto_saida_url == null ? null : String(row.foto_saida_url),
    fotos_extras: parseFotosExtras(row.fotos_extras),
    foto_entrada_nome_arquivo:
      row.foto_entrada_nome_arquivo == null ? null : String(row.foto_entrada_nome_arquivo),
    foto_saida_nome_arquivo:
      row.foto_saida_nome_arquivo == null ? null : String(row.foto_saida_nome_arquivo),

    foto_entrada_conferida: Boolean(row.foto_entrada_conferida),
    foto_entrada_observacao_conferencia:
      row.foto_entrada_observacao_conferencia == null
        ? null
        : String(row.foto_entrada_observacao_conferencia),
    foto_saida_conferida: Boolean(row.foto_saida_conferida),
    foto_saida_observacao_conferencia:
      row.foto_saida_observacao_conferencia == null
        ? null
        : String(row.foto_saida_observacao_conferencia),
    foto_entrada_ocr_meta:
      row.foto_entrada_ocr_meta && typeof row.foto_entrada_ocr_meta === 'object'
        ? (row.foto_entrada_ocr_meta as Record<string, unknown>)
        : {},
    foto_saida_ocr_meta:
      row.foto_saida_ocr_meta && typeof row.foto_saida_ocr_meta === 'object'
        ? (row.foto_saida_ocr_meta as Record<string, unknown>)
        : {},

    observacoes: row.observacoes == null ? null : String(row.observacoes),
    coleta_id: row.coleta_id == null ? null : String(row.coleta_id),
    mtr_id: row.mtr_id == null ? null : String(row.mtr_id),
    controle_massa_id:
      row.controle_massa_id == null ? null : String(row.controle_massa_id),

    faturamento_liberado: Boolean(row.faturamento_liberado),
    status_documento: st,

    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    created_by: row.created_by == null ? null : String(row.created_by),
    updated_by: row.updated_by == null ? null : String(row.updated_by),
  }
}

const soDigitos = (s: string) => s.replace(/\D/g, '').slice(0, 11)

/** Máscara simples BR: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX */
export function formatarTelefoneBr(valor: string): string {
  const d = soDigitos(valor)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

export function parsePesoInput(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function formatarPesoExibicao(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n)
}

export function calcularPesoLiquidoLocal(
  entrada: number | null | undefined,
  saida: number | null | undefined
): number | null {
  if (entrada == null || saida == null) return null
  return entrada - saida
}

export type ErrosValidacaoFinal = Partial<Record<string, string>>

export function validarFinalizacao(row: {
  codigo_remessa: string | null
  data_remessa: string | null
  numero_mtr: string | null
  tipo_efluente: string | null
  gerador_razao_social: string | null
  transportador_razao_social: string | null
  motorista_nome: string | null
  destinatario_razao_social: string | null
  peso_entrada: number | null
  peso_saida: number | null
}): ErrosValidacaoFinal {
  const e: ErrosValidacaoFinal = {}
  const req = (v: string | null | undefined) => (v ?? '').trim()
  if (!req(row.codigo_remessa)) e.codigo_remessa = 'Informe o código da remessa.'
  if (!req(row.data_remessa)) e.data_remessa = 'Informe a data da remessa.'
  if (!req(row.numero_mtr)) e.numero_mtr = 'Informe o número do MTR.'
  if (!req(row.tipo_efluente)) e.tipo_efluente = 'Informe o tipo e origem do efluente.'
  if (!req(row.gerador_razao_social)) e.gerador_razao_social = 'Informe a razão social do gerador.'
  if (!req(row.transportador_razao_social))
    e.transportador_razao_social = 'Informe o transportador.'
  if (!req(row.motorista_nome)) e.motorista_nome = 'Informe o motorista.'
  if (!req(row.destinatario_razao_social))
    e.destinatario_razao_social = 'Informe o destinatário.'
  if (row.peso_entrada == null) e.peso_entrada = 'Informe o peso de entrada.'
  if (row.peso_saida == null) e.peso_saida = 'Informe o peso de saída.'
  return e
}

export function dataIsoParaInputDate(iso: string | null): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

export function dataHoraIsoParaInputLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const h = pad(d.getHours())
  const min = pad(d.getMinutes())
  return `${y}-${m}-${day}T${h}:${min}`
}

export function inputLocalParaIsoUtc(val: string): string | null {
  if (!val.trim()) return null
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
