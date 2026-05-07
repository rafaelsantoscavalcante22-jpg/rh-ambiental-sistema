-- CRLV (validade), CIV e CIPP: números e URLs de arquivo no Storage (bucket caminhoes-certificados)

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS crlv_validade date;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS civ_numero text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS civ_arquivo_url text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS cipp_numero text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS cipp_arquivo_url text;

COMMENT ON COLUMN public.caminhoes.crlv_validade IS 'Data de validade do documento CRLV.';
COMMENT ON COLUMN public.caminhoes.civ_numero IS 'Número do certificado CIV (alternativa ou complemento ao arquivo).';
COMMENT ON COLUMN public.caminhoes.civ_arquivo_url IS 'URL pública do arquivo do CIV (bucket caminhoes-certificados).';
COMMENT ON COLUMN public.caminhoes.cipp_numero IS 'Número do certificado CIPP (alternativa ou complemento ao arquivo).';
COMMENT ON COLUMN public.caminhoes.cipp_arquivo_url IS 'URL pública do arquivo do CIPP (bucket caminhoes-certificados).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'caminhoes-certificados',
  'caminhoes-certificados',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "caminhoes_certificados_select_public" ON storage.objects;
CREATE POLICY "caminhoes_certificados_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'caminhoes-certificados');

DROP POLICY IF EXISTS "caminhoes_certificados_authenticated_insert" ON storage.objects;
CREATE POLICY "caminhoes_certificados_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'caminhoes-certificados');

DROP POLICY IF EXISTS "caminhoes_certificados_authenticated_update" ON storage.objects;
CREATE POLICY "caminhoes_certificados_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'caminhoes-certificados')
  WITH CHECK (bucket_id = 'caminhoes-certificados');

DROP POLICY IF EXISTS "caminhoes_certificados_authenticated_delete" ON storage.objects;
CREATE POLICY "caminhoes_certificados_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'caminhoes-certificados');
