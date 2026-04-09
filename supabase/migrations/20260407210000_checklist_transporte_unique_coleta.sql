-- Uma linha de checklist por coleta (evita duplicados e falhas ao ler/gravar).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY coleta_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM public.checklist_transporte
)
DELETE FROM public.checklist_transporte c
WHERE c.id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS checklist_transporte_coleta_id_uidx
  ON public.checklist_transporte (coleta_id);
