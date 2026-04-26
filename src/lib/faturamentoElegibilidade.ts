import { indiceEtapaFluxo, normalizarEtapaColeta, type EtapaFluxo } from './fluxoEtapas'
import type { FaturamentoResumoViewRow } from './faturamentoResumo'

export type MotivoInelegivelFaturamento =
  | 'peso_liquido_invalido'
  | 'cliente_obrigatorio'
  | 'conferencia_pendente'
  | 'ja_emitido'
  | 'ja_no_financeiro'

export type ResultadoElegibilidadeFaturamento = {
  ok: boolean
  etapa: EtapaFluxo
  motivos: MotivoInelegivelFaturamento[]
}

export function etapaDaLinhaFaturamento(row: Pick<FaturamentoResumoViewRow, 'fluxo_status' | 'etapa_operacional'>): EtapaFluxo {
  return normalizarEtapaColeta({
    fluxo_status: row.fluxo_status,
    etapa_operacional: row.etapa_operacional,
  })
}

export function coletaElegivelParaFaturar(row: FaturamentoResumoViewRow): ResultadoElegibilidadeFaturamento {
  const etapa = etapaDaLinhaFaturamento(row)
  const motivos: MotivoInelegivelFaturamento[] = []

  const p = row.peso_liquido
  if (!(p != null && Number(p) > 0)) motivos.push('peso_liquido_invalido')

  if (!row.cliente_id) motivos.push('cliente_obrigatorio')

  // Mesmo critério que `status_conferencia` em `vw_faturamento_resumo` (MTR, peso, ticket, aprovação;
  // valor pode ser definido só na emissão / regras de preço).
  const sc = (row.status_conferencia ?? '').trim()
  if (sc !== 'PRONTO_PARA_FATURAR') motivos.push('conferencia_pendente')

  if (row.faturamento_registro_status === 'emitido') motivos.push('ja_emitido')

  if (indiceEtapaFluxo(etapa) >= indiceEtapaFluxo('ENVIADO_FINANCEIRO')) motivos.push('ja_no_financeiro')

  return { ok: motivos.length === 0, etapa, motivos }
}

export function rotuloMotivoInelegivel(m: MotivoInelegivelFaturamento): string {
  switch (m) {
    case 'peso_liquido_invalido':
      return 'Peso líquido ausente ou inválido.'
    case 'cliente_obrigatorio':
      return 'Cliente obrigatório.'
    case 'conferencia_pendente':
      return 'Requisitos de conferência pendentes (MTR, peso, ticket, aprovação ou outro — veja pendências na lista).'
    case 'ja_emitido':
      return 'Faturamento já emitido.'
    case 'ja_no_financeiro':
      return 'Coleta já enviada ao financeiro.'
    default:
      return 'Não elegível para faturar.'
  }
}

