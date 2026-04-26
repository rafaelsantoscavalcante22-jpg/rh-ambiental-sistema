import { describe, expect, it } from 'vitest'
import {
  resolverFaseFluxoOficial,
  formatarFaseFluxoOficialParaUI,
  type EtapaFluxo,
} from './fluxoEtapas'

describe('resolverFaseFluxoOficial', () => {
  it('programada no início', () => {
    expect(resolverFaseFluxoOficial('PROGRAMACAO_CRIADA')).toBe('PROGRAMADA')
    expect(resolverFaseFluxoOficial('QUADRO_ATUALIZADO')).toBe('PROGRAMADA')
  })

  it('mtr emitida', () => {
    expect(resolverFaseFluxoOficial('MTR_PREENCHIDA')).toBe('MTR_EMITIDA')
    expect(resolverFaseFluxoOficial('MTR_ENTREGUE_LOGISTICA')).toBe('MTR_EMITIDA')
  })

  it('em operação', () => {
    expect(resolverFaseFluxoOficial('LOGISTICA_DESIGNADA')).toBe('EM_OPERACAO')
    expect(resolverFaseFluxoOficial('BRUTO_REGISTRADO')).toBe('EM_OPERACAO')
  })

  it('pesagem e pós-pesagem até ticket', () => {
    expect(resolverFaseFluxoOficial('CONTROLE_PESAGEM_LANCADO')).toBe('PESAGEM_LANCADA')
    expect(resolverFaseFluxoOficial('DOCUMENTOS_RECEBIDOS_OPERACIONAL')).toBe('PESAGEM_LANCADA')
  })

  it('pronta para faturar', () => {
    expect(resolverFaseFluxoOficial('TICKET_GERADO')).toBe('PRONTA_PARA_FATURAR')
    expect(resolverFaseFluxoOficial('APROVADO')).toBe('PRONTA_PARA_FATURAR')
  })

  it('faturada e financeiro', () => {
    expect(resolverFaseFluxoOficial('FATURADO')).toBe('FATURADA')
    expect(resolverFaseFluxoOficial('ENVIADO_FINANCEIRO')).toBe('FINANCEIRO_PENDENTE')
    expect(
      resolverFaseFluxoOficial('ENVIADO_FINANCEIRO' as EtapaFluxo, { statusPagamento: 'Pago' })
    ).toBe('PAGA')
    expect(resolverFaseFluxoOficial('FINALIZADO')).toBe('FINALIZADA')
  })

  it('rótulo PT', () => {
    expect(formatarFaseFluxoOficialParaUI('FATURADO')).toBe('Faturada')
  })
})
