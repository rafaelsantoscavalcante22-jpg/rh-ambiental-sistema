-- Páginas do sistema permitidas por utilizador (lista de prefixos de rota, ex. '/clientes').
-- NULL ou array vazio = sem restrição extra (mantém-se a regra por cargo nas rotas protegidas).

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS paginas_permitidas text[] NULL;

COMMENT ON COLUMN public.usuarios.paginas_permitidas IS
  'Prefixos de rota permitidos quando definido e não vazio; caso contrário só aplica o cargo.';
