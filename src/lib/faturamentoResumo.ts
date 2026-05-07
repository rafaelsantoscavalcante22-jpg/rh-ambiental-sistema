import {
  formatarEtapaParaUI,
  formatarFaseFluxoOficialParaUI,
  normalizarEtapaColeta,
} from './fluxoEtapas'

export type StatusPagamentoFinanceiro = 'Pendente' | 'Parcial' | 'Pago'

/** Linha de `vw_faturamento_resumo` (Supabase). */
export type FaturamentoResumoViewRow = {
  coleta_id: string
  numero: string
  numero_coleta: number | null
  cliente_id: string | null
  cliente_nome: string | null
  cliente_razao_social: string | null
  /** Margem de lucro alvo do cliente (%, da tabela clientes). */
  cliente_margem_lucro_percentual?: number | null
  data_agendada: string
  data_programacao: string | null
  data_execucao: string | null
  programacao_id: string | null
  programacao_numero: string | null
  programacao_observacoes: string | null
  mtr_id: string | null
  mtr_numero: string | null
  mtr_observacoes: string | null
  ticket_comprovante: string | null
  peso_tara: number | null
  peso_bruto: number | null
  peso_liquido: number | null
  motorista: string | null
  placa: string | null
  valor_coleta: number | null
  status_pagamento: string | null
  data_vencimento: string | null
  referencia_nf: string | null
  numero_nf_coleta: string | null
  faturamento_referencia_nf: string | null
  faturamento_registro_status: string | null
  faturamento_registro_valor: number | null
  confirmacao_recebimento: boolean | null
  fluxo_status: string | null
  etapa_operacional: string | null
  status_processo: string | null
  liberado_financeiro: boolean | null
  coleta_observacoes: string | null
  tipo_residuo: string
  cidade: string
  created_at: string
  ultima_aprovacao_decisao: string | null
  ultima_aprovacao_obs: string | null
  ultima_aprovacao_em: string | null
  conferencia_documentos_ok: boolean | null
  conferencia_operacional_obs: string | null
  conferencia_em: string | null
  status_conferencia: string | null
  pendencias_resumo: string | null
  /** SLA: coleta criada há >3 dias sem faturamento emitido / envio ao financeiro (view). */
  faturamento_sla_vencido?: boolean | null
  status_faturamento: string | null
  /** Preenchido quando existe linha em `contas_receber` (migração Fase 8). */
  conta_receber_nf_enviada_em?: string | null
  conta_receber_nf_envio_obs?: string | null
  conta_receber_valor_pago?: number | null
  conta_receber_valor_travado?: boolean | null
}

/**
 * Item da lista Financeiro — inclui snapshot operacional para conferência e detalhe.
 * Mantém compatibilidade com campos já usados em `Financeiro.tsx` (valor, NF, pagamento).
 */
export type FinanceiroListaItem = {
  id: string
  numero: string
  cliente: string
  dataAgendada: string
  tipoResiduo: string
  cidade: string
  /** Detalhe técnico (etapa canónica) para quem precisa do granular. */
  etapaOperacional: string
  /** Fase de negócio única em todo o sistema (Fase 1 — fluxo oficial). */
  faseFluxoOficial: string
  liberadoFinanceiro: boolean
  valorColeta: string
  statusPagamento: StatusPagamentoFinanceiro | ''
  dataVencimento: string
  pesoLiquido: string
  createdAt: string
  mtrId: string
  programacaoId: string
  clienteId: string
  numeroNf: string
  confirmacaoRecebimento: boolean
  statusConferencia: 'PRONTO_PARA_FATURAR' | 'PENDENTE'
  pendenciasResumo: string
  observacoesColeta: string
  mtrNumero: string
  programacaoNumero: string
  programacaoObs: string
  mtrObs: string
  ticketComprovante: string
  pesoTara: string
  pesoBruto: string
  motoristaSnap: string
  placaSnap: string
  ultimaAprovacaoDecisao: string
  ultimaAprovacaoObs: string
  conferenciaDocsOk: boolean | null
  conferenciaObs: string
  faturamentoRegStatus: string | null
  referenciaConsolidada: string
  dataExecucao: string
  dataProgramacao: string
  clienteRazaoSocial: string
  /** ISO timestamptz do último envio de NF registado na conta a receber. */
  nfEnviadaEm: string
  nfEnvioObs: string
  valorPago: string
  valorTravado: boolean
  contaReceberId: string
}

