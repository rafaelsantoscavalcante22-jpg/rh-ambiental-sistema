-- Cliente → representante do cadastro Representante RG (tabela public.representantes_rg).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS representante_rg_id uuid REFERENCES public.representantes_rg (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_representante_rg_id
  ON public.clientes (representante_rg_id)
  WHERE representante_rg_id IS NOT NULL;

COMMENT ON COLUMN public.clientes.representante_rg_id IS
  'Representante comercial RG (cadastro em representantes_rg) que atende o cliente.';
