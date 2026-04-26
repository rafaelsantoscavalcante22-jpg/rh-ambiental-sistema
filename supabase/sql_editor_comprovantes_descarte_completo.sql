-- =============================================================================
-- Comprovante de Descarte — SQL COMPLETO para Supabase (autocontido)
-- Executa este ficheiro inteiro no SQL Editor.
--
-- Inclui as funções helper de cargo (rg_is_visualizador, etc.) caso ainda
-- não existam no projeto — são as mesmas da migração RLS do fluxo.
--
-- Se o CREATE TRIGGER falhar: troca EXECUTE FUNCTION por EXECUTE PROCEDURE
-- na linha do trigger rg_set_updated_at.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de cargo (necessários para as políticas RLS abaixo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rg_user_cargo()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT u.cargo FROM public.usuarios u WHERE u.id = auth.uid()), '');
$$;

CREATE OR REPLACE FUNCTION public.rg_cargo_like(p text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(public.rg_user_cargo()) LIKE '%' || lower(COALESCE(p, '')) || '%';
$$;

CREATE OR REPLACE FUNCTION public.rg_cargo_vazio_compat()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT btrim(public.rg_user_cargo()) = '';
$$;

CREATE OR REPLACE FUNCTION public.rg_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rg_cargo_like('administrador');
$$;

CREATE OR REPLACE FUNCTION public.rg_is_diretoria()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rg_cargo_like('diretoria') OR public.rg_cargo_like('diretor');
$$;

CREATE OR REPLACE FUNCTION public.rg_is_visualizador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rg_cargo_like('visualizador');
$$;

-- ---------------------------------------------------------------------------
-- Gatilho updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tabela comprovantes_descarte
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.comprovantes_descarte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  codigo_remessa text,
  data_remessa date,
  cadri text,
  tipo_efluente text,
  linha_tratamento text,
  numero_mtr text,
  volume text,
  acondicionamento text,

  gerador_razao_social text,
  gerador_nome_fantasia text,
  gerador_endereco text,
  gerador_responsavel text,
  gerador_telefone text,
  gerador_contrato text,

  transportador_razao_social text,
  transportador_telefone text,
  placa text,
  motorista_nome text,
  motorista_cnh text,
  transportador_responsavel_assinatura_nome text,
  transportador_responsavel_assinatura_data date,

  destinatario_razao_social text,
  destinatario_endereco text,
  destinatario_telefone text,
  destinatario_responsavel_assinatura_nome text,
  destinatario_responsavel_assinatura_data date,

  peso_entrada numeric(14, 3),
  data_entrada timestamptz,
  peso_saida numeric(14, 3),
  data_saida timestamptz,
  peso_liquido numeric(14, 3) GENERATED ALWAYS AS (
    CASE
      WHEN peso_entrada IS NOT NULL AND peso_saida IS NOT NULL
        THEN peso_entrada - peso_saida
      ELSE NULL
    END
  ) STORED,

  foto_entrada_url text,
  foto_saida_url text,
  fotos_extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  foto_entrada_nome_arquivo text,
  foto_saida_nome_arquivo text,

  foto_entrada_conferida boolean NOT NULL DEFAULT false,
  foto_entrada_observacao_conferencia text,
  foto_saida_conferida boolean NOT NULL DEFAULT false,
  foto_saida_observacao_conferencia text,
  foto_entrada_ocr_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  foto_saida_ocr_meta jsonb NOT NULL DEFAULT '{}'::jsonb,

  observacoes text,
  coleta_id uuid REFERENCES public.coletas (id) ON DELETE SET NULL,
  mtr_id uuid REFERENCES public.mtrs (id) ON DELETE SET NULL,
  controle_massa_id uuid REFERENCES public.controle_massa (id) ON DELETE SET NULL,

  faturamento_liberado boolean NOT NULL DEFAULT false,
  status_documento text NOT NULL DEFAULT 'rascunho'
    CHECK (
      status_documento IN (
        'rascunho',
        'em_conferencia',
        'finalizado',
        'aprovado_faturamento'
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.comprovantes_descarte IS
  'Documento técnico de comprovação de descarte (pós-operacional).';
COMMENT ON COLUMN public.comprovantes_descarte.fotos_extras IS
  'JSON array: [{url, nome_arquivo, conferida_manual, observacao_conferencia, ocr_meta}]';
COMMENT ON COLUMN public.comprovantes_descarte.foto_entrada_ocr_meta IS
  'Reservado para leitura automática (peso/data) — evolução futura.';
COMMENT ON COLUMN public.comprovantes_descarte.faturamento_liberado IS
  'Sinaliza que o comprovante pode ser base para faturamento.';

CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_codigo_remessa
  ON public.comprovantes_descarte (codigo_remessa);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_numero_mtr
  ON public.comprovantes_descarte (numero_mtr);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_gerador_rs
  ON public.comprovantes_descarte (gerador_razao_social);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_motorista
  ON public.comprovantes_descarte (motorista_nome);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_placa
  ON public.comprovantes_descarte (placa);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_data_remessa
  ON public.comprovantes_descarte (data_remessa);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_status
  ON public.comprovantes_descarte (status_documento);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_created
  ON public.comprovantes_descarte (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_coleta
  ON public.comprovantes_descarte (coleta_id);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_mtr
  ON public.comprovantes_descarte (mtr_id);

DROP TRIGGER IF EXISTS trg_comprovantes_descarte_updated_at ON public.comprovantes_descarte;
CREATE TRIGGER trg_comprovantes_descarte_updated_at
  BEFORE UPDATE ON public.comprovantes_descarte
  FOR EACH ROW
  EXECUTE FUNCTION public.rg_set_updated_at();

ALTER TABLE public.comprovantes_descarte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comprovantes_descarte_select_authenticated" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_select_authenticated"
  ON public.comprovantes_descarte FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "comprovantes_descarte_insert_roles_fluxo" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_insert_roles_fluxo"
  ON public.comprovantes_descarte FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('balanceiro')
      OR public.rg_cargo_like('pesagem')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_cargo_like('financeiro')
      OR public.rg_is_diretoria()
    )
  );

DROP POLICY IF EXISTS "comprovantes_descarte_update_roles_fluxo" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_update_roles_fluxo"
  ON public.comprovantes_descarte FOR UPDATE TO authenticated
  USING (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('balanceiro')
      OR public.rg_cargo_like('pesagem')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_cargo_like('financeiro')
      OR public.rg_is_diretoria()
    )
  )
  WITH CHECK (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('balanceiro')
      OR public.rg_cargo_like('pesagem')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_cargo_like('financeiro')
      OR public.rg_is_diretoria()
    )
  );

DROP POLICY IF EXISTS "comprovantes_descarte_delete_roles_fluxo" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_delete_roles_fluxo"
  ON public.comprovantes_descarte FOR DELETE TO authenticated
  USING (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprovantes_descarte TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes-descarte',
  'comprovantes-descarte',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "comprovantes_descarte_storage_select" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comprovantes-descarte');

DROP POLICY IF EXISTS "comprovantes_descarte_storage_insert" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes-descarte'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

DROP POLICY IF EXISTS "comprovantes_descarte_storage_update" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comprovantes-descarte'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

DROP POLICY IF EXISTS "comprovantes_descarte_storage_delete" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprovantes-descarte'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
