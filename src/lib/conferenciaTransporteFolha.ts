/**
 * Campos extra da «folha de conferência» RG (modelo papel), gravados em
 * `checklist_transporte.respostas` sob a chave reservada `_folha`.
 */

export const RESPOSTAS_JSON_FOLHA_KEY = '_folha' as const

export type LinhaRotaFolha = {
  cliente: string
  kmChegada: string
  horaEntrada: string
  horaSaida: string
}

export type FolhaConferenciaTransporte = {
  dataStr: string
  horarioSaidaRg: string
  horarioChegada: string
  nomeAjudante: string
  pedagio1: string
  pedagio2: string
  veiculo: string
  qtdCombustivel: string
  kmInicial: string
  kmFinal: string
  kmTotal: string
  rotas: LinhaRotaFolha[]
  /** Caixa «Avarias» do termo. */
  avarias: string
  /** Ticket operacional / numeração interna (ex.: a partir de 1340). */
  numeroTicket: string
}

export const ROTAS_CONFERENCIA_LINHAS = 5

export function folhaConferenciaVazia(): FolhaConferenciaTransporte {
  return {
    dataStr: '',
    horarioSaidaRg: '',
    horarioChegada: '',
    nomeAjudante: '',
    pedagio1: '',
    pedagio2: '',
    veiculo: '',
    qtdCombustivel: '',
    kmInicial: '',
    kmFinal: '',
    kmTotal: '',
    rotas: Array.from({ length: ROTAS_CONFERENCIA_LINHAS }, () => ({
      cliente: '',
      kmChegada: '',
      horaEntrada: '',
      horaSaida: '',
    })),
    avarias: '',
    numeroTicket: '',
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === 'object' && !Array.isArray(x)
}

function pickStr(r: Record<string, unknown>, k: string): string {
  const v = r[k]
  return typeof v === 'string' ? v.trim() : ''
}

export function mesclarFolhaConferenciaTransporte(
  rawFolha: unknown,
  fallbackAvariasObservacoes?: string | null
): FolhaConferenciaTransporte {
  const b = folhaConferenciaVazia()
  if (!isRecord(rawFolha)) {
    if (fallbackAvariasObservacoes?.trim()) b.avarias = fallbackAvariasObservacoes.trim()
    return b
  }
  const r = rawFolha
  b.dataStr = pickStr(r, 'dataStr') || b.dataStr
  b.horarioSaidaRg = pickStr(r, 'horarioSaidaRg')
  b.horarioChegada = pickStr(r, 'horarioChegada')
  b.nomeAjudante = pickStr(r, 'nomeAjudante')
  b.pedagio1 = pickStr(r, 'pedagio1')
  b.pedagio2 = pickStr(r, 'pedagio2')
  b.veiculo = pickStr(r, 'veiculo')
  b.qtdCombustivel = pickStr(r, 'qtdCombustivel')
  b.kmInicial = pickStr(r, 'kmInicial')
  b.kmFinal = pickStr(r, 'kmFinal')
  b.kmTotal = pickStr(r, 'kmTotal')
  b.avarias = pickStr(r, 'avarias')
  b.numeroTicket = pickStr(r, 'numeroTicket')

  if (Array.isArray(r.rotas)) {
    for (let i = 0; i < ROTAS_CONFERENCIA_LINHAS; i++) {
      const row = r.rotas[i]
      if (!isRecord(row)) continue
      b.rotas[i] = {
        cliente: String(row.cliente ?? '').trim(),
        kmChegada: String(row.kmChegada ?? '').trim(),
        horaEntrada: String(row.horaEntrada ?? '').trim(),
        horaSaida: String(row.horaSaida ?? '').trim(),
      }
    }
  }

  if (!b.avarias.trim() && fallbackAvariasObservacoes?.trim()) {
    b.avarias = fallbackAvariasObservacoes.trim()
  }
  return b
}

export function extrairFolhaBrutaDeRespostas(respostas: unknown): unknown {
  if (!isRecord(respostas)) return undefined
  return respostas[RESPOSTAS_JSON_FOLHA_KEY]
}

export function incorporarFolhaNasRespostas(
  respostasItens: Record<string, string>,
  folha: FolhaConferenciaTransporte
): Record<string, unknown> {
  return {
    ...respostasItens,
    [RESPOSTAS_JSON_FOLHA_KEY]: folha,
  }
}

export function folhaPrefillParaColeta(opts: {
  dataStr: string
  numeroTicket?: string
}): FolhaConferenciaTransporte {
  return {
    ...folhaConferenciaVazia(),
    dataStr: opts.dataStr,
    numeroTicket: (opts.numeroTicket ?? '').trim(),
  }
}
