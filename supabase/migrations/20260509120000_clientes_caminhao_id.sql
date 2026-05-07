-- Veículo (frota) preferencial para atendimento ao cliente — FK para public.caminhoes.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS caminhao_id uuid REFERENCES public.caminhoes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_caminhao_id
  ON public.clientes (caminhao_id)
  WHERE caminhao_id IS NOT NULL;

COMMENT ON COLUMN public.clientes.caminhao_id IS
  'Veículo da frota (cadastro Caminhões/Veículos) associado ao cliente.';
