/**
 * Checklist «CONFERÊNCIA DO CAMINHÃO» — modelo papel RG (14 itens, SIM/NÃO no digital).
 * IDs estáveis para JSON em `checklist_transporte.respostas` (valores: ok / não).
 * Registos antigos (ids legados) são ignorados na UI; não quebram a página.
 */

export type ItemChecklistMotorista = {
  id: string
  label: string
}

/** Coluna esquerda do modelo físico (7 itens). */
export const CHECKLIST_MOTORISTA_COL_ESQ: ItemChecklistMotorista[] = [
  { id: 'cm_documentos', label: 'Documentos' },
  { id: 'cm_macaco', label: 'Macaco' },
  { id: 'cm_chave_roda', label: 'Chave de Roda' },
  { id: 'cm_extintor', label: 'Extintor' },
  { id: 'cm_tacografo', label: 'Tacógrafo' },
  { id: 'cm_oleo', label: 'Óleo' },
  { id: 'cm_triangulo_cones', label: 'Triângulo/cones' },
]

/** Coluna direita do modelo físico (7 itens). */
export const CHECKLIST_MOTORISTA_COL_DIR: ItemChecklistMotorista[] = [
  { id: 'cm_cones', label: 'Cones' },
  { id: 'cm_parte_eletrica', label: 'Parte elétrica' },
  { id: 'cm_avarias_cabine', label: 'Avarias Cabine' },
  { id: 'cm_parte_mecanica', label: 'Parte mecânica' },
  { id: 'cm_mao_forca', label: 'Mão de força' },
  { id: 'cm_agua', label: 'Água' },
  {
    id: 'cm_placa_residuos_perigosos',
    label: 'Placa de Identificação de Resíduos Perigosos',
  },
]

/** Lista única (14 itens) — ordem: esquerda de cima a baixo, depois direita. */
export const CHECKLIST_MOTORISTA_ITENS: ItemChecklistMotorista[] = [
  ...CHECKLIST_MOTORISTA_COL_ESQ,
  ...CHECKLIST_MOTORISTA_COL_DIR,
]

const IDS = new Set(CHECKLIST_MOTORISTA_ITENS.map((i) => i.id))

/** null = não assinalado; true = SIM; false = NÃO (modelo papel). */
export type RespostaChecklistItem = boolean | null

export type RespostasChecklistMotorista = Record<string, RespostaChecklistItem>

export function respostasChecklistMotoristaIniciais(): RespostasChecklistMotorista {
  const o: RespostasChecklistMotorista = {}
  for (const i of CHECKLIST_MOTORISTA_ITENS) {
    o[i.id] = null
  }
  return o
}

/** Grava ok/não por item (omitir chaves ainda não assinaladas). */
export function serializarRespostasMotoristaParaGravar(
  r: RespostasChecklistMotorista
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of CHECKLIST_MOTORISTA_ITENS) {
    const v = r[i.id]
    if (v === true) out[i.id] = 'ok'
    else if (v === false) out[i.id] = 'nao'
  }
  return out
}

/**
 * Mescla JSON gravado com o modelo actual (14 itens).
 * Chaves legadas (ex.: luz_freio) são ignoradas — checklist novo começa desmarcado.
 */
export function mesclarRespostasChecklistMotorista(raw: unknown): RespostasChecklistMotorista {
  const base = respostasChecklistMotoristaIniciais()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  for (const id of IDS) {
    if (!(id in o)) continue
    const v = o[id]
    if (v === 'ok' || v === true) base[id] = true
    else if (v === 'nao' || v === false) base[id] = false
    else base[id] = null
  }

  return base
}
