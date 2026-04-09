-- Envio de mensagens via RPC: evita falhas de RLS no INSERT/RETURNING e garante remetente = auth.uid().

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
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participantes cp
    WHERE cp.conversa_id = p_conversa_id AND cp.user_id = v_me
  ) THEN
    RAISE EXCEPTION 'Não pertence a esta conversa.';
  END IF;

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
