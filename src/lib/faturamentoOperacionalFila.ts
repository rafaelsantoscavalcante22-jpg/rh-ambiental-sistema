import type { FaturamentoResumoViewRow } from './faturamentoResumo'
import { indiceEtapaFluxo, normalizarEtapaColeta, type EtapaFluxo } from './fluxoEtapas'
import { coletaElegivelParaFaturar } from './faturamentoElegibilidade'

function etapaDaLinha(row: FaturamentoResumoViewRow): EtapaFluxo {
  return normalizarEtapaColeta({
    fluxo_status: row.fluxo_status,
    etapa_operacional: row.etapa_operacional,
  })
}

/** Já enviada ao financeiro / fechada nesta fase — não entra na fila de «a faturar». */
function jaEnviadaAoFinanceiro(etapa: EtapaFluxo): boolean {
  return indiceEtapaFluxo(etapa) >= indiceEtapaFluxo('ENVIADO_FINANCEIRO')
}

/** Registo operacional já emitido (envia ao financeiro). */
function registoFaturamentoEmitido(row: FaturamentoResumoViewRow): boolean {
  return row.faturamento_registro_status === 'emitido'
}

/**
 * Coleta elegível para aparecer na fila «prontas para faturamento»:
 * mesmo critério que `status_conferencia = PRONTO_PARA_FATURAR` na vista (peso, MTR, ticket, aprovação),
 * mais cliente e peso válidos; sem emissão ainda.
 */
export function coletaNaFilaFaturamento(row: FaturamentoResumoViewRow): boolean {
  return coletaElegivelParaFaturar(row).ok
}

/** Histórico: já emitido ao financeiro ou etapa já no financeiro. */
export function coletaHistoricoFaturamentoEmitido(row: FaturamentoResumoViewRow): boolean {
  const etapa = etapaDaLinha(row)
  if (registoFaturamentoEmitido(row)) return true
  return jaEnviadaAoFinanceiro(etapa)
}

export function statusFaturamentoUi(row: FaturamentoResumoViewRow): 'Pendente' | 'Faturado' {
  return coletaHistoricoFaturamentoEmitido(row) ? 'Faturado' : 'Pendente'
}

/** Indicador de SLA (3 dias): prioriza coluna da view; sem coluna, não assinala crítico. */
export function coletaFaturamentoSlaVencido(row: FaturamentoResumoViewRow): boolean {
  if (row.faturamento_sla_vencido === true) return true
  if (row.faturamento_sla_vencido === false) return false
  return false
}

/** Mesmo critério do filtro «Pronto para faturar» em Financeiro (`status_conferencia` na vista). */
export function coletaConferenciaProntaParaFaturar(row: FaturamentoResumoViewRow): boolean {
  return row.status_conferencia === 'PRONTO_PARA_FATURAR'
}

/** Conferência ainda incompleta na vista (`vw_faturamento_resumo`). */
export function coletaConferenciaPendente(row: FaturamentoResumoViewRow): boolean {
  return row.status_conferencia === 'PENDENTE'
}

/** Rótulo alinhado ao Financeiro (coluna / filtro de conferência). */
export function rotuloConferenciaResumo(row: FaturamentoResumoViewRow): string {
  if (row.status_conferencia === 'PRONTO_PARA_FATURAR') return 'Pronto para faturar'
  if (row.status_conferencia === 'PENDENTE') return 'Pendente'
  return row.status_conferencia?.trim() ? row.status_conferencia : '—'
}
