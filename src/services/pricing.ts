/**
 * Prioridade 2–3: sugestão de valor por regras (peso, resíduo, cliente, componentes).
 * Sem regra aplicável ou total 0 → o ecrã mantém faturamento manual (comportamento existente).
 */

export type RegraPrecoRow = {
  id: string
  cliente_id?: string | null
  tipo_residuo?: string | null
  tipo_servico?: string | null
  valor_por_kg?: number | string | null
  valor_minimo?: number | string | null
  valor_fixo?: number | string | null
  valor_transporte_por_kg?: number | string | null
  valor_tratamento_por_kg?: number | string | null
  taxa_adicional_fixa?: number | string | null
  ativo?: boolean | null
  updated_at?: string | null
}

export type PrecoResumoOrigem =
  | 'regra_cliente_residuo'
  | 'regra_cliente'
  | 'regra_geral_residuo'
  | 'regra_geral'
  | 'nenhuma'

export type PrecoBreakdownLinha = { chave: string; rotulo: string; valor: number }

export type ResultadoPrecoSugerido = {
  total: number
  linhas: PrecoBreakdownLinha[]
  regraId: string | null
  origem: PrecoResumoOrigem
}

function n(v: unknown): number {
  if (v == null || v === '') return 0
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function residuoWildcard(tipoResiduoRegra: string | null | undefined): boolean {
  const t = (tipoResiduoRegra ?? '').trim()
  return !t || t === '*'
}

function origemPorEspecificidade(spec: number): PrecoResumoOrigem {
  if (spec >= 4) return 'regra_cliente_residuo'
  if (spec === 3) return 'regra_cliente'
  if (spec === 2) return 'regra_geral_residuo'
  if (spec === 1) return 'regra_geral'
  return 'nenhuma'
}

/** 0 = não aplica a este cliente/resíduo. */
export function especificidadeRegra(
  rule: RegraPrecoRow,
  clienteId: string | null | undefined,
  tipoResiduo: string | null | undefined
): number {
  const cid = clienteId ?? null
  if (rule.cliente_id != null && rule.cliente_id !== cid) return 0

  const rColeta = (tipoResiduo ?? '').trim().toLowerCase()
  const rRegra = (rule.tipo_residuo ?? '').trim()
  const wild = residuoWildcard(rRegra)
  const exact = !wild && rRegra.toLowerCase() === rColeta

  const hasClient = !!rule.cliente_id
  if (hasClient && exact) return 4
  if (hasClient && wild) return 3
  if (!hasClient && exact) return 2
  if (!hasClient && wild) return 1
  return 0
}

function tsCompat(rule: RegraPrecoRow, tipoServico: string): boolean {
  const rs = (rule.tipo_servico ?? 'COLETA').trim() || 'COLETA'
  const ts = (tipoServico || 'COLETA').trim() || 'COLETA'
  return rs === ts
}

/** Escolhe a regra mais específica; empate por `updated_at` mais recente. */
export function selecionarRegraPreco(
  regras: RegraPrecoRow[],
  clienteId: string | null | undefined,
  tipoResiduo: string | null | undefined,
  tipoServico = 'COLETA'
): { regra: RegraPrecoRow; especificidade: number; origem: PrecoResumoOrigem } | null {
  const candidatos = regras
    .filter((r) => r.ativo !== false)
    .filter((r) => tsCompat(r, tipoServico))
    .map((r) => {
      const spec = especificidadeRegra(r, clienteId, tipoResiduo)
      return { regra: r, especificidade: spec, origem: origemPorEspecificidade(spec) }
    })
    .filter((x) => x.especificidade > 0)

  if (candidatos.length === 0) return null

  candidatos.sort((a, b) => {
    if (b.especificidade !== a.especificidade) return b.especificidade - a.especificidade
    const ta = new Date(a.regra.updated_at ?? 0).getTime()
    const tb = new Date(b.regra.updated_at ?? 0).getTime()
    return tb - ta
  })

  const top = candidatos[0]!
  return { regra: top.regra, especificidade: top.especificidade, origem: top.origem }
}

export function calcularPrecoDaRegra(regra: RegraPrecoRow, pesoLiquido: number | null | undefined): ResultadoPrecoSugerido {
  const peso = n(pesoLiquido)
  const linhas: PrecoBreakdownLinha[] = []
  let soma = 0

  const vt = n(regra.valor_transporte_por_kg)
  const vtr = n(regra.valor_tratamento_por_kg)
  const vkg = n(regra.valor_por_kg)
  const taxa = n(regra.taxa_adicional_fixa)
  const fixo = n(regra.valor_fixo)

  if (peso > 0 && vt > 0) {
    const v = peso * vt
    linhas.push({ chave: 'transporte', rotulo: 'Transporte', valor: v })
    soma += v
  }
  if (peso > 0 && vtr > 0) {
    const v = peso * vtr
    linhas.push({ chave: 'tratamento', rotulo: 'Tratamento', valor: v })
    soma += v
  }
  if (peso > 0 && vkg > 0) {
    const v = peso * vkg
    const rotulo = vt > 0 || vtr > 0 ? 'Serviço / outros (por kg)' : 'Valor por kg'
    linhas.push({ chave: 'por_kg', rotulo, valor: v })
    soma += v
  }
  if (taxa > 0) {
    linhas.push({ chave: 'taxa', rotulo: 'Taxa adicional', valor: taxa })
    soma += taxa
  }
  if (fixo > 0) {
    linhas.push({ chave: 'fixo', rotulo: 'Valor fixo', valor: fixo })
    soma += fixo
  }

  const minimo = n(regra.valor_minimo)
  let total = soma
  if (minimo > 0 && total < minimo) {
    linhas.push({ chave: 'minimo', rotulo: 'Ajuste ao valor mínimo', valor: minimo - total })
    total = minimo
  }

  return {
    total,
    linhas,
    regraId: regra.id,
    origem: 'nenhuma',
  }
}

export function resolverPrecoSugerido(
  regras: RegraPrecoRow[],
  clienteId: string | null | undefined,
  tipoResiduo: string | null | undefined,
  pesoLiquido: number | null | undefined,
  tipoServico = 'COLETA'
): ResultadoPrecoSugerido {
  const escolha = selecionarRegraPreco(regras, clienteId, tipoResiduo, tipoServico)
  if (!escolha) {
    return { total: 0, linhas: [], regraId: null, origem: 'nenhuma' }
  }
  const calc = calcularPrecoDaRegra(escolha.regra, pesoLiquido)
  return {
    ...calc,
    origem: escolha.origem,
    regraId: escolha.regra.id,
  }
}

export function rotuloOrigemPreco(o: PrecoResumoOrigem): string {
  switch (o) {
    case 'regra_cliente_residuo':
      return 'Regra: cliente + resíduo'
    case 'regra_cliente':
      return 'Regra: cliente'
    case 'regra_geral_residuo':
      return 'Regra: resíduo (geral)'
    case 'regra_geral':
      return 'Regra geral'
    default:
      return 'Manual'
  }
}
