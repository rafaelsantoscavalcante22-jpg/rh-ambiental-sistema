-- Estado de presença escolhido pelo utilizador (cabeçalho + chat).

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS presenca_status text NOT NULL DEFAULT 'online';

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_presenca_status_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_presenca_status_check
  CHECK (presenca_status IN ('online', 'ausente', 'offline'));

COMMENT ON COLUMN public.usuarios.presenca_status IS
  'Presença manual no painel: online, ausente, offline.';

-- Realtime: outros utilizadores veem mudanças (RLS limita linhas visíveis).
DO $p$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'usuarios'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios;
  END IF;
END;
$p$;
