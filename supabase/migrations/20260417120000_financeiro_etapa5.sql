-- ETAPA 5 — Financeiro: NF, confirmação de recebimento, documentos e índices
-- Aplicar no SQL Editor do Supabase.

-- Campos adicionais na coleta (cobrança)
ALTER TABLE public.coletas ADD COLUMN IF NOT EXISTS numero_nf text;
ALTER TABLE public.coletas ADD COLUMN IF NOT EXISTS confirmacao_recebimento boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coletas.numero_nf IS 'Número da nota fiscal referente à coleta.';
COMMENT ON COLUMN public.coletas.confirmacao_recebimento IS 'Confirmação de recebimento do valor/documento.';

CREATE INDEX IF NOT EXISTS idx_coletas_numero_nf ON public.coletas (numero_nf)
  WHERE numero_nf IS NOT NULL AND btrim(numero_nf) <> '';

-- Documentos a acompanhar (vencimentos, alertas na UI)
CREATE TABLE IF NOT EXISTS public.financeiro_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_documento text NOT NULL,
  data_vencimento date NOT NULL,
  coleta_id uuid REFERENCES public.coletas (id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_documentos_vencimento ON public.financeiro_documentos (data_vencimento);

COMMENT ON TABLE public.financeiro_documentos IS
  'Documentos com vencimento acompanhar no financeiro (licenças, apólices, certificados).';

ALTER TABLE public.financeiro_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financeiro_documentos_authenticated_all" ON public.financeiro_documentos;
CREATE POLICY "financeiro_documentos_authenticated_all"
  ON public.financeiro_documentos FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
