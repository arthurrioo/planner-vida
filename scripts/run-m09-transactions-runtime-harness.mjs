import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const m03MigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260915000100_m03_database_physical_foundation.sql",
);
const m04MigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260915000200_m04_auth_profiles_authorization_rls.sql",
);
const m09MigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260920000100_m09_transactions_atomic_rpc.sql",
);
const seedPath = path.join(repoRoot, "supabase", "seed.sql");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}${
        details ? `\n${details}` : ""
      }`,
    );
  }

  return result.stdout ?? "";
}

function psql(port, database, sql, options = {}) {
  const sqlPath = path.join(options.tempDir, `${options.name}.sql`);
  fs.writeFileSync(sqlPath, sql);

  return run(
    "psql",
    [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--dbname",
      database,
      "--file",
      sqlPath,
    ],
    { capture: Boolean(options.capture) },
  );
}

function psqlFile(port, database, filePath, options = {}) {
  return run(
    "psql",
    [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--dbname",
      database,
      "--file",
      filePath,
    ],
    { capture: Boolean(options.capture) },
  );
}

function runPsqlFileAsync(port, database, filePath) {
  return new Promise((resolve) => {
    const child = spawn(
      "psql",
      [
        "--no-psqlrc",
        "--set",
        "ON_ERROR_STOP=1",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--dbname",
        database,
        "--file",
        filePath,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("close", (status) => {
      resolve({
        output: Buffer.concat([...stdout, ...stderr]).toString("utf8"),
        status,
      });
    });
  });
}

async function runConcurrentReversalCheck(port, database, tempDir) {
  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000991';

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
  category_id,
  payment_method,
  account_id,
  posted_at
)
values (
  '00000000-0000-4000-8000-000000001008',
  '00000000-0000-4000-8000-000000000991',
  'expense',
  'posted',
  'Runtime concurrent reversal original',
  10,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000997',
  'pix',
  '00000000-0000-4000-8000-000000000993',
  now()
);
`,
    { name: "concurrent-setup", tempDir },
  );

  const sql = `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000991';
select public.reverse_transaction(
  '00000000-0000-4000-8000-000000001008',
  'runtime concurrent reversal'
);
`;
  const firstPath = path.join(tempDir, "concurrent-reversal-a.sql");
  const secondPath = path.join(tempDir, "concurrent-reversal-b.sql");
  fs.writeFileSync(firstPath, sql);
  fs.writeFileSync(secondPath, sql);

  const results = await Promise.all([
    runPsqlFileAsync(port, database, firstPath),
    runPsqlFileAsync(port, database, secondPath),
  ]);
  const successes = results.filter((result) => result.status === 0);
  const failures = results.filter((result) => result.status !== 0);

  if (successes.length !== 1 || failures.length !== 1) {
    throw new Error(
      `Expected one concurrent reversal success and one conflict. Results:\n${results
        .map((result) => `status=${result.status}\n${result.output}`)
        .join("\n---\n")}`,
    );
  }

  psql(
    port,
    database,
    `
do $$
declare
  actual numeric;
begin
  select count(*)
  into actual
  from public.transactions
  where reversal_of_transaction_id = '00000000-0000-4000-8000-000000001008'
    and status = 'reversed';

  if actual <> 1 then
    raise exception 'M09 runtime assertion failed: concurrent reversal creates one lineage row, got %', actual;
  end if;
end;
$$;
`,
    { name: "concurrent-assert", tempDir },
  );
}

const preludeSql = `
create schema extensions;
create schema auth;
create schema storage;

create role authenticated;
create role anon;
create role service_role bypassrls;

create table auth.users (
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema auth, storage to authenticated, anon, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
`;

