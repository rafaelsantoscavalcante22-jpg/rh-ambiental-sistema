-- Observacoes gerais do cadastro e link do Google Maps (GPS / localizacao).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS observacoes_gerais text,
  ADD COLUMN IF NOT EXISTS link_google_maps text;

COMMENT ON COLUMN public.clientes.observacoes_gerais IS 'Observacoes gerais do cliente (cadastro), distintas das observacoes operacionais da planilha.';
COMMENT ON COLUMN public.clientes.link_google_maps IS 'URL do Google Maps com a localizacao do cliente (ex.: link compartilhado ou coordenadas).';
