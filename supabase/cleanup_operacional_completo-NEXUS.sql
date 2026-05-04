-- Limpeza manual (SQL Editor): apaga dados de teste / operacionais.
-- Preserva: public.clientes, public.motoristas, public.caminhoes, public.usuarios,
-- public.faturamento_precos_regras (regras de preço) e contas auth.
-- Ordem: filhos → financeiro_auditoria → coletas (CASCADE em contas_receber / baixas) → mtrs → programações.

UPDATE public.programacoes SET coleta_id = NULL WHERE coleta_id IS NOT NULL;

DELETE FROM public.controle_massa;
DELETE FROM public.checklist_transporte;
DELETE FROM public.conferencia_transporte;
DELETE FROM public.tickets_operacionais;
DELETE FROM public.conferencia_operacional;
DELETE FROM public.aprovacoes_diretoria;
DELETE FROM public.faturamento_registros;
DELETE FROM public.financeiro_documentos;
DELETE FROM public.nf_envios_log;
DELETE FROM public.financeiro_auditoria;

DELETE FROM public.coletas;
DELETE FROM public.mtrs;
DELETE FROM public.programacoes;
