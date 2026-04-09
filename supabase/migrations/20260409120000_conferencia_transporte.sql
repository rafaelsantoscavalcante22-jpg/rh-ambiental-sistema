-- Conferência de transportes: checklist OK/NÃO (modelo planilha), por coleta.
-- Aplicar: supabase db push ou SQL Editor.

CREATE TABLE IF NOT EXISTS public.conferencia_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes text,
  preenchido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conferencia_transporte_coleta_id_key UNIQUE (coleta_id)
);

CREATE INDEX IF NOT EXISTS idx_conferencia_transporte_coleta ON public.conferencia_transporte (coleta_id);

COMMENT ON TABLE public.conferencia_transporte IS
  'Conferência de transportes (checklist OK/NÃO por item), vínculo 1:1 com coleta.';

ALTER TABLE public.conferencia_transporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conferencia_transporte_authenticated_all" ON public.conferencia_transporte;
CREATE POLICY "conferencia_transporte_authenticated_all"
  ON public.conferencia_transporte FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
