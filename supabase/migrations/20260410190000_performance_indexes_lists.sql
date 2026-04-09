-- Índices para listagens, filtros e ordenações frequentes (escala / performance).
-- CREATE INDEX IF NOT EXISTS é idempotente em migrações repetidas.

-- Coletas
CREATE INDEX IF NOT EXISTS idx_coletas_created_at_desc ON public.coletas (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_coletas_cliente_id ON public.coletas (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_programacao_id ON public.coletas (programacao_id) WHERE programacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_mtr_id ON public.coletas (mtr_id) WHERE mtr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_fluxo_status ON public.coletas (fluxo_status) WHERE fluxo_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_data_agendada ON public.coletas (data_agendada) WHERE data_agendada IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_numero_coleta ON public.coletas (numero_coleta);
CREATE INDEX IF NOT EXISTS idx_coletas_liberado_financeiro ON public.coletas (liberado_financeiro) WHERE liberado_financeiro IS NOT NULL;

-- MTRs
CREATE INDEX IF NOT EXISTS idx_mtrs_programacao_id ON public.mtrs (programacao_id) WHERE programacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mtrs_created_at_desc ON public.mtrs (created_at DESC NULLS LAST);

-- Programações
CREATE INDEX IF NOT EXISTS idx_programacoes_data_programada ON public.programacoes (data_programada) WHERE data_programada IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programacoes_cliente_id ON public.programacoes (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programacoes_coleta_id ON public.programacoes (coleta_id) WHERE coleta_id IS NOT NULL;

-- Clientes (busca / ordenação)
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON public.clientes (nome);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON public.clientes (cnpj) WHERE cnpj IS NOT NULL AND btrim(cnpj) <> '';

-- Controle de massa (última pesagem por coleta)
CREATE INDEX IF NOT EXISTS idx_controle_massa_coleta_created ON public.controle_massa (coleta_id, created_at DESC NULLS LAST);

-- Faturamento
CREATE INDEX IF NOT EXISTS idx_faturamento_registros_coleta ON public.faturamento_registros (coleta_id);

-- Tickets operacionais
CREATE INDEX IF NOT EXISTS idx_tickets_operacionais_coleta ON public.tickets_operacionais (coleta_id);

-- Usuários
CREATE INDEX IF NOT EXISTS idx_usuarios_created_at_desc ON public.usuarios (created_at DESC NULLS LAST);
