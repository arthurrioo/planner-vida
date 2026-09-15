-- Milestone 03 reproducible database checks.
-- Run after `supabase db reset` against a local/DEV Supabase database.
-- This script intentionally uses synthetic IDs and anon/authenticated roles,
-- never service_role, for RLS evidence.

begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_type('public', 'transaction_type', 'transaction_type enum exists');
select has_type('public', 'invoice_status', 'invoice_status enum exists');
select has_table('public', 'transactions', 'transactions table exists');
select has_table('public', 'admin_observability_metrics', 'admin metrics table exists');
select has_table('migration_ops', 'migration_entity_map', 'migration map table exists');
select has_index('public', 'transactions', 'transactions_user_date_desc_idx', 'transaction listing index exists');
select has_index('public', 'import_items', 'import_items_batch_line_fingerprint_uniq', 'import item idempotency index exists');
select col_type_is('public', 'transactions', 'amount', 'numeric', 'money uses numeric');
select col_type_is('public', 'transactions', 'transaction_date', 'date', 'financial dates are date-only');
select col_type_is('public', 'events', 'start_at', 'timestamp with time zone', 'timed events use timestamptz');
select policies_are('public', 'economic_indicators', array['economic_indicators_authenticated_read']);

select is(
  (select public from storage.buckets where id = 'invoice-imports'),
  false,
  'invoice-imports bucket is private'
);

prepare invalid_enum as
  insert into public.economic_indicators (code, name, source_name, frequency, unit)
  values ('not_canonical', 'Invalid', 'Synthetic', 'daily', 'percent');
select throws_ok('invalid_enum', null, null, 'invalid enum value is rejected');

prepare duplicate_seed as
  insert into public.economic_indicators (id, code, name, source_name, frequency, unit)
  values ('00000000-0000-4000-8000-000000000101', 'selic', 'Duplicate', 'Synthetic', 'daily', 'percent');
select throws_ok('duplicate_seed', null, null, 'duplicate indicator code is rejected without idempotent upsert');

set local role authenticated;
select is_empty(
  'select * from public.accounts',
  'authenticated user without auth.uid cannot read owned rows'
);
reset role;

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
    '00000000-0000-4000-8000-000000000201',
    'authenticated',
    'authenticated',
    'm03-user-a@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    'authenticated',
    'authenticated',
    'm03-user-b@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  );

insert into public.profiles (id, display_name, email)
values
  ('00000000-0000-4000-8000-000000000201', 'M03 User A', 'm03-user-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000202', 'M03 User B', 'm03-user-b@example.invalid');

insert into public.accounts (
  id,
  user_id,
  name,
  normalized_name,
  type,
  opening_balance,
  opening_balance_date
)
values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000201',
    'Synthetic Account A',
    'synthetic-account-a',
    'checking',
    0,
    '2026-01-01'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000202',
    'Synthetic Account B',
    'synthetic-account-b',
    'checking',
    0,
    '2026-01-01'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select results_eq(
  'select count(*)::integer from public.accounts',
  array[1],
  'authenticated user sees only own account'
);

prepare cross_user_insert as
  insert into public.accounts (
    user_id,
    name,
    normalized_name,
    type,
    opening_balance,
    opening_balance_date
  )
  values (
    '00000000-0000-4000-8000-000000000202',
    'Cross User Attempt',
    'cross-user-attempt',
    'checking',
    0,
    '2026-01-01'
  );
select throws_ok('cross_user_insert', null, null, 'cross-user insert is rejected by RLS');

select isnt_empty(
  'select * from public.economic_indicators',
  'authenticated user can read macro reference data'
);
reset role;

select finish();

rollback;
