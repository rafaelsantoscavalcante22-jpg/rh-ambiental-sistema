-- Cole no SQL Editor do Supabase: ficheiro completo (sem reticências).
-- Replica a migração 20260423100000_coletas_alinhar_fluxo_etapa_operacional.sql

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
  'Ordem numérica das etapas do fluxo RG (canónico + legados); alinhar fluxo_status com etapa_operacional.';

-- Só fluxo_status: status_processo tem CHECK com outros valores (MTR_EMITIDA, EM_CONFERENCIA, …).
UPDATE public.coletas c
SET fluxo_status = c.etapa_operacional
WHERE public.rg_ordem_etapa_fluxo(c.etapa_operacional) > public.rg_ordem_etapa_fluxo(c.fluxo_status)
  AND public.rg_ordem_etapa_fluxo(c.etapa_operacional) >= 1
  AND public.rg_ordem_etapa_fluxo(c.fluxo_status) >= 1;
