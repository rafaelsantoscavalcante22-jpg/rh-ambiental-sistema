/**
 * Checklist «CHECK LIST» — duas colunas (OK / NÃO / ITENS), alinhado ao modelo impresso RG.
 * Respostas gravadas em `conferencia_transporte.respostas` como JSON por id estável.
 */

import { CHECKLIST_MOTORISTA_ITENS } from './checklistMotoristaItens'

export type ItemConferenciaTransporte = {
  id: string
  label: string
}

/** Coluna esquerda (12 itens) — ordem do modelo. */
export const CONFERENCIA_TRANSPORTE_COL_ESQ: ItemConferenciaTransporte[] = [
  { id: 'cirene_re', label: 'Cirene de ré' },
  { id: 'luz_freio', label: 'Luz de Freio' },
  { id: 'lanternas', label: 'Lanternas' },
  { id: 'chave_forca', label: 'Chave de força' },
  { id: 'chave_roda', label: 'Chave de roda' },
  { id: 'macaco', label: 'Macaco' },
  { id: 'avarias_equipamento', label: 'Avarias Equipamento' },
  { id: 'avarias_cabine', label: 'Avarias Cabine' },
  { id: 'farol', label: 'Farol' },
  { id: 'setas', label: 'Setas' },
  { id: 'para_choque', label: 'Pára-Choque' },
  { id: 'espelhos', label: 'Espelhos' },
]

/** Coluna direita (10 itens) — linhas vazias do papel não entram no digital. */
export const CONFERENCIA_TRANSPORTE_COL_DIR: ItemConferenciaTransporte[] = [
  { id: 'abastecimento', label: 'Abastecimento' },
  { id: 'bolsa_classe_i_lacrada', label: 'Bolsa - Classe I - Lacrada' },
  { id: 'epi_motorista', label: "EPI's - Motorista" },
  { id: 'epi_caminhao', label: "EPI's - Caminhão" },
  { id: 'tacografo', label: 'Tacógrafo' },
  { id: 'extintores_int_ext', label: 'Extintores Interno e Externo' },
  { id: 'faixa_refletiva', label: 'Faixa Refletiva' },
  { id: 'pneus', label: 'Pneus' },
  { id: 'tomada_forca', label: 'Tomada de Força' },
  { id: 'triangulo', label: 'Triângulo' },
]

/**
 * Ordem única para impressão/PDF (uma coluna, 22 linhas) — alinhada ao modelo físico RG.
 */
export const CONFERENCIA_TRANSPORTE_IDS_ORDEM_IMPRESSAO: readonly string[] = [
  'luz_freio',
  'lanternas',
  'chave_forca',
  'macaco',
  'avarias_cabine',
  'farol',
  'para_choque',
  'cirene_re',
  'abastecimento',
  'bolsa_classe_i_lacrada',
  'epi_motorista',
  'epi_caminhao',
  'tacografo',
  'extintores_int_ext',
  'faixa_refletiva',
  'pneus',
  'tomada_forca',
  'triangulo',
  'chave_roda',
  'setas',
  'espelhos',
  'avarias_equipamento',
] as const

const MAPA_POR_ID: Record<string, ItemConferenciaTransporte> = Object.fromEntries(
  [...CONFERENCIA_TRANSPORTE_COL_ESQ, ...CONFERENCIA_TRANSPORTE_COL_DIR].map((i) => [i.id, i])
)

/** Itens da conferência na ordem do PDF (22 linhas). */
export function itensConferenciaOrdemImpressao(): ItemConferenciaTransporte[] {
  return CONFERENCIA_TRANSPORTE_IDS_ORDEM_IMPRESSAO.map((id) => MAPA_POR_ID[id]).filter(Boolean)
}

/**
 * ID no checklist do motorista (`checklist_transporte`) para o mesmo item da conferência.
 * Só diverge em extintores (`extintores` vs `extintores_int_ext`).
 */
export function idConferenciaParaIdMotorista(idConferencia: string): string {
  return idConferencia === 'extintores_int_ext' ? 'extintores' : idConferencia
}

/** ID do motorista → id gravado em `conferencia_transporte.respostas`. */
export function motoristaIdParaIdConferencia(idMotorista: string): string {
  return idMotorista === 'extintores' ? 'extintores_int_ext' : idMotorista
}

export type LinhaImpressaoUnificada = {
  idConferencia: string
  idMotorista: string
  labelImpressao: string
}

/**
 * Linhas do PDF unificado na mesma ordem do passo 2 (lista `CHECKLIST_MOTORISTA_ITENS`).
 * Rótulos iguais aos da aplicação; colunas motorista / conferência alinhadas por id.
 */
export function itensUnificadosOrdemMotorista(): LinhaImpressaoUnificada[] {
  return CHECKLIST_MOTORISTA_ITENS.map((m) => {
    const idConf = motoristaIdParaIdConferencia(m.id)
    const conf = MAPA_POR_ID[idConf]
    if (!conf) return null
    return {
      idConferencia: idConf,
      idMotorista: m.id,
      labelImpressao: m.label,
    }
  }).filter((row): row is LinhaImpressaoUnificada => row !== null)
}

const ALL_ITEMS = [...CONFERENCIA_TRANSPORTE_COL_ESQ, ...CONFERENCIA_TRANSPORTE_COL_DIR]
const ALL_IDS = new Set(ALL_ITEMS.map((i) => i.id))

export type RespostaConferenciaTransporte = 'ok' | 'nao'

export type RespostasConferenciaTransporte = Record<string, RespostaConferenciaTransporte | null>

export function respostasConferenciaTransporteIniciais(): RespostasConferenciaTransporte {
  const o: RespostasConferenciaTransporte = {}
  for (const i of ALL_ITEMS) {
    o[i.id] = null
  }
  return o
}

export function mesclarRespostasConferenciaTransporte(raw: unknown): RespostasConferenciaTransporte {
  const base = respostasConferenciaTransporteIniciais()
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>
  for (const id of ALL_IDS) {
    if (!(id in obj)) continue
    const v = obj[id]
    if (v === 'ok' || v === 'nao') base[id] = v
    else if (v === true) base[id] = 'ok'
    else if (v === false) base[id] = null
    else base[id] = null
  }
  return base
}

export function serializarRespostasParaGravar(r: RespostasConferenciaTransporte): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of ALL_IDS) {
    const v = r[id]
    if (v === 'ok' || v === 'nao') out[id] = v
  }
  return out
}
