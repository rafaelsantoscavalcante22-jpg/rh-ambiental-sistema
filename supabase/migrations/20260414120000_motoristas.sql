-- RG Ambiental — ETAPA 2: cadastro base de motoristas (sem FKs para outras páginas nesta etapa)
-- Aplicar: SQL Editor no Supabase ou `npm run db:apply:sql -- supabase/migrations/20260414120000_motoristas.sql`

CREATE TABLE IF NOT EXISTS public.motoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnh_numero text,
  cnh_categoria text,
  cnh_validade date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motoristas_nome ON public.motoristas (nome);
CREATE INDEX IF NOT EXISTS idx_motoristas_cnh_numero ON public.motoristas (cnh_numero)
  WHERE cnh_numero IS NOT NULL AND btrim(cnh_numero) <> '';

COMMENT ON TABLE public.motoristas IS
  'Motoristas habilitados; base para logística (integração com outras telas em etapa posterior).';
COMMENT ON COLUMN public.motoristas.nome IS 'Nome completo do motorista.';
COMMENT ON COLUMN public.motoristas.cnh_numero IS 'Número da CNH.';
COMMENT ON COLUMN public.motoristas.cnh_categoria IS 'Categoria da CNH (ex.: B, C, E).';
COMMENT ON COLUMN public.motoristas.cnh_validade IS 'Data de validade da CNH.';

ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "motoristas_authenticated_all" ON public.motoristas;
CREATE POLICY "motoristas_authenticated_all"
  ON public.motoristas FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
