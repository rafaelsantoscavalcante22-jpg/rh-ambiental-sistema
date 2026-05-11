/** Normalização alinhada a `src/lib/workflowPermissions.ts` (acentos / caixa). */
export function normalizarCargoServidor(cargo: string | null | undefined): string {
  return String(cargo ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function perfilPodeCriarOuExcluirUsuarios(cargo: string | null | undefined): boolean {
  const c = normalizarCargoServidor(cargo)
  return c.includes('administrador') || c.includes('desenvolvedor')
}

export function perfilPodeEditarUsuarios(cargo: string | null | undefined): boolean {
  const c = normalizarCargoServidor(cargo)
  if (c.includes('desenvolvedor') || c.includes('administrador')) return true
  if (c.includes('diretoria') || c.includes('diretor')) return true
  if (c.includes('financeiro') && !c.includes('operacional')) return true
  return false
}
