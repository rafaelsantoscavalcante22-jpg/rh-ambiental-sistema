-- Adiciona o cargo «Desenvolvedor» (perfil master na aplicação) à lista canónica.
alter table public.usuarios
  drop constraint if exists usuarios_cargo_canonico_chk;

alter table public.usuarios
  add constraint usuarios_cargo_canonico_chk
  check (
    cargo is null
    or btrim(cargo) = ''
    or cargo in (
      'Desenvolvedor',
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
  'Cargos canónicos (inclui Desenvolvedor). Vazio/NULL aceite para onboarding.';
