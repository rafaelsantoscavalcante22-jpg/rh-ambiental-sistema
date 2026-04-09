/**
 * Etapas oficiais do fluxo RG Ambiental (ordem canónica do processo; UI principal em Controle de Massa).
 * Usado para normalizar registros com fluxo_status e/ou etapa_operacional preenchidos de forma inconsistente.
 */

export const ETAPAS_FLUXO_ORDER = [
  'PROGRAMACAO_CRIADA',
  'QUADRO_ATUALIZADO',
  'MTR_PREENCHIDA',
  'MTR_ENTREGUE_LOGISTICA',
  'LOGISTICA_DESIGNADA',
  'TARA_REGISTRADA',
  'COLETA_REALIZADA',
  'BRUTO_REGISTRADO',
  'CONTROLE_PESAGEM_LANCADO',
  'DOCUMENTOS_RECEBIDOS_OPERACIONAL',
  'TICKET_GERADO',
  'ENVIADO_APROVACAO',
  'APROVADO',
  'ARQUIVADO',
  'FATURADO',
  'ENVIADO_FINANCEIRO',
  'FINALIZADO',
] as const

export type EtapaFluxo = (typeof ETAPAS_FLUXO_ORDER)[number]

const SET_ETAPAS = new Set<string>(ETAPAS_FLUXO_ORDER)

/** Valores legados de bancos antigos ou telas antigas → etapa canônica */
const LEGACY_ETAPA_PARA_CANONICA: Record<string, EtapaFluxo> = {
  PESO_CALCULADO: 'CONTROLE_PESAGEM_LANCADO',
  LANCADO_CONTROLE_MASSA: 'CONTROLE_PESAGEM_LANCADO',
  CONTROLE_PESAGEM: 'CONTROLE_PESAGEM_LANCADO',
  DOCUMENTO_CRIADO: 'MTR_PREENCHIDA',
  DOCUMENTO_ENTREGUE: 'MTR_ENTREGUE_LOGISTICA',
  LIBERADO_FINANCEIRO: 'ENVIADO_FINANCEIRO',
  LOGISTICA_DESIGNADA_SAIDA: 'LOGISTICA_DESIGNADA',
  RETORNO_PESO_BRUTO: 'BRUTO_REGISTRADO',
}

/** Labels curtos para dashboard / listas */
export const ETAPA_LABEL_CURTO: Record<EtapaFluxo, string> = {
  PROGRAMACAO_CRIADA: 'Programação criada',
  QUADRO_ATUALIZADO: 'Quadro atualizado',
  MTR_PREENCHIDA: 'MTR preenchida',
  MTR_ENTREGUE_LOGISTICA: 'MTR na logística',
  LOGISTICA_DESIGNADA: 'Logística designada',
  TARA_REGISTRADA: 'Tara registrada',
  COLETA_REALIZADA: 'Coleta realizada',
  BRUTO_REGISTRADO: 'Bruto registrado',
  CONTROLE_PESAGEM_LANCADO: 'Pesagem lançada',
  DOCUMENTOS_RECEBIDOS_OPERACIONAL: 'Docs recebidos',
  TICKET_GERADO: 'Ticket gerado',
  ENVIADO_APROVACAO: 'Em aprovação',
  APROVADO: 'Aprovado',
  ARQUIVADO: 'Arquivado',
  FATURADO: 'Faturado',
  ENVIADO_FINANCEIRO: 'No financeiro',
  FINALIZADO: 'Finalizado',
}

export function normalizarEtapaColeta(row: {
  fluxo_status?: string | null
  etapa_operacional?: string | null
}): EtapaFluxo {
  const a = (row.fluxo_status ?? '').trim()
  const b = (row.etapa_operacional ?? '').trim()

  const tentar = (raw: string): EtapaFluxo | null => {
    if (!raw) return null
    const upper = raw.toUpperCase()
    if (LEGACY_ETAPA_PARA_CANONICA[upper]) return LEGACY_ETAPA_PARA_CANONICA[upper]
    if (LEGACY_ETAPA_PARA_CANONICA[raw]) return LEGACY_ETAPA_PARA_CANONICA[raw]
    if (SET_ETAPAS.has(raw)) return raw as EtapaFluxo
    if (SET_ETAPAS.has(upper)) return upper as EtapaFluxo
    return null
  }

  return tentar(a) ?? tentar(b) ?? 'PROGRAMACAO_CRIADA'
}

export function indiceEtapaFluxo(etapa: EtapaFluxo): number {
  return ETAPAS_FLUXO_ORDER.indexOf(etapa)
}

/**
 * Controle de Massa: não bloquear por etapa (fluxo_status pode estar atrasado na operação real).
 * Pesagem pode ser lançada assim que existir MTR/coleta vinculada.
 */
export function etapaApareceNoSelectControleMassa(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

/** Lançar pesagem: mesmo critério — sem trava por etapa. */
export function etapaPermiteSalvarLancamentoMassa(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

/**
 * Checklist de transporte — a edição não é mais bloqueada pela etapa do fluxo
 * (a janela Tara–Bruto era restritiva demais para a operação real).
 */
export function etapaPermiteEditarChecklistTransporte(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

/** Conferência operacional — sem trava por etapa (reintroduzir depois se necessário). */
export function etapaPermiteEditarConferenciaOperacional(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

/** Já conferido — só leitura na UI (observações já gravadas). */
export function etapaConferenciaJaRegistradaNoFluxo(etapa: EtapaFluxo): boolean {
  const i = indiceEtapaFluxo(etapa)
  return i >= indiceEtapaFluxo('DOCUMENTOS_RECEBIDOS_OPERACIONAL')
}

/** Ticket operacional — sem trava por etapa. */
export function etapaPermiteEditarTicketOperacional(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

export function etapaTicketJaRegistradoNoFluxo(etapa: EtapaFluxo): boolean {
  return indiceEtapaFluxo(etapa) >= indiceEtapaFluxo('TICKET_GERADO')
}

/** Enviar para aprovação — sem trava por etapa. */
export function etapaPermiteEnviarParaAprovacao(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

/** Aprovação — sem trava por etapa. */
export function etapaPermiteEditarAprovacaoDiretoria(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

export function etapaAprovacaoJaRegistradaNoFluxo(etapa: EtapaFluxo): boolean {
  return indiceEtapaFluxo(etapa) >= indiceEtapaFluxo('APROVADO')
}

/** Faturamento — sem trava por etapa. */
export function etapaPermiteEditarFaturamentoRegistro(etapa: EtapaFluxo): boolean {
  void etapa
  return true
}

export function etapaFaturamentoJaRegistradoNoFluxo(etapa: EtapaFluxo): boolean {
  return indiceEtapaFluxo(etapa) >= indiceEtapaFluxo('FATURADO')
}

export function formatarEtapaParaUI(etapa: EtapaFluxo): string {
  return ETAPA_LABEL_CURTO[etapa] ?? etapa
}
