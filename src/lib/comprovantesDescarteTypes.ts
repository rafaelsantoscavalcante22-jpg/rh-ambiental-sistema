export type StatusDocumentoComprovante =
  | 'rascunho'
  | 'em_conferencia'
  | 'finalizado'
  | 'aprovado_faturamento'

export type ComprovanteFotoExtraItem = {
  url: string
  nome_arquivo: string
  conferida_manual?: boolean
  observacao_conferencia?: string | null
  /** Reservado para OCR / metadados futuros */
  ocr_meta?: Record<string, unknown> | null
}

export type ComprovanteDescarteRow = {
  id: string
  codigo_remessa: string | null
  data_remessa: string | null
  cadri: string | null
  tipo_efluente: string | null
  linha_tratamento: string | null
  numero_mtr: string | null
  volume: string | null
  acondicionamento: string | null

  gerador_razao_social: string | null
  gerador_nome_fantasia: string | null
  gerador_endereco: string | null
  gerador_responsavel: string | null
  gerador_telefone: string | null
  gerador_contrato: string | null

  transportador_razao_social: string | null
  transportador_telefone: string | null
  placa: string | null
  motorista_nome: string | null
  motorista_cnh: string | null
  transportador_responsavel_assinatura_nome: string | null
  transportador_responsavel_assinatura_data: string | null

  destinatario_razao_social: string | null
  destinatario_endereco: string | null
  destinatario_telefone: string | null
  destinatario_responsavel_assinatura_nome: string | null
  destinatario_responsavel_assinatura_data: string | null

  peso_entrada: number | null
  data_entrada: string | null
  peso_saida: number | null
  data_saida: string | null
  peso_liquido: number | null

  foto_entrada_url: string | null
  foto_saida_url: string | null
  fotos_extras: ComprovanteFotoExtraItem[] | null
  foto_entrada_nome_arquivo: string | null
  foto_saida_nome_arquivo: string | null

  foto_entrada_conferida: boolean
  foto_entrada_observacao_conferencia: string | null
  foto_saida_conferida: boolean
  foto_saida_observacao_conferencia: string | null
  foto_entrada_ocr_meta: Record<string, unknown>
  foto_saida_ocr_meta: Record<string, unknown>

  observacoes: string | null
  coleta_id: string | null
  mtr_id: string | null
  controle_massa_id: string | null

  faturamento_liberado: boolean
  status_documento: StatusDocumentoComprovante

  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export type ComprovanteDescarteFiltros = {
  codigoRemessa: string
  numeroMtr: string
  gerador: string
  motorista: string
  placa: string
  dataInicio: string
  dataFim: string
  statusDocumento: string
}
