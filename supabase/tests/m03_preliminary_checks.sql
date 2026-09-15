-- Milestone 03 reproducible database checks.
-- Run after `supabase db reset` against a local/DEV Supabase database.
-- This script intentionally uses synthetic IDs and anon/authenticated roles,
-- never service_role, for RLS evidence.

begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

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
select policies_are(
  'public',
  'transactions',
  array['owned_rows_select', 'owned_rows_insert', 'owned_rows_update', 'transactions_delete_draft_owner']
);
select policies_are('public', 'transfers', array['owned_rows_select', 'owned_rows_insert', 'owned_rows_update']);
select policies_are(
  'public',
  'accounts',
  array['owned_rows_select', 'owned_rows_insert', 'owned_rows_update', 'accounts_delete_owner']
);
select policies_are(
  'storage',
  'objects',
  array['invoice_imports_user_select', 'invoice_imports_user_insert', 'invoice_imports_user_delete']
);

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
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000201',
    'Synthetic Transfer Destination A',
    'synthetic-transfer-destination-a',
    'savings',
    0,
    '2026-01-01'
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000201',
    'Synthetic Deletable Account A',
    'synthetic-deletable-account-a',
    'wallet',
    0,
    '2026-01-01'
  );

insert into public.transactions (
  id,
  user_id,
  transaction_type,
  status,
  description,
  amount,
  transaction_date,
  competence_date,
  competence_month,
  payment_method,
  account_id
)
values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000201',
    'expense',
    'posted',
    'Posted transaction protected from hard delete',
    100,
    '2026-01-10',
    '2026-01-10',
    '2026-01-01',
    'cash',
    '00000000-0000-4000-8000-000000000301'
  ),
  (
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000202',
    'expense',
    'posted',
    'User B protected row',
    75,
    '2026-01-11',
    '2026-01-11',
    '2026-01-01',
    'cash',
    '00000000-0000-4000-8000-000000000302'
  );

insert into public.transfers (
  id,
  user_id,
  source_account_id,
  destination_account_id,
  amount,
  transfer_date,
  description
)
values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000303',
  10,
  '2026-01-12',
  'Class A transfer protected from hard delete'
);

insert into public.annual_obligations (
  id,
  user_id,
  obligation_type,
  title,
  fiscal_year,
  final_amount,
  due_date,
  status
)
values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000201',
    'ipva',
    'Draft obligation deletable before effect',
    2026,
    100,
    '2026-03-01',
    'draft'
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000201',
    'iptu',
    'Obligation for installment constraint checks',
    2026,
    120,
    '2026-04-01',
    'draft'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);

