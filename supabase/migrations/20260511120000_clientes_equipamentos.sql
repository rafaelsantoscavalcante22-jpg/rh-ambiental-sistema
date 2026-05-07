-- Lista livre de equipamentos desejados no cadastro de clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS equipamentos text;

COMMENT ON COLUMN public.clientes.equipamentos IS 'Lista de equipamentos desejados (texto livre).';
