-- Acelera o filtro "CADRI vencendo em 30/60/90 dias" da listagem de clientes
-- e dashboards de compliance que filtrem por validade próxima.
-- Também documenta as colunas pré-existentes que correspondem ao CADRI da planilha.
COMMENT ON COLUMN public.clientes.licenca_numero
  IS 'Número do CADRI (Certificado de Movimentação de Resíduos de Interesse Ambiental).';
COMMENT ON COLUMN public.clientes.validade
  IS 'Data de vencimento do CADRI (coluna "Venc CADRI" da planilha).';

CREATE INDEX IF NOT EXISTS idx_clientes_validade
  ON public.clientes (validade)
  WHERE validade IS NOT NULL;
