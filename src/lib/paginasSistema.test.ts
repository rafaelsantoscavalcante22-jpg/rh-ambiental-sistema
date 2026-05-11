import { describe, expect, it } from 'vitest'
import {
  cargoPodeAcessarRotaMenu,
  emailPodeDefinirPaginasPorUsuario,
  pathEstaNaListaValida,
  rotasCheckboxDesdePaginasGuardadas,
  usuarioPodeAcessarRota,
} from './paginasSistema'

describe('paginasSistema', () => {
  it('bem-vindo é sempre acessível com whitelist restrita', () => {
    expect(
      usuarioPodeAcessarRota({ email: 'u@test.com', paginas_permitidas: ['/clientes'] }, '/bem-vindo')
    ).toBe(true)
  })

  it('sem paginas_permitidas ou vazio não restringe rotas (cargo não-Visualizador)', () => {
    expect(usuarioPodeAcessarRota({ email: 'u@test.com', cargo: 'Operacional', paginas_permitidas: null }, '/mtr')).toBe(true)
    expect(usuarioPodeAcessarRota({ email: 'u@test.com', cargo: 'Operacional', paginas_permitidas: [] }, '/mtr')).toBe(true)
  })

  it('Visualizador sem paginas_permitidas só vê /bem-vindo', () => {
    expect(
      usuarioPodeAcessarRota({ email: 'u@test.com', cargo: 'Visualizador', paginas_permitidas: null }, '/bem-vindo')
    ).toBe(true)
    expect(
      usuarioPodeAcessarRota({ email: 'u@test.com', cargo: 'Visualizador', paginas_permitidas: [] }, '/clientes')
    ).toBe(false)
  })

  it('Visualizador com paginas_permitidas explícita vê só os prefixos liberados', () => {
    expect(
      usuarioPodeAcessarRota(
        { email: 'u@test.com', cargo: 'Visualizador', paginas_permitidas: ['/financeiro'] },
        '/financeiro/contas-pagar'
      )
    ).toBe(true)
    expect(
      usuarioPodeAcessarRota(
        { email: 'u@test.com', cargo: 'Visualizador', paginas_permitidas: ['/financeiro'] },
        '/clientes'
      )
    ).toBe(false)
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
    expect(pathEstaNaListaValida('/financeiro/contas-pagar')).toBe(true)
  })

  it('rotasCheckboxDesdePaginasGuardadas: prefixo expande filhos e aceita path sem slash inicial', () => {
    const a = rotasCheckboxDesdePaginasGuardadas(['/financeiro'])
    expect(a).toContain('/financeiro')
    expect(a).toContain('/financeiro/contas-receber')
    expect(a).toContain('/financeiro/contas-pagar')
    const b = rotasCheckboxDesdePaginasGuardadas(['financeiro/contas-pagar'])
    expect(b).toContain('/financeiro/contas-pagar')
    expect(b).not.toContain('/clientes')
  })

  it('cargoPodeAcessarRotaMenu: Operacional não acede a Financeiro (alinhado ao App)', () => {
    expect(cargoPodeAcessarRotaMenu('Operacional', '/financeiro')).toBe(false)
    expect(cargoPodeAcessarRotaMenu('Operacional', '/financeiro/contas-receber')).toBe(false)
    expect(cargoPodeAcessarRotaMenu('Operacional', '/clientes')).toBe(true)
    expect(cargoPodeAcessarRotaMenu('Operacional', '/mtr/abc')).toBe(true)
  })

  it('cargoPodeAcessarRotaMenu: Financeiro e Diretoria acedem a rotas financeiras', () => {
    expect(cargoPodeAcessarRotaMenu('Financeiro', '/financeiro')).toBe(true)
    expect(cargoPodeAcessarRotaMenu('Diretoria', '/financeiro/contas-pagar')).toBe(true)
  })
})
