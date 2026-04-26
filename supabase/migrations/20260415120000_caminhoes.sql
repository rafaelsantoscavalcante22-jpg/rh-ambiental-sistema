-- RG Ambiental — ETAPA 3: cadastro base de caminhões
-- Aplicar: SQL Editor no Supabase ou script local com DATABASE_URL

CREATE TABLE IF NOT EXISTS public.caminhoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  modelo text,
  tipo text,
  rodizio text,
  status_disponibilidade text NOT NULL DEFAULT 'Disponível',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caminhoes_placa_key UNIQUE (placa)
);

CREATE INDEX IF NOT EXISTS idx_caminhoes_placa_lower ON public.caminhoes (lower(placa));
CREATE INDEX IF NOT EXISTS idx_caminhoes_status ON public.caminhoes (status_disponibilidade);

COMMENT ON TABLE public.caminhoes IS
  'Frota / veículos; base para logística (integração com outras telas em etapa posterior).';
COMMENT ON COLUMN public.caminhoes.placa IS 'Placa do veículo (única no cadastro).';
COMMENT ON COLUMN public.caminhoes.modelo IS 'Modelo do veículo.';
COMMENT ON COLUMN public.caminhoes.tipo IS 'Tipo de veículo / carroceria (ex.: truck, basculante).';
COMMENT ON COLUMN public.caminhoes.rodizio IS 'Restrição de rodízio (dia ou código conforme regra local).';
COMMENT ON COLUMN public.caminhoes.status_disponibilidade IS 'Disponibilidade operacional do veículo.';

ALTER TABLE public.caminhoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caminhoes_authenticated_all" ON public.caminhoes;
CREATE POLICY "caminhoes_authenticated_all"
  ON public.caminhoes FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
