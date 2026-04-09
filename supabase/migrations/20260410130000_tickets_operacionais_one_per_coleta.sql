-- Um ticket operacional por coleta (evita várias linhas e falhas em PostgREST / UI).
-- Mantém o registo mais recente por coleta_id (empate: maior id).

DELETE FROM public.tickets_operacionais a
WHERE a.id NOT IN (
  SELECT id
  FROM (
    SELECT DISTINCT ON (coleta_id) id
    FROM public.tickets_operacionais
    ORDER BY coleta_id, created_at DESC NULLS LAST, id DESC
  ) keepers
);

CREATE UNIQUE INDEX IF NOT EXISTS tickets_operacionais_coleta_id_uidx
  ON public.tickets_operacionais (coleta_id);

COMMENT ON INDEX public.tickets_operacionais_coleta_id_uidx IS
  'Garante no máximo um ticket por coleta (fluxo Controle de Massa → ticket).';
