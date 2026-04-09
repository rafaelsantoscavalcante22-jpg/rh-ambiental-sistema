-- =============================================================================
-- Chat interno 1:1 — conversas, participantes, mensagens, storage, RLS, realtime
-- =============================================================================

-- Diretório: utilizadores autenticados podem listar colegas ativos (UI / presença)
DROP POLICY IF EXISTS "usuarios_select_ativos_directory" ON public.usuarios;
CREATE POLICY "usuarios_select_ativos_directory"
  ON public.usuarios FOR SELECT TO authenticated
  USING (lower(coalesce(status, '')) = 'ativo');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'direct' CHECK (tipo = 'direct'),
  participant_low uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  participant_high uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  ultima_preview text,
  ultima_em timestamptz,
  ultima_remetente_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (participant_low < participant_high)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversas_direct_pair
  ON public.chat_conversas (participant_low, participant_high);

CREATE TABLE IF NOT EXISTS public.chat_participantes (
  conversa_id uuid NOT NULL REFERENCES public.chat_conversas (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  last_read_at timestamptz,
  PRIMARY KEY (conversa_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participantes_user_id ON public.chat_participantes (user_id);

CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.chat_conversas (id) ON DELETE CASCADE,
  remetente_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  conteudo text,
  anexo_bucket text DEFAULT 'chat-anexos',
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (conteudo IS NOT NULL AND length(trim(conteudo)) > 0)
    OR (anexo_path IS NOT NULL AND length(trim(anexo_path)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa_created
  ON public.chat_mensagens (conversa_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers: preview / updated_at na conversa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_on_new_message_bump_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview text;
BEGIN
  IF NEW.conteudo IS NOT NULL AND length(trim(NEW.conteudo)) > 0 THEN
    v_preview := left(trim(NEW.conteudo), 240);
  ELSIF NEW.anexo_nome IS NOT NULL AND length(trim(NEW.anexo_nome)) > 0 THEN
    v_preview := '📎 ' || left(trim(NEW.anexo_nome), 200);
  ELSE
    v_preview := 'Anexo';
  END IF;

  UPDATE public.chat_conversas
  SET
    ultima_preview = v_preview,
    ultima_em = NEW.created_at,
    ultima_remetente_id = NEW.remetente_id,
    updated_at = now()
  WHERE id = NEW.conversa_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_mensagens_bump_conversa ON public.chat_mensagens;
CREATE TRIGGER trg_chat_mensagens_bump_conversa
  AFTER INSERT ON public.chat_mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_on_new_message_bump_conversa();

-- ---------------------------------------------------------------------------
-- RPC: conversa directa única + participantes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_get_or_create_direct(p_outro uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_outro IS NULL OR p_outro = v_me THEN
    RAISE EXCEPTION 'invalid_peer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_outro AND lower(coalesce(u.status, '')) = 'ativo'
  ) THEN
    RAISE EXCEPTION 'peer_not_found';
  END IF;

  IF p_outro < v_me THEN
    v_low := p_outro;
    v_high := v_me;
  ELSE
    v_low := v_me;
    v_high := p_outro;
  END IF;

  INSERT INTO public.chat_conversas (participant_low, participant_high)
  VALUES (v_low, v_high)
  ON CONFLICT (participant_low, participant_high) DO UPDATE
  SET updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (v_id, v_low), (v_id, v_high)
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_get_or_create_direct(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_get_or_create_direct(uuid) TO authenticated;

-- Contagens de não lidas (participação do utilizador actual)
CREATE OR REPLACE FUNCTION public.chat_unread_by_conversa()
RETURNS TABLE (conversa_id uuid, unread bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.conversa_id,
    count(*)::bigint AS unread
  FROM public.chat_mensagens m
  INNER JOIN public.chat_participantes cp
    ON cp.conversa_id = m.conversa_id
   AND cp.user_id = auth.uid()
  WHERE m.remetente_id IS DISTINCT FROM auth.uid()
    AND m.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
  GROUP BY m.conversa_id;
$$;

REVOKE ALL ON FUNCTION public.chat_unread_by_conversa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_unread_by_conversa() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversas_select_participant" ON public.chat_conversas;
CREATE POLICY "chat_conversas_select_participant"
  ON public.chat_conversas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.conversa_id = chat_conversas.id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_participantes_select_own" ON public.chat_participantes;
DROP POLICY IF EXISTS "chat_participantes_select_member" ON public.chat_participantes;
CREATE POLICY "chat_participantes_select_member"
  ON public.chat_participantes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participantes me
      WHERE me.conversa_id = chat_participantes.conversa_id
        AND me.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_participantes_update_own_read" ON public.chat_participantes;
CREATE POLICY "chat_participantes_update_own_read"
  ON public.chat_participantes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_mensagens_select_participant" ON public.chat_mensagens;
CREATE POLICY "chat_mensagens_select_participant"
  ON public.chat_mensagens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.conversa_id = chat_mensagens.conversa_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_mensagens_insert_self_participant" ON public.chat_mensagens;
CREATE POLICY "chat_mensagens_insert_self_participant"
  ON public.chat_mensagens FOR INSERT TO authenticated
  WITH CHECK (
    remetente_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.conversa_id = chat_mensagens.conversa_id
        AND cp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants (sem INSERT directo em chat_conversas — só RPC)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.chat_conversas TO authenticated;
GRANT SELECT, UPDATE ON public.chat_participantes TO authenticated;
GRANT SELECT, INSERT ON public.chat_mensagens TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;
  END IF;
END;
$pub$;

-- ---------------------------------------------------------------------------
-- Storage: chat-anexos (privado)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-anexos',
  'chat-anexos',
  false,
  15728640,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "chat_anexos_select_participant" ON storage.objects;
CREATE POLICY "chat_anexos_select_participant"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "chat_anexos_insert_participant" ON storage.objects;
CREATE POLICY "chat_anexos_insert_participant"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "chat_anexos_update_participant" ON storage.objects;
CREATE POLICY "chat_anexos_update_participant"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "chat_anexos_delete_participant" ON storage.objects;
CREATE POLICY "chat_anexos_delete_participant"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );
