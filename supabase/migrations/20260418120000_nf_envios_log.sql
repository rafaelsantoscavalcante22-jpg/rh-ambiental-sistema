-- ETAPA 6 — Registo de envios de NF (simulação / futura integração e-mail)
-- Aplicar no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.nf_envios_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  modo text NOT NULL DEFAULT 'simulacao',
  destinatarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_destinatarios int NOT NULL DEFAULT 0,
  observacao text
);

CREATE INDEX IF NOT EXISTS idx_nf_envios_log_created ON public.nf_envios_log (created_at DESC);

COMMENT ON TABLE public.nf_envios_log IS
  'Histórico de disparos de mala direta de NF; modo simulacao até integração SMTP/API.';
COMMENT ON COLUMN public.nf_envios_log.destinatarios IS 'JSON: [{ "cliente_id", "nome", "email" }, ...].';
COMMENT ON COLUMN public.nf_envios_log.modo IS 'simulacao | (futuro: email_smtp, etc.).';

ALTER TABLE public.nf_envios_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nf_envios_log_authenticated_all" ON public.nf_envios_log;
CREATE POLICY "nf_envios_log_authenticated_all"
  ON public.nf_envios_log FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
