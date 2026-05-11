-- =============================================================================
-- Legado: todas as programações já existentes passam a constar como lançadas
-- por «Rafaela Thomaz». O UUID é preenchido a partir de public.usuarios quando
-- existir utilizadora com esse nome; senão mantém-se o criado_por_user_id já
-- gravado (se houver). Novas programações continuam a ser gravadas pela app
-- com o utilizador autenticado.
--
-- O trigger de auditoria bloqueia alterações a criado_por_* para quem não é
-- Desenvolvedor (incl. no SQL Editor com JWT). Desliga-se temporariamente aqui.
-- =============================================================================

ALTER TABLE public.programacoes DISABLE TRIGGER trg_programacoes_criador_lock;

DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT u.id
  INTO v_uid
  FROM public.usuarios u
  WHERE lower(regexp_replace(trim(coalesce(u.nome, '')), '\s+', ' ', 'g')) = lower('Rafaela Thomaz')
  LIMIT 1;

  IF v_uid IS NULL THEN
    SELECT u.id
    INTO v_uid
    FROM public.usuarios u
    WHERE lower(trim(coalesce(u.nome, ''))) LIKE '%rafaela%'
      AND lower(trim(coalesce(u.nome, ''))) LIKE '%thomaz%'
    LIMIT 1;
  END IF;

  UPDATE public.programacoes p
  SET
    criado_por_nome = 'Rafaela Thomaz',
    criado_por_user_id = coalesce(p.criado_por_user_id, v_uid);

  RAISE NOTICE 'programacoes: criado_por_nome = Rafaela Thomaz em todas as linhas; uuid resolvido: %', v_uid;
END $$;

ALTER TABLE public.programacoes ENABLE TRIGGER trg_programacoes_criador_lock;