export function mapFaturamentoViewRow(row: FaturamentoResumoViewRow): FinanceiroListaItem {
  const etapa = normalizarEtapaColeta({
    fluxo_status: row.fluxo_status,
    etapa_operacional: row.etapa_operacional,
  })
  const sp = row.status_pagamento
  const statusPagamento: StatusPagamentoFinanceiro | '' =
    sp === 'Pendente' || sp === 'Parcial' || sp === 'Pago' ? sp : ''

  const sc =
    row.status_conferencia === 'PRONTO_PARA_FATURAR' ? 'PRONTO_PARA_FATURAR' : 'PENDENTE'

  const ref =
    (row.referencia_nf && String(row.referencia_nf).trim()) ||
    (row.numero_nf_coleta && String(row.numero_nf_coleta).trim()) ||
    ''

  return {
    id: row.coleta_id,
    numero: row.numero,
    cliente: row.cliente_nome || '—',
    dataAgendada: row.data_agendada,
    tipoResiduo: row.tipo_residuo,
    cidade: row.cidade,
    etapaOperacional: formatarEtapaParaUI(etapa),
    faseFluxoOficial: formatarFaseFluxoOficialParaUI(etapa, {
      statusPagamento: row.status_pagamento,
    }),
    liberadoFinanceiro: row.liberado_financeiro ?? false,
    valorColeta: row.valor_coleta !== null ? String(row.valor_coleta) : '',
    statusPagamento,
    dataVencimento: row.data_vencimento || '',
    pesoLiquido: row.peso_liquido !== null ? String(row.peso_liquido) : '',
    createdAt: row.created_at,
    mtrId: row.mtr_id != null ? String(row.mtr_id) : '',
    programacaoId: row.programacao_id != null ? String(row.programacao_id) : '',
    clienteId: row.cliente_id != null ? String(row.cliente_id) : '',
    numeroNf: ref,
    confirmacaoRecebimento: row.confirmacao_recebimento === true,
    statusConferencia: sc,
    pendenciasResumo: (row.pendencias_resumo ?? '').trim(),
    observacoesColeta: row.coleta_observacoes ?? '',
    mtrNumero: row.mtr_numero ?? '',
    programacaoNumero: row.programacao_numero ?? '',
    programacaoObs: row.programacao_observacoes ?? '',
    mtrObs: row.mtr_observacoes ?? '',
    ticketComprovante: row.ticket_comprovante ?? '',
    pesoTara: row.peso_tara !== null ? String(row.peso_tara) : '',
    pesoBruto: row.peso_bruto !== null ? String(row.peso_bruto) : '',
    motoristaSnap: row.motorista ?? '',
    placaSnap: row.placa ?? '',
    ultimaAprovacaoDecisao: row.ultima_aprovacao_decisao ?? '',
    ultimaAprovacaoObs: row.ultima_aprovacao_obs ?? '',
    conferenciaDocsOk: row.conferencia_documentos_ok,
    conferenciaObs: row.conferencia_operacional_obs ?? '',
    faturamentoRegStatus: row.faturamento_registro_status,
    referenciaConsolidada: ref,
    dataExecucao: row.data_execucao ?? '',
    dataProgramacao: row.data_programacao ?? '',
    clienteRazaoSocial: row.cliente_razao_social ?? '',
    nfEnviadaEm: row.conta_receber_nf_enviada_em
      ? String(row.conta_receber_nf_enviada_em)
      : '',
    nfEnvioObs: (row.conta_receber_nf_envio_obs ?? '').trim(),
    valorPago:
      row.conta_receber_valor_pago != null && Number.isFinite(Number(row.conta_receber_valor_pago))
        ? String(row.conta_receber_valor_pago)
        : '0',
    valorTravado: row.conta_receber_valor_travado === true,
    contaReceberId: '',
  }
}

export function exportarCsvFinanceiro(
  linhas: FinanceiroListaItem[],
  nomeBase: string
): void {
  const cols = [
    'numero',
    'cliente',
    'data_agendada',
    'peso_liquido',
    'valor',
    'status_pagamento',
    'fase_fluxo_oficial',
    'status_conferencia',
    'referencia_nf',
    'pendencias',
  ] as const
  const esc = (s: string | number) => {
    const t = String(s ?? '').replace(/"/g, '""')
    return `"${t}"`
  }
  const header = cols.join(';')
  const body = linhas
    .map((i) =>
      [
        esc(i.numero),
        esc(i.cliente),
        esc(i.dataAgendada),
        esc(i.pesoLiquido),
        esc(i.valorColeta),
        esc(i.statusPagamento),
        esc(i.faseFluxoOficial),
        esc(i.statusConferencia),
        esc(i.numeroNf),
        esc(i.pendenciasResumo),
      ].join(';')
    )
    .join('\r\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + header + '\r\n' + body], {
    type: 'text/csv;charset=utf-8;',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${nomeBase}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
