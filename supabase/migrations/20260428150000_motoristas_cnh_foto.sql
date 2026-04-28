-- Foto digital da CNH (URL pública no Storage) + bucket motoristas-cnh
-- Aplicar: SQL Editor ou supabase db push

ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS cnh_foto_url text;

COMMENT ON COLUMN public.motoristas.cnh_foto_url IS
  'URL pública da imagem da CNH (bucket motoristas-cnh/<motorista_id>/...).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'motoristas-cnh',
  'motoristas-cnh',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "motoristas_cnh_select_public" ON storage.objects;
CREATE POLICY "motoristas_cnh_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'motoristas-cnh');

DROP POLICY IF EXISTS "motoristas_cnh_authenticated_insert" ON storage.objects;
CREATE POLICY "motoristas_cnh_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'motoristas-cnh');

DROP POLICY IF EXISTS "motoristas_cnh_authenticated_update" ON storage.objects;
CREATE POLICY "motoristas_cnh_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'motoristas-cnh')
  WITH CHECK (bucket_id = 'motoristas-cnh');

DROP POLICY IF EXISTS "motoristas_cnh_authenticated_delete" ON storage.objects;
CREATE POLICY "motoristas_cnh_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'motoristas-cnh');
