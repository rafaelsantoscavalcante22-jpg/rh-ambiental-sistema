export type RegiaoNome =
  | 'Norte'
  | 'Nordeste'
  | 'Centro-Oeste'
  | 'Sudeste'
  | 'Sul'
  | 'Sem região'

export const REGIOES_ORDEM: RegiaoNome[] = [
  'Norte',
  'Nordeste',
  'Centro-Oeste',
  'Sudeste',
  'Sul',
  'Sem região',
]

/** UF → região (IBGE). */
const UF_REGIAO: Record<string, RegiaoNome> = {
  AC: 'Norte',
  AM: 'Norte',
  AP: 'Norte',
  PA: 'Norte',
  RO: 'Norte',
  RR: 'Norte',
  TO: 'Norte',
  AL: 'Nordeste',
  BA: 'Nordeste',
  CE: 'Nordeste',
  MA: 'Nordeste',
  PB: 'Nordeste',
  PE: 'Nordeste',
  PI: 'Nordeste',
  RN: 'Nordeste',
  SE: 'Nordeste',
  DF: 'Centro-Oeste',
  GO: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  ES: 'Sudeste',
  MG: 'Sudeste',
  RJ: 'Sudeste',
  SP: 'Sudeste',
  PR: 'Sul',
  RS: 'Sul',
  SC: 'Sul',
}

/** Sigla da UF quando reconhecível; senão `null`. */
export function resolverUfSigla(estado: string | null | undefined): string | null {
  if (!estado) return null
  const t = estado.trim().toUpperCase()
  if (t.length >= 2) {
    const dois = t.slice(0, 2).replace(/[^A-Z]/g, '')
    if (dois.length === 2 && UF_REGIAO[dois]) return dois
  }
  return null
}

/** Extrai possível UF de texto livre (ex.: "SP", "sp", "SP — São Paulo"). */
export function resolverRegiao(estado: string | null | undefined): RegiaoNome {
  const uf = resolverUfSigla(estado)
  if (uf) return UF_REGIAO[uf]
  return 'Sem região'
}

export function clienteEstaAtivo(status: string | null | undefined): boolean {
  return String(status ?? 'Ativo').trim().toLowerCase() === 'ativo'
}
