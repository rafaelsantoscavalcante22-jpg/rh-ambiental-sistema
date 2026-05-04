-- =============================================================================
-- RG Ambiental: todas as migrações do repositório (ordem cronológica).
-- Aplicar no Supabase: SQL Editor ou: supabase db push (recomendado com CLI).
-- ATENÇÃO: Se o projeto já tem parte deste schema, executar tudo pode dar erro
-- (objeto já existe). Nesse caso use só migrações em falta ou a CLI com histórico.
-- =============================================================================



-- >>> 20260406120000_coletas_fluxo_status_sync.sql <<<


-- =============================================================================
-- Coletas: coluna fluxo_status + sincronizaÃ§Ã£o com etapa_operacional + legado
-- Aplicar: Supabase Dashboard â†’ SQL â†’ New query â†’ colar â†’ Run
--          ou: supabase db push (CLI), ou: psql
-- =============================================================================

ALTER TABLE public.coletas
  ADD COLUMN IF NOT EXISTS fluxo_status text;

COMMENT ON COLUMN public.coletas.fluxo_status IS
  'Etapa canÃ´nica do fluxo RG Ambiental (alinhada a etapa_operacional).';

-- ---------------------------------------------------------------------------
-- 1) Copiar etapa â†’ fluxo quando fluxo estiver vazio
-- ---------------------------------------------------------------------------
UPDATE public.coletas
SET fluxo_status = btrim(etapa_operacional)
WHERE (fluxo_status IS NULL OR btrim(fluxo_status) = '')
  AND etapa_operacional IS NOT NULL
  AND btrim(etapa_operacional) <> '';

-- ---------------------------------------------------------------------------
-- 2) Copiar fluxo â†’ etapa quando etapa estiver vazio
-- ---------------------------------------------------------------------------
UPDATE public.coletas
SET etapa_operacional = btrim(fluxo_status)
WHERE (etapa_operacional IS NULL OR btrim(etapa_operacional) = '')
  AND fluxo_status IS NOT NULL
  AND btrim(fluxo_status) <> '';

-- ---------------------------------------------------------------------------
-- 3) Normalizar cÃ³digos legados (mesmo mapa conceitual do app / fluxoEtapas)
-- ---------------------------------------------------------------------------
UPDATE public.coletas
SET
  fluxo_status = 'CONTROLE_PESAGEM_LANCADO',
  etapa_operacional = 'CONTROLE_PESAGEM_LANCADO'
WHERE fluxo_status IN ('CONTROLE_PESAGEM', 'PESO_CALCULADO', 'LANCADO_CONTROLE_MASSA')
   OR etapa_operacional IN ('CONTROLE_PESAGEM', 'PESO_CALCULADO', 'LANCADO_CONTROLE_MASSA');

UPDATE public.coletas
SET
  fluxo_status = 'MTR_PREENCHIDA',
  etapa_operacional = 'MTR_PREENCHIDA'
WHERE fluxo_status = 'DOCUMENTO_CRIADO'
   OR etapa_operacional = 'DOCUMENTO_CRIADO';

UPDATE public.coletas
SET
  fluxo_status = 'MTR_ENTREGUE_LOGISTICA',
  etapa_operacional = 'MTR_ENTREGUE_LOGISTICA'
WHERE fluxo_status = 'DOCUMENTO_ENTREGUE'
   OR etapa_operacional = 'DOCUMENTO_ENTREGUE';

UPDATE public.coletas
SET
  fluxo_status = 'ENVIADO_FINANCEIRO',
  etapa_operacional = 'ENVIADO_FINANCEIRO'
WHERE fluxo_status = 'LIBERADO_FINANCEIRO'
   OR etapa_operacional = 'LIBERADO_FINANCEIRO';

UPDATE public.coletas
SET
  fluxo_status = 'LOGISTICA_DESIGNADA',
  etapa_operacional = 'LOGISTICA_DESIGNADA'
WHERE fluxo_status = 'LOGISTICA_DESIGNADA_SAIDA'
   OR etapa_operacional = 'LOGISTICA_DESIGNADA_SAIDA';

UPDATE public.coletas
SET
  fluxo_status = 'BRUTO_REGISTRADO',
  etapa_operacional = 'BRUTO_REGISTRADO'
WHERE fluxo_status = 'RETORNO_PESO_BRUTO'
   OR etapa_operacional = 'RETORNO_PESO_BRUTO';

-- ---------------------------------------------------------------------------
-- 4) Ãndices para listagens por etapa (opcional, seguro se repetir)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coletas_fluxo_status
  ON public.coletas (fluxo_status);

CREATE INDEX IF NOT EXISTS idx_coletas_etapa_operacional
  ON public.coletas (etapa_operacional);

CREATE INDEX IF NOT EXISTS idx_coletas_programacao_id
  ON public.coletas (programacao_id)
  WHERE programacao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coletas_mtr_id
  ON public.coletas (mtr_id)
  WHERE mtr_id IS NOT NULL;



-- >>> 20260407120000_usuarios_foto_url_avatars_bucket.sql <<<


-- =============================================================================
-- Perfil: foto_url em usuarios + bucket pÃºblico avatars (pastas por user id)
-- Aplicar: supabase db push / SQL Editor
-- =============================================================================

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS foto_url text;

COMMENT ON COLUMN public.usuarios.foto_url IS
  'URL pÃºblica da foto de perfil (ex.: Storage avatars/<user_id>/...).';

-- Bucket de avatares (pÃºblico para leitura via URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pÃºblica dos ficheiros (bucket jÃ¡ Ã© pÃºblico; polÃ­tica explÃ­cita)
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Utilizador pode atualizar a prÃ³pria linha (foto_url)
DROP POLICY IF EXISTS "usuarios_update_own" ON public.usuarios;
CREATE POLICY "usuarios_update_own"
  ON public.usuarios FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);



-- >>> 20260407210000_checklist_transporte_unique_coleta.sql <<<


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



-- >>> 20260408120000_fluxo_checklist_ticket_aprovacao.sql <<<


-- =============================================================================
-- Fluxo operacional RG: checklist de transporte, tickets operacionais, trilho de aprovaÃ§Ã£o
-- Executar: supabase db push / SQL Editor
-- =============================================================================

-- Checklist preenchido pelo motorista / logÃ­stica (vÃ­nculo Ã  coleta)
CREATE TABLE IF NOT EXISTS public.checklist_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes text,
  preenchido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_transporte_coleta ON public.checklist_transporte (coleta_id);

COMMENT ON TABLE public.checklist_transporte IS
  'Checklist de transporte (motorista/logÃ­stica), alinhado ao fluxo pÃ³s-MTR.';

-- Ticket operacional (distinto da MTR e do nÃºmero interno em coleta.ticket_numero quando existir)
CREATE TABLE IF NOT EXISTS public.tickets_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  numero text,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_operacionais_coleta ON public.tickets_operacionais (coleta_id);

COMMENT ON TABLE public.tickets_operacionais IS
  'Ticket operacional gerado apÃ³s conferÃªncia; fluxo separado da MTR.';

-- Registo de aprovaÃ§Ã£o pela diretoria (histÃ³rico simples)
CREATE TABLE IF NOT EXISTS public.aprovacoes_diretoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  decisao text NOT NULL CHECK (decisao IN ('aprovado', 'ajuste_solicitado')),
  observacoes text,
  decidido_em timestamptz NOT NULL DEFAULT now(),
  decidido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_aprovacoes_diretoria_coleta ON public.aprovacoes_diretoria (coleta_id);

COMMENT ON TABLE public.aprovacoes_diretoria IS
  'DecisÃµes da diretoria sobre o pacote MTR + ticket antes do faturamento.';

-- Faturamento (registo explÃ­cito antes de enviar ao financeiro)
CREATE TABLE IF NOT EXISTS public.faturamento_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  valor numeric,
  referencia_nf text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'emitido', 'cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faturamento_registros_coleta ON public.faturamento_registros (coleta_id);

COMMENT ON TABLE public.faturamento_registros IS
  'Camada de faturamento antes de enviar ao financeiro.';

-- ConferÃªncia operacional (checklist de documentos recebidos)
CREATE TABLE IF NOT EXISTS public.conferencia_operacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  documentos_ok boolean NOT NULL DEFAULT false,
  observacoes text,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  conferido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conferencia_operacional_coleta ON public.conferencia_operacional (coleta_id);

-- RLS (ajuste fino por perfil depois; aqui: utilizadores autenticados da aplicaÃ§Ã£o)
ALTER TABLE public.checklist_transporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets_operacionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprovacoes_diretoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencia_operacional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_transporte_authenticated_all" ON public.checklist_transporte;
CREATE POLICY "checklist_transporte_authenticated_all"
  ON public.checklist_transporte FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tickets_operacionais_authenticated_all" ON public.tickets_operacionais;
CREATE POLICY "tickets_operacionais_authenticated_all"
  ON public.tickets_operacionais FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "aprovacoes_diretoria_authenticated_all" ON public.aprovacoes_diretoria;
CREATE POLICY "aprovacoes_diretoria_authenticated_all"
  ON public.aprovacoes_diretoria FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "faturamento_registros_authenticated_all" ON public.faturamento_registros;
CREATE POLICY "faturamento_registros_authenticated_all"
  ON public.faturamento_registros FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "conferencia_operacional_authenticated_all" ON public.conferencia_operacional;
CREATE POLICY "conferencia_operacional_authenticated_all"
  ON public.conferencia_operacional FOR ALL TO authenticated
  USING (true) WITH CHECK (true);



-- >>> 20260408133000_mtrs_detalhes_jsonb.sql <<<


-- Campos do modelo MTR (planilha) em JSONB, sem quebrar o schema atual.
-- Execute no Supabase: `supabase db push` ou via SQL Editor.

ALTER TABLE public.mtrs
ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '{}'::jsonb;




-- >>> 20260408180000_tickets_operacionais_tipo_ticket.sql <<<


-- Tipo de ticket operacional (saÃ­da vs frete) para impressÃ£o e registo.
ALTER TABLE public.tickets_operacionais
  ADD COLUMN IF NOT EXISTS tipo_ticket text DEFAULT 'saida';

UPDATE public.tickets_operacionais SET tipo_ticket = 'saida' WHERE tipo_ticket IS NULL;

ALTER TABLE public.tickets_operacionais
  ALTER COLUMN tipo_ticket SET NOT NULL;

ALTER TABLE public.tickets_operacionais DROP CONSTRAINT IF EXISTS tickets_operacionais_tipo_ticket_check;

ALTER TABLE public.tickets_operacionais
  ADD CONSTRAINT tickets_operacionais_tipo_ticket_check CHECK (tipo_ticket IN ('saida', 'frete'));

COMMENT ON COLUMN public.tickets_operacionais.tipo_ticket IS
  'ClassificaÃ§Ã£o: saÃ­da de material ou frete.';



-- >>> 20260409120000_conferencia_transporte.sql <<<


-- ConferÃªncia de transportes: checklist OK/NÃƒO (modelo planilha), por coleta.
-- Aplicar: supabase db push ou SQL Editor.

CREATE TABLE IF NOT EXISTS public.conferencia_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes text,
  preenchido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conferencia_transporte_coleta_id_key UNIQUE (coleta_id)
);

CREATE INDEX IF NOT EXISTS idx_conferencia_transporte_coleta ON public.conferencia_transporte (coleta_id);

COMMENT ON TABLE public.conferencia_transporte IS
  'ConferÃªncia de transportes (checklist OK/NÃƒO por item), vÃ­nculo 1:1 com coleta.';

ALTER TABLE public.conferencia_transporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conferencia_transporte_authenticated_all" ON public.conferencia_transporte;
CREATE POLICY "conferencia_transporte_authenticated_all"
  ON public.conferencia_transporte FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);



-- >>> 20260410130000_tickets_operacionais_one_per_coleta.sql <<<


-- Um ticket operacional por coleta (evita vÃ¡rias linhas e falhas em PostgREST / UI).
-- MantÃ©m o registo mais recente por coleta_id (empate: maior id).

DELETE FROM public.tickets_operacionais a
WHERE a.id NOT IN (
  SELECT id
  FROM (
    SELECT DISTINCT ON (coleta_id) id
    FROM public.tickets_operacionais
    ORDER BY coleta_id, created_at DESC NULLS LAST, id DESC
  ) keepers
);

CREATE UNIQUE INDEX IF NOT EXISTS tickets_operacionais_coleta_id_uidx
  ON public.tickets_operacionais (coleta_id);

COMMENT ON INDEX public.tickets_operacionais_coleta_id_uidx IS
  'Garante no mÃ¡ximo um ticket por coleta (fluxo Controle de Massa â†’ ticket).';



-- >>> 20260410190000_performance_indexes_lists.sql <<<


-- Ãndices para listagens, filtros e ordenaÃ§Ãµes frequentes (escala / performance).
-- CREATE INDEX IF NOT EXISTS Ã© idempotente em migraÃ§Ãµes repetidas.

