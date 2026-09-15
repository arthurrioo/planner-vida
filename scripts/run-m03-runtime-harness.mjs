import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260915000100_m03_database_physical_foundation.sql",
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
      `${command} ${args.join(" ")} failed with exit code ${result.status}${details ? `\n${details}` : ""}`,
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

const preludeSql = `
create schema extensions;
create schema auth;
create schema storage;

create role authenticated;
create role anon;
create role service_role;

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

grant usage on schema auth, storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
`;

const runtimeSql = `
create function pg_temp.assert_true(description text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'M03 runtime assertion failed: %', description;
  end if;
end;
$$;

create function pg_temp.assert_eq(description text, actual bigint, expected bigint)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M03 runtime assertion failed: %, expected %, got %', description, expected, actual;
  end if;
end;
$$;

select pg_temp.assert_eq(
  'public table count',
  (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
  42
);
select pg_temp.assert_eq(
  'owned table delete policy count after remediation',
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and cmd = 'DELETE'
      and roles = array['authenticated']::name[]
  ),
  22
);
select pg_temp.assert_eq(
  'blanket owned_rows_delete absent',
  (select count(*) from pg_policies where policyname = 'owned_rows_delete'),
  0
);
select pg_temp.assert_eq(
  'admin metrics has no user_id column',
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_observability_metrics'
      and column_name = 'user_id'
  ),
  0
);
select pg_temp.assert_true(
  'invoice-imports storage bucket is private',
  (select public = false from storage.buckets where id = 'invoice-imports')
);
select pg_temp.assert_eq(
  'seed idempotency kept one selic row',
  (select count(*) from public.economic_indicators where code = 'selic'),
  1
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

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000201';

select pg_temp.assert_eq('user A sees only own accounts', (select count(*) from public.accounts), 3);

do $$
begin
  begin
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
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'cross-user insert was not rejected';
end;
$$;

update public.accounts
set name = 'Cross User Update Attempt'
where id = '00000000-0000-4000-8000-000000000302';
select pg_temp.assert_eq(
  'cross-user update cannot reach user B account',
  (select count(*) from public.accounts where id = '00000000-0000-4000-8000-000000000302'),
  0
);

delete from public.accounts
where id = '00000000-0000-4000-8000-000000000302';
reset role;
select pg_temp.assert_eq(
  'cross-user delete did not remove user B account',
  (select count(*) from public.accounts where id = '00000000-0000-4000-8000-000000000302'),
  1
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000201';

do $$
begin
  begin
    update public.accounts
    set user_id = '00000000-0000-4000-8000-000000000202'
    where id = '00000000-0000-4000-8000-000000000301';
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'ownership hijack update was not rejected';
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
      payment_method,
      account_id
    )
    values (
      '00000000-0000-4000-8000-000000000201',
      'expense',
      'posted',
      'Posted zero amount must fail',
      0,
      '2026-01-13',
      '2026-01-13',
      '2026-01-01',
      'cash',
      '00000000-0000-4000-8000-000000000301'
    );
  exception when check_violation then
    return;
  end;
  raise exception 'posted zero-amount transaction was not rejected';
end;
$$;

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
);

delete from public.transactions
where id = '00000000-0000-4000-8000-000000000401';
select pg_temp.assert_eq(
  'owner cannot hard-delete posted transactions',
  (select count(*) from public.transactions where id = '00000000-0000-4000-8000-000000000401'),
  1
);

delete from public.transactions
where id = '00000000-0000-4000-8000-000000000402';
select pg_temp.assert_eq(
  'owner can hard-delete draft transaction',
  (select count(*) from public.transactions where id = '00000000-0000-4000-8000-000000000402'),
  0
);

delete from public.transfers
where id = '00000000-0000-4000-8000-000000000601';
select pg_temp.assert_eq(
  'class A transfer hard-delete blocked',
  (select count(*) from public.transfers where id = '00000000-0000-4000-8000-000000000601'),
  1
);

delete from public.annual_obligations
where id = '00000000-0000-4000-8000-000000000501';
select pg_temp.assert_eq(
  'class B draft annual obligation hard-delete allowed',
  (select count(*) from public.annual_obligations where id = '00000000-0000-4000-8000-000000000501'),
  0
);

delete from public.accounts
where id = '00000000-0000-4000-8000-000000000304';
select pg_temp.assert_eq(
  'class C configurable account hard-delete allowed when unreferenced',
  (select count(*) from public.accounts where id = '00000000-0000-4000-8000-000000000304'),
  0
);

do $$
begin
  begin
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
  exception when check_violation then
    return;
  end;
  raise exception 'zero-value annual obligation installment was not rejected';
end;
$$;

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

insert into storage.objects (bucket_id, name)
values ('invoice-imports', '00000000-0000-4000-8000-000000000201/batch/source.pdf');

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('invoice-imports', '00000000-0000-4000-8000-000000000202/batch/source.pdf');
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'cross-user storage insert was not rejected';
end;
$$;

select pg_temp.assert_eq(
  'user A cannot read user B storage objects',
  (
    select count(*)
    from storage.objects
    where name like '00000000-0000-4000-8000-000000000202/%'
  ),
  0
);

select pg_temp.assert_true(
  'authenticated user can read macro reference data',
  exists(select 1 from public.economic_indicators)
);
select pg_temp.assert_eq(
  'authenticated non-admin has no broad admin metrics read policy',
  (select count(*) from public.admin_observability_metrics),
  0
);

reset role;
`;

function runCycle(cycleNumber) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `planner-vida-m03-${cycleNumber}-`),
  );
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  fs.mkdirSync(socketDir);
  const port = 56000 + cycleNumber;

  try {
    run("initdb", ["--no-locale", "--encoding=UTF8", "--pgdata", dataDir]);
    run("pg_ctl", [
      "--pgdata",
      dataDir,
      "--log",
      path.join(tempDir, "postgres.log"),
      "--options",
      `-k ${socketDir} -p ${port} -c listen_addresses=127.0.0.1`,
      "start",
      "--wait",
    ]);

    psql(port, "postgres", preludeSql, {
      tempDir,
      name: "00-prelude",
    });
    psqlFile(port, "postgres", migrationPath);
    psqlFile(port, "postgres", seedPath);
    psqlFile(port, "postgres", seedPath);
    psql(port, "postgres", runtimeSql, {
      tempDir,
      name: "99-runtime-checks",
    });

    const summary = psql(
      port,
      "postgres",
      `
      select jsonb_build_object(
        'public_tables', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
        'public_rls_tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
        'delete_policies', (select count(*) from pg_policies where schemaname = 'public' and cmd = 'DELETE'),
        'macro_seed_rows', (select count(*) from public.economic_indicators),
        'storage_bucket_private', (select public = false from storage.buckets where id = 'invoice-imports')
      )::text as summary;
      `,
      { tempDir, name: "summary", capture: true },
    ).trim();

    console.log(`M03 runtime harness cycle ${cycleNumber} passed: ${summary}`);
  } finally {
    spawnSync("pg_ctl", ["--pgdata", dataDir, "stop", "--mode", "fast"], {
      encoding: "utf8",
      stdio: "ignore",
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

for (const cycleNumber of [1, 2]) {
  runCycle(cycleNumber);
}

console.log(
  "M03 PostgreSQL compatibility runtime harness passed 2 clean reset cycles.",
);
