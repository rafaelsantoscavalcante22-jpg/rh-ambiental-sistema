-- Inclui "entrada" como tipo de ticket operacional (Entrada / Saída / Frete).
ALTER TABLE public.tickets_operacionais DROP CONSTRAINT IF EXISTS tickets_operacionais_tipo_ticket_check;

ALTER TABLE public.tickets_operacionais
  ADD CONSTRAINT tickets_operacionais_tipo_ticket_check CHECK (tipo_ticket IN ('entrada', 'saida', 'frete'));

COMMENT ON COLUMN public.tickets_operacionais.tipo_ticket IS
  'Classificação: entrada, saída de material ou frete.';
