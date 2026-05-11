-- Ajuste: permitir UPDATE de criado_por_* quando auth.uid() é NULL (migrações, SQL interno).
CREATE OR REPLACE FUNCTION public.trg_bloquear_mudanca_criador_exceto_desenvolvedor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF (NEW.criado_por_user_id IS DISTINCT FROM OLD.criado_por_user_id)
     OR (NEW.criado_por_nome IS DISTINCT FROM OLD.criado_por_nome) THEN
    IF auth.uid() IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.usuarios u
        WHERE u.id = auth.uid()
          AND lower(trim(coalesce(u.cargo, ''))) LIKE '%desenvolvedor%'
      ) THEN
        RAISE EXCEPTION 'Somente o cargo Desenvolvedor pode alterar os campos de auditoria do lançamento (criado_por).';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