select results_eq(
  'select count(*)::integer from public.accounts',
  array[3],
  'authenticated user sees only own accounts'
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

update public.accounts
set name = 'Cross User Update Attempt'
where id = '00000000-0000-4000-8000-000000000302';
select results_eq(
  $$select name from public.accounts where id = '00000000-0000-4000-8000-000000000302'$$,
  array[]::text[],
  'cross-user update cannot reach another user row'
);

delete from public.accounts
where id = '00000000-0000-4000-8000-000000000302';
reset role;
select results_eq(
  $$select count(*)::integer from public.accounts where id = '00000000-0000-4000-8000-000000000302'$$,
  array[1],
  'cross-user delete does not remove another user row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
prepare ownership_hijack_update as
  update public.accounts
  set user_id = '00000000-0000-4000-8000-000000000202'
  where id = '00000000-0000-4000-8000-000000000301';
select throws_ok('ownership_hijack_update', null, null, 'owner cannot change user_id to seize ownership');

create function pg_temp.assert_transaction_amount_rejected(
  tx_status public.transaction_status,
  tx_amount numeric,
  tx_description text,
  allowed_constraints text[]
)
returns void
language plpgsql
as $$
declare
  violated_constraint text;
begin
  begin
    insert into public.transactions (
      user_id,
      transaction_type,
      status,
      description,
      amount,
      transaction_date,
      competence_date,
      competence_month,
      payment_method,
      account_id
    )
    values (
      '00000000-0000-4000-8000-000000000201',
      'expense',
      tx_status,
      tx_description,
      tx_amount,
      '2026-01-13',
      '2026-01-13',
      '2026-01-01',
      'cash',
      '00000000-0000-4000-8000-000000000301'
    );
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;

    if not violated_constraint = any (allowed_constraints) then
      raise exception 'unexpected transaction amount constraint %, expected one of %',
        violated_constraint,
        allowed_constraints;
    end if;

    return;
  end;

  raise exception 'transaction amount %, status %, was not rejected', tx_amount, tx_status;
end;
$$;

select lives_ok(
  $$select pg_temp.assert_transaction_amount_rejected('draft'::public.transaction_status, -50, 'Draft negative amount must fail', array['transactions_amount_non_negative'])$$,
  'draft transaction amount negative is rejected by non-negative invariant'
);

select lives_ok(
  $$
  insert into public.transactions (
    id,
    user_id,
    transaction_type,
    status,
    amount,
    transaction_date,
    competence_date,
    competence_month,
    payment_method,
    account_id
  )
  values (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000201',
    'expense',
    'draft',
    0,
    '2026-01-14',
    '2026-01-14',
    '2026-01-01',
    'cash',
    '00000000-0000-4000-8000-000000000301'
  )
  $$,
  'draft transaction amount zero is accepted by the physical contract'
);

select lives_ok(
  $$
  insert into public.transactions (
    id,
    user_id,
    transaction_type,
    status,
    amount,
    transaction_date,
    competence_date,
    competence_month,
    payment_method,
    account_id
  )
  values (
    '00000000-0000-4000-8000-000000000425',
    '00000000-0000-4000-8000-000000000201',
    'expense',
    'draft',
    50,
    '2026-01-15',
    '2026-01-15',
    '2026-01-01',
    'cash',
    '00000000-0000-4000-8000-000000000301'
  )
  $$,
  'draft transaction amount positive is accepted'
);

select lives_ok(
  $$select pg_temp.assert_transaction_amount_rejected('posted'::public.transaction_status, -50, 'Posted negative amount must fail', array['transactions_amount_non_negative', 'transactions_posted_amount_positive'])$$,
  'posted transaction amount negative is rejected by amount constraints'
);

select lives_ok(
  $$select pg_temp.assert_transaction_amount_rejected('posted'::public.transaction_status, 0, 'Posted zero amount must fail', array['transactions_posted_amount_positive'])$$,
  'posted transaction amount zero is rejected by posted-positive invariant'
);

select lives_ok(
  $$
  insert into public.transactions (
    id,
    user_id,
    transaction_type,
    status,
    description,
    amount,
    transaction_date,
    competence_date,
    competence_month,
    payment_method,
    account_id
  )
  values (
    '00000000-0000-4000-8000-000000000426',
    '00000000-0000-4000-8000-000000000201',
    'expense',
    'posted',
    'Posted positive amount must pass',
    50,
    '2026-01-16',
    '2026-01-16',
    '2026-01-01',
    'cash',
    '00000000-0000-4000-8000-000000000301'
  )
  $$,
  'posted transaction amount positive is accepted'
);

delete from public.transactions
where id = '00000000-0000-4000-8000-000000000401';
select results_eq(
  $$select count(*)::integer from public.transactions where id = '00000000-0000-4000-8000-000000000401'$$,
  array[1],
  'owner cannot hard-delete posted transactions'
);

delete from public.transactions
where id = '00000000-0000-4000-8000-000000000402';
select results_eq(
  $$select count(*)::integer from public.transactions where id = '00000000-0000-4000-8000-000000000402'$$,
  array[0],
  'owner can hard-delete own draft transaction'
);

delete from public.transfers
where id = '00000000-0000-4000-8000-000000000601';
select results_eq(
  $$select count(*)::integer from public.transfers where id = '00000000-0000-4000-8000-000000000601'$$,
  array[1],
  'class A transfer hard-delete is blocked for owner'
);

delete from public.annual_obligations
where id = '00000000-0000-4000-8000-000000000501';
select results_eq(
  $$select count(*)::integer from public.annual_obligations where id = '00000000-0000-4000-8000-000000000501'$$,
  array[0],
  'class B draft annual obligation hard-delete is allowed'
);

delete from public.accounts
where id = '00000000-0000-4000-8000-000000000304';
select results_eq(
  $$select count(*)::integer from public.accounts where id = '00000000-0000-4000-8000-000000000304'$$,
  array[0],
  'class C unreferenced configurable account hard-delete is allowed'
);

prepare annual_installment_zero as
  insert into public.annual_obligation_installments (
    user_id,
    annual_obligation_id,
    installment_number,
    amount,
    due_date
  )
  values (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000502',
    1,
    0,
    '2026-04-01'
  );
select throws_ok('annual_installment_zero', null, null, 'annual obligation installment zero is rejected');

prepare annual_installment_positive as
  insert into public.annual_obligation_installments (
    user_id,
    annual_obligation_id,
    installment_number,
    amount,
    due_date
  )
  values (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000502',
    1,
    10,
    '2026-04-01'
  );
select lives_ok('annual_installment_positive', 'positive annual obligation installment is accepted');

select isnt_empty(
  'select * from public.economic_indicators',
  'authenticated user can read macro reference data'
);

select is_empty(
  'select * from public.admin_observability_metrics',
  'authenticated non-admin has no broad admin metrics read policy'
);

reset role;

select finish();

rollback;
