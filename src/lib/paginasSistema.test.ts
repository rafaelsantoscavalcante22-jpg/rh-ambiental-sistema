import { describe, expect, it } from 'vitest'
import {
  emailPodeDefinirPaginasPorUsuario,
  pathEstaNaListaValida,
  usuarioPodeAcessarRota,
} from './paginasSistema'

describe('paginasSistema', () => {
  it('bem-vindo é sempre acessível com whitelist restrita', () => {
    expect(
      usuarioPodeAcessarRota({ email: 'u@test.com', paginas_permitidas: ['/clientes'] }, '/bem-vindo')
    ).toBe(true)
  })

  it('sem paginas_permitidas ou vazio não restringe rotas', () => {
    expect(usuarioPodeAcessarRota({ email: 'u@test.com', paginas_permitidas: null }, '/mtr')).toBe(true)
    expect(usuarioPodeAcessarRota({ email: 'u@test.com', paginas_permitidas: [] }, '/mtr')).toBe(true)
  })

  it('whitelist por prefixo de rota', () => {
    expect(
      usuarioPodeAcessarRota(
        { email: 'u@test.com', paginas_permitidas: ['/financeiro'] },
        '/financeiro/contas-receber'
      )
    ).toBe(true)
    expect(usuarioPodeAcessarRota({ email: 'u@test.com', paginas_permitidas: ['/clientes'] }, '/mtr')).toBe(
      false
    )
  })

  it('e-mails base ignoram whitelist', () => {
    expect(
      usuarioPodeAcessarRota(
        { email: 'gestores@rgambiental.com', paginas_permitidas: ['/clientes'] },
        '/mtr'
      )
    ).toBe(true)
    expect(emailPodeDefinirPaginasPorUsuario('gestores@rgambiental.com')).toBe(true)
  })

  it('rotas de UI alinhadas com a lista válida', () => {
    expect(pathEstaNaListaValida('/faturamento/regras-preco')).toBe(true)
    expect(pathEstaNaListaValida('/financeiro/contas-receber')).toBe(true)
  })
})
