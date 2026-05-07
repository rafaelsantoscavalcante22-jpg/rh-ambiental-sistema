-- NOPP (documento / certificação operacional): indicação e validade no cadastro de motoristas
ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS possui_nopp boolean NOT NULL DEFAULT false;

ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS nopp_validade date;

COMMENT ON COLUMN public.motoristas.possui_nopp IS 'Indica se o motorista possui NOPP.';
COMMENT ON COLUMN public.motoristas.nopp_validade IS 'Data de validade do NOPP.';
