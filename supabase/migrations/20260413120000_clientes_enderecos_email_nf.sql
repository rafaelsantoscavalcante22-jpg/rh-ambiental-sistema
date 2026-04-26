-- RG Ambiental — ETAPA 1: campos adicionais em public.clientes
-- Aplicar no Supabase: SQL Editor → colar e executar, ou `supabase db push` / migration deploy.

-- Endereços textuais (coleta / faturamento) e e-mail para envio de NF
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS endereco_coleta text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS endereco_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS email_nf text;

-- Status operacional (já usado na UI: Ativo / Inativo)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status text;

-- Valor padrão coerente com o formulário existente
ALTER TABLE public.clientes
  ALTER COLUMN status SET DEFAULT 'Ativo';

-- Dados antigos sem status passam a ficar explícitos como Ativo
UPDATE public.clientes
SET status = 'Ativo'
WHERE status IS NULL OR btrim(status) = '';

COMMENT ON COLUMN public.clientes.endereco_coleta IS 'Endereço completo para coleta (texto livre).';
COMMENT ON COLUMN public.clientes.endereco_faturamento IS 'Endereço completo para faturamento (texto livre).';
COMMENT ON COLUMN public.clientes.email_nf IS 'E-mail para envio de notas fiscais.';
COMMENT ON COLUMN public.clientes.status IS 'Situação cadastral: Ativo ou Inativo.';