-- Coletas
CREATE INDEX IF NOT EXISTS idx_coletas_created_at_desc ON public.coletas (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_coletas_cliente_id ON public.coletas (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_programacao_id ON public.coletas (programacao_id) WHERE programacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_mtr_id ON public.coletas (mtr_id) WHERE mtr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_fluxo_status ON public.coletas (fluxo_status) WHERE fluxo_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_data_agendada ON public.coletas (data_agendada) WHERE data_agendada IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coletas_numero_coleta ON public.coletas (numero_coleta);
CREATE INDEX IF NOT EXISTS idx_coletas_liberado_financeiro ON public.coletas (liberado_financeiro) WHERE liberado_financeiro IS NOT NULL;

-- MTRs
CREATE INDEX IF NOT EXISTS idx_mtrs_programacao_id ON public.mtrs (programacao_id) WHERE programacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mtrs_created_at_desc ON public.mtrs (created_at DESC NULLS LAST);

-- ProgramaÃ§Ãµes
CREATE INDEX IF NOT EXISTS idx_programacoes_data_programada ON public.programacoes (data_programada) WHERE data_programada IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programacoes_cliente_id ON public.programacoes (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_programacoes_coleta_id ON public.programacoes (coleta_id) WHERE coleta_id IS NOT NULL;

-- Clientes (busca / ordenaÃ§Ã£o)
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON public.clientes (nome);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON public.clientes (cnpj) WHERE cnpj IS NOT NULL AND btrim(cnpj) <> '';

-- Controle de massa (Ãºltima pesagem por coleta)
CREATE INDEX IF NOT EXISTS idx_controle_massa_coleta_created ON public.controle_massa (coleta_id, created_at DESC NULLS LAST);

-- Faturamento
CREATE INDEX IF NOT EXISTS idx_faturamento_registros_coleta ON public.faturamento_registros (coleta_id);

-- Tickets operacionais
CREATE INDEX IF NOT EXISTS idx_tickets_operacionais_coleta ON public.tickets_operacionais (coleta_id);

-- UsuÃ¡rios
CREATE INDEX IF NOT EXISTS idx_usuarios_created_at_desc ON public.usuarios (created_at DESC NULLS LAST);



-- >>> 20260411120000_chat_interno.sql <<<


-- =============================================================================
-- Chat interno 1:1 â€” conversas, participantes, mensagens, storage, RLS, realtime
-- =============================================================================

-- DiretÃ³rio: utilizadores autenticados podem listar colegas ativos (UI / presenÃ§a)
DROP POLICY IF EXISTS "usuarios_select_ativos_directory" ON public.usuarios;
CREATE POLICY "usuarios_select_ativos_directory"
  ON public.usuarios FOR SELECT TO authenticated
  USING (lower(coalesce(status, '')) = 'ativo');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'direct' CHECK (tipo = 'direct'),
  participant_low uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  participant_high uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  ultima_preview text,
  ultima_em timestamptz,
  ultima_remetente_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (participant_low < participant_high)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversas_direct_pair
  ON public.chat_conversas (participant_low, participant_high);

CREATE TABLE IF NOT EXISTS public.chat_participantes (
  conversa_id uuid NOT NULL REFERENCES public.chat_conversas (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  last_read_at timestamptz,
  PRIMARY KEY (conversa_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participantes_user_id ON public.chat_participantes (user_id);

CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.chat_conversas (id) ON DELETE CASCADE,
  remetente_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  conteudo text,
  anexo_bucket text DEFAULT 'chat-anexos',
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (conteudo IS NOT NULL AND length(trim(conteudo)) > 0)
    OR (anexo_path IS NOT NULL AND length(trim(anexo_path)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa_created
  ON public.chat_mensagens (conversa_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers: preview / updated_at na conversa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_on_new_message_bump_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview text;
BEGIN
  IF NEW.conteudo IS NOT NULL AND length(trim(NEW.conteudo)) > 0 THEN
    v_preview := left(trim(NEW.conteudo), 240);
  ELSIF NEW.anexo_nome IS NOT NULL AND length(trim(NEW.anexo_nome)) > 0 THEN
    v_preview := 'ðŸ“Ž ' || left(trim(NEW.anexo_nome), 200);
  ELSE
    v_preview := 'Anexo';
  END IF;

  UPDATE public.chat_conversas
  SET
    ultima_preview = v_preview,
    ultima_em = NEW.created_at,
    ultima_remetente_id = NEW.remetente_id,
    updated_at = now()
  WHERE id = NEW.conversa_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_mensagens_bump_conversa ON public.chat_mensagens;
CREATE TRIGGER trg_chat_mensagens_bump_conversa
  AFTER INSERT ON public.chat_mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_on_new_message_bump_conversa();

-- ---------------------------------------------------------------------------
-- RPC: conversa directa Ãºnica + participantes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_get_or_create_direct(p_outro uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_outro IS NULL OR p_outro = v_me THEN
    RAISE EXCEPTION 'invalid_peer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_outro AND lower(coalesce(u.status, '')) = 'ativo'
  ) THEN
    RAISE EXCEPTION 'peer_not_found';
  END IF;

  IF p_outro < v_me THEN
    v_low := p_outro;
    v_high := v_me;
  ELSE
    v_low := v_me;
    v_high := p_outro;
  END IF;

  INSERT INTO public.chat_conversas (participant_low, participant_high)
  VALUES (v_low, v_high)
  ON CONFLICT (participant_low, participant_high) DO UPDATE
  SET updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (v_id, v_low), (v_id, v_high)
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_get_or_create_direct(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_get_or_create_direct(uuid) TO authenticated;

-- Contagens de nÃ£o lidas (participaÃ§Ã£o do utilizador actual)
CREATE OR REPLACE FUNCTION public.chat_unread_by_conversa()
RETURNS TABLE (conversa_id uuid, unread bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.conversa_id,
    count(*)::bigint AS unread
  FROM public.chat_mensagens m
  INNER JOIN public.chat_participantes cp
    ON cp.conversa_id = m.conversa_id
   AND cp.user_id = auth.uid()
  WHERE m.remetente_id IS DISTINCT FROM auth.uid()
    AND m.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
  GROUP BY m.conversa_id;
$$;

REVOKE ALL ON FUNCTION public.chat_unread_by_conversa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_unread_by_conversa() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversas_select_participant" ON public.chat_conversas;
CREATE POLICY "chat_conversas_select_participant"
  ON public.chat_conversas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.conversa_id = chat_conversas.id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_participantes_select_own" ON public.chat_participantes;
DROP POLICY IF EXISTS "chat_participantes_select_member" ON public.chat_participantes;
CREATE POLICY "chat_participantes_select_member"
  ON public.chat_participantes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participantes me
      WHERE me.conversa_id = chat_participantes.conversa_id
        AND me.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_participantes_update_own_read" ON public.chat_participantes;
CREATE POLICY "chat_participantes_update_own_read"
  ON public.chat_participantes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_mensagens_select_participant" ON public.chat_mensagens;
CREATE POLICY "chat_mensagens_select_participant"
  ON public.chat_mensagens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.conversa_id = chat_mensagens.conversa_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_mensagens_insert_self_participant" ON public.chat_mensagens;
CREATE POLICY "chat_mensagens_insert_self_participant"
  ON public.chat_mensagens FOR INSERT TO authenticated
  WITH CHECK (
    remetente_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.conversa_id = chat_mensagens.conversa_id
        AND cp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants (sem INSERT directo em chat_conversas â€” sÃ³ RPC)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.chat_conversas TO authenticated;
GRANT SELECT, UPDATE ON public.chat_participantes TO authenticated;
GRANT SELECT, INSERT ON public.chat_mensagens TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;
  END IF;
END;
$pub$;

-- ---------------------------------------------------------------------------
-- Storage: chat-anexos (privado)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-anexos',
  'chat-anexos',
  false,
  15728640,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "chat_anexos_select_participant" ON storage.objects;
CREATE POLICY "chat_anexos_select_participant"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "chat_anexos_insert_participant" ON storage.objects;
CREATE POLICY "chat_anexos_insert_participant"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "chat_anexos_update_participant" ON storage.objects;
CREATE POLICY "chat_anexos_update_participant"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "chat_anexos_delete_participant" ON storage.objects;
CREATE POLICY "chat_anexos_delete_participant"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND EXISTS (
      SELECT 1 FROM public.chat_participantes cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversa_id::text = split_part(name, '/', 1)
    )
  );



-- >>> 20260411180000_residuos_catalogo.sql <<<


-- CatÃ¡logo de resÃ­duos com cÃ³digos (RG Ambiental) + vÃ­nculo opcional em coletas
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
  'CatÃ¡logo de tipos de resÃ­duo com cÃ³digo Ãºnico; coletas referenciam via residuo_catalogo_id.';

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

-- Dados iniciais (cÃ³digos RG-R-xxx â€” principais categorias operacionais / NBR 10004 orientaÃ§Ã£o)
INSERT INTO public.residuos (codigo, nome, descricao, grupo, sort_order) VALUES
  ('RG-R-001', 'Lodo de tratamento de efluentes', 'Lodos de ETAs e similares', 'II-A', 10),
  ('RG-R-002', 'Borracha e plÃ¡stico contaminados', 'Misturas com Ã³leo, solventes ou quÃ­micos', 'II-A', 20),
  ('RG-R-003', 'Embalagens contaminadas', 'Tambores, bombonas, IBC apÃ³s uso', 'II-A', 30),
  ('RG-R-004', 'Filtros e mangas contaminados', 'Filtros industriais, mangas de dedusting', 'II-A', 40),
  ('RG-R-005', 'SÃ³lidos oleosos', 'SÃ³lidos impregnados com Ã³leo mineral', 'II-A', 50),
  ('RG-R-006', 'Ã“leos lubrificantes usados', 'Ã“leo de motor, hidrÃ¡ulico, compressores', 'I', 60),
  ('RG-R-007', 'Ã“leos isolantes usados', 'Ã“leo dielÃ©trico de transformadores', 'I', 70),
  ('RG-R-008', 'Efluentes lÃ­quidos industriais', 'Ãguas contaminadas de processo', 'II-A', 80),
  ('RG-R-009', 'Solventes halogenados usados', 'Clorados, freons de processo', 'I', 90),
  ('RG-R-010', 'Solventes nÃ£o halogenados usados', 'Thinners alifÃ¡ticos, Ã¡lcoois', 'II-A', 100),
  ('RG-R-011', 'Tintas, tintas em pÃ³ e vernizes', 'ResÃ­duos de pintura e revestimentos', 'II-A', 110),
  ('RG-R-012', 'Resinas e colas', 'EpÃ³xi, PU, adesivos fora de especificaÃ§Ã£o', 'II-A', 120),
  ('RG-R-013', 'Ãcidos em desuso', 'Ãcidos fora de uso ou contaminados', 'I', 130),
  ('RG-R-014', 'Bases em desuso', 'HidrÃ³xidos e alcalinos fora de uso', 'I', 140),
  ('RG-R-015', 'Reagentes de laboratÃ³rio', 'QuÃ­micos laboratoriais mistos ou vencidos', 'I', 150),
  ('RG-R-016', 'LÃ¢mpadas fluorescentes e vapor de mercÃºrio', 'LÃ¢mpadas classe A (mercÃºrio)', 'I', 160),
  ('RG-R-017', 'Pilhas e baterias', 'Pilhas e baterias portÃ¡teis usadas', 'I', 170),
  ('RG-R-018', 'ResÃ­duos eletrÃ´nicos (e-lixo)', 'Placas, cabos, equipamentos fora de uso', 'II-A', 180),
  ('RG-R-019', 'Sucata ferrosa contaminada', 'Metais com Ã³leo, tinta ou solvente', 'II-A', 190),
  ('RG-R-020', 'Sucata nÃ£o ferrosa contaminada', 'AlumÃ­nio, cobre, latÃ£o contaminados', 'II-A', 200),
  ('RG-R-021', 'Papel e papelÃ£o contaminados', 'Com Ã³leo, quÃ­mico ou alimentar', 'II-B', 210),
  ('RG-R-022', 'Madeira tratada ou contaminada', 'CCA, creosoto ou quÃ­micos', 'II-A', 220),
  ('RG-R-023', 'ResÃ­duos de healthcare similares', 'Afiados, materiais de cura contaminados', 'I', 230),
  ('RG-R-024', 'ResÃ­duos biolÃ³gicos / infectantes', 'Conforme segregaÃ§Ã£o operacional', 'I', 240),
  ('RG-R-025', 'LixÃ­via e soda cÃ¡ustica usada', 'SoluÃ§Ãµes alcalinas de limpeza', 'II-A', 250),
  ('RG-R-026', 'Areia ou brita contaminada', 'Absorventes de derramamento', 'II-A', 260),
  ('RG-R-027', 'Lodo de decantador / tanque', 'Retirada de tanques e caixas separadoras', 'II-A', 270),
  ('RG-R-028', 'Outros nÃ£o classificados acima', 'Especificar observaÃ§Ãµes na coleta/MTR', 'â€”', 999)
ON CONFLICT (codigo) DO NOTHING;



-- >>> 20260411200000_chat_conversas_client_insert.sql <<<


-- Permite criar conversa directa pelo cliente quando a RPC ainda nÃ£o estÃ¡ exposta (ex.: cache PostgREST)
-- ou como caminho alternativo. O trigger preenche chat_participantes (antes sÃ³ a RPC inseria).

CREATE OR REPLACE FUNCTION public.chat_conversas_after_insert_participantes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (NEW.id, NEW.participant_low), (NEW.id, NEW.participant_high)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_conversas_insert_participantes ON public.chat_conversas;
CREATE TRIGGER trg_chat_conversas_insert_participantes
  AFTER INSERT ON public.chat_conversas
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_conversas_after_insert_participantes();

DROP POLICY IF EXISTS "chat_conversas_insert_direct_member" ON public.chat_conversas;
CREATE POLICY "chat_conversas_insert_direct_member"
  ON public.chat_conversas FOR INSERT TO authenticated
  WITH CHECK (
    tipo = 'direct'
    AND participant_low IS NOT NULL
    AND participant_high IS NOT NULL
    AND participant_low < participant_high
    AND (auth.uid() = participant_low OR auth.uid() = participant_high)
  );

GRANT INSERT ON public.chat_conversas TO authenticated;



-- >>> 20260412120000_chat_insert_mensagem_rpc.sql <<<


-- Envio de mensagens via RPC: evita falhas de RLS no INSERT/RETURNING e garante remetente = auth.uid().

CREATE OR REPLACE FUNCTION public.chat_insert_mensagem(
  p_conversa_id uuid,
  p_conteudo text DEFAULT NULL,
  p_anexo_bucket text DEFAULT NULL,
  p_anexo_path text DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_anexo_mime text DEFAULT NULL,
  p_anexo_size bigint DEFAULT NULL
)
RETURNS SETOF public.chat_mensagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_c text;
  v_path text := nullif(trim(coalesce(p_anexo_path, '')), '');
  v_bucket text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'SessÃ£o invÃ¡lida.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participantes cp
    WHERE cp.conversa_id = p_conversa_id AND cp.user_id = v_me
  ) THEN
    RAISE EXCEPTION 'NÃ£o pertence a esta conversa.';
  END IF;

  v_c := trim(coalesce(p_conteudo, ''));

  IF v_path IS NOT NULL THEN
    IF length(v_c) = 0 THEN
      v_c := 'Anexo enviado';
    END IF;
    v_bucket := nullif(trim(coalesce(p_anexo_bucket, '')), '');
    IF v_bucket IS NULL THEN
      v_bucket := 'chat-anexos';
    END IF;
  ELSIF length(v_c) = 0 THEN
    RAISE EXCEPTION 'Mensagem vazia.';
  END IF;

  RETURN QUERY
  INSERT INTO public.chat_mensagens (
    conversa_id,
    remetente_id,
    conteudo,
    anexo_bucket,
    anexo_path,
    anexo_nome,
    anexo_mime,
    anexo_size
  )
  VALUES (
    p_conversa_id,
    v_me,
    v_c,
    v_bucket,
    v_path,
    p_anexo_nome,
    p_anexo_mime,
    p_anexo_size
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_insert_mensagem(uuid, text, text, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_insert_mensagem(uuid, text, text, text, text, text, bigint) TO authenticated;



-- >>> 20260412150000_chat_participantes_garantidos.sql <<<


-- Garante que ambos os interlocutores ficam em chat_participantes (lista + RLS + Realtime).
-- Corrige conversas antigas sem participantes e endurece get_or_create / insert mensagem.

-- ---------------------------------------------------------------------------
-- Backfill: conversas Ã³rfÃ£s (sem as duas linhas em chat_participantes)
-- ---------------------------------------------------------------------------
INSERT INTO public.chat_participantes (conversa_id, user_id)
SELECT c.id, c.participant_low
FROM public.chat_conversas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_participantes p
  WHERE p.conversa_id = c.id AND p.user_id = c.participant_low
)
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_participantes (conversa_id, user_id)
SELECT c.id, c.participant_high
FROM public.chat_conversas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.chat_participantes p
  WHERE p.conversa_id = c.id AND p.user_id = c.participant_high
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Par ordenado como UUID (igual ao servidor) â€” fallback cliente sem RPC principal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_ordered_participant_pair(p_a uuid, p_b uuid)
RETURNS TABLE (participant_low uuid, participant_high uuid)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_a < p_b THEN p_a ELSE p_b END,
         CASE WHEN p_a < p_b THEN p_b ELSE p_a END;
$$;

REVOKE ALL ON FUNCTION public.chat_ordered_participant_pair(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_ordered_participant_pair(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_or_create: id da conversa via SELECT apÃ³s UPSERT (evita ambiguidades com RETURNING)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_get_or_create_direct(p_outro uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_outro IS NULL OR p_outro = v_me THEN
    RAISE EXCEPTION 'invalid_peer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_outro AND lower(coalesce(u.status, '')) = 'ativo'
  ) THEN
    RAISE EXCEPTION 'peer_not_found';
  END IF;

  IF p_outro < v_me THEN
    v_low := p_outro;
    v_high := v_me;
  ELSE
    v_low := v_me;
    v_high := p_outro;
  END IF;

  INSERT INTO public.chat_conversas (participant_low, participant_high)
  VALUES (v_low, v_high)
  ON CONFLICT (participant_low, participant_high) DO UPDATE
  SET updated_at = now();

  SELECT c.id INTO STRICT v_id
  FROM public.chat_conversas c
  WHERE c.participant_low = v_low AND c.participant_high = v_high;

  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (v_id, v_low), (v_id, v_high)
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enviar mensagem: se faltar linha em participantes, repÃµe a partir da conversa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_insert_mensagem(
  p_conversa_id uuid,
  p_conteudo text DEFAULT NULL,
  p_anexo_bucket text DEFAULT NULL,
  p_anexo_path text DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_anexo_mime text DEFAULT NULL,
  p_anexo_size bigint DEFAULT NULL
)
RETURNS SETOF public.chat_mensagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_c text;
  v_path text := nullif(trim(coalesce(p_anexo_path, '')), '');
  v_bucket text;
  v_low uuid;
  v_high uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'SessÃ£o invÃ¡lida.';
  END IF;

  SELECT participant_low, participant_high
  INTO v_low, v_high
  FROM public.chat_conversas
  WHERE id = p_conversa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa nÃ£o encontrada.';
  END IF;

  IF v_me <> v_low AND v_me <> v_high THEN
    RAISE EXCEPTION 'NÃ£o pertence a esta conversa.';
  END IF;

  INSERT INTO public.chat_participantes (conversa_id, user_id)
  VALUES (p_conversa_id, v_low), (p_conversa_id, v_high)
  ON CONFLICT DO NOTHING;

  v_c := trim(coalesce(p_conteudo, ''));

  IF v_path IS NOT NULL THEN
    IF length(v_c) = 0 THEN
      v_c := 'Anexo enviado';
    END IF;
    v_bucket := nullif(trim(coalesce(p_anexo_bucket, '')), '');
    IF v_bucket IS NULL THEN
      v_bucket := 'chat-anexos';
    END IF;
  ELSIF length(v_c) = 0 THEN
    RAISE EXCEPTION 'Mensagem vazia.';
  END IF;

  RETURN QUERY
  INSERT INTO public.chat_mensagens (
    conversa_id,
    remetente_id,
    conteudo,
    anexo_bucket,
    anexo_path,
    anexo_nome,
    anexo_mime,
    anexo_size
  )
  VALUES (
    p_conversa_id,
    v_me,
    v_c,
    v_bucket,
    v_path,
    p_anexo_nome,
    p_anexo_mime,
    p_anexo_size
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_insert_mensagem(uuid, text, text, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_insert_mensagem(uuid, text, text, text, text, text, bigint) TO authenticated;



-- >>> 20260412170000_usuarios_presenca_status.sql <<<


-- Estado de presenÃ§a escolhido pelo utilizador (cabeÃ§alho + chat).

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS presenca_status text NOT NULL DEFAULT 'online';

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_presenca_status_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_presenca_status_check
  CHECK (presenca_status IN ('online', 'ausente', 'offline'));

COMMENT ON COLUMN public.usuarios.presenca_status IS
  'PresenÃ§a manual no painel: online, ausente, offline.';

-- Realtime: outros utilizadores veem mudanÃ§as (RLS limita linhas visÃ­veis).
DO $p$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'usuarios'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios;
  END IF;
END;
$p$;



-- >>> 20260412183000_fix_chat_participantes_rls.sql <<<


-- Corrige RLS: evita recursÃ£o infinita em chat_participantes
-- A policy anterior fazia SELECT em public.chat_participantes dentro da prÃ³pria policy.

ALTER TABLE public.chat_participantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_participantes_select_own" ON public.chat_participantes;
DROP POLICY IF EXISTS "chat_participantes_select_member" ON public.chat_participantes;

CREATE POLICY "chat_participantes_select_member"
  ON public.chat_participantes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_conversas c
      WHERE c.id = chat_participantes.conversa_id
        AND (c.participant_low = auth.uid() OR c.participant_high = auth.uid())
    )
  );




-- >>> 20260412184000_fix_chat_conversas_rls.sql <<<


-- Corrige RLS: evita recursÃ£o infinita em chat_conversas
-- A policy anterior verificava participaÃ§Ã£o via chat_participantes, que por sua vez dependia de chat_conversas.

ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversas_select_participant" ON public.chat_conversas;

CREATE POLICY "chat_conversas_select_participant"
  ON public.chat_conversas FOR SELECT TO authenticated
  USING (participant_low = auth.uid() OR participant_high = auth.uid());




-- >>> 20260413120000_clientes_enderecos_email_nf.sql <<<


-- RG Ambiental â€” ETAPA 1: campos adicionais em public.clientes
-- Aplicar no Supabase: SQL Editor â†’ colar e executar, ou `supabase db push` / migration deploy.

-- EndereÃ§os textuais (coleta / faturamento) e e-mail para envio de NF
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS endereco_coleta text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS endereco_faturamento text;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS email_nf text;

-- Status operacional (jÃ¡ usado na UI: Ativo / Inativo)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status text;

-- Valor padrÃ£o coerente com o formulÃ¡rio existente
ALTER TABLE public.clientes
  ALTER COLUMN status SET DEFAULT 'Ativo';

-- Dados antigos sem status passam a ficar explÃ­citos como Ativo
UPDATE public.clientes
SET status = 'Ativo'
WHERE status IS NULL OR btrim(status) = '';

COMMENT ON COLUMN public.clientes.endereco_coleta IS 'EndereÃ§o completo para coleta (texto livre).';
COMMENT ON COLUMN public.clientes.endereco_faturamento IS 'EndereÃ§o completo para faturamento (texto livre).';
COMMENT ON COLUMN public.clientes.email_nf IS 'E-mail para envio de notas fiscais.';
COMMENT ON COLUMN public.clientes.status IS 'SituaÃ§Ã£o cadastral: Ativo ou Inativo.';



-- >>> 20260414120000_motoristas.sql <<<


-- RG Ambiental â€” ETAPA 2: cadastro base de motoristas (sem FKs para outras pÃ¡ginas nesta etapa)
-- Aplicar: SQL Editor no Supabase ou `npm run db:apply:sql -- supabase/migrations/20260414120000_motoristas.sql`

CREATE TABLE IF NOT EXISTS public.motoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnh_numero text,
  cnh_categoria text,
  cnh_validade date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motoristas_nome ON public.motoristas (nome);
CREATE INDEX IF NOT EXISTS idx_motoristas_cnh_numero ON public.motoristas (cnh_numero)
  WHERE cnh_numero IS NOT NULL AND btrim(cnh_numero) <> '';

COMMENT ON TABLE public.motoristas IS
  'Motoristas habilitados; base para logÃ­stica (integraÃ§Ã£o com outras telas em etapa posterior).';
COMMENT ON COLUMN public.motoristas.nome IS 'Nome completo do motorista.';
COMMENT ON COLUMN public.motoristas.cnh_numero IS 'NÃºmero da CNH.';
COMMENT ON COLUMN public.motoristas.cnh_categoria IS 'Categoria da CNH (ex.: B, C, E).';
COMMENT ON COLUMN public.motoristas.cnh_validade IS 'Data de validade da CNH.';

ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "motoristas_authenticated_all" ON public.motoristas;
CREATE POLICY "motoristas_authenticated_all"
  ON public.motoristas FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);



-- >>> 20260415120000_caminhoes.sql <<<


-- RG Ambiental â€” ETAPA 3: cadastro base de caminhÃµes
-- Aplicar: SQL Editor no Supabase ou script local com DATABASE_URL

CREATE TABLE IF NOT EXISTS public.caminhoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  modelo text,
  tipo text,
  rodizio text,
  status_disponibilidade text NOT NULL DEFAULT 'DisponÃ­vel',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caminhoes_placa_key UNIQUE (placa)
);

CREATE INDEX IF NOT EXISTS idx_caminhoes_placa_lower ON public.caminhoes (lower(placa));
CREATE INDEX IF NOT EXISTS idx_caminhoes_status ON public.caminhoes (status_disponibilidade);

COMMENT ON TABLE public.caminhoes IS
  'Frota / veÃ­culos; base para logÃ­stica (integraÃ§Ã£o com outras telas em etapa posterior).';
COMMENT ON COLUMN public.caminhoes.placa IS 'Placa do veÃ­culo (Ãºnica no cadastro).';
COMMENT ON COLUMN public.caminhoes.modelo IS 'Modelo do veÃ­culo.';
COMMENT ON COLUMN public.caminhoes.tipo IS 'Tipo de veÃ­culo / carroceria (ex.: truck, basculante).';
COMMENT ON COLUMN public.caminhoes.rodizio IS 'RestriÃ§Ã£o de rodÃ­zio (dia ou cÃ³digo conforme regra local).';
COMMENT ON COLUMN public.caminhoes.status_disponibilidade IS 'Disponibilidade operacional do veÃ­culo.';

ALTER TABLE public.caminhoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caminhoes_authenticated_all" ON public.caminhoes;
CREATE POLICY "caminhoes_authenticated_all"
  ON public.caminhoes FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);



-- >>> 20260416120000_checklist_transporte_assinaturas.sql <<<


-- ETAPA 4: assinaturas no checklist de transporte (motorista / responsÃ¡vel)
-- Aplicar no SQL Editor do Supabase.

ALTER TABLE public.checklist_transporte
  ADD COLUMN IF NOT EXISTS assinatura_motorista text;

ALTER TABLE public.checklist_transporte
  ADD COLUMN IF NOT EXISTS assinatura_responsavel text;

COMMENT ON COLUMN public.checklist_transporte.assinatura_motorista IS
  'Nome ou rubrica do motorista no checklist.';
COMMENT ON COLUMN public.checklist_transporte.assinatura_responsavel IS
  'Nome ou rubrica do responsÃ¡vel interno no checklist.';



-- >>> 20260417120000_financeiro_etapa5.sql <<<


-- ETAPA 5 â€” Financeiro: NF, confirmaÃ§Ã£o de recebimento, documentos e Ã­ndices
-- Aplicar no SQL Editor do Supabase.

-- Campos adicionais na coleta (cobranÃ§a)
ALTER TABLE public.coletas ADD COLUMN IF NOT EXISTS numero_nf text;
ALTER TABLE public.coletas ADD COLUMN IF NOT EXISTS confirmacao_recebimento boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coletas.numero_nf IS 'NÃºmero da nota fiscal referente Ã  coleta.';
COMMENT ON COLUMN public.coletas.confirmacao_recebimento IS 'ConfirmaÃ§Ã£o de recebimento do valor/documento.';

CREATE INDEX IF NOT EXISTS idx_coletas_numero_nf ON public.coletas (numero_nf)
  WHERE numero_nf IS NOT NULL AND btrim(numero_nf) <> '';

-- Documentos a acompanhar (vencimentos, alertas na UI)
CREATE TABLE IF NOT EXISTS public.financeiro_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_documento text NOT NULL,
  data_vencimento date NOT NULL,
  coleta_id uuid REFERENCES public.coletas (id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_documentos_vencimento ON public.financeiro_documentos (data_vencimento);

COMMENT ON TABLE public.financeiro_documentos IS
  'Documentos com vencimento acompanhar no financeiro (licenÃ§as, apÃ³lices, certificados).';

ALTER TABLE public.financeiro_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financeiro_documentos_authenticated_all" ON public.financeiro_documentos;
CREATE POLICY "financeiro_documentos_authenticated_all"
  ON public.financeiro_documentos FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);



-- >>> 20260418120000_nf_envios_log.sql <<<


-- ETAPA 6 â€” Registo de envios de NF (simulaÃ§Ã£o / futura integraÃ§Ã£o e-mail)
-- Aplicar no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.nf_envios_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  modo text NOT NULL DEFAULT 'simulacao',
  destinatarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_destinatarios int NOT NULL DEFAULT 0,
  observacao text
);

CREATE INDEX IF NOT EXISTS idx_nf_envios_log_created ON public.nf_envios_log (created_at DESC);

COMMENT ON TABLE public.nf_envios_log IS
  'HistÃ³rico de disparos de mala direta de NF; modo simulacao atÃ© integraÃ§Ã£o SMTP/API.';
COMMENT ON COLUMN public.nf_envios_log.destinatarios IS 'JSON: [{ "cliente_id", "nome", "email" }, ...].';
COMMENT ON COLUMN public.nf_envios_log.modo IS 'simulacao | (futuro: email_smtp, etc.).';

ALTER TABLE public.nf_envios_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nf_envios_log_authenticated_all" ON public.nf_envios_log;
CREATE POLICY "nf_envios_log_authenticated_all"
  ON public.nf_envios_log FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);



-- >>> 20260419120000_vw_faturamento_resumo.sql <<<


-- Vista consolidada para a pÃ¡gina Financeiro / faturamento: coleta + programaÃ§Ã£o + MTR + aprovaÃ§Ã£o + faturamento operacional.
-- security_invoker: RLS das tabelas base aplica-se ao utilizador da sessÃ£o.
-- Aplicar: SQL Editor ou npm run db:apply:sql -- supabase/migrations/20260419120000_vw_faturamento_resumo.sql

CREATE OR REPLACE VIEW public.vw_faturamento_resumo
WITH (security_invoker = true) AS
SELECT
  c.id AS coleta_id,
  c.numero,
  c.numero_coleta,
  c.cliente_id,
  COALESCE(cl.nome, c.cliente) AS cliente_nome,
  cl.razao_social AS cliente_razao_social,
  c.data_agendada,
  COALESCE(p.data_programada, c.data_agendada) AS data_programacao,
  c.data_coleta AS data_execucao,
  c.programacao_id,
  p.numero AS programacao_numero,
  p.observacoes AS programacao_observacoes,
  c.mtr_id,
  m.numero AS mtr_numero,
  m.observacoes AS mtr_observacoes,
  COALESCE(
    NULLIF(btrim(c.ticket_numero), ''),
    ltk.ticket_numero
  ) AS ticket_comprovante,
  c.peso_tara,
  c.peso_bruto,
  c.peso_liquido,
  COALESCE(c.motorista_nome, c.motorista) AS motorista,
  c.placa,
  c.valor_coleta,
  c.status_pagamento,
  c.data_vencimento,
  COALESCE(c.numero_nf, lfr.referencia_nf) AS referencia_nf,
  c.numero_nf AS numero_nf_coleta,
  lfr.referencia_nf AS faturamento_referencia_nf,
  lfr.status AS faturamento_registro_status,
  lfr.valor AS faturamento_registro_valor,
  c.confirmacao_recebimento,
  c.fluxo_status,
  c.etapa_operacional,
  c.status_processo,
  c.liberado_financeiro,
  c.observacoes AS coleta_observacoes,
  c.tipo_residuo,
  c.cidade,
  c.created_at,
  la.decisao AS ultima_aprovacao_decisao,
  la.observacoes AS ultima_aprovacao_obs,
  la.decidido_em AS ultima_aprovacao_em,
  lco.documentos_ok AS conferencia_documentos_ok,
  lco.observacoes AS conferencia_operacional_obs,
  lco.conferido_em AS conferencia_em,
  CASE
    WHEN c.mtr_id IS NOT NULL
      AND c.peso_liquido IS NOT NULL
      AND c.peso_liquido > 0
      AND (
        (c.ticket_numero IS NOT NULL AND btrim(c.ticket_numero) <> '')
        OR (ltk.ticket_numero IS NOT NULL AND btrim(ltk.ticket_numero) <> '')
      )
      AND la.decisao = 'aprovado'
      AND c.valor_coleta IS NOT NULL
      AND c.valor_coleta > 0
    THEN 'PRONTO_PARA_FATURAR'::text
    ELSE 'PENDENTE'::text
  END AS status_conferencia,
  trim(both ', ' FROM concat_ws(', ',
    CASE WHEN c.mtr_id IS NULL THEN 'sem MTR' END,
    CASE WHEN c.peso_liquido IS NULL OR c.peso_liquido <= 0 THEN 'sem peso lÃ­quido' END,
    CASE
      WHEN (c.ticket_numero IS NULL OR btrim(c.ticket_numero) = '')
        AND (ltk.ticket_numero IS NULL OR btrim(ltk.ticket_numero) = '')
      THEN 'sem ticket'
    END,
    CASE WHEN la.decisao IS DISTINCT FROM 'aprovado' THEN 'sem aprovaÃ§Ã£o' END,
    CASE WHEN c.valor_coleta IS NULL OR c.valor_coleta <= 0 THEN 'sem valor' END
  )) AS pendencias_resumo,
  c.status_pagamento AS status_faturamento
FROM public.coletas c
LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.programacoes p ON p.id = c.programacao_id
LEFT JOIN public.mtrs m ON m.id = c.mtr_id
LEFT JOIN LATERAL (
  SELECT t.numero AS ticket_numero
  FROM public.tickets_operacionais t
  WHERE t.coleta_id = c.id
  ORDER BY t.created_at DESC NULLS LAST, t.id DESC
  LIMIT 1
) ltk ON true
LEFT JOIN LATERAL (
  SELECT ad.decisao, ad.observacoes, ad.decidido_em
  FROM public.aprovacoes_diretoria ad
  WHERE ad.coleta_id = c.id
  ORDER BY ad.decidido_em DESC NULLS LAST, ad.id DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT fr.status, fr.referencia_nf, fr.valor
  FROM public.faturamento_registros fr
  WHERE fr.coleta_id = c.id
  ORDER BY fr.updated_at DESC NULLS LAST, fr.id DESC
  LIMIT 1
) lfr ON true
LEFT JOIN LATERAL (
  SELECT co.documentos_ok, co.observacoes, co.conferido_em
  FROM public.conferencia_operacional co
  WHERE co.coleta_id = c.id
  ORDER BY co.conferido_em DESC NULLS LAST, co.id DESC
  LIMIT 1
) lco ON true;

COMMENT ON VIEW public.vw_faturamento_resumo IS
  'ConsolidaÃ§Ã£o para conferÃªncia final / faturamento: coleta, cliente, programaÃ§Ã£o, MTR, ticket, pesos, aprovaÃ§Ã£o, faturamento operacional.';

GRANT SELECT ON public.vw_faturamento_resumo TO authenticated;



-- >>> 20260420120000_chat_participantes_realtime.sql <<<


-- Realtime em chat_participantes: actualizar UI (ex.: badge nÃ£o lidas) quando last_read_at muda.
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_participantes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participantes;
  END IF;
END;
$pub$;



-- >>> 20260420130000_usuarios_paginas_permitidas.sql <<<


-- PÃ¡ginas do sistema permitidas por utilizador (lista de prefixos de rota, ex. '/clientes').
-- NULL ou array vazio = sem restriÃ§Ã£o extra (mantÃ©m-se a regra por cargo nas rotas protegidas).

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS paginas_permitidas text[] NULL;

COMMENT ON COLUMN public.usuarios.paginas_permitidas IS
  'Prefixos de rota permitidos quando definido e nÃ£o vazio; caso contrÃ¡rio sÃ³ aplica o cargo.';



-- >>> 20260421120000_tickets_operacionais_tipo_entrada.sql <<<


-- Inclui "entrada" como tipo de ticket operacional (Entrada / SaÃ­da / Frete).
ALTER TABLE public.tickets_operacionais DROP CONSTRAINT IF EXISTS tickets_operacionais_tipo_ticket_check;

ALTER TABLE public.tickets_operacionais
  ADD CONSTRAINT tickets_operacionais_tipo_ticket_check CHECK (tipo_ticket IN ('entrada', 'saida', 'frete'));

COMMENT ON COLUMN public.tickets_operacionais.tipo_ticket IS
  'ClassificaÃ§Ã£o: entrada, saÃ­da de material ou frete.';



-- >>> 20260423100000_coletas_alinhar_fluxo_etapa_operacional.sql <<<


-- Alinha `fluxo_status` a `etapa_operacional` quando esta estÃ¡ Ã  frente na ordem canÃ³nica.
-- NÃ£o altera `status_processo`: no projeto esse campo segue outro vocabulÃ¡rio (CHECK, ex.: MTR_EMITIDA, EM_CONFERENCIA).
--
-- Aplicar: `supabase db push` OU colar no SQL Editor do Supabase o **ficheiro inteiro** (desde CREATE atÃ© ao UPDATE).
-- NÃ£o use reticÃªncias (...) no meio do cÃ³digo â€” isso gera erro de sintaxe (42601).

CREATE OR REPLACE FUNCTION public.rg_ordem_etapa_fluxo(p_etapa text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE upper(btrim(p_etapa))
    WHEN 'PROGRAMACAO_CRIADA' THEN 1
    WHEN 'QUADRO_ATUALIZADO' THEN 2
    WHEN 'MTR_PREENCHIDA' THEN 3
    WHEN 'MTR_ENTREGUE_LOGISTICA' THEN 4
    WHEN 'LOGISTICA_DESIGNADA' THEN 5
    WHEN 'TARA_REGISTRADA' THEN 6
    WHEN 'COLETA_REALIZADA' THEN 7
    WHEN 'BRUTO_REGISTRADO' THEN 8
    WHEN 'CONTROLE_PESAGEM_LANCADO' THEN 9
    WHEN 'DOCUMENTOS_RECEBIDOS_OPERACIONAL' THEN 10
    WHEN 'TICKET_GERADO' THEN 11
    WHEN 'ENVIADO_APROVACAO' THEN 12
    WHEN 'APROVADO' THEN 13
    WHEN 'ARQUIVADO' THEN 14
    WHEN 'FATURADO' THEN 15
    WHEN 'ENVIADO_FINANCEIRO' THEN 16
    WHEN 'FINALIZADO' THEN 17
    -- Legados (mesmo mapeamento que src/lib/fluxoEtapas.ts)
    WHEN 'PESO_CALCULADO' THEN 9
    WHEN 'LANCADO_CONTROLE_MASSA' THEN 9
    WHEN 'CONTROLE_PESAGEM' THEN 9
    WHEN 'DOCUMENTO_CRIADO' THEN 3
    WHEN 'DOCUMENTO_ENTREGUE' THEN 4
    WHEN 'LIBERADO_FINANCEIRO' THEN 16
    WHEN 'LOGISTICA_DESIGNADA_SAIDA' THEN 5
    WHEN 'RETORNO_PESO_BRUTO' THEN 8
    ELSE -1
  END
$$;

COMMENT ON FUNCTION public.rg_ordem_etapa_fluxo(text) IS
  'Ordem numÃ©rica das etapas do fluxo RG (canÃ³nico + legados); usada para alinhar fluxo_status com etapa_operacional.';

UPDATE public.coletas c
SET fluxo_status = c.etapa_operacional
WHERE public.rg_ordem_etapa_fluxo(c.etapa_operacional) > public.rg_ordem_etapa_fluxo(c.fluxo_status)
  AND public.rg_ordem_etapa_fluxo(c.etapa_operacional) >= 1
  AND public.rg_ordem_etapa_fluxo(c.fluxo_status) >= 1;

-- SÃ³ seeds de faturamento (alternativa conservadora):
-- UPDATE public.coletas
-- SET fluxo_status = etapa_operacional
-- WHERE observacoes ILIKE '%[FAT-TEST-5]%'
--   AND etapa_operacional IS NOT NULL
--   AND btrim(etapa_operacional) <> ''
--   AND etapa_operacional IS DISTINCT FROM fluxo_status;



-- >>> 20260424120000_faturamento_precos_contas_receber.sql <<<


-- Regras de preÃ§o (faturamento automÃ¡tico) + contas a receber (pÃ³s-emissÃ£o).
-- CompatÃ­vel com faturamento manual: se nÃ£o houver regra ou tabelas nÃ£o aplicadas, o fluxo existente mantÃ©m-se.

CREATE TABLE IF NOT EXISTS public.faturamento_precos_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE CASCADE,
  tipo_residuo text NOT NULL DEFAULT '',
  tipo_servico text DEFAULT 'COLETA',
  valor_por_kg numeric,
  valor_minimo numeric DEFAULT 0,
  valor_fixo numeric,
  valor_transporte_por_kg numeric,
  valor_tratamento_por_kg numeric,
  taxa_adicional_fixa numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faturamento_precos_regras_residuo_chk CHECK (char_length(btrim(tipo_residuo)) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_faturamento_precos_regras_ativo ON public.faturamento_precos_regras (ativo)
  WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_faturamento_precos_regras_cliente ON public.faturamento_precos_regras (cliente_id)
  WHERE cliente_id IS NOT NULL;

COMMENT ON TABLE public.faturamento_precos_regras IS
  'Regras de sugestÃ£o de valor: prioridade cliente+resÃ­duo > cliente > geral por resÃ­duo. tipo_residuo vazio ou * = qualquer resÃ­duo.';

ALTER TABLE public.faturamento_precos_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faturamento_precos_regras_authenticated_all" ON public.faturamento_precos_regras;
CREATE POLICY "faturamento_precos_regras_authenticated_all"
  ON public.faturamento_precos_regras FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faturamento_precos_regras TO authenticated;

-- Uma conta por coleta (evita duplicar ao reemitir / atualizar).
CREATE TABLE IF NOT EXISTS public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE SET NULL,
  valor numeric NOT NULL,
  data_emissao date NOT NULL DEFAULT (CURRENT_DATE),
  data_vencimento date,
  status_pagamento text NOT NULL DEFAULT 'Pendente'
    CHECK (status_pagamento IN ('Pendente', 'Pago', 'Parcial', 'Cancelado')),
  referencia_coleta_id uuid NOT NULL REFERENCES public.coletas (id) ON DELETE CASCADE,
  faturamento_registro_id uuid REFERENCES public.faturamento_registros (id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contas_receber_coleta_unique UNIQUE (referencia_coleta_id)
);

CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON public.contas_receber (cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON public.contas_receber (data_vencimento);

COMMENT ON TABLE public.contas_receber IS
  'Conta a receber gerada na emissÃ£o do faturamento; actualizada se jÃ¡ existir para a mesma coleta.';

ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contas_receber_authenticated_all" ON public.contas_receber;
CREATE POLICY "contas_receber_authenticated_all"
  ON public.contas_receber FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_receber TO authenticated;



-- >>> 20260425120000_rls_por_cargo_core_fluxo.sql <<<


-- =============================================================================
-- Fase 5 (backend) â€” RLS por cargo (core do fluxo)
-- Objetivo: restringir mutaÃ§Ãµes por perfil usando `public.usuarios.cargo` (auth.uid()).
-- Rollout seguro: se `usuarios.cargo` estiver vazio/nulo, mantÃ©m mutaÃ§Ã£o permitida (modo compat).
-- =============================================================================

-- Helpers de cargo ------------------------------------------------------------

create or replace function public.rg_user_cargo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.cargo from public.usuarios u where u.id = auth.uid()), '');
$$;

create or replace function public.rg_cargo_like(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(public.rg_user_cargo()) like '%' || lower(coalesce(p, '')) || '%';
$$;

create or replace function public.rg_cargo_vazio_compat()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select btrim(public.rg_user_cargo()) = '';
$$;

create or replace function public.rg_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rg_cargo_like('administrador');
$$;

create or replace function public.rg_is_diretoria()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rg_cargo_like('diretoria') or public.rg_cargo_like('diretor');
$$;

create or replace function public.rg_is_visualizador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rg_cargo_like('visualizador');
$$;

-- Coletas --------------------------------------------------------------------

alter table public.coletas enable row level security;

drop policy if exists "coletas_select_authenticated" on public.coletas;
create policy "coletas_select_authenticated"
  on public.coletas for select to authenticated
  using (true);

drop policy if exists "coletas_insert_operacional" on public.coletas;
create policy "coletas_insert_operacional"
  on public.coletas for insert to authenticated
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('operacional')
  );

drop policy if exists "coletas_update_roles_fluxo" on public.coletas;
create policy "coletas_update_roles_fluxo"
  on public.coletas for update to authenticated
  using (not public.rg_is_visualizador())
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('operacional')
    or public.rg_cargo_like('logistica')
    or public.rg_cargo_like('balanceiro')
    or public.rg_cargo_like('pesagem')
    or public.rg_cargo_like('faturamento')
    or public.rg_cargo_like('financeiro')
    or public.rg_is_diretoria()
  );

drop policy if exists "coletas_delete_operacional" on public.coletas;
create policy "coletas_delete_operacional"
  on public.coletas for delete to authenticated
  using (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('operacional')
  );

grant select, insert, update, delete on public.coletas to authenticated;

-- ProgramaÃ§Ãµes ----------------------------------------------------------------

alter table public.programacoes enable row level security;

drop policy if exists "programacoes_select_authenticated" on public.programacoes;
create policy "programacoes_select_authenticated"
  on public.programacoes for select to authenticated
  using (true);

drop policy if exists "programacoes_mutate_operacional" on public.programacoes;
create policy "programacoes_mutate_operacional"
  on public.programacoes for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('operacional')
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('operacional')
  );

grant select, insert, update, delete on public.programacoes to authenticated;

-- MTRs -----------------------------------------------------------------------

alter table public.mtrs enable row level security;

drop policy if exists "mtrs_select_authenticated" on public.mtrs;
create policy "mtrs_select_authenticated"
  on public.mtrs for select to authenticated
  using (true);

drop policy if exists "mtrs_mutate_operacional" on public.mtrs;
create policy "mtrs_mutate_operacional"
  on public.mtrs for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('operacional')
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('operacional')
  );

grant select, insert, update, delete on public.mtrs to authenticated;

-- Controle de massa -----------------------------------------------------------

alter table public.controle_massa enable row level security;

drop policy if exists "controle_massa_select_authenticated" on public.controle_massa;
create policy "controle_massa_select_authenticated"
  on public.controle_massa for select to authenticated
  using (true);

drop policy if exists "controle_massa_mutate_pesagem" on public.controle_massa;
create policy "controle_massa_mutate_pesagem"
  on public.controle_massa for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('balanceiro')
      or public.rg_cargo_like('pesagem')
      or public.rg_cargo_like('logistica')
      or public.rg_cargo_like('operacional')
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('balanceiro')
    or public.rg_cargo_like('pesagem')
    or public.rg_cargo_like('logistica')
    or public.rg_cargo_like('operacional')
  );

grant select, insert, update, delete on public.controle_massa to authenticated;

-- Faturamento (registros) -----------------------------------------------------

alter table public.faturamento_registros enable row level security;

drop policy if exists "faturamento_registros_authenticated_all" on public.faturamento_registros;
drop policy if exists "faturamento_registros_select_authenticated" on public.faturamento_registros;
create policy "faturamento_registros_select_authenticated"
  on public.faturamento_registros for select to authenticated
  using (true);

drop policy if exists "faturamento_registros_mutate_faturamento" on public.faturamento_registros;
create policy "faturamento_registros_mutate_faturamento"
  on public.faturamento_registros for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('faturamento')
      or public.rg_cargo_like('financeiro')
      or public.rg_is_diretoria()
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('faturamento')
    or public.rg_cargo_like('financeiro')
    or public.rg_is_diretoria()
  );

grant select, insert, update, delete on public.faturamento_registros to authenticated;

-- Contas a receber ------------------------------------------------------------

alter table public.contas_receber enable row level security;

drop policy if exists "contas_receber_authenticated_all" on public.contas_receber;

drop policy if exists "contas_receber_select_authenticated" on public.contas_receber;
create policy "contas_receber_select_authenticated"
  on public.contas_receber for select to authenticated
  using (true);

drop policy if exists "contas_receber_mutate_financeiro" on public.contas_receber;
create policy "contas_receber_mutate_financeiro"
  on public.contas_receber for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('financeiro')
      or public.rg_cargo_like('faturamento')
      or public.rg_is_diretoria()
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('financeiro')
    or public.rg_cargo_like('faturamento')
    or public.rg_is_diretoria()
  );

grant select, insert, update, delete on public.contas_receber to authenticated;

-- Checklist / Ticket / AprovaÃ§Ã£o / ConferÃªncia --------------------------------

alter table public.checklist_transporte enable row level security;
alter table public.tickets_operacionais enable row level security;
alter table public.aprovacoes_diretoria enable row level security;
alter table public.conferencia_operacional enable row level security;

drop policy if exists "checklist_transporte_authenticated_all" on public.checklist_transporte;
drop policy if exists "tickets_operacionais_authenticated_all" on public.tickets_operacionais;
drop policy if exists "aprovacoes_diretoria_authenticated_all" on public.aprovacoes_diretoria;
drop policy if exists "conferencia_operacional_authenticated_all" on public.conferencia_operacional;

create policy "checklist_transporte_select_authenticated"
  on public.checklist_transporte for select to authenticated using (true);
create policy "checklist_transporte_mutate_roles"
  on public.checklist_transporte for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('motorista')
      or public.rg_cargo_like('logistica')
      or public.rg_cargo_like('operacional')
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('motorista')
    or public.rg_cargo_like('logistica')
    or public.rg_cargo_like('operacional')
  );

create policy "tickets_operacionais_select_authenticated"
  on public.tickets_operacionais for select to authenticated using (true);
create policy "tickets_operacionais_mutate_roles"
  on public.tickets_operacionais for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('balanceiro')
      or public.rg_cargo_like('pesagem')
      or public.rg_cargo_like('logistica')
      or public.rg_cargo_like('operacional')
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('balanceiro')
    or public.rg_cargo_like('pesagem')
    or public.rg_cargo_like('logistica')
    or public.rg_cargo_like('operacional')
  );

create policy "aprovacoes_diretoria_select_authenticated"
  on public.aprovacoes_diretoria for select to authenticated using (true);
create policy "aprovacoes_diretoria_mutate_diretoria"
  on public.aprovacoes_diretoria for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_is_diretoria()
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_is_diretoria()
  );

