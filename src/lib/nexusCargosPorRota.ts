/**
 * Cargos permitidos por rota — fonte única para `App-NEXUS.tsx` e `paginasSistema.ts` (menu).
 * Regras de negócio (resumo):
 * - Desenvolvedor / Administrador / Financeiro: acesso total às rotas de negócio.
 * - Operacional: sem Faturamento, Financeiro, Pós-venda, Usuários.
 * - Logística: apenas o fluxo operacional do menu (sem Cadastros, Dashboard, checklist, ticket, aprovação, etc.).
 * - Comercial: apenas Cadastros + Pós-venda.
 */

export const CARGO_NEXUS = {
  desenvolvedor: 'Desenvolvedor',
  administrador: 'Administrador',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  logistica: 'Logística',
  balanceiro: 'Balanceiro',
  diretoria: 'Diretoria',
  faturamento: 'Faturamento',
  comercial: 'Comercial',
  visualizador: 'Visualizador',
} as const

const C = CARGO_NEXUS

const ACESSO_TOTAL = [C.desenvolvedor, C.administrador, C.financeiro] as const

/** Visão geral: sem Comercial nem Logística (fluxo/cadastro fora do perfil). */
const DASHBOARD_E_CHAT = [
  ...ACESSO_TOTAL,
  C.operacional,
  C.balanceiro,
  C.diretoria,
  C.faturamento,
  C.visualizador,
] as const

/** Cadastros (sem Logística; Comercial incluído). */
const CADASTRO = [
  ...ACESSO_TOTAL,
  C.operacional,
  C.balanceiro,
  C.diretoria,
  C.faturamento,
  C.visualizador,
  C.comercial,
] as const

/** Pós-venda: Operacional não acede. */
const POS_VENDA = [
  ...ACESSO_TOTAL,
  C.balanceiro,
  C.diretoria,
  C.faturamento,
  C.visualizador,
  C.comercial,
] as const

const PROGRAMACAO_MTR = [...ACESSO_TOTAL, C.operacional, C.logistica, C.visualizador] as const

const CONTROLE_MASSA = [
  ...ACESSO_TOTAL,
  C.operacional,
  C.logistica,
  C.balanceiro,
  C.diretoria,
  C.faturamento,
  C.visualizador,
] as const

/** Comprovante e conferência: incluem Logística (itens do menu «Fluxo operacional»). */
const FLUXO_COM_LOGISTICA = [
  ...ACESSO_TOTAL,
  C.operacional,
  C.logistica,
  C.balanceiro,
  C.diretoria,
  C.faturamento,
  C.visualizador,
] as const

/** Checklist, ticket, aprovação: Logística não acede (fora do conjunto restrito). */
const FLUXO_SEM_LOGISTICA = [
  ...ACESSO_TOTAL,
  C.operacional,
  C.balanceiro,
  C.diretoria,
  C.faturamento,
  C.visualizador,
] as const

const FATURAMENTO = [...ACESSO_TOTAL, C.balanceiro, C.diretoria, C.faturamento, C.visualizador] as const

const FINANCEIRO = [...ACESSO_TOTAL, C.diretoria, C.faturamento, C.visualizador] as const

const ENVIO_NF = [...ACESSO_TOTAL, C.faturamento, C.visualizador] as const

const USUARIOS = [...ACESSO_TOTAL, C.diretoria] as const

export const NEXUS_CARGOS_POR_ROTA: Record<string, readonly string[]> = {
  '/dashboard': [...DASHBOARD_E_CHAT],
  '/clientes': [...CADASTRO],
  '/motoristas': [...CADASTRO],
  '/caminhoes': [...CADASTRO],
  '/representantes-rg': [...CADASTRO],
  '/pos-venda': [...POS_VENDA],
  '/programacao': [...PROGRAMACAO_MTR],
  '/mtr': [...PROGRAMACAO_MTR],
  '/controle-massa': [...CONTROLE_MASSA],
  '/comprovantes-descarte': [...FLUXO_COM_LOGISTICA],
  '/checklist-transporte': [...FLUXO_SEM_LOGISTICA],
  '/conferencia-transporte': [...FLUXO_COM_LOGISTICA],
  '/ticket-operacional': [...FLUXO_SEM_LOGISTICA],
  '/aprovacao': [...FLUXO_SEM_LOGISTICA],
  '/faturamento': [...FATURAMENTO],
  '/faturamento/regras-preco': [...FATURAMENTO],
  '/financeiro': [...FINANCEIRO],
  '/financeiro/contas-receber': [...FINANCEIRO],
  '/financeiro/contas-pagar': [...FINANCEIRO],
  '/envio-nf': [...ENVIO_NF],
  '/usuarios': [...USUARIOS],
  '/chat': [...DASHBOARD_E_CHAT],
}
