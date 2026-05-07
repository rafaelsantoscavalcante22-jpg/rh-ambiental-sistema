-- Margem de lucro por cliente + indicador de SLA de faturamento (3 dias) na view de resumo.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS margem_lucro_percentual numeric(7, 2);

COMMENT ON COLUMN public.clientes.margem_lucro_percentual IS
  'Margem de lucro alvo para o cliente (%). Opcional; usada em precificação / relatórios.';

-- Função de apoio: mesma regra da coluna computada da view (para jobs ou relatórios SQL).
CREATE OR REPLACE FUNCTION public.coleta_faturamento_sla_vencido(
  p_created_at timestamptz,
  p_faturamento_registro_status text,
  p_fluxo_status text,
  p_etapa_operacional text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    p_created_at < (now() - interval '3 days')
    AND COALESCE(btrim(p_faturamento_registro_status), '') <> 'emitido'
    AND NOT (
      COALESCE(btrim(p_fluxo_status), '') IN (
        'ENVIADO_FINANCEIRO',
        'FINALIZADO',
        'FATURADO',
        'LIBERADO_FINANCEIRO'
      )
      OR COALESCE(btrim(p_etapa_operacional), '') IN (
        'ENVIADO_FINANCEIRO',
        'FINALIZADO',
        'FATURADO',
        'LIBERADO_FINANCEIRO'
      )
    );
$$;

COMMENT ON FUNCTION public.coleta_faturamento_sla_vencido IS
  'Verdadeiro se a coleta tem mais de 3 dias e ainda não foi faturada (emitida) nem enviada ao financeiro.';

DROP VIEW IF EXISTS public.vw_faturamento_resumo CASCADE;

CREATE VIEW public.vw_faturamento_resumo
WITH (security_invoker = true) AS
SELECT
  c.id AS coleta_id,
  c.numero,
  c.numero_coleta,
  c.cliente_id,
  COALESCE(cl.nome, c.cliente) AS cliente_nome,
  cl.razao_social AS cliente_razao_social,
  cl.margem_lucro_percentual AS cliente_margem_lucro_percentual,
  c.data_agendada,
  COALESCE(p.data_programada, c.data_agendada) AS data_programacao,
  c.data_coleta AS data_execucao,
  c.programacao_id,
  p.numero AS programacao_numero,
  p.observacoes AS programacao_observacoes,
  c.mtr_id,
  m.numero AS mtr_numero,
  m.observacoes AS mtr_observacoes,
  COALESCE(
    NULLIF(btrim(c.ticket_numero), ''),
    ltk.ticket_numero
  ) AS ticket_comprovante,
  c.peso_tara,
  c.peso_bruto,
  c.peso_liquido,
  COALESCE(c.motorista_nome, c.motorista) AS motorista,
  c.placa,
  c.valor_coleta,
  c.status_pagamento,
  c.data_vencimento,
  COALESCE(c.numero_nf, lfr.referencia_nf) AS referencia_nf,
  c.numero_nf AS numero_nf_coleta,
  lfr.referencia_nf AS faturamento_referencia_nf,
  lfr.status AS faturamento_registro_status,
  lfr.valor AS faturamento_registro_valor,
  c.confirmacao_recebimento,
  c.fluxo_status,
  c.etapa_operacional,
  c.status_processo,
  c.liberado_financeiro,
  c.observacoes AS coleta_observacoes,
  c.tipo_residuo,
  c.cidade,
  c.created_at,
  la.decisao AS ultima_aprovacao_decisao,
  la.observacoes AS ultima_aprovacao_obs,
  la.decidido_em AS ultima_aprovacao_em,
  lco.documentos_ok AS conferencia_documentos_ok,
  lco.observacoes AS conferencia_operacional_obs,
  lco.conferido_em AS conferencia_em,
  lcr.nf_enviada_em AS conta_receber_nf_enviada_em,
  lcr.nf_envio_observacao AS conta_receber_nf_envio_obs,
  lcr.valor_pago AS conta_receber_valor_pago,
  lcr.valor_travado AS conta_receber_valor_travado,
  CASE
    WHEN c.mtr_id IS NOT NULL
      AND c.peso_liquido IS NOT NULL
      AND c.peso_liquido > 0
      AND (
        (c.ticket_numero IS NOT NULL AND btrim(c.ticket_numero) <> '')
        OR (ltk.ticket_numero IS NOT NULL AND btrim(ltk.ticket_numero) <> '')
      )
    THEN 'PRONTO_PARA_FATURAR'::text
    ELSE 'PENDENTE'::text
  END AS status_conferencia,
  trim(both ', ' FROM concat_ws(', ',
    CASE WHEN c.mtr_id IS NULL THEN 'sem MTR' END,
    CASE WHEN c.peso_liquido IS NULL OR c.peso_liquido <= 0 THEN 'sem peso líquido' END,
    CASE
      WHEN (c.ticket_numero IS NULL OR btrim(c.ticket_numero) = '')
        AND (ltk.ticket_numero IS NULL OR btrim(ltk.ticket_numero) = '')
      THEN 'sem ticket'
    END,
    CASE WHEN c.valor_coleta IS NULL OR c.valor_coleta <= 0 THEN 'sem valor' END
  )) AS pendencias_resumo,
  public.coleta_faturamento_sla_vencido(
    c.created_at,
    lfr.status,
    c.fluxo_status,
    c.etapa_operacional
  ) AS faturamento_sla_vencido,
  c.status_pagamento AS status_faturamento
FROM public.coletas c
LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.programacoes p ON p.id = c.programacao_id
LEFT JOIN public.mtrs m ON m.id = c.mtr_id
LEFT JOIN LATERAL (
  SELECT t.numero AS ticket_numero
  FROM public.tickets_operacionais t
  WHERE t.coleta_id = c.id
  ORDER BY t.created_at DESC NULLS LAST, t.id DESC
  LIMIT 1
) ltk ON true
LEFT JOIN LATERAL (
  SELECT ad.decisao, ad.observacoes, ad.decidido_em
  FROM public.aprovacoes_diretoria ad
  WHERE ad.coleta_id = c.id
  ORDER BY ad.decidido_em DESC NULLS LAST, ad.id DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT fr.status, fr.referencia_nf, fr.valor
  FROM public.faturamento_registros fr
  WHERE fr.coleta_id = c.id
  ORDER BY fr.updated_at DESC NULLS LAST, fr.id DESC
  LIMIT 1
) lfr ON true
LEFT JOIN LATERAL (
  SELECT co.documentos_ok, co.observacoes, co.conferido_em
  FROM public.conferencia_operacional co
  WHERE co.coleta_id = c.id
  ORDER BY co.conferido_em DESC NULLS LAST, co.id DESC
  LIMIT 1
) lco ON true
LEFT JOIN LATERAL (
  SELECT cr.nf_enviada_em, cr.nf_envio_observacao, cr.valor_pago, cr.valor_travado
  FROM public.contas_receber cr
  WHERE cr.referencia_coleta_id = c.id
  LIMIT 1
) lcr ON true;

COMMENT ON VIEW public.vw_faturamento_resumo IS
  'Consolidação para conferência / faturamento / financeiro; inclui SLA de 3 dias (faturamento_sla_vencido) e margem do cliente.';

COMMENT ON COLUMN public.vw_faturamento_resumo.faturamento_sla_vencido IS
  'Indica atraso: coleta criada há mais de 3 dias sem faturamento emitido e sem envio ao financeiro.';

GRANT SELECT ON public.vw_faturamento_resumo TO authenticated;
