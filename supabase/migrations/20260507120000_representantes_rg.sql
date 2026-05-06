-- Cadastro de representantes comerciais RG (equipa comercial da empresa).
-- Aplicar: SQL Editor no Supabase ou fluxo de migrações do projeto.

CREATE TABLE IF NOT EXISTS public.representantes_rg (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  cpf text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_representantes_rg_nome ON public.representantes_rg (nome);
CREATE INDEX IF NOT EXISTS idx_representantes_rg_email ON public.representantes_rg (email)
  WHERE email IS NOT NULL AND btrim(email) <> '';

COMMENT ON TABLE public.representantes_rg IS
  'Representantes comerciais RG — cadastro da equipa comercial.';
COMMENT ON COLUMN public.representantes_rg.nome IS 'Nome completo do representante.';
COMMENT ON COLUMN public.representantes_rg.email IS 'E-mail de contacto.';
COMMENT ON COLUMN public.representantes_rg.telefone IS 'Telefone de contacto.';
COMMENT ON COLUMN public.representantes_rg.cpf IS 'CPF (opcional).';
COMMENT ON COLUMN public.representantes_rg.observacoes IS 'Notas internas (território, contrato, etc.).';

ALTER TABLE public.representantes_rg ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "representantes_rg_authenticated_all" ON public.representantes_rg;
CREATE POLICY "representantes_rg_authenticated_all"
  ON public.representantes_rg FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
