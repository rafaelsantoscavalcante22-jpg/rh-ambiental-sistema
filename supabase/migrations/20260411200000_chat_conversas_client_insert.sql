-- Permite criar conversa directa pelo cliente quando a RPC ainda não está exposta (ex.: cache PostgREST)
-- ou como caminho alternativo. O trigger preenche chat_participantes (antes só a RPC inseria).

CREATE OR REPLACE FUNCTION public.chat_conversas_after_insert_participantes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (NEW.id, NEW.participant_low), (NEW.id, NEW.participant_high)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_conversas_insert_participantes ON public.chat_conversas;
CREATE TRIGGER trg_chat_conversas_insert_participantes
  AFTER INSERT ON public.chat_conversas
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_conversas_after_insert_participantes();

DROP POLICY IF EXISTS "chat_conversas_insert_direct_member" ON public.chat_conversas;
CREATE POLICY "chat_conversas_insert_direct_member"
  ON public.chat_conversas FOR INSERT TO authenticated
  WITH CHECK (
    tipo = 'direct'
    AND participant_low IS NOT NULL
    AND participant_high IS NOT NULL
    AND participant_low < participant_high
    AND (auth.uid() = participant_low OR auth.uid() = participant_high)
  );

GRANT INSERT ON public.chat_conversas TO authenticated;