create policy "conferencia_operacional_select_authenticated"
  on public.conferencia_operacional for select to authenticated using (true);
create policy "conferencia_operacional_mutate_operacional"
  on public.conferencia_operacional for all to authenticated
  using (
    not public.rg_is_visualizador()
    and (
      public.rg_is_admin()
      or public.rg_cargo_vazio_compat()
      or public.rg_cargo_like('operacional')
    )
  )
  with check (
    public.rg_is_admin()
    or public.rg_cargo_vazio_compat()
    or public.rg_cargo_like('operacional')
  );

grant select, insert, update, delete on public.checklist_transporte to authenticated;
grant select, insert, update, delete on public.tickets_operacionais to authenticated;
grant select, insert, update, delete on public.aprovacoes_diretoria to authenticated;
grant select, insert, update, delete on public.conferencia_operacional to authenticated;




-- >>> 20260426120000_contas_receber_nf_envio.sql <<<


-- Fase 8 â€” Rastreio de envio de NF na conta a receber (por coleta).
-- ApÃ³s aplicar, recrie a view vw_faturamento_resumo (este ficheiro inclui o REPLACE completo).

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS nf_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS nf_envio_observacao text,
  ADD COLUMN IF NOT EXISTS nf_envio_log_id uuid REFERENCES public.nf_envios_log (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contas_receber.nf_enviada_em IS 'Data/hora do Ãºltimo registo de envio (simulaÃ§Ã£o ou e-mail) ligado a esta coleta.';
COMMENT ON COLUMN public.contas_receber.nf_envio_observacao IS 'Resumo curto (modo, observaÃ§Ã£o do utilizador, id do log).';
COMMENT ON COLUMN public.contas_receber.nf_envio_log_id IS 'Ãšltimo registo em nf_envios_log associado a este envio.';

CREATE INDEX IF NOT EXISTS idx_contas_receber_nf_enviada ON public.contas_receber (nf_enviada_em DESC NULLS LAST)
  WHERE nf_enviada_em IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_faturamento_resumo
WITH (security_invoker = true) AS
SELECT
  c.id AS coleta_id,
  c.numero,
  c.numero_coleta,
  c.cliente_id,
  COALESCE(cl.nome, c.cliente) AS cliente_nome,
  cl.razao_social AS cliente_razao_social,
  c.data_agendada,
  COALESCE(p.data_programada, c.data_agendada) AS data_programacao,
  c.data_coleta AS data_execucao,
  c.programacao_id,
  p.numero AS programacao_numero,
  p.observacoes AS programacao_observacoes,
  c.mtr_id,
  m.numero AS mtr_numero,
  m.observacoes AS mtr_observacoes,
  COALESCE(
    NULLIF(btrim(c.ticket_numero), ''),
    ltk.ticket_numero
  ) AS ticket_comprovante,
  c.peso_tara,
  c.peso_bruto,
  c.peso_liquido,
  COALESCE(c.motorista_nome, c.motorista) AS motorista,
  c.placa,
  c.valor_coleta,
  c.status_pagamento,
  c.data_vencimento,
  COALESCE(c.numero_nf, lfr.referencia_nf) AS referencia_nf,
  c.numero_nf AS numero_nf_coleta,
  lfr.referencia_nf AS faturamento_referencia_nf,
  lfr.status AS faturamento_registro_status,
  lfr.valor AS faturamento_registro_valor,
  c.confirmacao_recebimento,
  c.fluxo_status,
  c.etapa_operacional,
  c.status_processo,
  c.liberado_financeiro,
  c.observacoes AS coleta_observacoes,
  c.tipo_residuo,
  c.cidade,
  c.created_at,
  la.decisao AS ultima_aprovacao_decisao,
  la.observacoes AS ultima_aprovacao_obs,
  la.decidido_em AS ultima_aprovacao_em,
  lco.documentos_ok AS conferencia_documentos_ok,
  lco.observacoes AS conferencia_operacional_obs,
  lco.conferido_em AS conferencia_em,
  lcr.nf_enviada_em AS conta_receber_nf_enviada_em,
  lcr.nf_envio_observacao AS conta_receber_nf_envio_obs,
  CASE
    WHEN c.mtr_id IS NOT NULL
      AND c.peso_liquido IS NOT NULL
      AND c.peso_liquido > 0
      AND (
        (c.ticket_numero IS NOT NULL AND btrim(c.ticket_numero) <> '')
        OR (ltk.ticket_numero IS NOT NULL AND btrim(ltk.ticket_numero) <> '')
      )
      AND la.decisao = 'aprovado'
      AND c.valor_coleta IS NOT NULL
      AND c.valor_coleta > 0
    THEN 'PRONTO_PARA_FATURAR'::text
    ELSE 'PENDENTE'::text
  END AS status_conferencia,
  trim(both ', ' FROM concat_ws(', ',
    CASE WHEN c.mtr_id IS NULL THEN 'sem MTR' END,
    CASE WHEN c.peso_liquido IS NULL OR c.peso_liquido <= 0 THEN 'sem peso lÃ­quido' END,
    CASE
      WHEN (c.ticket_numero IS NULL OR btrim(c.ticket_numero) = '')
        AND (ltk.ticket_numero IS NULL OR btrim(ltk.ticket_numero) = '')
      THEN 'sem ticket'
    END,
    CASE WHEN la.decisao IS DISTINCT FROM 'aprovado' THEN 'sem aprovaÃ§Ã£o' END,
    CASE WHEN c.valor_coleta IS NULL OR c.valor_coleta <= 0 THEN 'sem valor' END
  )) AS pendencias_resumo,
  c.status_pagamento AS status_faturamento
FROM public.coletas c
LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.programacoes p ON p.id = c.programacao_id
LEFT JOIN public.mtrs m ON m.id = c.mtr_id
LEFT JOIN LATERAL (
  SELECT t.numero AS ticket_numero
  FROM public.tickets_operacionais t
  WHERE t.coleta_id = c.id
  ORDER BY t.created_at DESC NULLS LAST, t.id DESC
  LIMIT 1
) ltk ON true
LEFT JOIN LATERAL (
  SELECT ad.decisao, ad.observacoes, ad.decidido_em
  FROM public.aprovacoes_diretoria ad
  WHERE ad.coleta_id = c.id
  ORDER BY ad.decidido_em DESC NULLS LAST, ad.id DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT fr.status, fr.referencia_nf, fr.valor
  FROM public.faturamento_registros fr
  WHERE fr.coleta_id = c.id
  ORDER BY fr.updated_at DESC NULLS LAST, fr.id DESC
  LIMIT 1
) lfr ON true
LEFT JOIN LATERAL (
  SELECT co.documentos_ok, co.observacoes, co.conferido_em
  FROM public.conferencia_operacional co
  WHERE co.coleta_id = c.id
  ORDER BY co.conferido_em DESC NULLS LAST, co.id DESC
  LIMIT 1
) lco ON true
LEFT JOIN LATERAL (
  SELECT cr.nf_enviada_em, cr.nf_envio_observacao
  FROM public.contas_receber cr
  WHERE cr.referencia_coleta_id = c.id
  LIMIT 1
) lcr ON true;

COMMENT ON VIEW public.vw_faturamento_resumo IS
  'ConsolidaÃ§Ã£o para conferÃªncia final / faturamento: coleta, cliente, programaÃ§Ã£o, MTR, ticket, pesos, aprovaÃ§Ã£o, faturamento operacional, envio NF (conta a receber).';

GRANT SELECT ON public.vw_faturamento_resumo TO authenticated;



-- >>> 20260427120000_fase9_parcelas_auditoria.sql <<<


-- Fase 9 â€” Pagamento parcial (baixas), trava de valor pÃ³s-faturamento, auditoria, relatÃ³rio base.
-- Aplicar no SQL Editor ou: npm run db:apply:sql -- supabase/migrations/20260427120000_fase9_parcelas_auditoria.sql

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS valor_pago numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_travado boolean NOT NULL DEFAULT false;

ALTER TABLE public.contas_receber
  DROP CONSTRAINT IF EXISTS contas_receber_valor_pago_chk;

ALTER TABLE public.contas_receber
  ADD CONSTRAINT contas_receber_valor_pago_chk
  CHECK (valor_pago >= 0 AND valor_pago <= valor);

COMMENT ON COLUMN public.contas_receber.valor_pago IS 'Total jÃ¡ recebido (somatÃ³rio das baixas ou ajuste manual alinhado ao status).';
COMMENT ON COLUMN public.contas_receber.valor_travado IS 'Se true, o valor da fatura sÃ³ pode ser alterado por administrador (emitido pelo faturamento).';

UPDATE public.contas_receber
SET valor_pago = valor
WHERE status_pagamento = 'Pago' AND valor_pago = 0 AND valor > 0;

UPDATE public.contas_receber
SET valor_travado = true
WHERE faturamento_registro_id IS NOT NULL;

UPDATE public.contas_receber
SET status_pagamento = 'Parcial'
WHERE valor_pago > 0 AND valor_pago < valor AND status_pagamento NOT IN ('Pago', 'Cancelado');

CREATE TABLE IF NOT EXISTS public.contas_receber_baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id uuid NOT NULL REFERENCES public.contas_receber (id) ON DELETE CASCADE,
  valor numeric NOT NULL CHECK (valor > 0),
  data_baixa date NOT NULL DEFAULT (CURRENT_DATE),
  observacao text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_receber_baixas_conta ON public.contas_receber_baixas (conta_receber_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_baixas_data ON public.contas_receber_baixas (data_baixa DESC);

COMMENT ON TABLE public.contas_receber_baixas IS 'HistÃ³rico de recebimentos parciais (baixas) sobre contas_receber.';

CREATE TABLE IF NOT EXISTS public.financeiro_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade text NOT NULL,
  entidade_id uuid NOT NULL,
  usuario_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  acao text NOT NULL,
  detalhe jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_auditoria_entidade ON public.financeiro_auditoria (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_auditoria_created ON public.financeiro_auditoria (created_at DESC);

COMMENT ON TABLE public.financeiro_auditoria IS 'Trilha de alteraÃ§Ãµes sensÃ­veis no financeiro (contas a receber, baixas).';

ALTER TABLE public.contas_receber_baixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contas_receber_baixas_select_authenticated" ON public.contas_receber_baixas;
CREATE POLICY "contas_receber_baixas_select_authenticated"
  ON public.contas_receber_baixas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "contas_receber_baixas_mutate_financeiro" ON public.contas_receber_baixas;
CREATE POLICY "contas_receber_baixas_mutate_financeiro"
  ON public.contas_receber_baixas FOR ALL TO authenticated
  USING (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  )
  WITH CHECK (
    public.rg_is_admin()
    OR public.rg_cargo_vazio_compat()
    OR public.rg_cargo_like('financeiro')
    OR public.rg_cargo_like('faturamento')
    OR public.rg_is_diretoria()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_receber_baixas TO authenticated;

DROP POLICY IF EXISTS "financeiro_auditoria_select_authenticated" ON public.financeiro_auditoria;
CREATE POLICY "financeiro_auditoria_select_authenticated"
  ON public.financeiro_auditoria FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "financeiro_auditoria_insert_financeiro" ON public.financeiro_auditoria;
CREATE POLICY "financeiro_auditoria_insert_financeiro"
  ON public.financeiro_auditoria FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('financeiro')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  );

GRANT SELECT, INSERT ON public.financeiro_auditoria TO authenticated;

CREATE OR REPLACE VIEW public.vw_faturamento_resumo
WITH (security_invoker = true) AS
SELECT
  c.id AS coleta_id,
  c.numero,
  c.numero_coleta,
  c.cliente_id,
  COALESCE(cl.nome, c.cliente) AS cliente_nome,
  cl.razao_social AS cliente_razao_social,
  c.data_agendada,
  COALESCE(p.data_programada, c.data_agendada) AS data_programacao,
  c.data_coleta AS data_execucao,
  c.programacao_id,
  p.numero AS programacao_numero,
  p.observacoes AS programacao_observacoes,
  c.mtr_id,
  m.numero AS mtr_numero,
  m.observacoes AS mtr_observacoes,
  COALESCE(
    NULLIF(btrim(c.ticket_numero), ''),
    ltk.ticket_numero
  ) AS ticket_comprovante,
  c.peso_tara,
  c.peso_bruto,
  c.peso_liquido,
  COALESCE(c.motorista_nome, c.motorista) AS motorista,
  c.placa,
  c.valor_coleta,
  c.status_pagamento,
  c.data_vencimento,
  COALESCE(c.numero_nf, lfr.referencia_nf) AS referencia_nf,
  c.numero_nf AS numero_nf_coleta,
  lfr.referencia_nf AS faturamento_referencia_nf,
  lfr.status AS faturamento_registro_status,
  lfr.valor AS faturamento_registro_valor,
  c.confirmacao_recebimento,
  c.fluxo_status,
  c.etapa_operacional,
  c.status_processo,
  c.liberado_financeiro,
  c.observacoes AS coleta_observacoes,
  c.tipo_residuo,
  c.cidade,
  c.created_at,
  la.decisao AS ultima_aprovacao_decisao,
  la.observacoes AS ultima_aprovacao_obs,
  la.decidido_em AS ultima_aprovacao_em,
  lco.documentos_ok AS conferencia_documentos_ok,
  lco.observacoes AS conferencia_operacional_obs,
  lco.conferido_em AS conferencia_em,
  lcr.nf_enviada_em AS conta_receber_nf_enviada_em,
  lcr.nf_envio_observacao AS conta_receber_nf_envio_obs,
  lcr.valor_pago AS conta_receber_valor_pago,
  lcr.valor_travado AS conta_receber_valor_travado,
  CASE
    WHEN c.mtr_id IS NOT NULL
      AND c.peso_liquido IS NOT NULL
      AND c.peso_liquido > 0
      AND (
        (c.ticket_numero IS NOT NULL AND btrim(c.ticket_numero) <> '')
        OR (ltk.ticket_numero IS NOT NULL AND btrim(ltk.ticket_numero) <> '')
      )
      AND la.decisao = 'aprovado'
      AND c.valor_coleta IS NOT NULL
      AND c.valor_coleta > 0
    THEN 'PRONTO_PARA_FATURAR'::text
    ELSE 'PENDENTE'::text
  END AS status_conferencia,
  trim(both ', ' FROM concat_ws(', ',
    CASE WHEN c.mtr_id IS NULL THEN 'sem MTR' END,
    CASE WHEN c.peso_liquido IS NULL OR c.peso_liquido <= 0 THEN 'sem peso lÃ­quido' END,
    CASE
      WHEN (c.ticket_numero IS NULL OR btrim(c.ticket_numero) = '')
        AND (ltk.ticket_numero IS NULL OR btrim(ltk.ticket_numero) = '')
      THEN 'sem ticket'
    END,
    CASE WHEN la.decisao IS DISTINCT FROM 'aprovado' THEN 'sem aprovaÃ§Ã£o' END,
    CASE WHEN c.valor_coleta IS NULL OR c.valor_coleta <= 0 THEN 'sem valor' END
  )) AS pendencias_resumo,
  c.status_pagamento AS status_faturamento
FROM public.coletas c
LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.programacoes p ON p.id = c.programacao_id
LEFT JOIN public.mtrs m ON m.id = c.mtr_id
LEFT JOIN LATERAL (
  SELECT t.numero AS ticket_numero
  FROM public.tickets_operacionais t
  WHERE t.coleta_id = c.id
  ORDER BY t.created_at DESC NULLS LAST, t.id DESC
  LIMIT 1
) ltk ON true
LEFT JOIN LATERAL (
  SELECT ad.decisao, ad.observacoes, ad.decidido_em
  FROM public.aprovacoes_diretoria ad
  WHERE ad.coleta_id = c.id
  ORDER BY ad.decidido_em DESC NULLS LAST, ad.id DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT fr.status, fr.referencia_nf, fr.valor
  FROM public.faturamento_registros fr
  WHERE fr.coleta_id = c.id
  ORDER BY fr.updated_at DESC NULLS LAST, fr.id DESC
  LIMIT 1
) lfr ON true
LEFT JOIN LATERAL (
  SELECT co.documentos_ok, co.observacoes, co.conferido_em
  FROM public.conferencia_operacional co
  WHERE co.coleta_id = c.id
  ORDER BY co.conferido_em DESC NULLS LAST, co.id DESC
  LIMIT 1
) lco ON true
LEFT JOIN LATERAL (
  SELECT cr.nf_enviada_em, cr.nf_envio_observacao, cr.valor_pago, cr.valor_travado
  FROM public.contas_receber cr
  WHERE cr.referencia_coleta_id = c.id
  LIMIT 1
) lcr ON true;

COMMENT ON VIEW public.vw_faturamento_resumo IS
  'ConsolidaÃ§Ã£o para conferÃªncia / faturamento / financeiro; inclui snapshot de contas_receber (NF, parcelas, trava).';

GRANT SELECT ON public.vw_faturamento_resumo TO authenticated;



-- >>> 20260427140000_clientes_status_datas.sql <<<


-- Datas de referÃªncia do estado comercial (pÃ³s-venda / carteira)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_ativo_desde date;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_inativo_desde date;

COMMENT ON COLUMN public.clientes.status_ativo_desde IS 'Data a partir da qual o cliente estÃ¡ ou passou a estar ativo (cadastro manual).';
COMMENT ON COLUMN public.clientes.status_inativo_desde IS 'Data a partir da qual o cliente estÃ¡ ou passou a estar inativo (cadastro manual).';



-- >>> 20260428120000_vw_faturamento_resumo_pronto_sem_valor_obrigatorio.sql <<<


-- PRONTO_PARA_FATURAR: alinha com o fluxo pÃ³sâ€“Controle de Massa + aprovaÃ§Ã£o.
-- NÃ£o exige valor prÃ©-gravado em coletas.valor_coleta (definido na emissÃ£o / regras de preÃ§o).
-- PendÃªncia Â«sem valorÂ» continua em pendencias_resumo quando aplicÃ¡vel.

CREATE OR REPLACE VIEW public.vw_faturamento_resumo
WITH (security_invoker = true) AS
SELECT
  c.id AS coleta_id,
  c.numero,
  c.numero_coleta,
  c.cliente_id,
  COALESCE(cl.nome, c.cliente) AS cliente_nome,
  cl.razao_social AS cliente_razao_social,
  c.data_agendada,
  COALESCE(p.data_programada, c.data_agendada) AS data_programacao,
  c.data_coleta AS data_execucao,
  c.programacao_id,
  p.numero AS programacao_numero,
  p.observacoes AS programacao_observacoes,
  c.mtr_id,
  m.numero AS mtr_numero,
  m.observacoes AS mtr_observacoes,
  COALESCE(
    NULLIF(btrim(c.ticket_numero), ''),
    ltk.ticket_numero
  ) AS ticket_comprovante,
  c.peso_tara,
  c.peso_bruto,
  c.peso_liquido,
  COALESCE(c.motorista_nome, c.motorista) AS motorista,
  c.placa,
  c.valor_coleta,
  c.status_pagamento,
  c.data_vencimento,
  COALESCE(c.numero_nf, lfr.referencia_nf) AS referencia_nf,
  c.numero_nf AS numero_nf_coleta,
  lfr.referencia_nf AS faturamento_referencia_nf,
  lfr.status AS faturamento_registro_status,
  lfr.valor AS faturamento_registro_valor,
  c.confirmacao_recebimento,
  c.fluxo_status,
  c.etapa_operacional,
  c.status_processo,
  c.liberado_financeiro,
  c.observacoes AS coleta_observacoes,
  c.tipo_residuo,
  c.cidade,
  c.created_at,
  la.decisao AS ultima_aprovacao_decisao,
  la.observacoes AS ultima_aprovacao_obs,
  la.decidido_em AS ultima_aprovacao_em,
  lco.documentos_ok AS conferencia_documentos_ok,
  lco.observacoes AS conferencia_operacional_obs,
  lco.conferido_em AS conferencia_em,
  lcr.nf_enviada_em AS conta_receber_nf_enviada_em,
  lcr.nf_envio_observacao AS conta_receber_nf_envio_obs,
  lcr.valor_pago AS conta_receber_valor_pago,
  lcr.valor_travado AS conta_receber_valor_travado,
  CASE
    WHEN c.mtr_id IS NOT NULL
      AND c.peso_liquido IS NOT NULL
      AND c.peso_liquido > 0
      AND (
        (c.ticket_numero IS NOT NULL AND btrim(c.ticket_numero) <> '')
        OR (ltk.ticket_numero IS NOT NULL AND btrim(ltk.ticket_numero) <> '')
      )
      AND la.decisao = 'aprovado'
    THEN 'PRONTO_PARA_FATURAR'::text
    ELSE 'PENDENTE'::text
  END AS status_conferencia,
  trim(both ', ' FROM concat_ws(', ',
    CASE WHEN c.mtr_id IS NULL THEN 'sem MTR' END,
    CASE WHEN c.peso_liquido IS NULL OR c.peso_liquido <= 0 THEN 'sem peso lÃ­quido' END,
    CASE
      WHEN (c.ticket_numero IS NULL OR btrim(c.ticket_numero) = '')
        AND (ltk.ticket_numero IS NULL OR btrim(ltk.ticket_numero) = '')
      THEN 'sem ticket'
    END,
    CASE WHEN la.decisao IS DISTINCT FROM 'aprovado' THEN 'sem aprovaÃ§Ã£o' END,
    CASE WHEN c.valor_coleta IS NULL OR c.valor_coleta <= 0 THEN 'sem valor' END
  )) AS pendencias_resumo,
  c.status_pagamento AS status_faturamento
FROM public.coletas c
LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.programacoes p ON p.id = c.programacao_id
LEFT JOIN public.mtrs m ON m.id = c.mtr_id
LEFT JOIN LATERAL (
  SELECT t.numero AS ticket_numero
  FROM public.tickets_operacionais t
  WHERE t.coleta_id = c.id
  ORDER BY t.created_at DESC NULLS LAST, t.id DESC
  LIMIT 1
) ltk ON true
LEFT JOIN LATERAL (
  SELECT ad.decisao, ad.observacoes, ad.decidido_em
  FROM public.aprovacoes_diretoria ad
  WHERE ad.coleta_id = c.id
  ORDER BY ad.decidido_em DESC NULLS LAST, ad.id DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT fr.status, fr.referencia_nf, fr.valor
  FROM public.faturamento_registros fr
  WHERE fr.coleta_id = c.id
  ORDER BY fr.updated_at DESC NULLS LAST, fr.id DESC
  LIMIT 1
) lfr ON true
LEFT JOIN LATERAL (
  SELECT co.documentos_ok, co.observacoes, co.conferido_em
  FROM public.conferencia_operacional co
  WHERE co.coleta_id = c.id
  ORDER BY co.conferido_em DESC NULLS LAST, co.id DESC
  LIMIT 1
) lco ON true
LEFT JOIN LATERAL (
  SELECT cr.nf_enviada_em, cr.nf_envio_observacao, cr.valor_pago, cr.valor_travado
  FROM public.contas_receber cr
  WHERE cr.referencia_coleta_id = c.id
  LIMIT 1
) lcr ON true;

COMMENT ON VIEW public.vw_faturamento_resumo IS
  'ConsolidaÃ§Ã£o para conferÃªncia / faturamento / financeiro; PRONTO_PARA_FATURAR sem exigir valor na coleta (emissÃ£o / regras).';

GRANT SELECT ON public.vw_faturamento_resumo TO authenticated;



-- >>> 20260428150000_motoristas_cnh_foto.sql <<<


-- Foto digital da CNH (URL pÃºblica no Storage) + bucket motoristas-cnh
-- Aplicar: SQL Editor ou supabase db push

ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS cnh_foto_url text;

COMMENT ON COLUMN public.motoristas.cnh_foto_url IS
  'URL pÃºblica da imagem da CNH (bucket motoristas-cnh/<motorista_id>/...).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'motoristas-cnh',
  'motoristas-cnh',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "motoristas_cnh_select_public" ON storage.objects;
CREATE POLICY "motoristas_cnh_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'motoristas-cnh');

DROP POLICY IF EXISTS "motoristas_cnh_authenticated_insert" ON storage.objects;
CREATE POLICY "motoristas_cnh_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'motoristas-cnh');

DROP POLICY IF EXISTS "motoristas_cnh_authenticated_update" ON storage.objects;
CREATE POLICY "motoristas_cnh_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'motoristas-cnh')
  WITH CHECK (bucket_id = 'motoristas-cnh');

DROP POLICY IF EXISTS "motoristas_cnh_authenticated_delete" ON storage.objects;
CREATE POLICY "motoristas_cnh_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'motoristas-cnh');



-- >>> 20260428160000_caminhoes_foto.sql <<<


-- Foto do veÃ­culo (URL pÃºblica) + bucket caminhoes-fotos

ALTER TABLE public.caminhoes
  ADD COLUMN IF NOT EXISTS foto_url text;

COMMENT ON COLUMN public.caminhoes.foto_url IS
  'URL pÃºblica da fotografia do caminhÃ£o (bucket caminhoes-fotos/<caminhao_id>/...).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'caminhoes-fotos',
  'caminhoes-fotos',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "caminhoes_fotos_select_public" ON storage.objects;
CREATE POLICY "caminhoes_fotos_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'caminhoes-fotos');

DROP POLICY IF EXISTS "caminhoes_fotos_authenticated_insert" ON storage.objects;
CREATE POLICY "caminhoes_fotos_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'caminhoes-fotos');

DROP POLICY IF EXISTS "caminhoes_fotos_authenticated_update" ON storage.objects;
CREATE POLICY "caminhoes_fotos_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'caminhoes-fotos')
  WITH CHECK (bucket_id = 'caminhoes-fotos');

DROP POLICY IF EXISTS "caminhoes_fotos_authenticated_delete" ON storage.objects;
CREATE POLICY "caminhoes_fotos_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'caminhoes-fotos');



-- >>> 20260429120000_vw_faturamento_resumo_sem_aprovacao.sql <<<


-- Remove a exigÃªncia de aprovaÃ§Ã£o da diretoria para ficar PRONTO_PARA_FATURAR.
-- MantÃ©m pendÃªncias operacionais: MTR, peso lÃ­quido, ticket (e valor ainda aparece como pendÃªncia, mas nÃ£o bloqueia o status).
--
-- Garante colunas em contas_receber usadas pela view (projetos que sÃ³ aplicaram a tabela base).
--
-- Aplicar: SQL Editor ou npm run db:apply:sql -- supabase/migrations/20260429120000_vw_faturamento_resumo_sem_aprovacao.sql

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS nf_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS nf_envio_observacao text;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS valor_pago numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_travado boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.vw_faturamento_resumo
WITH (security_invoker = true) AS
SELECT
  c.id AS coleta_id,
  c.numero,
  c.numero_coleta,
  c.cliente_id,
  COALESCE(cl.nome, c.cliente) AS cliente_nome,
  cl.razao_social AS cliente_razao_social,
  c.data_agendada,
  COALESCE(p.data_programada, c.data_agendada) AS data_programacao,
  c.data_coleta AS data_execucao,
  c.programacao_id,
  p.numero AS programacao_numero,
  p.observacoes AS programacao_observacoes,
  c.mtr_id,
  m.numero AS mtr_numero,
  m.observacoes AS mtr_observacoes,
  COALESCE(
    NULLIF(btrim(c.ticket_numero), ''),
    ltk.ticket_numero
  ) AS ticket_comprovante,
  c.peso_tara,
  c.peso_bruto,
  c.peso_liquido,
  COALESCE(c.motorista_nome, c.motorista) AS motorista,
  c.placa,
  c.valor_coleta,
  c.status_pagamento,
  c.data_vencimento,
  COALESCE(c.numero_nf, lfr.referencia_nf) AS referencia_nf,
  c.numero_nf AS numero_nf_coleta,
  lfr.referencia_nf AS faturamento_referencia_nf,
  lfr.status AS faturamento_registro_status,
  lfr.valor AS faturamento_registro_valor,
  c.confirmacao_recebimento,
  c.fluxo_status,
  c.etapa_operacional,
  c.status_processo,
  c.liberado_financeiro,
  c.observacoes AS coleta_observacoes,
  c.tipo_residuo,
  c.cidade,
  c.created_at,
  la.decisao AS ultima_aprovacao_decisao,
  la.observacoes AS ultima_aprovacao_obs,
  la.decidido_em AS ultima_aprovacao_em,
  lco.documentos_ok AS conferencia_documentos_ok,
  lco.observacoes AS conferencia_operacional_obs,
  lco.conferido_em AS conferencia_em,
  lcr.nf_enviada_em AS conta_receber_nf_enviada_em,
  lcr.nf_envio_observacao AS conta_receber_nf_envio_obs,
  lcr.valor_pago AS conta_receber_valor_pago,
  lcr.valor_travado AS conta_receber_valor_travado,
  CASE
    WHEN c.mtr_id IS NOT NULL
      AND c.peso_liquido IS NOT NULL
      AND c.peso_liquido > 0
      AND (
        (c.ticket_numero IS NOT NULL AND btrim(c.ticket_numero) <> '')
        OR (ltk.ticket_numero IS NOT NULL AND btrim(ltk.ticket_numero) <> '')
      )
    THEN 'PRONTO_PARA_FATURAR'::text
    ELSE 'PENDENTE'::text
  END AS status_conferencia,
  trim(both ', ' FROM concat_ws(', ',
    CASE WHEN c.mtr_id IS NULL THEN 'sem MTR' END,
    CASE WHEN c.peso_liquido IS NULL OR c.peso_liquido <= 0 THEN 'sem peso lÃ­quido' END,
    CASE
      WHEN (c.ticket_numero IS NULL OR btrim(c.ticket_numero) = '')
        AND (ltk.ticket_numero IS NULL OR btrim(ltk.ticket_numero) = '')
      THEN 'sem ticket'
    END,
    CASE WHEN c.valor_coleta IS NULL OR c.valor_coleta <= 0 THEN 'sem valor' END
  )) AS pendencias_resumo,
  c.status_pagamento AS status_faturamento
FROM public.coletas c
LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.programacoes p ON p.id = c.programacao_id
LEFT JOIN public.mtrs m ON m.id = c.mtr_id
LEFT JOIN LATERAL (
  SELECT t.numero AS ticket_numero
  FROM public.tickets_operacionais t
  WHERE t.coleta_id = c.id
  ORDER BY t.created_at DESC NULLS LAST, t.id DESC
  LIMIT 1
) ltk ON true
LEFT JOIN LATERAL (
  SELECT ad.decisao, ad.observacoes, ad.decidido_em
  FROM public.aprovacoes_diretoria ad
  WHERE ad.coleta_id = c.id
  ORDER BY ad.decidido_em DESC NULLS LAST, ad.id DESC
  LIMIT 1
) la ON true
LEFT JOIN LATERAL (
  SELECT fr.status, fr.referencia_nf, fr.valor
  FROM public.faturamento_registros fr
  WHERE fr.coleta_id = c.id
  ORDER BY fr.updated_at DESC NULLS LAST, fr.id DESC
  LIMIT 1
) lfr ON true
LEFT JOIN LATERAL (
  SELECT co.documentos_ok, co.observacoes, co.conferido_em
  FROM public.conferencia_operacional co
  WHERE co.coleta_id = c.id
  ORDER BY co.conferido_em DESC NULLS LAST, co.id DESC
  LIMIT 1
) lco ON true
LEFT JOIN LATERAL (
  SELECT cr.nf_enviada_em, cr.nf_envio_observacao, cr.valor_pago, cr.valor_travado
  FROM public.contas_receber cr
  WHERE cr.referencia_coleta_id = c.id
  LIMIT 1
) lcr ON true;

COMMENT ON VIEW public.vw_faturamento_resumo IS
  'ConsolidaÃ§Ã£o para conferÃªncia / faturamento / financeiro; PRONTO_PARA_FATURAR sem exigir aprovaÃ§Ã£o da diretoria.';

GRANT SELECT ON public.vw_faturamento_resumo TO authenticated;




-- >>> 20260430120000_comprovantes_descarte.sql <<<


-- =============================================================================
-- Comprovante de Descarte â€” tabela, RLS, storage e gatilhos
-- =============================================================================

-- AtualizaÃ§Ã£o automÃ¡tica de updated_at (reutilizÃ¡vel)
CREATE OR REPLACE FUNCTION public.rg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.comprovantes_descarte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  codigo_remessa text,
  data_remessa date,
  cadri text,
  tipo_efluente text,
  linha_tratamento text,
  numero_mtr text,
  volume text,
  acondicionamento text,

  gerador_razao_social text,
  gerador_nome_fantasia text,
  gerador_endereco text,
  gerador_responsavel text,
  gerador_telefone text,
  gerador_contrato text,

  transportador_razao_social text,
  transportador_telefone text,
  placa text,
  motorista_nome text,
  motorista_cnh text,
  transportador_responsavel_assinatura_nome text,
  transportador_responsavel_assinatura_data date,

  destinatario_razao_social text,
  destinatario_endereco text,
  destinatario_telefone text,
  destinatario_responsavel_assinatura_nome text,
  destinatario_responsavel_assinatura_data date,

  peso_entrada numeric(14, 3),
  data_entrada timestamptz,
  peso_saida numeric(14, 3),
  data_saida timestamptz,
  peso_liquido numeric(14, 3) GENERATED ALWAYS AS (
    CASE
      WHEN peso_entrada IS NOT NULL AND peso_saida IS NOT NULL
        THEN peso_entrada - peso_saida
      ELSE NULL
    END
  ) STORED,

  foto_entrada_url text,
  foto_saida_url text,
  fotos_extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  foto_entrada_nome_arquivo text,
  foto_saida_nome_arquivo text,

  foto_entrada_conferida boolean NOT NULL DEFAULT false,
  foto_entrada_observacao_conferencia text,
  foto_saida_conferida boolean NOT NULL DEFAULT false,
  foto_saida_observacao_conferencia text,
  foto_entrada_ocr_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  foto_saida_ocr_meta jsonb NOT NULL DEFAULT '{}'::jsonb,

  observacoes text,
  coleta_id uuid REFERENCES public.coletas (id) ON DELETE SET NULL,
  mtr_id uuid REFERENCES public.mtrs (id) ON DELETE SET NULL,
  controle_massa_id uuid REFERENCES public.controle_massa (id) ON DELETE SET NULL,

  faturamento_liberado boolean NOT NULL DEFAULT false,
  status_documento text NOT NULL DEFAULT 'rascunho'
    CHECK (
      status_documento IN (
        'rascunho',
        'em_conferencia',
        'finalizado',
        'aprovado_faturamento'
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.comprovantes_descarte IS
  'Documento tÃ©cnico de comprovaÃ§Ã£o de descarte (pÃ³s-operacional).';
COMMENT ON COLUMN public.comprovantes_descarte.fotos_extras IS
  'JSON array: [{url, nome_arquivo, conferida_manual, observacao_conferencia, ocr_meta}]';
COMMENT ON COLUMN public.comprovantes_descarte.foto_entrada_ocr_meta IS
  'Reservado para leitura automÃ¡tica (peso/data) â€” evoluÃ§Ã£o futura.';
COMMENT ON COLUMN public.comprovantes_descarte.faturamento_liberado IS
  'Sinaliza que o comprovante pode ser base para faturamento.';

CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_codigo_remessa
  ON public.comprovantes_descarte (codigo_remessa);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_numero_mtr
  ON public.comprovantes_descarte (numero_mtr);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_gerador_rs
  ON public.comprovantes_descarte (gerador_razao_social);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_motorista
  ON public.comprovantes_descarte (motorista_nome);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_placa
  ON public.comprovantes_descarte (placa);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_data_remessa
  ON public.comprovantes_descarte (data_remessa);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_status
  ON public.comprovantes_descarte (status_documento);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_created
  ON public.comprovantes_descarte (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_coleta
  ON public.comprovantes_descarte (coleta_id);
CREATE INDEX IF NOT EXISTS idx_comprovantes_descarte_mtr
  ON public.comprovantes_descarte (mtr_id);

DROP TRIGGER IF EXISTS trg_comprovantes_descarte_updated_at ON public.comprovantes_descarte;
CREATE TRIGGER trg_comprovantes_descarte_updated_at
  BEFORE UPDATE ON public.comprovantes_descarte
  FOR EACH ROW
  EXECUTE FUNCTION public.rg_set_updated_at();

ALTER TABLE public.comprovantes_descarte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comprovantes_descarte_select_authenticated" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_select_authenticated"
  ON public.comprovantes_descarte FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "comprovantes_descarte_insert_roles_fluxo" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_insert_roles_fluxo"
  ON public.comprovantes_descarte FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('balanceiro')
      OR public.rg_cargo_like('pesagem')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_cargo_like('financeiro')
      OR public.rg_is_diretoria()
    )
  );

DROP POLICY IF EXISTS "comprovantes_descarte_update_roles_fluxo" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_update_roles_fluxo"
  ON public.comprovantes_descarte FOR UPDATE TO authenticated
  USING (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('balanceiro')
      OR public.rg_cargo_like('pesagem')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_cargo_like('financeiro')
      OR public.rg_is_diretoria()
    )
  )
  WITH CHECK (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('balanceiro')
      OR public.rg_cargo_like('pesagem')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_cargo_like('financeiro')
      OR public.rg_is_diretoria()
    )
  );

DROP POLICY IF EXISTS "comprovantes_descarte_delete_roles_fluxo" ON public.comprovantes_descarte;
CREATE POLICY "comprovantes_descarte_delete_roles_fluxo"
  ON public.comprovantes_descarte FOR DELETE TO authenticated
  USING (
    NOT public.rg_is_visualizador()
    AND (
      public.rg_is_admin()
      OR public.rg_cargo_vazio_compat()
      OR public.rg_cargo_like('operacional')
      OR public.rg_cargo_like('logistica')
      OR public.rg_cargo_like('faturamento')
      OR public.rg_is_diretoria()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprovantes_descarte TO authenticated;

-- Storage: comprovantes-descarte/{comprovante_id}/entrada|saida|extras/...
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes-descarte',
  'comprovantes-descarte',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "comprovantes_descarte_storage_select" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comprovantes-descarte');

DROP POLICY IF EXISTS "comprovantes_descarte_storage_insert" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes-descarte'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

DROP POLICY IF EXISTS "comprovantes_descarte_storage_update" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comprovantes-descarte'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

DROP POLICY IF EXISTS "comprovantes_descarte_storage_delete" ON storage.objects;
CREATE POLICY "comprovantes_descarte_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprovantes-descarte'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );


-- >>> 20260430210000_clientes_codigo.sql <<<

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS codigo text;

COMMENT ON COLUMN public.clientes.codigo IS
  'Código interno legível (ex.: 01). Na listagem: «Nome — Código 01».';

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY nome ASC NULLS LAST, id) AS rn
  FROM public.clientes
  WHERE codigo IS NULL OR btrim(codigo) = ''
)
UPDATE public.clientes AS c
SET codigo = LPAD(n.rn::text, 2, '0')
FROM numbered AS n
WHERE c.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_codigo_unique
  ON public.clientes (codigo)
  WHERE codigo IS NOT NULL AND btrim(codigo) <> '';

