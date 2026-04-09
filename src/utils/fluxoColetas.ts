export type EtapaOperacional =
  | 'SOLICITACAO_CLIENTE'
  | 'PROGRAMACAO_WHATSAPP'
  | 'QUADRO_ATUALIZADO'
  | 'MTR_PREENCHIDA'
  | 'MTR_ENTREGUE_LOGISTICA'
  | 'LOGISTICA_DESIGNADA_SAIDA'
  | 'RETORNO_PESO_BRUTO'
  | 'CONTROLE_PESAGEM'
  | 'DOCUMENTOS_RECEBIDOS_OPERACIONAL'
  | 'TICKET_PESO_LIQUIDO'
  | 'ENVIADO_APROVACAO'
  | 'APROVADO'
  | 'ARQUIVO'
  | 'FATURADO'
  | 'ENVIADO_FINANCEIRO'
  | 'FINALIZADO';

export interface ColetaFluxoBase {
  etapa_operacional: EtapaOperacional;
  [key: string]: unknown;
}

export const FLUXO_OPERACIONAL: { value: EtapaOperacional; label: string; status: string }[] = [
  { value: 'SOLICITACAO_CLIENTE', label: '1. Solicitação Cliente', status: 'Pendente' },
  { value: 'PROGRAMACAO_WHATSAPP', label: '2. Programação WhatsApp', status: 'Pendente' },
  { value: 'QUADRO_ATUALIZADO', label: '3. Quadro Atualizado', status: 'Em Andamento' },
  { value: 'MTR_PREENCHIDA', label: '4. MTR Preenchida', status: 'Em Andamento' },
  { value: 'MTR_ENTREGUE_LOGISTICA', label: '5. MTR Logística', status: 'Em Andamento' },
  { value: 'LOGISTICA_DESIGNADA_SAIDA', label: '6. Saída Logística', status: 'Em Execução' },
  { value: 'RETORNO_PESO_BRUTO', label: '7. Retorno / Peso Bruto', status: 'Em Execução' },
  { value: 'CONTROLE_PESAGEM', label: '8. Controle Pesagem', status: 'Processamento' },
  { value: 'DOCUMENTOS_RECEBIDOS_OPERACIONAL', label: '9. Docs Recebidos', status: 'Processamento' },
  { value: 'TICKET_PESO_LIQUIDO', label: '10. Ticket / Peso Líquido', status: 'Processamento' },
  { value: 'ENVIADO_APROVACAO', label: '11. Enviado Aprovação', status: 'Revisão' },
  { value: 'APROVADO', label: '12. Aprovado', status: 'Concluído Operacional' },
  { value: 'ARQUIVO', label: '13. Arquivo', status: 'Concluído Operacional' },
  { value: 'FATURADO', label: '14. Faturado', status: 'Financeiro' },
  { value: 'ENVIADO_FINANCEIRO', label: '15. Enviado Financeiro', status: 'Financeiro' },
  { value: 'FINALIZADO', label: '16. Finalizado', status: 'Finalizado' },
];

export function getIndexEtapa(etapa: EtapaOperacional): number {
  return FLUXO_OPERACIONAL.findIndex(e => e.value === etapa);
}

export function podeCriarMTR(coleta: ColetaFluxoBase): boolean {
  return getIndexEtapa(coleta.etapa_operacional) >= getIndexEtapa('QUADRO_ATUALIZADO');
}

export function podeIrParaFinanceiro(coleta: ColetaFluxoBase): boolean {
  return getIndexEtapa(coleta.etapa_operacional) >= getIndexEtapa('FATURADO');
}

export function podeLancarControleMassa(coleta: ColetaFluxoBase): boolean {
  return getIndexEtapa(coleta.etapa_operacional) >= getIndexEtapa('RETORNO_PESO_BRUTO');
}

export function getMensagemBloqueioMTR(coleta: ColetaFluxoBase): string {
  if (podeCriarMTR(coleta)) return '';
  return 'A MTR só pode ser gerada após a etapa "Quadro Atualizado".';
}

export function getMensagemBloqueioControleMassa(coleta: ColetaFluxoBase): string {
  if (podeLancarControleMassa(coleta)) return '';
  return 'O controle de massa só pode ser lançado após a etapa "Retorno / Peso Bruto".';
}

export function getMensagemBloqueioFinanceiro(coleta: ColetaFluxoBase): string {
  if (podeIrParaFinanceiro(coleta)) return '';
  return 'O financeiro só pode receber a coleta após a etapa "Faturado".';
}