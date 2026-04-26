import { describe, expect, it } from 'vitest'
import { resolverPrecoSugerido, selecionarRegraPreco, type RegraPrecoRow } from './pricing'

describe('selecionarRegraPreco', () => {
  const base: RegraPrecoRow[] = [
    { id: '1', cliente_id: null, tipo_residuo: '*', valor_por_kg: 1, valor_minimo: 0, ativo: true },
    { id: '2', cliente_id: 'c1', tipo_residuo: '*', valor_por_kg: 2, valor_minimo: 0, ativo: true },
    { id: '3', cliente_id: 'c1', tipo_residuo: 'Lodo', valor_por_kg: 5, valor_minimo: 0, ativo: true },
  ]

  it('prioriza cliente + resíduo exact', () => {
    const r = selecionarRegraPreco(base, 'c1', 'Lodo')
    expect(r?.regra.id).toBe('3')
  })

  it('usa regra de cliente quando resíduo não casa', () => {
    const r = selecionarRegraPreco(base, 'c1', 'Outro')
    expect(r?.regra.id).toBe('2')
  })

  it('usa regra geral', () => {
    const r = selecionarRegraPreco(base, null, 'X')
    expect(r?.regra.id).toBe('1')
  })
})

describe('resolverPrecoSugerido', () => {
  it('calcula por kg e mínimo', () => {
    const regras: RegraPrecoRow[] = [
      { id: 'a', cliente_id: null, tipo_residuo: '*', valor_por_kg: 10, valor_minimo: 100, ativo: true },
    ]
    const x = resolverPrecoSugerido(regras, null, 'R', 5)
    expect(x.total).toBe(100)
    expect(x.linhas.some((l) => l.chave === 'minimo')).toBe(true)
  })
})
