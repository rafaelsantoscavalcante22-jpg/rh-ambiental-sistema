-- =============================================================================
-- Coleta fixa com periodicidade semanal: gera programações futuras no mesmo
-- dia da semana que data_programada. Usa programacao_serie_id para agrupar.
-- Chamar: select public.programacao_manter_fixas_semanais(53);
-- (Opcional: agendar com pg_cron diariamente.)
-- =============================================================================

ALTER TABLE public.programacoes
  ADD COLUMN IF NOT EXISTS programacao_serie_id uuid;

COMMENT ON COLUMN public.programacoes.programacao_serie_id IS
  'Identificador da série (recorrência). Partilhado por todas as ocorrências da mesma coleta fixa semanal.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_programacoes_serie_data
  ON public.programacoes (programacao_serie_id, data_programada)
  WHERE programacao_serie_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_programacoes_serie_id
  ON public.programacoes (programacao_serie_id)
  WHERE programacao_serie_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.programacao_periodicidade_e_semanal(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    lower(trim(coalesce(p, ''))) LIKE '%semanal%'
    OR lower(trim(coalesce(p, ''))) LIKE '%weekly%'
    OR lower(trim(coalesce(p, ''))) IN ('semana');
$$;

CREATE OR REPLACE FUNCTION public.programacao_manter_fixas_semanais(p_horizonte_semanas integer DEFAULT 53)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  tmpl public.programacoes%ROWTYPE;
  v_ins date;
  v_lim date;
  v_anchor date;
  v_serie_min date;
  v_dow_tmpl numeric;
  v_dow_anchor numeric;
  v_off integer;
  v_num text;
  n_ins integer := 0;
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
      AND public.programacao_periodicidade_e_semanal(w.periodicidade)
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

    IF NOT coalesce(tmpl.coleta_fixa, false)
       OR NOT public.programacao_periodicidade_e_semanal(tmpl.periodicidade) THEN
      CONTINUE;
    END IF;

    IF tmpl.data_programada IS NULL THEN
      CONTINUE;
    END IF;

    SELECT min(p.data_programada::date)
    INTO v_serie_min
    FROM public.programacoes p
    WHERE p.programacao_serie_id = r.sid;

    IF v_serie_min IS NULL THEN
      CONTINUE;
    END IF;

    v_anchor := GREATEST(CURRENT_DATE, v_serie_min);

    v_dow_tmpl := EXTRACT(DOW FROM tmpl.data_programada::date);
    v_dow_anchor := EXTRACT(DOW FROM v_anchor);
    v_off := ((v_dow_tmpl - v_dow_anchor)::integer % 7 + 7) % 7;
    v_ins := (v_anchor + v_off)::date;

    WHILE v_ins <= v_lim LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.programacoes x
        WHERE x.programacao_serie_id = r.sid
          AND x.data_programada = v_ins
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
          programacao_serie_id
        ) VALUES (
          v_num,
          tmpl.cliente_id,
          tmpl.cliente,
          v_ins,
          tmpl.tipo_caminhao,
          tmpl.tipo_servico,
          tmpl.observacoes,
          true,
          tmpl.periodicidade,
          'PENDENTE',
          NULL,
          tmpl.programacao_serie_id
        );

        n_ins := n_ins + 1;
      END IF;

      v_ins := (v_ins + 7)::date;
    END LOOP;
  END LOOP;

  RETURN n_ins;
END;
$$;

REVOKE ALL ON FUNCTION public.programacao_periodicidade_e_semanal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.programacao_manter_fixas_semanais(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.programacao_manter_fixas_semanais(integer) TO authenticated;

-- Liga programações antigas (fixas + texto semanal) como série individual para passarem a expandir.
UPDATE public.programacoes p
SET programacao_serie_id = p.id
WHERE p.programacao_serie_id IS NULL
  AND coalesce(p.coleta_fixa, false)
  AND public.programacao_periodicidade_e_semanal(p.periodicidade);
