-- Milestone 04 - Authentication, Profiles, Authorization, and RLS
-- Completes Auth/profile lifecycle and role-aware RLS on top of the frozen
-- Milestone 03 physical foundation without changing the M03 data contract.

set check_function_bodies = off;

create or replace function public.current_user_has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = required_role
        and revoked_at is null
    );
$$;

revoke all on function public.current_user_has_role(text) from public;
grant execute on function public.current_user_has_role(text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_display_name text;
begin
  if new.email is null or nullif(btrim(new.email), '') is null then
    raise exception 'Planner Vida profile creation requires a real auth email'
      using errcode = '23514';
  end if;

  profile_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    new.email
  );

  insert into public.profiles (
    id,
    display_name,
    email,
    default_currency,
    default_timezone,
    locale
  )
  values (
    new.id,
    profile_display_name,
    new.email,
    'BRL',
    'America/Sao_Paulo',
    'pt-BR'
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  insert into public.user_roles (user_id, role, granted_by_user_id)
  values (new.id, 'user', null)
  on conflict on constraint user_roles_user_role_active_uniq do nothing;

  insert into public.audit_logs (
    user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    new.id,
    'system',
    'auth.profile_created',
    'profile',
    new.id,
    jsonb_build_object('source', 'auth.users')
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.prevent_profile_identity_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and (new.id <> old.id or new.email <> old.email) then
    raise exception 'Profile identity fields are managed by Supabase Auth'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_identity_mutation on public.profiles;
create trigger prevent_profile_identity_mutation
  before update on public.profiles
  for each row execute function public.prevent_profile_identity_mutation();

drop policy if exists admin_observability_metrics_admin_select on public.admin_observability_metrics;
create policy admin_observability_metrics_admin_select
  on public.admin_observability_metrics
  for select to authenticated
  using (public.current_user_has_role('admin'));

drop policy if exists system_job_runs_admin_select on public.system_job_runs;
create policy system_job_runs_admin_select
  on public.system_job_runs
  for select to authenticated
  using (public.current_user_has_role('admin'));

revoke all on all tables in schema public from anon;
revoke all on all tables in schema migration_ops from anon;
revoke all on all tables in schema migration_ops from authenticated;
grant usage on schema public to anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage on schema migration_ops to service_role;
grant select, insert, update, delete on all tables in schema migration_ops to service_role;
