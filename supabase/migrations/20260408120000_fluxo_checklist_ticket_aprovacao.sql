-- =============================================================================
-- Fluxo operacional RG: checklist de transporte, tickets operacionais, trilho de aprovação
-- Executar: supabase db push / SQL Editor
-- =============================================================================

-- Checklist preenchido pelo motorista / logística (vínculo à coleta)
CREATE TABLE IF NOT EXISTS public.checklist_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes text,
  preenchido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_transporte_coleta ON public.checklist_transporte (coleta_id);

COMMENT ON TABLE public.checklist_transporte IS
  'Checklist de transporte (motorista/logística), alinhado ao fluxo pós-MTR.';

-- Ticket operacional (distinto da MTR e do número interno em coleta.ticket_numero quando existir)
CREATE TABLE IF NOT EXISTS public.tickets_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  numero text,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_operacionais_coleta ON public.tickets_operacionais (coleta_id);

COMMENT ON TABLE public.tickets_operacionais IS
  'Ticket operacional gerado após conferência; fluxo separado da MTR.';

-- Registo de aprovação pela diretoria (histórico simples)
CREATE TABLE IF NOT EXISTS public.aprovacoes_diretoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  decisao text NOT NULL CHECK (decisao IN ('aprovado', 'ajuste_solicitado')),
  observacoes text,
  decidido_em timestamptz NOT NULL DEFAULT now(),
  decidido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_aprovacoes_diretoria_coleta ON public.aprovacoes_diretoria (coleta_id);

COMMENT ON TABLE public.aprovacoes_diretoria IS
  'Decisões da diretoria sobre o pacote MTR + ticket antes do faturamento.';

-- Faturamento (registo explícito antes de enviar ao financeiro)
CREATE TABLE IF NOT EXISTS public.faturamento_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  valor numeric,
  referencia_nf text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'emitido', 'cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faturamento_registros_coleta ON public.faturamento_registros (coleta_id);

COMMENT ON TABLE public.faturamento_registros IS
  'Camada de faturamento antes de enviar ao financeiro.';

-- Conferência operacional (checklist de documentos recebidos)
CREATE TABLE IF NOT EXISTS public.conferencia_operacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  documentos_ok boolean NOT NULL DEFAULT false,
  observacoes text,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  conferido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conferencia_operacional_coleta ON public.conferencia_operacional (coleta_id);

-- RLS (ajuste fino por perfil depois; aqui: utilizadores autenticados da aplicação)
ALTER TABLE public.checklist_transporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets_operacionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprovacoes_diretoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencia_operacional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_transporte_authenticated_all" ON public.checklist_transporte;
CREATE POLICY "checklist_transporte_authenticated_all"
  ON public.checklist_transporte FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tickets_operacionais_authenticated_all" ON public.tickets_operacionais;
CREATE POLICY "tickets_operacionais_authenticated_all"
  ON public.tickets_operacionais FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "aprovacoes_diretoria_authenticated_all" ON public.aprovacoes_diretoria;
CREATE POLICY "aprovacoes_diretoria_authenticated_all"
  ON public.aprovacoes_diretoria FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "faturamento_registros_authenticated_all" ON public.faturamento_registros;
CREATE POLICY "faturamento_registros_authenticated_all"
  ON public.faturamento_registros FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "conferencia_operacional_authenticated_all" ON public.conferencia_operacional;
CREATE POLICY "conferencia_operacional_authenticated_all"
  ON public.conferencia_operacional FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
