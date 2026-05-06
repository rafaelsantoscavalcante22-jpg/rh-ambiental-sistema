-- Representante comercial (utilizador interno) associado ao cliente.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS representante_comercial_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_representante_comercial_id
  ON public.clientes (representante_comercial_id)
  WHERE representante_comercial_id IS NOT NULL;

COMMENT ON COLUMN public.clientes.representante_comercial_id IS
  'Utilizador com cargo Comercial que atende o cliente (FK public.usuarios).';
