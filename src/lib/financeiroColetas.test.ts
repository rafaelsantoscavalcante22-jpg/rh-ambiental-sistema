import { describe, expect, it } from 'vitest'
import {
  coletaVisivelListaFinanceiro,
  etapaVisivelListaFinanceiro,
  isVencidoFinanceiro,
} from './financeiroColetas'

describe('etapaVisivelListaFinanceiro', () => {
  it('inclui FATURADO, ENVIADO_FINANCEIRO e FINALIZADO', () => {
    expect(etapaVisivelListaFinanceiro('FATURADO')).toBe(true)
    expect(etapaVisivelListaFinanceiro('ENVIADO_FINANCEIRO')).toBe(true)
    expect(etapaVisivelListaFinanceiro('FINALIZADO')).toBe(true)
  })

  it('exclui etapas anteriores ao financeiro', () => {
    expect(etapaVisivelListaFinanceiro('MTR_PREENCHIDA')).toBe(false)
    expect(etapaVisivelListaFinanceiro('TICKET_GERADO')).toBe(false)
  })
})

describe('coletaVisivelListaFinanceiro', () => {
  it('inclui seeds de teste pelas observações (coleta_observacoes ou observacoes)', () => {
    expect(
      coletaVisivelListaFinanceiro({
        fluxo_status: 'MTR_PREENCHIDA',
        etapa_operacional: 'MTR_PREENCHIDA',
        coleta_observacoes: '[FLUXO-20] seed',
      })
    ).toBe(true)
    expect(
      coletaVisivelListaFinanceiro({
        fluxo_status: 'MTR_PREENCHIDA',
        etapa_operacional: 'MTR_PREENCHIDA',
        observacoes: '[SIM-50] teste',
      })
    ).toBe(true)
    expect(
      coletaVisivelListaFinanceiro({
        fluxo_status: 'PROGRAMACAO_CRIADA',
        etapa_operacional: 'PROGRAMACAO_CRIADA',
        observacoes: 'Prefixo HIST-200 no texto',
      })
    ).toBe(true)
  })

  it('inclui quando liberado_financeiro', () => {
    expect(
      coletaVisivelListaFinanceiro({
        fluxo_status: 'COLETA_REALIZADA',
        etapa_operacional: 'COLETA_REALIZADA',
        liberado_financeiro: true,
      })
    ).toBe(true)
  })
})

describe('isVencidoFinanceiro', () => {
  it('retorna false quando pago ou sem data', () => {
    expect(isVencidoFinanceiro('2020-01-01', 'Pago')).toBe(false)
    expect(isVencidoFinanceiro('', 'Pendente')).toBe(false)
  })
})
