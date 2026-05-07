-- Dados operacionais vindos da planilha real de clientes (CLIENTES / DESTINAÇÕES / CLINICAS).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo_ibama text,
  ADD COLUMN IF NOT EXISTS descricao_veiculo text,
  ADD COLUMN IF NOT EXISTS mtr_coleta text,
  ADD COLUMN IF NOT EXISTS destino text,
  ADD COLUMN IF NOT EXISTS mtr_destino text,
  ADD COLUMN IF NOT EXISTS residuo_destino text,
  ADD COLUMN IF NOT EXISTS observacoes_operacionais text,
  ADD COLUMN IF NOT EXISTS ajudante text,
  ADD COLUMN IF NOT EXISTS solicitante text,
  ADD COLUMN IF NOT EXISTS origem_planilha_cliente text,
  ADD COLUMN IF NOT EXISTS cnpj_raiz text,
  ADD COLUMN IF NOT EXISTS tipo_unidade_cliente text;

COMMENT ON COLUMN public.clientes.codigo_ibama IS 'Codigo IBAMA informado na planilha de clientes.';
COMMENT ON COLUMN public.clientes.descricao_veiculo IS 'Descricao textual do veiculo preferencial informado na planilha.';
COMMENT ON COLUMN public.clientes.mtr_coleta IS 'Regra ou observacao sobre MTR de coleta.';
COMMENT ON COLUMN public.clientes.destino IS 'Destino operacional informado na planilha.';
COMMENT ON COLUMN public.clientes.mtr_destino IS 'Regra ou observacao sobre MTR de destino.';
COMMENT ON COLUMN public.clientes.residuo_destino IS 'Residuo de destino informado na planilha.';
COMMENT ON COLUMN public.clientes.observacoes_operacionais IS 'Observacoes livres da planilha para operacao/coleta.';
COMMENT ON COLUMN public.clientes.ajudante IS 'Indicacao textual sobre necessidade de ajudante.';
COMMENT ON COLUMN public.clientes.solicitante IS 'Solicitante informado na planilha, quando houver.';
COMMENT ON COLUMN public.clientes.origem_planilha_cliente IS 'Aba da planilha original usada na importacao do cliente.';
COMMENT ON COLUMN public.clientes.cnpj_raiz IS 'Raiz de 8 digitos do CNPJ para agrupar matriz e filiais; vazio para CPF.';
COMMENT ON COLUMN public.clientes.tipo_unidade_cliente IS 'Tipo da unidade pelo documento: Matriz, Filial ou Pessoa fisica.';

CREATE INDEX IF NOT EXISTS idx_clientes_codigo_ibama
  ON public.clientes (codigo_ibama)
  WHERE codigo_ibama IS NOT NULL AND btrim(codigo_ibama) <> '';

CREATE INDEX IF NOT EXISTS idx_clientes_origem_planilha_cliente
  ON public.clientes (origem_planilha_cliente)
  WHERE origem_planilha_cliente IS NOT NULL AND btrim(origem_planilha_cliente) <> '';

CREATE INDEX IF NOT EXISTS idx_clientes_cnpj_raiz
  ON public.clientes (cnpj_raiz)
  WHERE cnpj_raiz IS NOT NULL AND btrim(cnpj_raiz) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_documento_normalizado
  ON public.clientes ((regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')))
  WHERE regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') <> '';
