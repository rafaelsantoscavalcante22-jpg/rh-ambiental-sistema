import { resolverUfSigla } from './brasilRegioes'

/** Segmentação da carteira para o mapa de Pós-venda (foco em SP). */
export type ZonaSpCarteira =
  | 'centro'
  | 'zona_norte'
  | 'zona_sul'
  | 'zona_leste'
  | 'zona_oeste'
  | 'grande_sp'
  | 'interior_sp'
  | 'indefinido'
  | 'fora_sp'

export const ZONAS_SP_MAPA_ORDEM: ZonaSpCarteira[] = [
  'centro',
  'zona_norte',
  'zona_sul',
  'zona_leste',
  'zona_oeste',
  'grande_sp',
  'interior_sp',
  'indefinido',
  'fora_sp',
]

export const ZONA_SP_LABEL: Record<ZonaSpCarteira, string> = {
  centro: 'Centro expandido',
  zona_norte: 'Zona Norte',
  zona_sul: 'Zona Sul',
  zona_leste: 'Zona Leste',
  zona_oeste: 'Zona Oeste',
  grande_sp: 'Grande São Paulo (RM)',
  interior_sp: 'Interior (SP)',
  indefinido: 'Capital — zona não identificada',
  fora_sp: 'Fora de SP',
}

/** Cores base distintas por zona (o mapa mistura com intensidade pelo volume). */
export const ZONA_SP_COR_BASE: Record<ZonaSpCarteira, string> = {
  centro: '#7c3aed',
  zona_norte: '#0284c7',
  zona_sul: '#ea580c',
  zona_leste: '#16a34a',
  zona_oeste: '#ca8a04',
  grande_sp: '#4f46e5',
  interior_sp: '#64748b',
  indefinido: '#94a3b8',
  fora_sp: '#cbd5e1',
}

function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function bairroCoincide(b: string, fragmentos: string[]): boolean {
  if (!b) return false
  return fragmentos.some((f) => b.includes(f))
}

/** Municípios usuais da RM (fora do município São Paulo). */
const GRANDE_SP_CIDADES = new Set(
  [
    'americana',
    'aruja',
    'barueri',
    'bertioga',
    'caieiras',
    'cajamar',
    'carapicuiba',
    'cotia',
    'diadema',
    'embu',
    'embu das artes',
    'embu-guacu',
    'ferraz de vasconcelos',
    'francisco morato',
    'franco da rocha',
    'guararema',
    'guarulhos',
    'itapecerica da serra',
    'itaquaquecetuba',
    'jandira',
    'juquitiba',
    'mairipora',
    'maua',
    'mogi das cruzes',
    'osasco',
    'poa',
    'ribeirao pires',
    'rio grande da serra',
    'salesopolis',
    'santa isabel',
    'santa barbara do oeste',
    'santo andre',
    'santana de parnaiba',
    'sao bernardo do campo',
    'sao caetano do sul',
    'sao lourenco da serra',
    'sumare',
    'suzano',
    'taboao da serra',
    'vargem grande paulista',
    'varzea paulista',
  ].map((x) => norm(x))
)

function isCapitalMunicipioSaoPaulo(cidadeNorm: string): boolean {
  if (!cidadeNorm) return false
  if (cidadeNorm === 'sao paulo' || cidadeNorm === 's.paulo' || cidadeNorm === 'sp capital') return true
  // Evita "São Vicente", "São José dos Campos" como capital
  if (!cidadeNorm.startsWith('sao paulo')) return false
  const rest = cidadeNorm.slice('sao paulo'.length).trim()
  return rest === '' || rest.startsWith('-') || rest.startsWith('/')
}

const BAIRROS_CENTRO = [
  'bela vista',
  'bom retiro',
  'bras',
  'cambuci',
  'caninde',
  'consolacao',
  'liberdade',
  'republica',
  'santa cecilia',
  'santa ifigenia',
  'se',
  'centro',
  'higienopolis',
  'pacaembu',
  'vila buarque',
]

const BAIRROS_NORTE = [
  'santana',
  'tucuruvi',
  'vila maria',
  'vila guilherme',
  'vila medeiros',
  'casa verde',
  'limao',
  'mandaqui',
  'tremembe',
  'jaçana',
  'jaçanã',
  'vila nova cachoeirinha',
  'cachoeirinha',
  'vila sabrina',
  'vila albertina',
  'vila gustavo',
  'vila isabel',
]

const BAIRROS_SUL = [
  'ipiranga',
  'moema',
  'vila mariana',
  'santo amaro',
  'campo limpo',
  'capao redondo',
  'jabaquara',
  'socorro',
  'cidade dutra',
  'grajau',
  'pedreira',
  'sacomã',
  'm boi mirim',
  'jardim angela',
  'campo belo',
  'brooklin',
  'vila olimpia',
  'itaim bibi',
]

const BAIRROS_LESTE = [
  'tatuape',
  'itaquera',
  'penha',
  'mooca',
  'vila formosa',
  'sao mateus',
  'sapopemba',
  'cidade tiradentes',
  'ermelino matarazzo',
  'sao miguel',
  'guaianases',
  'cidade lider',
  'jardim helena',
  'vila curuca',
  'artur alvim',
]

const BAIRROS_OESTE = [
  'lapa',
  'butanta',
  'pinheiros',
  'perdizes',
  'alto de pinheiros',
  'jaguaré',
  'jaguare',
  'rio pequeno',
  'vila leopoldina',
  'barra funda',
  'aguas claras',
]

/**
 * Resolve a zona para plotagem no mapa de SP.
 * Usa UF, município e, quando existir, bairro do cadastro.
 */
export function resolverZonaSpCarteira(input: {
  estado: string | null | undefined
  cidade: string | null | undefined
  bairro?: string | null | undefined
}): ZonaSpCarteira {
  const uf = resolverUfSigla(input.estado)
  if (uf !== 'SP') return 'fora_sp'

  const cidadeNorm = norm(input.cidade)
  const bairroNorm = norm(input.bairro)

  if (GRANDE_SP_CIDADES.has(cidadeNorm)) return 'grande_sp'

  if (isCapitalMunicipioSaoPaulo(cidadeNorm)) {
    if (bairroNorm) {
      if (bairroCoincide(bairroNorm, BAIRROS_LESTE)) return 'zona_leste'
      if (bairroCoincide(bairroNorm, BAIRROS_SUL)) return 'zona_sul'
      if (bairroCoincide(bairroNorm, BAIRROS_NORTE)) return 'zona_norte'
      if (bairroCoincide(bairroNorm, BAIRROS_OESTE)) return 'zona_oeste'
      if (bairroCoincide(bairroNorm, BAIRROS_CENTRO)) return 'centro'
    }
    return 'indefinido'
  }

  if (cidadeNorm) return 'interior_sp'
  return 'indefinido'
}

export function contagensZonaSpInicial(): Record<ZonaSpCarteira, number> {
  const o = {} as Record<ZonaSpCarteira, number>
  for (const z of ZONAS_SP_MAPA_ORDEM) o[z] = 0
  return o
}

export function acumularContagensZonaSp(
  acc: Record<ZonaSpCarteira, number>,
  zona: ZonaSpCarteira
): void {
  acc[zona] = (acc[zona] ?? 0) + 1
}
