-- =============================================================================
-- Contas a pagar — títulos, anexos (Storage), RLS alinhado a contas_receber
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor text NOT NULL,
  descricao text NOT NULL,
  valor numeric(14, 2) NOT NULL CHECK (valor >= 0),
  data_vencimento date NOT NULL,
  categoria text NOT NULL DEFAULT 'Geral',
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Pago')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.contas_pagar IS 'Lançamentos de contas a pagar (fornecedores, despesas). Status «Atrasado» é derivado na aplicação (Pendente + vencimento < hoje).';

CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON public.contas_pagar (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON public.contas_pagar (status);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_categoria ON public.contas_pagar (categoria);

DROP TRIGGER IF EXISTS trg_contas_pagar_updated_at ON public.contas_pagar;
CREATE TRIGGER trg_contas_pagar_updated_at
  BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW
  EXECUTE FUNCTION public.rg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.contas_pagar_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_pagar_id uuid NOT NULL REFERENCES public.contas_pagar (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  nome_arquivo text NOT NULL,
  content_type text,
  tamanho_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_anexos_conta ON public.contas_pagar_anexos (conta_pagar_id);

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contas_pagar_select_authenticated" ON public.contas_pagar;
CREATE POLICY "contas_pagar_select_authenticated"
  ON public.contas_pagar FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "contas_pagar_mutate_financeiro" ON public.contas_pagar;
CREATE POLICY "contas_pagar_mutate_financeiro"
  ON public.contas_pagar FOR ALL TO authenticated
  USING (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  )
  WITH CHECK (
    public.rg_is_admin()
    OR public.rg_cargo_vazio_compat()
    OR public.rg_cargo_like('financeiro')
    OR public.rg_cargo_like('faturamento')
    OR public.rg_is_diretoria()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_pagar TO authenticated;

DROP POLICY IF EXISTS "contas_pagar_anexos_select_authenticated" ON public.contas_pagar_anexos;
CREATE POLICY "contas_pagar_anexos_select_authenticated"
  ON public.contas_pagar_anexos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "contas_pagar_anexos_mutate_financeiro" ON public.contas_pagar_anexos;
CREATE POLICY "contas_pagar_anexos_mutate_financeiro"
  ON public.contas_pagar_anexos FOR ALL TO authenticated
  USING (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  )
  WITH CHECK (
    public.rg_is_admin()
    OR public.rg_cargo_vazio_compat()
    OR public.rg_cargo_like('financeiro')
    OR public.rg_cargo_like('faturamento')
    OR public.rg_is_diretoria()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_pagar_anexos TO authenticated;

-- Storage: contas-pagar-anexos/{conta_pagar_id}/...
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contas-pagar-anexos',
  'contas-pagar-anexos',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "contas_pagar_anexos_storage_select" ON storage.objects;
CREATE POLICY "contas_pagar_anexos_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contas-pagar-anexos');

DROP POLICY IF EXISTS "contas_pagar_anexos_storage_insert" ON storage.objects;
CREATE POLICY "contas_pagar_anexos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contas-pagar-anexos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  );

DROP POLICY IF EXISTS "contas_pagar_anexos_storage_update" ON storage.objects;
CREATE POLICY "contas_pagar_anexos_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contas-pagar-anexos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  )
  WITH CHECK (
    bucket_id = 'contas-pagar-anexos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  );

DROP POLICY IF EXISTS "contas_pagar_anexos_storage_delete" ON storage.objects;
CREATE POLICY "contas_pagar_anexos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'contas-pagar-anexos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  );
