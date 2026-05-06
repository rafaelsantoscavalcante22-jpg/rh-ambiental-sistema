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
  { path: '/caminhoes', label: 'Caminhões' },
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
  paginas_permitidas?: string[] | null
}

function normalizarPath(pathname: string): string {
  if (!pathname) return '/'
  const p = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname
  return p || '/'
}

/**
 * Quando `paginas_permitidas` é null ou vazio → não há filtro extra (mantém-se a regra por cargo nas rotas).
 * Quando tem entradas → o utilizador só acede a esses prefixos de rota.
 * Dois e-mails de gestão ignoram a lista (nunca ficam bloqueados por engano).
 */
export function usuarioPodeAcessarRota(usuario: UsuarioComPaginas, pathname: string): boolean {
  const path = normalizarPath(pathname)
  const bem = normalizarPath(ROTA_BEM_VINDO)
  if (path === bem || path.startsWith(`${bem}/`)) return true

  const em = (usuario.email || '').trim().toLowerCase()
  if (EMAILS_BYPASS_PAGINAS.has(em)) return true

  const raw = usuario.paginas_permitidas
  if (raw == null || raw.length === 0) return true

  return raw.some((prefix) => {
    const pre = normalizarPath(prefix)
    return path === pre || path.startsWith(`${pre}/`)
  })
}

export function labelParaPath(path: string): string {
  return ROTAS_SISTEMA.find((r) => r.path === path)?.label ?? path
}

/** Primeira rota operacional a que o utilizador tem acesso (para CTAs na página inicial). */
export function primeiraRotaOperacionalPermitida(usuario: UsuarioComPaginas): string | null {
  for (const { path } of ROTAS_SISTEMA) {
    if (usuarioPodeAcessarRota(usuario, path)) return path
  }
  return null
}
