-- =============================================================================
-- Coleta fixa: dias da semana (ISO 1=Seg … 7=Dom) em programacao_dias_semana.
-- Expansão: para cada dia selecionado, gera programações até ao horizonte.
-- =============================================================================

ALTER TABLE public.programacoes
  ADD COLUMN IF NOT EXISTS programacao_dias_semana smallint[];

COMMENT ON COLUMN public.programacoes.programacao_dias_semana IS
  'Dias ISO 1=segunda … 7=domingo em que a coleta fixa se repete. Vazio/null: comportamento legado (só o dia de data_programada).';

CREATE OR REPLACE FUNCTION public.programacao_manter_fixas_semanais(p_horizonte_semanas integer DEFAULT 53)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  tmpl public.programacoes%ROWTYPE;
  v_d date;
  v_lim date;
  v_anchor date;
  v_serie_min date;
  v_num text;
  n_ins integer := 0;
  dias integer[];
BEGIN
  IF p_horizonte_semanas IS NULL OR p_horizonte_semanas < 1 THEN
    p_horizonte_semanas := 53;
  END IF;

  v_lim := (CURRENT_DATE + (p_horizonte_semanas * 7))::date;

  FOR r IN
    SELECT DISTINCT w.programacao_serie_id AS sid
    FROM public.programacoes w
    WHERE w.programacao_serie_id IS NOT NULL
      AND coalesce(w.coleta_fixa, false)
      AND (
        public.programacao_periodicidade_e_semanal(w.periodicidade)
        OR (
          w.programacao_dias_semana IS NOT NULL
          AND coalesce(array_length(w.programacao_dias_semana, 1), 0) > 0
        )
      )
  LOOP
    SELECT p.*
    INTO tmpl
    FROM public.programacoes p
    WHERE p.programacao_serie_id = r.sid
    ORDER BY p.data_programada DESC NULLS LAST, p.created_at DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF NOT coalesce(tmpl.coleta_fixa, false) THEN
      CONTINUE;
    END IF;

    IF tmpl.data_programada IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT public.programacao_periodicidade_e_semanal(tmpl.periodicidade)
       AND (
         tmpl.programacao_dias_semana IS NULL
         OR coalesce(array_length(tmpl.programacao_dias_semana, 1), 0) = 0
       ) THEN
      CONTINUE;
    END IF;

    dias := ARRAY(
      SELECT DISTINCT u::integer
      FROM unnest(coalesce(tmpl.programacao_dias_semana, '{}'::smallint[])) AS u
      WHERE u BETWEEN 1 AND 7
      ORDER BY 1
    );

    IF dias IS NULL OR cardinality(dias) = 0 THEN
      dias := ARRAY[EXTRACT(ISODOW FROM tmpl.data_programada::date)::integer];
    END IF;

    SELECT min(p.data_programada::date)
    INTO v_serie_min
    FROM public.programacoes p
    WHERE p.programacao_serie_id = r.sid;

    IF v_serie_min IS NULL THEN
      CONTINUE;
    END IF;

    v_anchor := GREATEST(CURRENT_DATE, v_serie_min);
    v_d := v_anchor;

    WHILE v_d <= v_lim LOOP
      IF EXTRACT(ISODOW FROM v_d)::integer = ANY(dias) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.programacoes x
          WHERE x.programacao_serie_id = r.sid
            AND x.data_programada = v_d
        ) THEN
          v_num := lpad(
            ((SELECT count(*)::bigint FROM public.programacoes) + 1)::text,
            3,
            '0'
          );

          INSERT INTO public.programacoes (
            numero,
            cliente_id,
            cliente,
            data_programada,
            tipo_caminhao,
            tipo_servico,
            observacoes,
            coleta_fixa,
            periodicidade,
            status_programacao,
            coleta_id,
            programacao_serie_id,
            programacao_dias_semana
          ) VALUES (
            v_num,
            tmpl.cliente_id,
            tmpl.cliente,
            v_d,
            tmpl.tipo_caminhao,
            tmpl.tipo_servico,
            tmpl.observacoes,
            true,
            coalesce(nullif(trim(tmpl.periodicidade), ''), 'Semanal'),
            'PENDENTE',
            NULL,
            tmpl.programacao_serie_id,
            tmpl.programacao_dias_semana
          );

          n_ins := n_ins + 1;
        END IF;
      END IF;

      v_d := (v_d + 1)::date;
    END LOOP;
  END LOOP;

  RETURN n_ins;
END;
$$;

REVOKE ALL ON FUNCTION public.programacao_manter_fixas_semanais(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.programacao_manter_fixas_semanais(integer) TO authenticated;

UPDATE public.programacoes p
SET programacao_dias_semana = ARRAY[EXTRACT(ISODOW FROM p.data_programada::date)::smallint]
WHERE coalesce(p.coleta_fixa, false)
  AND p.data_programada IS NOT NULL
  AND (
    p.programacao_dias_semana IS NULL
    OR coalesce(array_length(p.programacao_dias_semana, 1), 0) = 0
  )
  AND public.programacao_periodicidade_e_semanal(p.periodicidade);
