/**
 * Página inicial de boas-vindas — sempre acessível (fora da lista `paginas_permitidas`).
 */
export const ROTA_BEM_VINDO = '/bem-vindo'

/**
 * Rotas configuráveis para restrição por utilizador (`usuarios.paginas_permitidas`).
 * Valores guardados na BD são os `path` (prefixo), alinhados com as rotas em App.tsx.
 */
export const ROTAS_SISTEMA: { path: string; label: string }[] = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/clientes', label: 'Clientes' },
  { path: '/motoristas', label: 'Motoristas' },
  { path: '/representantes-rg', label: 'Representante RG' },
  { path: '/caminhoes', label: 'Veículos' },
  { path: '/programacao', label: 'Programação' },
  { path: '/mtr', label: 'MTR' },
  { path: '/controle-massa', label: 'Pesagem e Ticket' },
  { path: '/comprovantes-descarte', label: 'Comprovante de Descarte' },
  { path: '/checklist-transporte', label: 'Checklist de transportes' },
  { path: '/conferencia-transporte', label: 'Conferência de transportes' },
  { path: '/ticket-operacional', label: 'Ticket operacional' },
  { path: '/aprovacao', label: 'Aprovação' },
  { path: '/faturamento', label: 'Faturamento' },
  { path: '/faturamento/regras-preco', label: 'Regras de preço' },
  { path: '/envio-nf', label: 'Envio de NF' },
  { path: '/financeiro', label: 'Financeiro' },
  { path: '/financeiro/contas-receber', label: 'Contas a receber' },
  { path: '/financeiro/contas-pagar', label: 'Contas a pagar' },
  { path: '/pos-venda', label: 'Pós-venda' },
  { path: '/usuarios', label: 'Usuários' },
  { path: '/chat', label: 'Chat' },
]

const ROTAS_VALIDAS = new Set(ROTAS_SISTEMA.map((r) => r.path))

export function pathEstaNaListaValida(path: string): boolean {
  return ROTAS_VALIDAS.has(path)
}

/** Contas que ignoram a lista de páginas (sempre incluídas). */
const EMAILS_BYPASS_PAGINAS_BASE = new Set([
  'cavalcantersc07@gmail.com',
  'gestores@rgambiental.com',
])

