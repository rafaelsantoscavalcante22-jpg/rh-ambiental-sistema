/**
 * Resolver qual coleta está ativa a partir de ?coleta= | ?mtr= | ?programacao= | ?cliente=.
 * Usado em várias telas do seguimento da coleta — uma única implementação.
 */

export type ColetaComIdsContexto = {
  id: string
  mtr_id: string | null
  programacao_id: string | null
  cliente_id: string | null
}

export type IdsContextoUrl = {
  coleta: string | null
  mtr: string | null
  programacao: string | null
  cliente: string | null
}

export function idsContextoFromSearchParams(searchParams: URLSearchParams): IdsContextoUrl {
  return {
    coleta: searchParams.get('coleta'),
    mtr: searchParams.get('mtr'),
    programacao: searchParams.get('programacao'),
    cliente: searchParams.get('cliente'),
  }
}

export function resolverColetaPorContextoUrl<T extends ColetaComIdsContexto>(
  lista: T[],
  ids: IdsContextoUrl
): T | null {
  if (ids.coleta) {
    const c = lista.find((x) => x.id === ids.coleta)
    if (c) return c
  }
  if (ids.mtr) {
    const c = lista.find((x) => x.mtr_id === ids.mtr)
    if (c) return c
  }
  if (ids.programacao) {
    const c = lista.find((x) => x.programacao_id === ids.programacao)
    if (c) return c
  }
  if (ids.cliente) {
    const c = lista.find((x) => x.cliente_id === ids.cliente)
    if (c) return c
  }
  return null
}
