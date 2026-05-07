-- =============================================================================
-- Cargos canónicos + auditoria de mudança de cargo + RLS de gestão de usuários
-- Alinhado ao documento de regras de negócio:
--   - 9 cargos canónicos
--   - Diretoria também pode gerir usuários (UPDATE), Administrador continua para tudo
--   - Mudanças de cargo passam a ser registadas em usuarios_cargo_log
-- =============================================================================

-- 1) Validação dos cargos canónicos -----------------------------------------
-- Não bloqueia legados em branco/null para não quebrar contas em onboarding.
alter table public.usuarios
  drop constraint if exists usuarios_cargo_canonico_chk;

alter table public.usuarios
  add constraint usuarios_cargo_canonico_chk
  check (
    cargo is null
    or btrim(cargo) = ''
    or cargo in (
      'Administrador',
      'Diretoria',
      'Comercial',
      'Operacional',
      'Logística',
      'Balanceiro',
      'Faturamento',
      'Financeiro',
      'Visualizador'
    )
  );

comment on constraint usuarios_cargo_canonico_chk on public.usuarios is
  'Cargos canónicos do sistema (acentuação: Logística). Vazio/NULL é aceito para onboarding.';

-- 2) Auditoria de mudança de cargo ------------------------------------------
create table if not exists public.usuarios_cargo_log (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  cargo_antigo text,
  cargo_novo text,
  alterado_por uuid references public.usuarios(id) on delete set null,
  alterado_em timestamptz not null default now()
);

create index if not exists usuarios_cargo_log_usuario_id_idx
  on public.usuarios_cargo_log(usuario_id, alterado_em desc);

alter table public.usuarios_cargo_log enable row level security;

drop policy if exists "usuarios_cargo_log_select_admin_diretoria" on public.usuarios_cargo_log;
create policy "usuarios_cargo_log_select_admin_diretoria"
  on public.usuarios_cargo_log for select to authenticated
  using (public.rg_is_admin() or public.rg_is_diretoria());

drop policy if exists "usuarios_cargo_log_insert_admin_diretoria" on public.usuarios_cargo_log;
create policy "usuarios_cargo_log_insert_admin_diretoria"
  on public.usuarios_cargo_log for insert to authenticated
  with check (public.rg_is_admin() or public.rg_is_diretoria());

grant select, insert on public.usuarios_cargo_log to authenticated;

create or replace function public.usuarios_log_cargo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') and (coalesce(new.cargo,'') is distinct from coalesce(old.cargo,'')) then
    insert into public.usuarios_cargo_log (usuario_id, cargo_antigo, cargo_novo, alterado_por)
    values (new.id, old.cargo, new.cargo, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_cargo_change_log on public.usuarios;
create trigger usuarios_cargo_change_log
  after update of cargo on public.usuarios
  for each row execute function public.usuarios_log_cargo_change();

-- 3) RLS — gestão de usuários (Admin + Diretoria) ---------------------------
-- Mantém a policy existente de "atualizar o próprio perfil" para uso geral.
-- Adiciona policy específica para Admin e Diretoria poderem editar outros.

alter table public.usuarios enable row level security;

drop policy if exists "usuarios_update_admin_diretoria" on public.usuarios;
create policy "usuarios_update_admin_diretoria"
  on public.usuarios for update to authenticated
  using (public.rg_is_admin() or public.rg_is_diretoria())
  with check (public.rg_is_admin() or public.rg_is_diretoria());

-- Inserção/eliminação direta continua só para Admin (Edge Functions usam service_role e ignoram RLS).
drop policy if exists "usuarios_insert_admin" on public.usuarios;
create policy "usuarios_insert_admin"
  on public.usuarios for insert to authenticated
  with check (public.rg_is_admin());

drop policy if exists "usuarios_delete_admin" on public.usuarios;
create policy "usuarios_delete_admin"
  on public.usuarios for delete to authenticated
  using (public.rg_is_admin());

grant select, insert, update, delete on public.usuarios to authenticated;
