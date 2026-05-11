-- Preenche criado_por_nome a partir de public.usuarios quando só o UUID foi gravado.
-- Desliga triggers de auditoria: no SQL Editor o JWT não é «Desenvolvedor».

ALTER TABLE public.programacoes DISABLE TRIGGER trg_programacoes_criador_lock;
ALTER TABLE public.mtrs DISABLE TRIGGER trg_mtrs_criador_lock;

UPDATE public.programacoes p
SET criado_por_nome = btrim(coalesce(u.nome, u.email))
FROM public.usuarios u
WHERE p.criado_por_user_id = u.id
  AND (p.criado_por_nome IS NULL OR btrim(p.criado_por_nome) = '')
  AND btrim(coalesce(u.nome, u.email)) <> '';

UPDATE public.mtrs m
SET criado_por_nome = btrim(coalesce(u.nome, u.email))
FROM public.usuarios u
WHERE m.criado_por_user_id = u.id
  AND (m.criado_por_nome IS NULL OR btrim(m.criado_por_nome) = '')
  AND btrim(coalesce(u.nome, u.email)) <> '';

ALTER TABLE public.programacoes ENABLE TRIGGER trg_programacoes_criador_lock;
ALTER TABLE public.mtrs ENABLE TRIGGER trg_mtrs_criador_lock;
