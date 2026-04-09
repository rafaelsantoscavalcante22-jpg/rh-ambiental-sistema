-- Corrige RLS: evita recursão infinita em chat_participantes
-- A policy anterior fazia SELECT em public.chat_participantes dentro da própria policy.

ALTER TABLE public.chat_participantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_participantes_select_own" ON public.chat_participantes;
DROP POLICY IF EXISTS "chat_participantes_select_member" ON public.chat_participantes;

CREATE POLICY "chat_participantes_select_member"
  ON public.chat_participantes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_conversas c
      WHERE c.id = chat_participantes.conversa_id
        AND (c.participant_low = auth.uid() OR c.participant_high = auth.uid())
    )
  );

