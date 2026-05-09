-- =============================================================================
-- Chat interno: administradores podem apagar todo o histórico de uma conversa
-- (mensagens + anexos no bucket chat-anexos). Requer participação na conversa.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.chat_admin_apagar_historico_conversa(p_conversa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.rg_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_participantes cp
    WHERE cp.conversa_id = p_conversa_id
      AND cp.user_id = v_me
  ) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = 'chat-anexos'
    AND name LIKE p_conversa_id::text || '/%';

  DELETE FROM public.chat_mensagens
  WHERE conversa_id = p_conversa_id;

  UPDATE public.chat_conversas
  SET
    ultima_preview = NULL,
    ultima_em = NULL,
    ultima_remetente_id = NULL,
    updated_at = now()
  WHERE id = p_conversa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_admin_apagar_historico_conversa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_admin_apagar_historico_conversa(uuid) TO authenticated;
