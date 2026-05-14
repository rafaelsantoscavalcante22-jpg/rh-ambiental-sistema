-- Sequência global para número do ticket operacional (piso 1340 na primeira emissão).
-- Assinatura guardada no cadastro do motorista (opcional) para reutilizar na conferência.

CREATE SEQUENCE IF NOT EXISTS public.ticket_operacional_numero_seq;

DO $$
DECLARE
  mx int;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(TRIM(numero), '') AS int)), 1339)
  INTO mx
  FROM public.tickets_operacionais
  WHERE numero ~ '^[0-9]+$';

  IF mx < 1339 THEN
    mx := 1339;
  END IF;

  PERFORM setval('public.ticket_operacional_numero_seq', mx, true);
END $$;

CREATE OR REPLACE FUNCTION public.next_ticket_operacional_numero()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.ticket_operacional_numero_seq')::text;
$$;

COMMENT ON FUNCTION public.next_ticket_operacional_numero() IS
  'Próximo número de ticket operacional (inteiro como texto). Mantém continuidade com números já gravados; piso operacional 1340.';

GRANT USAGE, SELECT ON SEQUENCE public.ticket_operacional_numero_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_ticket_operacional_numero() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_tickets_operacionais_numero ON public.tickets_operacionais (numero);

ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS assinatura_data_url text;

COMMENT ON COLUMN public.motoristas.assinatura_data_url IS
  'Data URL (PNG) da rubrica/assinatura do motorista para reutilização na conferência de transporte.';
