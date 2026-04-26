-- =============================================================================
-- Fase 5 (backend) — RLS por cargo (core do fluxo)
-- Objetivo: restringir mutações por perfil usando `public.usuarios.cargo` (auth.uid()).
-- Rollout seguro: se `usuarios.cargo` estiver vazio/nulo, mantém mutação permitida (modo compat).
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

-- Programações ----------------------------------------------------------------

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

-- Checklist / Ticket / Aprovação / Conferência --------------------------------

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

