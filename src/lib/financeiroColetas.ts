import { normalizarEtapaColeta, type EtapaFluxo } from './fluxoEtapas'

/**
 * Coletas que entram na lista de cobrança (Financeiro).
 * Mantém a regra num único sítio — evita divergência com Faturamento / fluxo.
 */
export function etapaVisivelListaFinanceiro(etapa: EtapaFluxo): boolean {
  return (
    etapa === 'FATURADO' ||
    etapa === 'ENVIADO_FINANCEIRO' ||
    etapa === 'FINALIZADO'
  )
}

/**
 * Mesmo critério da UI: linha entra na lista se etapa de cobrança, liberação ao financeiro,
 * ou coleta gerada pelos scripts de teste (observações).
 */
export function coletaVisivelListaFinanceiro(row: {
  fluxo_status?: string | null
  etapa_operacional?: string | null
  liberado_financeiro?: boolean | null
  /** Vista `vw_faturamento_resumo`; em `coletas` cru usa-se `observacoes`. */
  coleta_observacoes?: string | null
  observacoes?: string | null
}): boolean {
  const obs = (row.coleta_observacoes ?? row.observacoes ?? '').toUpperCase()
  if (obs.includes('HIST-200') || obs.includes('SIM-50') || obs.includes('FLUXO-20')) return true
  if (row.liberado_financeiro === true) return true
  return etapaVisivelListaFinanceiro(
    normalizarEtapaColeta({
      fluxo_status: row.fluxo_status,
      etapa_operacional: row.etapa_operacional,
    })
  )
}

/**
 * Filtro PostgREST para `.or(...)`: etapas de cobrança OU liberação OU seeds de teste (substring em observações).
 * Usa só `.eq.` / `.ilike.` por vírgula — `.in.(a,b,c)` dentro de `or` quebra o parser em várias versões do PostgREST.
 */
export const COLETAS_OR_FINANCEIRO_QUERY = [
  'fluxo_status.eq.FATURADO',
  'fluxo_status.eq.ENVIADO_FINANCEIRO',
  'fluxo_status.eq.FINALIZADO',
  'etapa_operacional.eq.FATURADO',
  'etapa_operacional.eq.ENVIADO_FINANCEIRO',
  'etapa_operacional.eq.FINALIZADO',
  'liberado_financeiro.eq.true',
  'coleta_observacoes.ilike.%HIST-200%',
  'coleta_observacoes.ilike.%SIM-50%',
  'coleta_observacoes.ilike.%FLUXO-20%',
].join(',')

/** Vencimento já passou e pagamento não está «Pago» (Dashboard / Financeiro). */
export function isVencidoFinanceiro(
  dataVencimento: string | null | undefined,
  statusPagamento: string | null | undefined
): boolean {
  const d = (dataVencimento ?? '').trim()
  if (!d) return false
  if ((statusPagamento ?? '').trim() === 'Pago') return false
  const vencimento = new Date(`${d}T23:59:59`)
  return vencimento < new Date()
}
