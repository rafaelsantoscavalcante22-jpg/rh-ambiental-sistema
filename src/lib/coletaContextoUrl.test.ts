import { describe, expect, it } from 'vitest'
import { idsContextoFromSearchParams, resolverColetaPorContextoUrl } from './coletaContextoUrl'

describe('idsContextoFromSearchParams', () => {
  it('lê coleta, mtr, programacao e cliente', () => {
    const p = new URLSearchParams('coleta=a&mtr=b&programacao=c&cliente=d')
    expect(idsContextoFromSearchParams(p)).toEqual({
      coleta: 'a',
      mtr: 'b',
      programacao: 'c',
      cliente: 'd',
    })
  })

  it('retorna null para parâmetros em falta', () => {
    const p = new URLSearchParams('')
    expect(idsContextoFromSearchParams(p)).toEqual({
      coleta: null,
      mtr: null,
      programacao: null,
      cliente: null,
    })
  })
})

describe('resolverColetaPorContextoUrl', () => {
  const lista = [
    { id: 'c1', mtr_id: 'm1' as string | null, programacao_id: 'p1' as string | null, cliente_id: 'cl1' as string | null },
    { id: 'c2', mtr_id: null, programacao_id: null, cliente_id: 'cl2' as string | null },
  ]

  it('prioriza coleta sobre os outros ids', () => {
    const r = resolverColetaPorContextoUrl(lista, {
      coleta: 'c2',
      mtr: 'm1',
      programacao: null,
      cliente: null,
    })
    expect(r?.id).toBe('c2')
  })

  it('resolve por mtr quando não há coleta', () => {
    const r = resolverColetaPorContextoUrl(lista, {
      coleta: null,
      mtr: 'm1',
      programacao: null,
      cliente: null,
    })
    expect(r?.id).toBe('c1')
  })

  it('resolve por cliente quando é o único critério', () => {
    const r = resolverColetaPorContextoUrl(lista, {
      coleta: null,
      mtr: null,
      programacao: null,
      cliente: 'cl2',
    })
    expect(r?.id).toBe('c2')
  })

  it('retorna null se nada corresponde', () => {
    expect(
      resolverColetaPorContextoUrl(lista, {
        coleta: 'x',
        mtr: null,
        programacao: null,
        cliente: null,
      })
    ).toBeNull()
  })
})
