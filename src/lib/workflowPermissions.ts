/**
 * Permissões por cargo alinhadas ao fluxo operacional RG Ambiental.
 * Usado nas telas para desabilitar mutações; a fonte da verdade para políticas finas continua sendo o RLS no Supabase.
 */

export function normalizarTextoCargo(s: string | null | undefined): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function cargoEhAdministrador(cargo: string | null | undefined): boolean {
  return normalizarTextoCargo(cargo).includes('administrador')
}

export function cargoEhDesenvolvedor(cargo: string | null | undefined): boolean {
  return normalizarTextoCargo(cargo).includes('desenvolvedor')
}

/** Criar / excluir utilizadores — só Administrador e Desenvolvedor (perfil master). */
export function cargoEhAdministradorOuDesenvolvedor(cargo: string | null | undefined): boolean {
  return cargoEhAdministrador(cargo) || cargoEhDesenvolvedor(cargo)
}

/**
 * Acesso de rotas e mutações ao nível de «Administrador» no app, incluindo Financeiro
 * (regra de negócio: Financeiro com o mesmo acesso que Administrador nas áreas de negócio).
 */
export function cargoTemAcessoTipoAdministradorApp(cargo: string | null | undefined): boolean {
  if (cargoEhAdministrador(cargo)) return true
  if (cargoEhDesenvolvedor(cargo)) return true
  const c = normalizarTextoCargo(cargo)
  if (c.includes('financeiro') && !c.includes('operacional')) return true
  return false
}

/** Logística não pode eliminar registos em lado nenhum. */
function cargoProibidoExcluirRegistos(cargo: string | null | undefined): boolean {
  return normalizarTextoCargo(cargo).includes('logistica')
}

export function cargoEhVisualizador(cargo: string | null | undefined): boolean {
  return normalizarTextoCargo(cargo).includes('visualizador')
}

export function cargoEhDiretoria(cargo: string | null | undefined): boolean {
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  return c.includes('diretoria') || c.includes('diretor')
}

/**
 * Painel executivo (home tipo BI) — Diretoria e Administrador.
 * Outros perfis mantêm o dashboard operacional padrão.
 */
export function cargoPodeVerDashboardExecutivo(cargo: string | null | undefined): boolean {
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  return cargoEhDiretoria(cargo)
}

/** Programação: criação de agenda e vínculo ao fluxo — Operacional + Admin. */
export function cargoPodeMutarProgramacao(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  // Sem cargo na tabela usuários: não bloquear a UI (RLS no Supabase continua sendo a barreira real).
  if (!c) return true
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  return c.includes('operacional') || c.includes('logistica')
}

/** MTR / documentação — Operacional + Admin. */
export function cargoPodeMutarMtr(cargo: string | null | undefined): boolean {
  return cargoPodeMutarProgramacao(cargo)
}

/** Lançamento de pesagem — balanceiro, operacional, logística e admin (visualizador só lê). */
export function cargoPodeMutarControleMassa(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return true
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  return (
    c.includes('balanceiro') ||
    c.includes('pesagem') ||
    c.includes('operacional') ||
    c.includes('logistica')
  )
}

/** Conferência operacional (documentos / dados após pesagem) — Operacional + Admin. */
export function cargoPodeMutarConferenciaOperacional(cargo: string | null | undefined): boolean {
  return cargoPodeMutarMtr(cargo)
}

/** Checklist de transporte — motorista, operacional, logística e admin (não visualizador). */
export function cargoPodeMutarChecklistTransporte(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  return (
    c.includes('motorista') ||
    c.includes('operacional') ||
    c.includes('logistica')
  )
}

/**
 * Ticket operacional e envio à aprovação — mesmo universo do Controle de Massa
 * (balanceiro / pesagem / logística / operacional / admin), para não bloquear após a pesagem.
 */
export function cargoPodeMutarTicketOperacional(cargo: string | null | undefined): boolean {
  return cargoPodeMutarControleMassa(cargo)
}

