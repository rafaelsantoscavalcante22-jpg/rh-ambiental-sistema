import { indiceEtapaFluxo, type EtapaFluxo } from './fluxoEtapas'

export type PendenciaSetorKey = 'operacional' | 'logistica' | 'massa' | 'faturamento' | 'financeiro'

export type PendenciaItemBase = {
  id: string
  numero: string
  cliente: string
  clienteId?: string
  programacaoId?: string
  mtrId?: string
  etapaCodigo: EtapaFluxo
  dataAgendada?: string
  createdAt?: string
  pesoLiquido?: string
  liberadoFinanceiro?: boolean
  statusPagamento?: string
  dataVencimento?: string
}

export type PendenciaItem = PendenciaItemBase & {
  setor: PendenciaSetorKey
  titulo: string
  detalhe?: string
  destino: 'programacao' | 'mtr' | 'controle-massa' | 'faturamento' | 'financeiro'
  highlight?: 'critico' | 'atencao'
}

function parseIsoDateToMs(iso?: string) {
  if (!iso) return Number.NaN
  const t = new Date(`${iso}T00:00:00`).getTime()
  return Number.isFinite(t) ? t : Number.NaN
}

function isVencido(dataVencimento?: string, statusPagamento?: string) {
  if (!dataVencimento) return false
  if ((statusPagamento || '').trim() === 'Pago') return false
  const hoje = new Date()
  const venc = new Date(`${dataVencimento}T23:59:59`)
  return venc.getTime() < hoje.getTime()
}

function ordenarPadrao(a: PendenciaItem, b: PendenciaItem) {
  const prio = (x: PendenciaItem) => (x.highlight === 'critico' ? 2 : x.highlight === 'atencao' ? 1 : 0)
  const pa = prio(a)
  const pb = prio(b)
  if (pa !== pb) return pb - pa

  const da = parseIsoDateToMs(a.dataAgendada) || parseIsoDateToMs(a.createdAt)
  const db = parseIsoDateToMs(b.dataAgendada) || parseIsoDateToMs(b.createdAt)
  if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db
  return String(a.numero).localeCompare(String(b.numero), 'pt-BR')
}

export function classificarPendenciasPorSetor(
  itens: PendenciaItemBase[]
): Record<PendenciaSetorKey, PendenciaItem[]> {
  const out: Record<PendenciaSetorKey, PendenciaItem[]> = {
    operacional: [],
    logistica: [],
    massa: [],
    faturamento: [],
    financeiro: [],
  }

  const iMtr = indiceEtapaFluxo('MTR_PREENCHIDA')
  const iLog = indiceEtapaFluxo('LOGISTICA_DESIGNADA')
  const iColeta = indiceEtapaFluxo('COLETA_REALIZADA')
  const iPesagem = indiceEtapaFluxo('CONTROLE_PESAGEM_LANCADO')
  const iTicket = indiceEtapaFluxo('TICKET_GERADO')
  const iFaturado = indiceEtapaFluxo('FATURADO')
  const iFinanceiro = indiceEtapaFluxo('ENVIADO_FINANCEIRO')

  for (const item of itens) {
    const i = indiceEtapaFluxo(item.etapaCodigo)
    const peso = Number(item.pesoLiquido || 0)
    const temPeso = Number.isFinite(peso) && peso > 0
    const vencido = isVencido(item.dataVencimento, item.statusPagamento)

    // Operacional: sem MTR / documentação inicial pendente
    if (i < iMtr || !(item.mtrId || '').trim()) {
      out.operacional.push({
        ...item,
        setor: 'operacional',
        titulo: 'MTR pendente',
        detalhe: 'Sem MTR vinculada ou fluxo antes de “MTR preenchida”.',
        destino: 'mtr',
        highlight: 'atencao',
      })
      continue
    }

    // Logística: designada → coleta (antes da pesagem)
    if (i >= iLog && i < iPesagem) {
      out.logistica.push({
        ...item,
        setor: 'logistica',
        titulo: 'Em operação',
        detalhe: 'Logística / coleta ainda não fechou a etapa de pesagem.',
        destino: 'controle-massa',
      })
      continue
    }

    // Controle de massa: coleta realizada (ou fluxo avançado) mas sem pesagem/peso
    if ((i >= iColeta && i < iPesagem) || (!temPeso && i >= iColeta && i < iTicket)) {
      out.massa.push({
        ...item,
        setor: 'massa',
        titulo: 'Aguardando pesagem',
        detalhe: 'Peso líquido ausente ou pesagem não lançada.',
        destino: 'controle-massa',
        highlight: !temPeso ? 'atencao' : undefined,
      })
      continue
    }

    // Faturamento: pronto (ticket) e ainda não faturado
    if (i >= iTicket && i < iFaturado) {
      out.faturamento.push({
        ...item,
        setor: 'faturamento',
        titulo: 'Pronta para faturar',
        detalhe: 'Ticket/Pesagem concluído · falta emitir faturamento.',
        destino: 'faturamento',
        highlight: 'atencao',
      })
      continue
    }

    // Financeiro: enviado ao financeiro e ainda não pago
    if (i >= iFinanceiro && (item.statusPagamento || '').trim() !== 'Pago') {
      out.financeiro.push({
        ...item,
        setor: 'financeiro',
        titulo: vencido ? 'Cobrança vencida' : 'Em aberto',
        detalhe: vencido ? 'Requer ação (vencido).' : 'Aguardando recebimento.',
        destino: 'financeiro',
        highlight: vencido ? 'critico' : 'atencao',
      })
      continue
    }
  }

  for (const k of Object.keys(out) as PendenciaSetorKey[]) {
    out[k].sort(ordenarPadrao)
  }
  return out
}

