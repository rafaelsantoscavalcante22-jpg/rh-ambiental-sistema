-- Garante que ambos os interlocutores ficam em chat_participantes (lista + RLS + Realtime).
-- Corrige conversas antigas sem participantes e endurece get_or_create / insert mensagem.

-- ---------------------------------------------------------------------------
-- Backfill: conversas órfãs (sem as duas linhas em chat_participantes)
-- ---------------------------------------------------------------------------
INSERT INTO public.chat_participantes (conversa_id, user_id)
SELECT c.id, c.participant_low
FROM public.chat_conversas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_participantes p
  WHERE p.conversa_id = c.id AND p.user_id = c.participant_low
)
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_participantes (conversa_id, user_id)
SELECT c.id, c.participant_high
FROM public.chat_conversas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_participantes p
  WHERE p.conversa_id = c.id AND p.user_id = c.participant_high
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Par ordenado como UUID (igual ao servidor) — fallback cliente sem RPC principal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_ordered_participant_pair(p_a uuid, p_b uuid)
RETURNS TABLE (participant_low uuid, participant_high uuid)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_a < p_b THEN p_a ELSE p_b END,
         CASE WHEN p_a < p_b THEN p_b ELSE p_a END;
$$;

REVOKE ALL ON FUNCTION public.chat_ordered_participant_pair(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_ordered_participant_pair(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_or_create: id da conversa via SELECT após UPSERT (evita ambiguidades com RETURNING)
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
  SET updated_at = now();

  SELECT c.id INTO STRICT v_id
  FROM public.chat_conversas c
  WHERE c.participant_low = v_low AND c.participant_high = v_high;

  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (v_id, v_low), (v_id, v_high)
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enviar mensagem: se faltar linha em participantes, repõe a partir da conversa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_insert_mensagem(
  p_conversa_id uuid,
  p_conteudo text DEFAULT NULL,
  p_anexo_bucket text DEFAULT NULL,
  p_anexo_path text DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_anexo_mime text DEFAULT NULL,
  p_anexo_size bigint DEFAULT NULL
)
RETURNS SETOF public.chat_mensagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_c text;
  v_path text := nullif(trim(coalesce(p_anexo_path, '')), '');
  v_bucket text;
  v_low uuid;
  v_high uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  SELECT participant_low, participant_high
  INTO v_low, v_high
  FROM public.chat_conversas
  WHERE id = p_conversa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada.';
  END IF;

  IF v_me <> v_low AND v_me <> v_high THEN
    RAISE EXCEPTION 'Não pertence a esta conversa.';
  END IF;

  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (p_conversa_id, v_low), (p_conversa_id, v_high)
  ON CONFLICT DO NOTHING;

  v_c := trim(coalesce(p_conteudo, ''));

  IF v_path IS NOT NULL THEN
    IF length(v_c) = 0 THEN
      v_c := 'Anexo enviado';
    END IF;
    v_bucket := nullif(trim(coalesce(p_anexo_bucket, '')), '');
    IF v_bucket IS NULL THEN
      v_bucket := 'chat-anexos';
    END IF;
  ELSIF length(v_c) = 0 THEN
    RAISE EXCEPTION 'Mensagem vazia.';
  END IF;

  RETURN QUERY
  INSERT INTO public.chat_mensagens (
    conversa_id,
    remetente_id,
    conteudo,
    anexo_bucket,
    anexo_path,
    anexo_nome,
    anexo_mime,
    anexo_size
  )
  VALUES (
    p_conversa_id,
    v_me,
    v_c,
    v_bucket,
    v_path,
    p_anexo_nome,
    p_anexo_mime,
    p_anexo_size
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_insert_mensagem(uuid, text, text, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_insert_mensagem(uuid, text, text, text, text, text, bigint) TO authenticated;
