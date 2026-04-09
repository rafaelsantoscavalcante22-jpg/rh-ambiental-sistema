-- Catálogo de resíduos com códigos (RG Ambiental) + vínculo opcional em coletas
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.residuos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  grupo text,
  ativo boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT residuos_codigo_key UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_residuos_ativo_sort ON public.residuos (ativo, sort_order, codigo);

COMMENT ON TABLE public.residuos IS
  'Catálogo de tipos de resíduo com código único; coletas referenciam via residuo_catalogo_id.';

ALTER TABLE public.coletas
  ADD COLUMN IF NOT EXISTS residuo_catalogo_id uuid REFERENCES public.residuos (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coletas_residuo_catalogo_id
  ON public.coletas (residuo_catalogo_id)
  WHERE residuo_catalogo_id IS NOT NULL;

ALTER TABLE public.residuos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "residuos_select_authenticated" ON public.residuos;
CREATE POLICY "residuos_select_authenticated"
  ON public.residuos FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.residuos TO authenticated;

-- Dados iniciais (códigos RG-R-xxx — principais categorias operacionais / NBR 10004 orientação)
INSERT INTO public.residuos (codigo, nome, descricao, grupo, sort_order) VALUES
  ('RG-R-001', 'Lodo de tratamento de efluentes', 'Lodos de ETAs e similares', 'II-A', 10),
  ('RG-R-002', 'Borracha e plástico contaminados', 'Misturas com óleo, solventes ou químicos', 'II-A', 20),
  ('RG-R-003', 'Embalagens contaminadas', 'Tambores, bombonas, IBC após uso', 'II-A', 30),
  ('RG-R-004', 'Filtros e mangas contaminados', 'Filtros industriais, mangas de dedusting', 'II-A', 40),
  ('RG-R-005', 'Sólidos oleosos', 'Sólidos impregnados com óleo mineral', 'II-A', 50),
  ('RG-R-006', 'Óleos lubrificantes usados', 'Óleo de motor, hidráulico, compressores', 'I', 60),
  ('RG-R-007', 'Óleos isolantes usados', 'Óleo dielétrico de transformadores', 'I', 70),
  ('RG-R-008', 'Efluentes líquidos industriais', 'Águas contaminadas de processo', 'II-A', 80),
  ('RG-R-009', 'Solventes halogenados usados', 'Clorados, freons de processo', 'I', 90),
  ('RG-R-010', 'Solventes não halogenados usados', 'Thinners alifáticos, álcoois', 'II-A', 100),
  ('RG-R-011', 'Tintas, tintas em pó e vernizes', 'Resíduos de pintura e revestimentos', 'II-A', 110),
  ('RG-R-012', 'Resinas e colas', 'Epóxi, PU, adesivos fora de especificação', 'II-A', 120),
  ('RG-R-013', 'Ácidos em desuso', 'Ácidos fora de uso ou contaminados', 'I', 130),
  ('RG-R-014', 'Bases em desuso', 'Hidróxidos e alcalinos fora de uso', 'I', 140),
  ('RG-R-015', 'Reagentes de laboratório', 'Químicos laboratoriais mistos ou vencidos', 'I', 150),
  ('RG-R-016', 'Lâmpadas fluorescentes e vapor de mercúrio', 'Lâmpadas classe A (mercúrio)', 'I', 160),
  ('RG-R-017', 'Pilhas e baterias', 'Pilhas e baterias portáteis usadas', 'I', 170),
  ('RG-R-018', 'Resíduos eletrônicos (e-lixo)', 'Placas, cabos, equipamentos fora de uso', 'II-A', 180),
  ('RG-R-019', 'Sucata ferrosa contaminada', 'Metais com óleo, tinta ou solvente', 'II-A', 190),
  ('RG-R-020', 'Sucata não ferrosa contaminada', 'Alumínio, cobre, latão contaminados', 'II-A', 200),
  ('RG-R-021', 'Papel e papelão contaminados', 'Com óleo, químico ou alimentar', 'II-B', 210),
  ('RG-R-022', 'Madeira tratada ou contaminada', 'CCA, creosoto ou químicos', 'II-A', 220),
  ('RG-R-023', 'Resíduos de healthcare similares', 'Afiados, materiais de cura contaminados', 'I', 230),
  ('RG-R-024', 'Resíduos biológicos / infectantes', 'Conforme segregação operacional', 'I', 240),
  ('RG-R-025', 'Lixívia e soda cáustica usada', 'Soluções alcalinas de limpeza', 'II-A', 250),
  ('RG-R-026', 'Areia ou brita contaminada', 'Absorventes de derramamento', 'II-A', 260),
  ('RG-R-027', 'Lodo de decantador / tanque', 'Retirada de tanques e caixas separadoras', 'II-A', 270),
  ('RG-R-028', 'Outros não classificados acima', 'Especificar observações na coleta/MTR', '—', 999)
ON CONFLICT (codigo) DO NOTHING;