const runtimeSql = `
create function pg_temp.assert_true(description text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'M09 runtime assertion failed: %', description;
  end if;
end;
$$;

create function pg_temp.assert_eq(description text, actual numeric, expected numeric)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M09 runtime assertion failed: %, expected %, got %', description, expected, actual;
  end if;
end;
$$;

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
    '00000000-0000-4000-8000-000000000991',
    'authenticated',
    'authenticated',
    'm09-user-a@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M09 User A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000992',
    'authenticated',
    'authenticated',
    'm09-user-b@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M09 User B"}'::jsonb
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
values
  (
    '00000000-0000-4000-8000-000000000993',
    '00000000-0000-4000-8000-000000000991',
    'Conta A',
    'conta-a',
    'checking',
    1000,
    '2026-09-01'
  ),
  (
    '00000000-0000-4000-8000-000000000994',
    '00000000-0000-4000-8000-000000000992',
    'Conta B',
    'conta-b',
    'checking',
    500,
    '2026-09-01'
  );

insert into public.credit_cards (
  id,
  user_id,
  name,
  normalized_name,
  credit_limit,
  closing_day,
  due_day
)
values (
  '00000000-0000-4000-8000-000000000995',
  '00000000-0000-4000-8000-000000000991',
  'Cartao A',
  'cartao-a',
  2000,
  10,
  20
);

insert into public.categories (
  id,
  user_id,
  name,
  normalized_name,
  type
)
values
  (
    '00000000-0000-4000-8000-000000000996',
    '00000000-0000-4000-8000-000000000991',
    'Receitas',
    'receitas',
    'income'
  ),
  (
    '00000000-0000-4000-8000-000000000997',
    '00000000-0000-4000-8000-000000000991',
    'Despesas',
    'despesas',
    'variable_expense'
  ),
  (
    '00000000-0000-4000-8000-000000000998',
    '00000000-0000-4000-8000-000000000992',
    'Despesas B',
    'despesas-b',
    'variable_expense'
  );

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000991';

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
  category_id,
  payment_method,
  account_id,
  posted_at
)
values (
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000000991',
  'income',
  'posted',
  'Receita runtime',
  300,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000996',
  'pix',
  '00000000-0000-4000-8000-000000000993',
  now()
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
  category_id,
  payment_method,
  account_id,
  posted_at
)
values (
  '00000000-0000-4000-8000-000000001002',
  '00000000-0000-4000-8000-000000000991',
  'expense',
  'posted',
  'Despesa runtime',
  50,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000997',
  'debit',
  '00000000-0000-4000-8000-000000000993',
  now()
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
  category_id,
  payment_method,
  credit_card_id,
  posted_at
)
values (
  '00000000-0000-4000-8000-000000001003',
  '00000000-0000-4000-8000-000000000991',
  'expense',
  'posted',
  'Compra cartao runtime',
  70,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000997',
  'credit_card',
  '00000000-0000-4000-8000-000000000995',
  now()
);

select pg_temp.assert_eq(
  'credit-card purchase does not appear as account movement',
  (
    select coalesce(sum(amount), 0)
    from public.transactions
    where user_id = '00000000-0000-4000-8000-000000000991'
      and account_id = '00000000-0000-4000-8000-000000000993'
      and payment_method = 'credit_card'
  ),
  0
);

select pg_temp.assert_eq(
  'account balance formula excludes card purchase',
  (
    1000
    + (
      select coalesce(sum(amount), 0)
      from public.transactions
      where user_id = '00000000-0000-4000-8000-000000000991'
        and account_id = '00000000-0000-4000-8000-000000000993'
        and transaction_type = 'income'
        and status = 'posted'
    )
    - (
      select coalesce(sum(amount), 0)
      from public.transactions
      where user_id = '00000000-0000-4000-8000-000000000991'
        and account_id = '00000000-0000-4000-8000-000000000993'
        and transaction_type in ('expense', 'investment')
        and status = 'posted'
        and payment_method <> 'credit_card'
        and credit_card_id is null
    )
  ),
  1250
);

do $$
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
      category_id,
      payment_method,
      account_id,
      posted_at
    )
    values (
      '00000000-0000-4000-8000-000000000991',
      'expense',
      'posted',
      'Cross user account attempt',
      10,
      '2026-09-20',
      '2026-09-20',
      '2026-09-01',
      '00000000-0000-4000-8000-000000000997',
      'pix',
      '00000000-0000-4000-8000-000000000994',
      now()
    );
  exception when foreign_key_violation then
    return;
  end;
  raise exception 'cross-user account FK was not rejected';
end;
$$;

do $$
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
      category_id,
      payment_method,
      account_id,
      posted_at
    )
    values (
      '00000000-0000-4000-8000-000000000991',
      'expense',
      'posted',
      'Cross user category attempt',
      10,
      '2026-09-20',
      '2026-09-20',
      '2026-09-01',
      '00000000-0000-4000-8000-000000000998',
      'pix',
      '00000000-0000-4000-8000-000000000993',
      now()
    );
  exception when foreign_key_violation then
    return;
  end;
  raise exception 'cross-user category FK was not rejected';
end;
$$;

delete from public.transactions
where id = '00000000-0000-4000-8000-000000001002';

select pg_temp.assert_true(
  'posted transaction hard delete is blocked by policy',
  exists(
    select 1
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001002'
      and status = 'posted'
  )
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
  category_id,
  payment_method,
  account_id
)
values (
  '00000000-0000-4000-8000-000000001004',
  '00000000-0000-4000-8000-000000000991',
  'expense',
  'draft',
  'Draft runtime',
  0,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000997',
  'pix',
  '00000000-0000-4000-8000-000000000993'
);

delete from public.transactions
where id = '00000000-0000-4000-8000-000000001004';

select pg_temp.assert_eq(
  'draft transaction can be hard-deleted by owner',
  (
    select count(*)
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001004'
  ),
  0
);

update public.transactions
set
  status = 'voided',
  voided_at = now(),
  reversal_reason = 'runtime void'
where id = '00000000-0000-4000-8000-000000001002';

select pg_temp.assert_true(
  'posted transaction can move to voided status',
  exists(
    select 1
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001002'
      and status = 'voided'
      and voided_at is not null
  )
);

update public.transactions
set description = 'Own update baseline'
where id = '00000000-0000-4000-8000-000000001001';

select pg_temp.assert_true(
  'owner can update own transaction baseline',
  exists(
    select 1
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001001'
      and description = 'Own update baseline'
  )
);

do $$
begin
  begin
    update public.transactions
    set user_id = '00000000-0000-4000-8000-000000000992'
    where id = '00000000-0000-4000-8000-000000001001';
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'owner reassignment was not rejected';
end;
$$;

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
  category_id,
  payment_method,
  account_id,
  posted_at
)
values (
  '00000000-0000-4000-8000-000000001005',
  '00000000-0000-4000-8000-000000000991',
  'expense',
  'posted',
  'Runtime reversal original',
  25,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000997',
  'pix',
  '00000000-0000-4000-8000-000000000993',
  now()
);

select public.reverse_transaction(
  '00000000-0000-4000-8000-000000001005',
  'runtime reversal'
);

select pg_temp.assert_true(
  'reversal RPC marks original reversed',
  exists(
    select 1
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001005'
      and status = 'reversed'
      and reversed_by_transaction_id is not null
  )
);

select pg_temp.assert_eq(
  'reversal RPC creates exactly one reversed lineage row',
  (
    select count(*)
    from public.transactions
    where reversal_of_transaction_id = '00000000-0000-4000-8000-000000001005'
      and status = 'reversed'
  ),
  1
);

do $$
begin
  begin
    perform public.reverse_transaction(
      '00000000-0000-4000-8000-000000001005',
      'runtime duplicate reversal'
    );
  exception when raise_exception then
    return;
  end;
  raise exception 'duplicate reversal was not rejected';
end;
$$;

select pg_temp.assert_eq(
  'duplicate reversal guard preserves one lineage row',
  (
    select count(*)
    from public.transactions
    where reversal_of_transaction_id = '00000000-0000-4000-8000-000000001005'
  ),
  1
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
  category_id,
  payment_method,
  account_id,
  posted_at
)
values (
  '00000000-0000-4000-8000-000000001006',
  '00000000-0000-4000-8000-000000000991',
  'expense',
  'posted',
  'Runtime correction original',
  40,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000997',
  'pix',
  '00000000-0000-4000-8000-000000000993',
  now()
);

select public.correct_transaction(
  '00000000-0000-4000-8000-000000001006',
  'runtime correction',
  jsonb_build_object(
    'account_id', '00000000-0000-4000-8000-000000000993',
    'amount', 35,
    'category_id', '00000000-0000-4000-8000-000000000997',
    'competence_date', '2026-09-20',
    'competence_month', '2026-09-01',
    'credit_card_id', null,
    'description', 'Runtime correction replacement',
    'payment_method', 'pix',
    'subcategory_id', null,
    'transaction_date', '2026-09-21',
    'transaction_type', 'expense',
    'user_id', '00000000-0000-4000-8000-000000000992'
  )
);

select pg_temp.assert_true(
  'correction RPC marks original reversed',
  exists(
    select 1
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001006'
      and status = 'reversed'
      and reversed_by_transaction_id is not null
  )
);

select pg_temp.assert_eq(
  'correction RPC creates exactly one reversed lineage row',
  (
    select count(*)
    from public.transactions
    where reversal_of_transaction_id = '00000000-0000-4000-8000-000000001006'
      and status = 'reversed'
  ),
  1
);

select pg_temp.assert_true(
  'correction RPC creates posted replacement owned by authenticated user',
  exists(
    select 1
    from public.transactions
    where description = 'Runtime correction replacement'
      and status = 'posted'
      and user_id = '00000000-0000-4000-8000-000000000991'
      and amount = 35
  )
);

reset role;

create function pg_temp.fail_m09_replacement_insert()
returns trigger
language plpgsql
as $$
begin
  if new.description = 'Runtime replacement failure' then
    raise exception 'synthetic replacement failure';
  end if;
  return new;
end;
$$;

create trigger m09_fail_replacement_insert
before insert on public.transactions
for each row
execute function pg_temp.fail_m09_replacement_insert();

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000991';

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
  category_id,
  payment_method,
  account_id,
  posted_at
)
values (
  '00000000-0000-4000-8000-000000001007',
  '00000000-0000-4000-8000-000000000991',
  'expense',
  'posted',
  'Runtime rollback original',
  45,
  '2026-09-20',
  '2026-09-20',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000997',
  'pix',
  '00000000-0000-4000-8000-000000000993',
  now()
);

do $$
begin
  begin
    perform public.correct_transaction(
      '00000000-0000-4000-8000-000000001007',
      'runtime rollback',
      jsonb_build_object(
        'account_id', '00000000-0000-4000-8000-000000000993',
        'amount', 30,
        'category_id', '00000000-0000-4000-8000-000000000997',
        'competence_date', '2026-09-20',
        'competence_month', '2026-09-01',
        'credit_card_id', null,
        'description', 'Runtime replacement failure',
        'payment_method', 'pix',
        'subcategory_id', null,
        'transaction_date', '2026-09-21',
        'transaction_type', 'expense'
      )
    );
  exception when others then
    return;
  end;
  raise exception 'correction failure did not raise';
end;
$$;

reset role;
drop trigger m09_fail_replacement_insert on public.transactions;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000991';

select pg_temp.assert_true(
  'correction rollback keeps original posted',
  exists(
    select 1
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001007'
      and status = 'posted'
      and reversed_by_transaction_id is null
  )
);

select pg_temp.assert_eq(
  'correction rollback leaves no reversal row',
  (
    select count(*)
    from public.transactions
    where reversal_of_transaction_id = '00000000-0000-4000-8000-000000001007'
  ),
  0
);

select pg_temp.assert_eq(
  'account balance after void reverse correct and rollback uses persisted states',
  (
    select coalesce(sum(
      case
        when transaction_type = 'income' then amount
        when transaction_type in ('expense', 'investment') then -amount
        else 0
      end
    ), 0)
    from public.transactions
    where user_id = '00000000-0000-4000-8000-000000000991'
      and account_id = '00000000-0000-4000-8000-000000000993'
      and status = 'posted'
      and payment_method <> 'credit_card'
      and credit_card_id is null
  ),
  220
);

set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000992';

select pg_temp.assert_eq(
  'user B cannot read user A transactions',
  (
    select count(*)
    from public.transactions
    where id = '00000000-0000-4000-8000-000000001001'
  ),
  0
);

update public.transactions
set description = 'User B hijack attempt'
where id = '00000000-0000-4000-8000-000000001001';

select pg_temp.assert_eq(
  'user B cannot update user A transactions',
  (
    select count(*)
    from public.transactions
    where description = 'User B hijack attempt'
  ),
  0
);

do $$
begin
  begin
    perform public.reverse_transaction(
      '00000000-0000-4000-8000-000000001007',
      'cross user reversal'
    );
  exception when raise_exception then
    return;
  end;
  raise exception 'cross-user reversal RPC was not rejected';
end;
$$;

do $$
begin
  begin
    insert into public.audit_logs (
      user_id,
      actor_user_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      severity
    )
    values (
      '00000000-0000-4000-8000-000000000992',
      '00000000-0000-4000-8000-000000000992',
      'user',
      'transactions.create',
      'transaction',
      '00000000-0000-4000-8000-000000001001',
      'info'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'authenticated audit insert was not rejected';
end;
$$;

set role anon;
reset request.jwt.claim.sub;

do $$
begin
  begin
    perform public.reverse_transaction(
      '00000000-0000-4000-8000-000000001007',
      'anon reversal'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'anon reversal RPC was not rejected';
end;
$$;

reset role;
`;

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-m09-"));
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  const database = "planner_m09_runtime";
  const port = 55439;

  fs.mkdirSync(socketDir);

  try {
    run("initdb", ["--pgdata", dataDir, "--auth=trust"]);
    run("pg_ctl", [
      "--pgdata",
      dataDir,
      "-o",
      `-p ${port} -k ${socketDir} -c listen_addresses='127.0.0.1'`,
      "--wait",
      "start",
    ]);
    run("createdb", ["--host", "127.0.0.1", "--port", String(port), database]);

    psql(port, database, preludeSql, {
      name: "prelude",
      tempDir,
    });
    psqlFile(port, database, m03MigrationPath);
    psqlFile(port, database, m04MigrationPath);
    psqlFile(port, database, m09MigrationPath);
    psqlFile(port, database, seedPath);
    psql(port, database, runtimeSql, {
      name: "runtime",
      tempDir,
    });
    await runConcurrentReversalCheck(port, database, tempDir);

    console.log("M09 transactions runtime harness passed.");
  } finally {
    spawnSync("pg_ctl", ["--pgdata", dataDir, "--wait", "stop"], {
      encoding: "utf8",
      stdio: "ignore",
    });
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
