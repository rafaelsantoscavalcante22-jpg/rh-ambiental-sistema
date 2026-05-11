-- =============================================================================
-- Auditoria: quem lançou programação e MTR (nome + user id). Imutável na app
-- exceto para cargo Desenvolvedor (enforcement por trigger).
-- Atualiza RPC de expansão de coleta fixa para copiar o criador do template.
-- =============================================================================

ALTER TABLE public.programacoes
  ADD COLUMN IF NOT EXISTS criado_por_user_id uuid,
  ADD COLUMN IF NOT EXISTS criado_por_nome text;

COMMENT ON COLUMN public.programacoes.criado_por_user_id IS 'auth.users / usuarios.id do utilizador que criou a linha (auditoria).';
COMMENT ON COLUMN public.programacoes.criado_por_nome IS 'Nome de exibição gravado no lançamento (auditoria; imutável exceto Desenvolvedor).';

ALTER TABLE public.mtrs
  ADD COLUMN IF NOT EXISTS criado_por_user_id uuid,
  ADD COLUMN IF NOT EXISTS criado_por_nome text;

COMMENT ON COLUMN public.mtrs.criado_por_user_id IS 'auth.users / usuarios.id do utilizador que criou a MTR (auditoria).';
COMMENT ON COLUMN public.mtrs.criado_por_nome IS 'Nome de exibição gravado no lançamento (auditoria; imutável exceto Desenvolvedor).';

CREATE OR REPLACE FUNCTION public.trg_bloquear_mudanca_criador_exceto_desenvolvedor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF (NEW.criado_por_user_id IS DISTINCT FROM OLD.criado_por_user_id)
     OR (NEW.criado_por_nome IS DISTINCT FROM OLD.criado_por_nome) THEN
    -- Migrações / service role / SQL editor: sem JWT — não bloquear.
    IF auth.uid() IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.usuarios u
        WHERE u.id = auth.uid()
          AND lower(trim(coalesce(u.cargo, ''))) LIKE '%desenvolvedor%'
      ) THEN
        RAISE EXCEPTION 'Somente o cargo Desenvolvedor pode alterar os campos de auditoria do lançamento (criado_por).';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_programacoes_criador_lock ON public.programacoes;
CREATE TRIGGER trg_programacoes_criador_lock
  BEFORE UPDATE ON public.programacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bloquear_mudanca_criador_exceto_desenvolvedor();

DROP TRIGGER IF EXISTS trg_mtrs_criador_lock ON public.mtrs;
CREATE TRIGGER trg_mtrs_criador_lock
  BEFORE UPDATE ON public.mtrs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_bloquear_mudanca_criador_exceto_desenvolvedor();

-- Mantém a lógica de 20260511130000_programacao_dias_semana.sql e acrescenta criador na expansão.
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
            programacao_dias_semana,
            criado_por_user_id,
            criado_por_nome
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
            tmpl.programacao_dias_semana,
            tmpl.criado_por_user_id,
            tmpl.criado_por_nome
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
