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

export function cargoEhVisualizador(cargo: string | null | undefined): boolean {
  return normalizarTextoCargo(cargo).includes('visualizador')
}

/**
 * Painel executivo (home tipo BI) — Diretoria e Administrador.
 * Outros perfis mantêm o dashboard operacional padrão.
 */
export function cargoPodeVerDashboardExecutivo(cargo: string | null | undefined): boolean {
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoEhAdministrador(cargo)) return true
  return c.includes('diretoria') || c.includes('diretor')
}

/** Programação: criação de agenda e vínculo ao fluxo — Operacional + Admin. */
export function cargoPodeMutarProgramacao(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  // Sem cargo na tabela usuários: não bloquear a UI (RLS no Supabase continua sendo a barreira real).
  if (!c) return true
  if (cargoEhAdministrador(cargo)) return true
  return c.includes('operacional')
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
  if (cargoEhAdministrador(cargo)) return true
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
  if (cargoEhAdministrador(cargo)) return true
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
  if (cargoEhAdministrador(cargo)) return true
  return c.includes('diretoria')
}

/** Registo de faturamento (camada antes do financeiro). */
export function cargoPodeMutarFaturamentoFluxo(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoEhAdministrador(cargo)) return true
  return (
    c.includes('faturamento') ||
    c.includes('financeiro') ||
    c.includes('diretoria')
  )
}

/** Cobrança / pagamento na tela Financeiro — Financeiro + Admin. */
export function cargoPodeMutarFinanceiro(cargo: string | null | undefined): boolean {
  if (cargoEhVisualizador(cargo)) return false
  const c = normalizarTextoCargo(cargo)
  if (!c) return false
  if (cargoEhAdministrador(cargo)) return true
  if (c.includes('operacional')) return false
  return c === 'financeiro' || (c.includes('financeiro') && !c.includes('operacional'))
}
