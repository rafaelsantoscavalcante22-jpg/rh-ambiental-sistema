/**
 * Dados cadastrais públicos da transportadora (CNPJ / endereço de referência comercial).
 * Usados só para preencher campos vazios do bloco Transportador quando o nome indica RG Ambiental.
 */
export const TRANSPORTADOR_RG_AMBIENTAL_PADRAO = {
  razao_social: 'RG Ambiental Transportes Ltda.',
  atividade: 'Tratamento e disposição de resíduos perigosos de contaminação não radioativa (CNAE 3822-0/00)',
  cnpj: '02.785.402/0001-74',
  ie: '',
  endereco: 'Estrada Gregório Spina, 1101, Galpão RG Ambiental, Distrito Industrial',
  municipio: 'Araçariguama',
  bairro: 'Distrito Industrial',
  cep: '18147-000',
  estado: 'SP',
  responsavel: '',
  telefone: '(11) 4204-1249',
  email: 'contato@rgambiental.com.br',
  telefones_gerais: '(11) 4204-1249 | (11) 4204-1186 | (11) 4136-4243 | (11) 4204-3026',
} as const

export function nomeIndicaRgAmbiental(nome: string | null | undefined): boolean {
  const n = (nome ?? '').toLowerCase()
  return n.includes('rg') && n.includes('ambiental')
}

/** Preenche apenas chaves ainda vazias em `atual`. */
export function preencherCamposVazios<T extends Record<string, string>>(atual: T, defaults: Partial<T>): T {
  const o = { ...atual }
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const cur = String(o[key] ?? '').trim()
    const def = defaults[key]
    if (!cur && def !== undefined && String(def).trim()) {
      o[key] = def as T[keyof T]
    }
  }
  return o
}
