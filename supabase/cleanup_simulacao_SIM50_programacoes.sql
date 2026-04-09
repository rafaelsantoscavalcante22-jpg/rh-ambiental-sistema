-- Remove programações órfãs deixadas por tentativas de seed com chave anon (MTR bloqueado por RLS).
-- Rode no SQL Editor do Supabase se necessário.
-- Ajuste o filtro se usar outro prefixo.

DELETE FROM public.programacoes
WHERE observacoes LIKE '%[SIM-50]%'
  AND NOT EXISTS (
    SELECT 1 FROM public.coletas c WHERE c.programacao_id = programacoes.id
  );
