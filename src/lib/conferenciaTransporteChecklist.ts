/**
 * Checklist conferência — mesmo modelo de 14 itens que o checklist do motorista (papel RG).
 * Respostas em `conferencia_transporte.respostas` (quando essa tabela for usada) ou alinhamento PDF.
 */

import {
  CHECKLIST_MOTORISTA_COL_DIR,
  CHECKLIST_MOTORISTA_COL_ESQ,
  CHECKLIST_MOTORISTA_ITENS,
} from './checklistMotoristaItens'

export type ItemConferenciaTransporte = {
  id: string
  label: string
}

export const CONFERENCIA_TRANSPORTE_COL_ESQ: ItemConferenciaTransporte[] =
  CHECKLIST_MOTORISTA_COL_ESQ as ItemConferenciaTransporte[]

export const CONFERENCIA_TRANSPORTE_COL_DIR: ItemConferenciaTransporte[] =
  CHECKLIST_MOTORISTA_COL_DIR as ItemConferenciaTransporte[]

/** Ordem de impressão: igual à lista única do motorista. */
export const CONFERENCIA_TRANSPORTE_IDS_ORDEM_IMPRESSAO: readonly string[] =
  CHECKLIST_MOTORISTA_ITENS.map((i) => i.id) as readonly string[]

const MAPA_POR_ID: Record<string, ItemConferenciaTransporte> = Object.fromEntries(
  [...CONFERENCIA_TRANSPORTE_COL_ESQ, ...CONFERENCIA_TRANSPORTE_COL_DIR].map((i) => [i.id, i])
)

export function itensConferenciaOrdemImpressao(): ItemConferenciaTransporte[] {
  return CONFERENCIA_TRANSPORTE_IDS_ORDEM_IMPRESSAO.map((id) => MAPA_POR_ID[id]).filter(Boolean)
}

/** Mantido por compatibilidade de importações — ids são os mesmos. */
export function idConferenciaParaIdMotorista(idConferencia: string): string {
  return idConferencia
}

export function motoristaIdParaIdConferencia(idMotorista: string): string {
  return idMotorista
}

export type LinhaImpressaoUnificada = {
  idConferencia: string
  idMotorista: string
  labelImpressao: string
}

export function itensUnificadosOrdemMotorista(): LinhaImpressaoUnificada[] {
  return CHECKLIST_MOTORISTA_ITENS.map((m) => ({
    idConferencia: m.id,
    idMotorista: m.id,
    labelImpressao: m.label,
  }))
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
