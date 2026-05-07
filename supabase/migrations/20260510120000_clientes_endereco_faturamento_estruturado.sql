-- Endereço de faturamento estruturado (espelha o bloco de endereço de coleta).
-- Os campos endereco_coleta / endereco_faturamento (texto livre) continuam sendo
-- preenchidos pela aplicação a partir dos blocos estruturados, para compatibilidade.

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cep_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS rua_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS numero_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS complemento_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS bairro_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cidade_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estado_faturamento text;

COMMENT ON COLUMN public.clientes.cep_faturamento IS 'CEP do endereço de faturamento.';
COMMENT ON COLUMN public.clientes.rua_faturamento IS 'Logradouro (faturamento).';
COMMENT ON COLUMN public.clientes.numero_faturamento IS 'Número (faturamento).';
COMMENT ON COLUMN public.clientes.complemento_faturamento IS 'Complemento (faturamento).';
COMMENT ON COLUMN public.clientes.bairro_faturamento IS 'Bairro (faturamento).';
COMMENT ON COLUMN public.clientes.cidade_faturamento IS 'Cidade (faturamento).';
COMMENT ON COLUMN public.clientes.estado_faturamento IS 'UF (faturamento).';

-- Dados existentes: copia o endereço de coleta estruturado quando o de faturamento ainda está vazio.
UPDATE public.clientes SET
  cep_faturamento = cep,
  rua_faturamento = rua,
  numero_faturamento = numero,
  complemento_faturamento = complemento,
  bairro_faturamento = bairro,
  cidade_faturamento = cidade,
  estado_faturamento = estado
WHERE cep_faturamento IS NULL
  AND rua_faturamento IS NULL
  AND numero_faturamento IS NULL
  AND complemento_faturamento IS NULL
  AND bairro_faturamento IS NULL
  AND cidade_faturamento IS NULL
  AND estado_faturamento IS NULL;

UPDATE public.clientes
SET endereco_faturamento = endereco_coleta
WHERE (endereco_faturamento IS NULL OR btrim(endereco_faturamento) = '')
  AND endereco_coleta IS NOT NULL
  AND btrim(endereco_coleta) <> '';
