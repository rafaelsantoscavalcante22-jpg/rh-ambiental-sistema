-- ETAPA 4: assinaturas no checklist de transporte (motorista / responsável)
-- Aplicar no SQL Editor do Supabase.

ALTER TABLE public.checklist_transporte
  ADD COLUMN IF NOT EXISTS assinatura_motorista text;

ALTER TABLE public.checklist_transporte
  ADD COLUMN IF NOT EXISTS assinatura_responsavel text;

COMMENT ON COLUMN public.checklist_transporte.assinatura_motorista IS
  'Nome ou rubrica do motorista no checklist.';
COMMENT ON COLUMN public.checklist_transporte.assinatura_responsavel IS
  'Nome ou rubrica do responsável interno no checklist.';
