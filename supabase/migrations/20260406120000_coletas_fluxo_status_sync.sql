-- =============================================================================
-- Coletas: coluna fluxo_status + sincronização com etapa_operacional + legado
-- Aplicar: Supabase Dashboard → SQL → New query → colar → Run
--          ou: supabase db push (CLI), ou: psql
-- =============================================================================

ALTER TABLE public.coletas
  ADD COLUMN IF NOT EXISTS fluxo_status text;

COMMENT ON COLUMN public.coletas.fluxo_status IS
  'Etapa canônica do fluxo RG Ambiental (alinhada a etapa_operacional).';

-- ---------------------------------------------------------------------------
-- 1) Copiar etapa → fluxo quando fluxo estiver vazio
-- ---------------------------------------------------------------------------
UPDATE public.coletas
SET fluxo_status = btrim(etapa_operacional)
WHERE (fluxo_status IS NULL OR btrim(fluxo_status) = '')
  AND etapa_operacional IS NOT NULL
  AND btrim(etapa_operacional) <> '';

-- ---------------------------------------------------------------------------
-- 2) Copiar fluxo → etapa quando etapa estiver vazio
-- ---------------------------------------------------------------------------
UPDATE public.coletas
SET etapa_operacional = btrim(fluxo_status)
WHERE (etapa_operacional IS NULL OR btrim(etapa_operacional) = '')
  AND fluxo_status IS NOT NULL
  AND btrim(fluxo_status) <> '';

-- ---------------------------------------------------------------------------
-- 3) Normalizar códigos legados (mesmo mapa conceitual do app / fluxoEtapas)
-- ---------------------------------------------------------------------------
UPDATE public.coletas
SET
  fluxo_status = 'CONTROLE_PESAGEM_LANCADO',
  etapa_operacional = 'CONTROLE_PESAGEM_LANCADO'
WHERE fluxo_status IN ('CONTROLE_PESAGEM', 'PESO_CALCULADO', 'LANCADO_CONTROLE_MASSA')
   OR etapa_operacional IN ('CONTROLE_PESAGEM', 'PESO_CALCULADO', 'LANCADO_CONTROLE_MASSA');

UPDATE public.coletas
SET
  fluxo_status = 'MTR_PREENCHIDA',
  etapa_operacional = 'MTR_PREENCHIDA'
WHERE fluxo_status = 'DOCUMENTO_CRIADO'
   OR etapa_operacional = 'DOCUMENTO_CRIADO';

UPDATE public.coletas
SET
  fluxo_status = 'MTR_ENTREGUE_LOGISTICA',
  etapa_operacional = 'MTR_ENTREGUE_LOGISTICA'
WHERE fluxo_status = 'DOCUMENTO_ENTREGUE'
   OR etapa_operacional = 'DOCUMENTO_ENTREGUE';

UPDATE public.coletas
SET
  fluxo_status = 'ENVIADO_FINANCEIRO',
  etapa_operacional = 'ENVIADO_FINANCEIRO'
WHERE fluxo_status = 'LIBERADO_FINANCEIRO'
   OR etapa_operacional = 'LIBERADO_FINANCEIRO';

UPDATE public.coletas
SET
  fluxo_status = 'LOGISTICA_DESIGNADA',
  etapa_operacional = 'LOGISTICA_DESIGNADA'
WHERE fluxo_status = 'LOGISTICA_DESIGNADA_SAIDA'
   OR etapa_operacional = 'LOGISTICA_DESIGNADA_SAIDA';

UPDATE public.coletas
SET
  fluxo_status = 'BRUTO_REGISTRADO',
  etapa_operacional = 'BRUTO_REGISTRADO'
WHERE fluxo_status = 'RETORNO_PESO_BRUTO'
   OR etapa_operacional = 'RETORNO_PESO_BRUTO';

-- ---------------------------------------------------------------------------
-- 4) Índices para listagens por etapa (opcional, seguro se repetir)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coletas_fluxo_status
  ON public.coletas (fluxo_status);

CREATE INDEX IF NOT EXISTS idx_coletas_etapa_operacional
  ON public.coletas (etapa_operacional);

CREATE INDEX IF NOT EXISTS idx_coletas_programacao_id
  ON public.coletas (programacao_id)
  WHERE programacao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coletas_mtr_id
  ON public.coletas (mtr_id)
  WHERE mtr_id IS NOT NULL;
