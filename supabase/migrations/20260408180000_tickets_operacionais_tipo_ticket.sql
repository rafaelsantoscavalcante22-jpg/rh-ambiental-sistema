-- Tipo de ticket operacional (saída vs frete) para impressão e registo.
ALTER TABLE public.tickets_operacionais
  ADD COLUMN IF NOT EXISTS tipo_ticket text DEFAULT 'saida';

UPDATE public.tickets_operacionais SET tipo_ticket = 'saida' WHERE tipo_ticket IS NULL;

ALTER TABLE public.tickets_operacionais
  ALTER COLUMN tipo_ticket SET NOT NULL;

ALTER TABLE public.tickets_operacionais DROP CONSTRAINT IF EXISTS tickets_operacionais_tipo_ticket_check;

ALTER TABLE public.tickets_operacionais
  ADD CONSTRAINT tickets_operacionais_tipo_ticket_check CHECK (tipo_ticket IN ('saida', 'frete'));

COMMENT ON COLUMN public.tickets_operacionais.tipo_ticket IS
  'Classificação: saída de material ou frete.';
