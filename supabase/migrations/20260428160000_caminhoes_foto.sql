-- Foto do veículo (URL pública) + bucket caminhoes-fotos

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS foto_url text;

COMMENT ON COLUMN public.caminhoes.foto_url IS
  'URL pública da fotografia do caminhão (bucket caminhoes-fotos/<caminhao_id>/...).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'caminhoes-fotos',
  'caminhoes-fotos',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "caminhoes_fotos_select_public" ON storage.objects;
CREATE POLICY "caminhoes_fotos_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'caminhoes-fotos');

DROP POLICY IF EXISTS "caminhoes_fotos_authenticated_insert" ON storage.objects;
CREATE POLICY "caminhoes_fotos_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'caminhoes-fotos');

DROP POLICY IF EXISTS "caminhoes_fotos_authenticated_update" ON storage.objects;
CREATE POLICY "caminhoes_fotos_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'caminhoes-fotos')
  WITH CHECK (bucket_id = 'caminhoes-fotos');

DROP POLICY IF EXISTS "caminhoes_fotos_authenticated_delete" ON storage.objects;
CREATE POLICY "caminhoes_fotos_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'caminhoes-fotos');
