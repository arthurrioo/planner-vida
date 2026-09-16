-- Milestone 04 reproducible auth/RLS checks.
-- Run after M03 and M04 migrations against local/DEV Supabase only.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_function('public', 'current_user_has_role', array['text'], 'role helper exists');
select has_function('public', 'handle_new_auth_user', array[]::text[], 'auth profile trigger function exists');
select has_trigger('auth', 'users', 'on_auth_user_created', 'auth user profile trigger exists');
select has_trigger('public', 'profiles', 'prevent_profile_identity_mutation', 'profile identity guard trigger exists');
select policies_are(
  'public',
  'admin_observability_metrics',
  array['admin_observability_metrics_admin_select']
);
select policies_are(
  'public',
  'system_job_runs',
  array['system_job_runs_admin_select']
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '00000000-0000-4000-8000-000000000701',
    'authenticated',
    'authenticated',
    'm04-user-a@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M04 User A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    'authenticated',
    'authenticated',
    'm04-user-b@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M04 User B"}'::jsonb
  );

select results_eq(
  $$select count(*)::integer from public.profiles where id in ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000702')$$,
  array[2],
  'signup creates aligned profiles'
);
select results_eq(
  $$select count(*)::integer from public.user_roles where user_id in ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000702') and role = 'user' and revoked_at is null$$,
  array[2],
  'signup grants active user role'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);

select results_eq(
  $$select email from public.profiles order by email$$,
  array['m04-user-a@example.invalid'],
  'owner sees only own profile'
);

update public.profiles
set display_name = 'M04 User A Updated'
where id = '00000000-0000-4000-8000-000000000701';
select results_eq(
  $$select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000701'$$,
  array['M04 User A Updated'],
  'owner can update profile basics'
);

prepare profile_email_hijack as
  update public.profiles
  set email = 'hijack@example.invalid'
  where id = '00000000-0000-4000-8000-000000000701';
select throws_ok('profile_email_hijack', null, null, 'owner cannot mutate auth-managed profile email');

update public.profiles
set display_name = 'Cross-user update attempt'
where id = '00000000-0000-4000-8000-000000000702';
select is_empty(
  $$select * from public.profiles where display_name = 'Cross-user update attempt'$$,
  'owner cannot update another profile'
);

prepare role_escalation as
  insert into public.user_roles (user_id, role)
  values ('00000000-0000-4000-8000-000000000701', 'admin');
select throws_ok('role_escalation', null, null, 'authenticated user cannot grant self admin role');

select is(public.current_user_has_role('admin'), false, 'non-admin role helper returns false');

select is_empty(
  'select * from public.admin_observability_metrics',
  'non-admin cannot read aggregate admin metrics'
);

reset role;

insert into public.user_roles (user_id, role, granted_by_user_id)
values ('00000000-0000-4000-8000-000000000702', 'admin', '00000000-0000-4000-8000-000000000702');
insert into public.admin_observability_metrics (
  metric_date,
  metric_window_start_at,
  metric_window_end_at,
  module,
  metric_name,
  metric_value,
  metric_unit,
  aggregation_type
)
values (
  '2026-09-15',
  now() - interval '1 hour',
  now(),
  'auth',
  'signup_count',
  2,
  'count',
  'count'
);
insert into public.accounts (
  id,
  user_id,
  name,
  normalized_name,
  type,
  opening_balance,
  opening_balance_date
)
values (
  '00000000-0000-4000-8000-000000000703',
  '00000000-0000-4000-8000-000000000701',
  'M04 User A Account',
  'm04-user-a-account',
  'checking',
  0,
  '2026-09-15'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);

select is(public.current_user_has_role('admin'), true, 'admin role helper returns true');
select isnt_empty(
  'select * from public.admin_observability_metrics',
  'admin can read aggregate observability metrics'
);
select is_empty(
  'select * from public.accounts',
  'admin cannot read another user financial rows through product paths'
);

reset role;
set local role anon;
prepare anon_profile_read as select * from public.profiles;
select throws_ok('anon_profile_read', null, null, 'anon cannot read profiles directly');
reset role;

select finish();

rollback;
