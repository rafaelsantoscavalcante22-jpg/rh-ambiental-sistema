-- Realtime em chat_participantes: actualizar UI (ex.: badge não lidas) quando last_read_at muda.
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_participantes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participantes;
  END IF;
END;
$pub$;