function parseEmailsBypassFromEnv(): string[] {
  const raw = String(import.meta.env.VITE_PAGINAS_BYPASS_EMAILS ?? '').trim()
  if (!raw) return []
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Base + opcional `VITE_PAGINAS_BYPASS_EMAILS` (lista separada por vírgula ou ponto e vírgula). */
const EMAILS_BYPASS_PAGINAS = (() => {
  const s = new Set(EMAILS_BYPASS_PAGINAS_BASE)
  for (const em of parseEmailsBypassFromEnv()) {
    s.add(em)
  }
  return s
})()

export function emailPodeDefinirPaginasPorUsuario(email: string | null | undefined): boolean {
  const em = (email || '').trim().toLowerCase()
  return EMAILS_BYPASS_PAGINAS.has(em)
}

export type UsuarioComPaginas = {
  email?: string | null
  cargo?: string | null
  paginas_permitidas?: string[] | null
}

function cargoEhVisualizadorLocal(cargo: string | null | undefined): boolean {
  return String(cargo ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .includes('visualizador')
}

export function normalizarPath(pathname: string): string {
  if (!pathname) return '/'
  const p = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname
  return p || '/'
}

/** Garante `/` inicial para valores vindos da BD ou de importações. */
function normalizarPrefixoPaginaGuardada(p: string): string {
  const t = String(p).trim()
  if (!t) return '/'
  const comSlash = t.startsWith('/') ? t : `/${t.replace(/^\/+/, '')}`
  return normalizarPath(comSlash)
}

/**
 * Converte `paginas_permitidas` (prefixos ou paths exatos) nos paths canónicos de `ROTAS_SISTEMA`
 * usados nos checkboxes (inclui filhos de um prefixo, ex.: `/financeiro` → contas a pagar/receber).
 */
export function rotasCheckboxDesdePaginasGuardadas(paginas: string[] | null | undefined): string[] {
  if (!paginas?.length) return []
  const prefixes = [
    ...new Set(paginas.map((p) => normalizarPrefixoPaginaGuardada(p)).filter((p) => p !== '/')),
  ]
  const out = new Set<string>()
  for (const pre of prefixes) {
    if (ROTAS_VALIDAS.has(pre)) out.add(pre)
  }
  for (const { path } of ROTAS_SISTEMA) {
    const pathN = normalizarPath(path)
    if (prefixes.some((pre) => pathN === pre || pathN.startsWith(`${pre}/`))) {
      out.add(path)
    }
  }
  return Array.from(out)
}

/** Igual a `ROLES_SEGUIMENTO_COLETA` em App-NEXUS.tsx (fluxo de coleta / faturamento). */
const R_SEGUIMENTO_COLETA = [
  'Administrador',
  'Operacional',
  'Logística',
  'Balanceiro',
  'Diretoria',
  'Faturamento',
  'Financeiro',
  'Visualizador',
] as const

const R_CADASTRO_E_DASHBOARD = [
  'Administrador',
  'Operacional',
  'Logística',
  'Balanceiro',
  'Diretoria',
  'Faturamento',
  'Financeiro',
  'Visualizador',
] as const

/**
 * Cargos autorizados por prefixo de rota — espelha `allowedRoles` em App-NEXUS.tsx.
 * O menu lateral deve filtrar com `cargoPodeAcessarRotaMenu` para não mostrar links que o utilizador
 * não consegue abrir (ex.: Operacional não vê Financeiro mesmo com `paginas_permitidas` vazio).
 */
const CARGOS_POR_PREFIXO_ROTA: Record<string, readonly string[]> = {
  '/dashboard': R_CADASTRO_E_DASHBOARD,
  '/clientes': R_CADASTRO_E_DASHBOARD,
  '/motoristas': R_CADASTRO_E_DASHBOARD,
  '/caminhoes': R_CADASTRO_E_DASHBOARD,
  '/pos-venda': R_CADASTRO_E_DASHBOARD,
  '/chat': R_CADASTRO_E_DASHBOARD,
  '/representantes-rg': [
    'Administrador',
    'Operacional',
    'Logística',
    'Balanceiro',
    'Diretoria',
    'Faturamento',
    'Financeiro',
    'Comercial',
    'Visualizador',
  ],
  '/programacao': ['Administrador', 'Operacional', 'Visualizador'],
  '/mtr': ['Administrador', 'Operacional', 'Visualizador'],
  '/controle-massa': ['Administrador', 'Operacional', 'Logística', 'Balanceiro', 'Visualizador'],
  '/comprovantes-descarte': R_SEGUIMENTO_COLETA,
  '/checklist-transporte': R_SEGUIMENTO_COLETA,
  '/conferencia-transporte': R_SEGUIMENTO_COLETA,
  '/ticket-operacional': R_SEGUIMENTO_COLETA,
  '/aprovacao': R_SEGUIMENTO_COLETA,
  '/faturamento': R_SEGUIMENTO_COLETA,
  '/faturamento/regras-preco': R_SEGUIMENTO_COLETA,
  '/envio-nf': ['Administrador', 'Financeiro', 'Faturamento', 'Visualizador'],
  '/financeiro': ['Administrador', 'Diretoria', 'Financeiro', 'Faturamento', 'Visualizador'],
  '/financeiro/contas-receber': ['Administrador', 'Diretoria', 'Financeiro', 'Faturamento', 'Visualizador'],
  '/financeiro/contas-pagar': ['Administrador', 'Diretoria', 'Financeiro', 'Faturamento', 'Visualizador'],
  '/usuarios': ['Administrador', 'Diretoria'],
}

const PREFIXOS_ROTA_PARA_CARGO = Object.keys(CARGOS_POR_PREFIXO_ROTA).sort(
  (a, b) => normalizarPath(b).length - normalizarPath(a).length
)

/**
 * Indica se o cargo pode aceder à rota segundo as regras do `App` (menu e CTAs).
 * Prefixo mais longo ganha (ex.: `/financeiro/contas-receber` antes de `/financeiro`).
 */
export function cargoPodeAcessarRotaMenu(cargo: string | null | undefined, pathname: string): boolean {
  const c = String(cargo ?? '').trim()
  if (!c) return false
  const path = normalizarPath(pathname)
  for (const key of PREFIXOS_ROTA_PARA_CARGO) {
    const k = normalizarPath(key)
    if (path === k || path.startsWith(`${k}/`)) {
      const lista = CARGOS_POR_PREFIXO_ROTA[key]
      return lista.includes(c)
    }
  }
  return true
}

/** Rotas da checklist a que o cargo já pode aceder pelo menu (base para pré-marcação ao mudar para «lista»). */
export function rotasPermitidasPorCargoParaChecklist(cargo: string | null | undefined): Set<string> {
  const c = String(cargo ?? '').trim()
  const out = new Set<string>()
  for (const { path } of ROTAS_SISTEMA) {
    if (cargoPodeAcessarRotaMenu(c, path)) out.add(path)
  }
  return out
}

/**
 * Regras (alinhadas ao documento de cargos):
 * - Página `/bem-vindo` é sempre acessível.
 * - E-mails de gestão (bypass) ignoram qualquer restrição.
 * - Cargo `Visualizador` exige `paginas_permitidas` explícita; sem lista, só vê `/bem-vindo`.
 * - Demais cargos: lista vazia/nula = sem filtro extra por **lista de páginas** (o cargo continua a ser
 *   validado nas rotas em `App.tsx` e no menu com `cargoPodeAcessarRotaMenu`).
 *   Lista preenchida = só os prefixos listados.
 */
export function usuarioPodeAcessarRota(usuario: UsuarioComPaginas, pathname: string): boolean {
  const path = normalizarPath(pathname)
  const bem = normalizarPath(ROTA_BEM_VINDO)
  if (path === bem || path.startsWith(`${bem}/`)) return true

  const em = (usuario.email || '').trim().toLowerCase()
  if (EMAILS_BYPASS_PAGINAS.has(em)) return true

  const raw = usuario.paginas_permitidas
  const visualizador = cargoEhVisualizadorLocal(usuario.cargo)

  if (raw == null || raw.length === 0) {
    return !visualizador
  }

  return raw.some((prefix) => {
    const pre = normalizarPrefixoPaginaGuardada(String(prefix))
    return path === pre || path.startsWith(`${pre}/`)
  })
}

export function labelParaPath(path: string): string {
  return ROTAS_SISTEMA.find((r) => r.path === path)?.label ?? path
}

/** Primeira rota operacional a que o utilizador tem acesso (para CTAs na página inicial). */
export function primeiraRotaOperacionalPermitida(usuario: UsuarioComPaginas): string | null {
  for (const { path } of ROTAS_SISTEMA) {
    if (
      usuarioPodeAcessarRota(usuario, path) &&
      cargoPodeAcessarRotaMenu(usuario.cargo, path)
    ) {
      return path
    }
  }
  return null
}
