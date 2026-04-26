-- Regras de preço (faturamento automático) + contas a receber (pós-emissão).
-- Compatível com faturamento manual: se não houver regra ou tabelas não aplicadas, o fluxo existente mantém-se.

CREATE TABLE IF NOT EXISTS public.faturamento_precos_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE CASCADE,
  tipo_residuo text NOT NULL DEFAULT '',
  tipo_servico text DEFAULT 'COLETA',
  valor_por_kg numeric,
  valor_minimo numeric DEFAULT 0,
  valor_fixo numeric,
  valor_transporte_por_kg numeric,
  valor_tratamento_por_kg numeric,
  taxa_adicional_fixa numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faturamento_precos_regras_residuo_chk CHECK (char_length(btrim(tipo_residuo)) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_faturamento_precos_regras_ativo ON public.faturamento_precos_regras (ativo)
  WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_faturamento_precos_regras_cliente ON public.faturamento_precos_regras (cliente_id)
  WHERE cliente_id IS NOT NULL;

COMMENT ON TABLE public.faturamento_precos_regras IS
  'Regras de sugestão de valor: prioridade cliente+resíduo > cliente > geral por resíduo. tipo_residuo vazio ou * = qualquer resíduo.';

ALTER TABLE public.faturamento_precos_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faturamento_precos_regras_authenticated_all" ON public.faturamento_precos_regras;
CREATE POLICY "faturamento_precos_regras_authenticated_all"
  ON public.faturamento_precos_regras FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faturamento_precos_regras TO authenticated;

-- Uma conta por coleta (evita duplicar ao reemitir / atualizar).
CREATE TABLE IF NOT EXISTS public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE SET NULL,
  valor numeric NOT NULL,
  data_emissao date NOT NULL DEFAULT (CURRENT_DATE),
  data_vencimento date,
  status_pagamento text NOT NULL DEFAULT 'Pendente'
    CHECK (status_pagamento IN ('Pendente', 'Pago', 'Parcial', 'Cancelado')),
  referencia_coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  faturamento_registro_id uuid REFERENCES public.faturamento_registros (id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contas_receber_coleta_unique UNIQUE (referencia_coleta_id)
);

CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON public.contas_receber (cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON public.contas_receber (data_vencimento);

COMMENT ON TABLE public.contas_receber IS
  'Conta a receber gerada na emissão do faturamento; actualizada se já existir para a mesma coleta.';

ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contas_receber_authenticated_all" ON public.contas_receber;
CREATE POLICY "contas_receber_authenticated_all"
  ON public.contas_receber FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_receber TO authenticated;
