-- Alinha `fluxo_status` a `etapa_operacional` quando esta está à frente na ordem canónica.
-- Não altera `status_processo`: no projeto esse campo segue outro vocabulário (CHECK, ex.: MTR_EMITIDA, EM_CONFERENCIA).
--
-- Aplicar: `supabase db push` OU colar no SQL Editor do Supabase o **ficheiro inteiro** (desde CREATE até ao UPDATE).
-- Não use reticências (...) no meio do código — isso gera erro de sintaxe (42601).

CREATE OR REPLACE FUNCTION public.rg_ordem_etapa_fluxo(p_etapa text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE upper(btrim(p_etapa))
    WHEN 'PROGRAMACAO_CRIADA' THEN 1
    WHEN 'QUADRO_ATUALIZADO' THEN 2
    WHEN 'MTR_PREENCHIDA' THEN 3
    WHEN 'MTR_ENTREGUE_LOGISTICA' THEN 4
    WHEN 'LOGISTICA_DESIGNADA' THEN 5
    WHEN 'TARA_REGISTRADA' THEN 6
    WHEN 'COLETA_REALIZADA' THEN 7
    WHEN 'BRUTO_REGISTRADO' THEN 8
    WHEN 'CONTROLE_PESAGEM_LANCADO' THEN 9
    WHEN 'DOCUMENTOS_RECEBIDOS_OPERACIONAL' THEN 10
    WHEN 'TICKET_GERADO' THEN 11
    WHEN 'ENVIADO_APROVACAO' THEN 12
    WHEN 'APROVADO' THEN 13
    WHEN 'ARQUIVADO' THEN 14
    WHEN 'FATURADO' THEN 15
    WHEN 'ENVIADO_FINANCEIRO' THEN 16
    WHEN 'FINALIZADO' THEN 17
    -- Legados (mesmo mapeamento que src/lib/fluxoEtapas.ts)
    WHEN 'PESO_CALCULADO' THEN 9
    WHEN 'LANCADO_CONTROLE_MASSA' THEN 9
    WHEN 'CONTROLE_PESAGEM' THEN 9
    WHEN 'DOCUMENTO_CRIADO' THEN 3
    WHEN 'DOCUMENTO_ENTREGUE' THEN 4
    WHEN 'LIBERADO_FINANCEIRO' THEN 16
    WHEN 'LOGISTICA_DESIGNADA_SAIDA' THEN 5
    WHEN 'RETORNO_PESO_BRUTO' THEN 8
    ELSE -1
  END
$$;

COMMENT ON FUNCTION public.rg_ordem_etapa_fluxo(text) IS
  'Ordem numérica das etapas do fluxo RG (canónico + legados); usada para alinhar fluxo_status com etapa_operacional.';

UPDATE public.coletas c
SET fluxo_status = c.etapa_operacional
WHERE public.rg_ordem_etapa_fluxo(c.etapa_operacional) > public.rg_ordem_etapa_fluxo(c.fluxo_status)
  AND public.rg_ordem_etapa_fluxo(c.etapa_operacional) >= 1
  AND public.rg_ordem_etapa_fluxo(c.fluxo_status) >= 1;

-- Só seeds de faturamento (alternativa conservadora):
-- UPDATE public.coletas
-- SET fluxo_status = etapa_operacional
-- WHERE observacoes ILIKE '%[FAT-TEST-5]%'
--   AND etapa_operacional IS NOT NULL
--   AND btrim(etapa_operacional) <> ''
--   AND etapa_operacional IS DISTINCT FROM fluxo_status;
