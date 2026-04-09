/**
 * Itens alinhados ao modelo «CHECK LIST MOTORISTA» (planilha operacional RG).
 * IDs estáveis para JSON em `checklist_transporte.respostas`.
 * Respostas por linha: OK ou NÃO (igual ao checklist de conferência).
 */

export type ItemChecklistMotorista = {
  id: string
  label: string
}

export const CHECKLIST_MOTORISTA_ITENS: ItemChecklistMotorista[] = [
  { id: 'luz_freio', label: 'Luz de Freio' },
  { id: 'lanternas', label: 'Lanternas' },
  { id: 'chave_forca', label: 'Chave de força' },
  { id: 'macaco', label: 'Macaco' },
  { id: 'avarias_cabine', label: 'Avarias Cabine' },
  { id: 'farol', label: 'Farol' },
  { id: 'para_choque', label: 'Pára-Choque' },
  { id: 'cirene_re', label: 'Cirene de ré' },
  { id: 'abastecimento', label: 'Abastecimento' },
  { id: 'bolsa_classe_i_lacrada', label: 'Bolsa - Classe I - Lacrada' },
  { id: 'epi_motorista', label: 'EPIs - Motorista' },
  { id: 'epi_caminhao', label: 'EPIs - Caminhão' },
  { id: 'tacografo', label: 'Tacógrafo' },
  { id: 'extintores', label: 'Extintores Interno e Externo' },
  { id: 'faixa_refletiva', label: 'Faixa Refletiva' },
  { id: 'pneus', label: 'Pneus' },
  { id: 'tomada_forca', label: 'Tomada de Força' },
  { id: 'triangulo', label: 'Triângulo' },
  { id: 'chave_roda', label: 'Chave de roda' },
  { id: 'setas', label: 'Setas' },
  { id: 'espelhos', label: 'Espelhos' },
  { id: 'avarias_equipamento', label: 'Avarias Equipamento' },
]

const IDS = new Set(CHECKLIST_MOTORISTA_ITENS.map((i) => i.id))

export type RespostaChecklistMotorista = 'ok' | 'nao'

export type RespostasChecklistMotorista = Record<string, RespostaChecklistMotorista | null>

export function respostasChecklistMotoristaIniciais(): RespostasChecklistMotorista {
  const o: RespostasChecklistMotorista = {}
  for (const i of CHECKLIST_MOTORISTA_ITENS) {
    o[i.id] = null
  }
  return o
}

/** Só grava chaves com OK ou NÃO (como `serializarRespostasParaGravar` na conferência). */
export function serializarRespostasMotoristaParaGravar(r: RespostasChecklistMotorista): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of CHECKLIST_MOTORISTA_ITENS) {
    const v = r[i.id]
    if (v === 'ok' || v === 'nao') out[i.id] = v
  }
  return out
}

/**
 * Mescla JSON gravado com o modelo atual.
 * Migra booleanos antigos: `true` → OK, `false` → NÃO; migra chaves antigas (5 itens genéricos).
 */
export function mesclarRespostasChecklistMotorista(raw: unknown): RespostasChecklistMotorista {
  const base = respostasChecklistMotoristaIniciais()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  const temChaveId = Object.keys(o).some((k) => IDS.has(k))

  for (const id of IDS) {
    if (!(id in o)) continue
    const v = o[id]
    if (v === 'ok' || v === 'nao') base[id] = v
    else if (v === true) base[id] = 'ok'
    else if (v === false) base[id] = 'nao'
    else base[id] = null
  }

  if (!temChaveId) {
    if (o.veiculo_condicoes_ok) {
      base.luz_freio = 'ok'
      base.farol = 'ok'
      base.pneus = 'ok'
    }
    if (o.ep_motorista_ok) {
      base.epi_motorista = 'ok'
      base.epi_caminhao = 'ok'
    }
    if (o.documentacao_mtr_ok) base.tacografo = 'ok'
    if (o.carga_acondicionada_ok) base.bolsa_classe_i_lacrada = 'ok'
    if (o.rota_seguranca_ok) {
      base.triangulo = 'ok'
      base.setas = 'ok'
    }
  }
  return base
}
