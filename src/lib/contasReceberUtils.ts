export type StatusContaReceber = 'Pendente' | 'Pago' | 'Parcial' | 'Cancelado'

export function derivarStatusPagamento(valorTotal: number, valorPago: number): StatusContaReceber {
  if (valorTotal <= 0) return 'Pendente'
  if (valorPago >= valorTotal) return 'Pago'
  if (valorPago > 0) return 'Parcial'
  return 'Pendente'
}

/** Alinha status escolhido na coleta com valor_pago quando a conta está travada. */
export function alinharValorPagoComStatusUi(
  valorTotal: number,
  valorPagoAtual: number,
  statusUi: string
): { valorPago: number; status: StatusContaReceber } {
  const vtot = Math.max(0, valorTotal)
  let vp = Math.max(0, Math.min(vtot, valorPagoAtual))
  if (statusUi === 'Pago') vp = vtot
  else if (statusUi === 'Pendente') vp = 0
  else if (statusUi === 'Parcial') {
    vp = Math.max(0, Math.min(vtot, valorPagoAtual))
  }
  return { valorPago: vp, status: derivarStatusPagamento(vtot, vp) }
}
