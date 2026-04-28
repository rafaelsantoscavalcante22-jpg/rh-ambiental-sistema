-- Datas de referência do estado comercial (pós-venda / carteira)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_ativo_desde date;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_inativo_desde date;

COMMENT ON COLUMN public.clientes.status_ativo_desde IS 'Data a partir da qual o cliente está ou passou a estar ativo (cadastro manual).';
COMMENT ON COLUMN public.clientes.status_inativo_desde IS 'Data a partir da qual o cliente está ou passou a estar inativo (cadastro manual).';
