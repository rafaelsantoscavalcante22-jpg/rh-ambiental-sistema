-- Corrige RLS: evita recursão infinita em chat_conversas
-- A policy anterior verificava participação via chat_participantes, que por sua vez dependia de chat_conversas.

ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversas_select_participant" ON public.chat_conversas;

CREATE POLICY "chat_conversas_select_participant"
  ON public.chat_conversas FOR SELECT TO authenticated
  USING (participant_low = auth.uid() OR participant_high = auth.uid());