/** Decisão da diretoria na etapa ENVIADO_APROVACAO. */
export function cargoPodeMutarAprovacaoDiretoria(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  return cargoEhDiretoria(cargo)
}

/**
 * Comprovante de descarte — documentação pós-pesagem (operacional / pesagem / faturamento).
 */
export function cargoPodeMutarComprovanteDescarte(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return true
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  return (
    c.includes('operacional') ||
    c.includes('logistica') ||
    c.includes('balanceiro') ||
    c.includes('pesagem') ||
    c.includes('faturamento') ||
    c.includes('financeiro') ||
    cargoEhDiretoria(cargo)
  )
}

/** Registo de faturamento (camada antes do financeiro). */
export function cargoPodeMutarFaturamentoFluxo(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  return (
    c.includes('faturamento') ||
    c.includes('financeiro') ||
    cargoEhDiretoria(cargo)
  )
}

/** Alterar valor da conta após faturamento (travado) — só Administrador e Desenvolvedor. */
export function cargoPodeAlterarValorContaTravada(cargo: string | null | undefined): boolean {
  return cargoEhAdministradorOuDesenvolvedor(cargo)
}

/**
 * Gestão de usuários — quem pode editar nome, cargo, status, página e senha.
 * Administrador e Diretoria, conforme regra de negócio acordada.
 * Criar e excluir continua sendo somente Administrador (`cargoPodeCriarOuExcluirUsuario`).
 */
export function cargoPodeGerirUsuarios(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  if (cargoEhDiretoria(cargo)) return true
  return false
}

/** Criar ou excluir usuário — Administrador e Desenvolvedor (não Financeiro). */
export function cargoPodeCriarOuExcluirUsuario(cargo: string | null | undefined): boolean {
  return cargoEhAdministradorOuDesenvolvedor(cargo)
}

/** Alterar o cargo de outro usuário — Administrador e Diretoria. */
export const cargoPodeAlterarCargoDeUsuario = cargoPodeGerirUsuarios

/** Cobrança / pagamento na tela Financeiro — alinhado ao RLS (financeiro, faturamento, diretoria, admin). */
export function cargoPodeMutarFinanceiro(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoTemAcessoTipoAdministradorApp(cargo)) return true
  if (cargoEhDiretoria(cargo)) return true
  if (c.includes('faturamento')) return true
  if (c.includes('operacional')) return false
  return c === 'financeiro' || (c.includes('financeiro') && !c.includes('operacional'))
}

// ---------------------------------------------------------------------------
// Fase 5 — permissões por ação (wrappers sem espalhar regra pela UI)
// ---------------------------------------------------------------------------

export const cargoPodeCriarProgramacao = cargoPodeMutarProgramacao
export const cargoPodeEditarProgramacao = cargoPodeMutarProgramacao
export function cargoPodeExcluirProgramacao(cargo: string | null | undefined): boolean {
  return cargoPodeMutarProgramacao(cargo) && !cargoProibidoExcluirRegistos(cargo)
}

export const cargoPodeCriarMtr = cargoPodeMutarMtr
export const cargoPodeEditarMtr = cargoPodeMutarMtr
export function cargoPodeExcluirMtr(cargo: string | null | undefined): boolean {
  return cargoPodeMutarMtr(cargo) && !cargoProibidoExcluirRegistos(cargo)
}

export const cargoPodeLancarPesagem = cargoPodeMutarControleMassa

export const cargoPodeEmitirFaturamento = cargoPodeMutarFaturamentoFluxo
export const cargoPodeCancelarFaturamento = cargoPodeMutarFaturamentoFluxo

export const cargoPodeEditarCobranca = cargoPodeMutarFinanceiro
export const cargoPodeMarcarPagamento = cargoPodeMutarFinanceiro

export const cargoPodeEditarChecklistTransporte = cargoPodeMutarChecklistTransporte
export const cargoPodeEditarTicketOperacional = cargoPodeMutarTicketOperacional
export const cargoPodeDecidirAprovacaoDiretoria = cargoPodeMutarAprovacaoDiretoria
