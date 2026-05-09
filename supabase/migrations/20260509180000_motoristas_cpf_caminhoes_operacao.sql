-- CPF em motoristas; dados operacionais e RENAVAM em caminhões; vínculo opcional motorista ↔ veículo.
ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS cpf text;

COMMENT ON COLUMN public.motoristas.cpf IS 'CPF do motorista (formato 000.000.000-00), opcional.';

CREATE INDEX IF NOT EXISTS idx_motoristas_cpf_nao_vazio
  ON public.motoristas (cpf)
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS renavam text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS peso_tara text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS peso_bruto text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS cmt text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS quant_ibcs text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS tipo_caixa text;

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS motorista_id uuid REFERENCES public.motoristas (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.caminhoes.renavam IS 'RENAVAM do veículo (9 a 11 dígitos, armazenado sem máscara ou com zeros à esquerda conforme informado).';
COMMENT ON COLUMN public.caminhoes.peso_tara IS 'Peso tara informado na operação (texto livre, ex.: 10.91T ou 13500 kg).';
COMMENT ON COLUMN public.caminhoes.peso_bruto IS 'Peso bruto informado na operação (texto livre).';
COMMENT ON COLUMN public.caminhoes.cmt IS 'CMT — Capacidade Máxima de Tração (texto livre).';
COMMENT ON COLUMN public.caminhoes.quant_ibcs IS 'Quantidade / indicação de IBCs (texto livre).';
COMMENT ON COLUMN public.caminhoes.tipo_caixa IS 'Tipo de caixa / equipamento (texto livre, ex.: 30M³).';
COMMENT ON COLUMN public.caminhoes.motorista_id IS 'Motorista habitual do veículo (opcional).';

CREATE INDEX IF NOT EXISTS idx_caminhoes_motorista_id
  ON public.caminhoes (motorista_id)
  WHERE motorista_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_caminhoes_renavam
  ON public.caminhoes (renavam)
  WHERE renavam IS NOT NULL AND btrim(renavam) <> '';
