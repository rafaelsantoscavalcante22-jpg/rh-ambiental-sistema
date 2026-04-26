import { describe, expect, it } from 'vitest'
import { alinharValorPagoComStatusUi, derivarStatusPagamento } from './contasReceberUtils'

describe('derivarStatusPagamento', () => {
  it('Pago quando quitado', () => {
    expect(derivarStatusPagamento(100, 100)).toBe('Pago')
    expect(derivarStatusPagamento(100, 120)).toBe('Pago')
  })
  it('Parcial com valor no meio', () => {
    expect(derivarStatusPagamento(100, 40)).toBe('Parcial')
  })
  it('Pendente sem pagamento', () => {
    expect(derivarStatusPagamento(100, 0)).toBe('Pendente')
    expect(derivarStatusPagamento(0, 0)).toBe('Pendente')
  })
})

describe('alinharValorPagoComStatusUi', () => {
  it('Pago força valor total', () => {
    const r = alinharValorPagoComStatusUi(200, 0, 'Pago')
    expect(r.valorPago).toBe(200)
    expect(r.status).toBe('Pago')
  })
  it('Pendente zera', () => {
    const r = alinharValorPagoComStatusUi(200, 50, 'Pendente')
    expect(r.valorPago).toBe(0)
    expect(r.status).toBe('Pendente')
  })
})
