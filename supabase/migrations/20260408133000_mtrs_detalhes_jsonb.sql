-- Campos do modelo MTR (planilha) em JSONB, sem quebrar o schema atual.
-- Execute no Supabase: `supabase db push` ou via SQL Editor.

ALTER TABLE public.mtrs
ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '{}'::jsonb;

