/**
 * Checklist motorista simplificado: 15 itens (checkbox) + assinaturas na UI.
 * IDs estáveis para JSON em `checklist_transporte.respostas` (valores gravados: ok / não).
 */

export type ItemChecklistMotorista = {
  id: string
  label: string
}

/** 15 itens operacionais (modelo simplificado RG). */
export const CHECKLIST_MOTORISTA_ITENS: ItemChecklistMotorista[] = [
  { id: 'luz_freio', label: 'Luz de freio' },
  { id: 'lanternas', label: 'Lanternas' },
  { id: 'chave_forca', label: 'Chave de força' },
  { id: 'macaco', label: 'Macaco' },
  { id: 'avarias_cabine', label: 'Avarias na cabine' },
  { id: 'farol', label: 'Farol' },
  { id: 'para_choque', label: 'Pára-choque' },
  { id: 'cirene_re', label: 'Cirene de ré' },
  { id: 'abastecimento', label: 'Abastecimento' },
  { id: 'bolsa_classe_i_lacrada', label: 'Bolsa — Classe I — lacrada' },
  { id: 'epi_motorista', label: 'EPIs — motorista' },
  { id: 'epi_caminhao', label: 'EPIs — caminhão' },
  { id: 'tacografo', label: 'Tacógrafo' },
  { id: 'extintores', label: 'Extintores interno e externo' },
  { id: 'faixa_refletiva', label: 'Faixa refletiva' },
]

const IDS = new Set(CHECKLIST_MOTORISTA_ITENS.map((i) => i.id))

/** Estado na UI: marcado = verificado / conforme. */
export type RespostasChecklistMotorista = Record<string, boolean>

export function respostasChecklistMotoristaIniciais(): RespostasChecklistMotorista {
  const o: RespostasChecklistMotorista = {}
  for (const i of CHECKLIST_MOTORISTA_ITENS) {
    o[i.id] = false
  }
  return o
}

/** Grava ok/não por item (compatível com JSON já existente no Supabase). */
export function serializarRespostasMotoristaParaGravar(
  r: RespostasChecklistMotorista
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of CHECKLIST_MOTORISTA_ITENS) {
    out[i.id] = r[i.id] === true ? 'ok' : 'nao'
  }
  return out
}

/**
 * Mescla JSON gravado com o modelo atual (15 itens).
 * Aceita legado: 'ok' / 'nao', booleanos, e chaves antigas com mais de 15 itens.
 */
export function mesclarRespostasChecklistMotorista(raw: unknown): RespostasChecklistMotorista {
  const base = respostasChecklistMotoristaIniciais()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  const temChaveId = Object.keys(o).some((k) => IDS.has(k))

  for (const id of IDS) {
    if (!(id in o)) continue
    const v = o[id]
    if (v === 'ok' || v === true) base[id] = true
    else if (v === 'nao' || v === false) base[id] = false
    else base[id] = false
  }

  if (!temChaveId) {
    if (o.veiculo_condicoes_ok) {
      base.luz_freio = true
      base.farol = true
      base.faixa_refletiva = true
    }
    if (o.ep_motorista_ok) {
      base.epi_motorista = true
      base.epi_caminhao = true
    }
    if (o.documentacao_mtr_ok) base.tacografo = true
    if (o.carga_acondicionada_ok) base.bolsa_classe_i_lacrada = true
    if (o.rota_seguranca_ok) {
      base.cirene_re = true
      base.lanternas = true
    }
  }
  return base
}
