import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

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
    raise exception 'M07 runtime assertion failed: %', description;
  end if;
end;
$$;

create function pg_temp.assert_eq(description text, actual bigint, expected bigint)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M07 runtime assertion failed: %, expected %, got %', description, expected, actual;
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
    '00000000-0000-4000-8000-000000000771',
    'authenticated',
    'authenticated',
    'm07-user-a@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M07 User A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000772',
    'authenticated',
    'authenticated',
    'm07-user-b@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M07 User B"}'::jsonb
  );

insert into public.accounts (
  id,
  user_id,
  name,
  normalized_name,
  type,
  institution,
  opening_balance,
  opening_balance_date,
  overdraft_limit
)
values
  (
    '00000000-0000-4000-8000-000000000773',
    '00000000-0000-4000-8000-000000000771',
    'Conta Principal A',
    'conta principal',
    'checking',
    'Banco A',
    1000,
    '2026-09-15',
    500
  ),
  (
    '00000000-0000-4000-8000-000000000774',
    '00000000-0000-4000-8000-000000000772',
    'Conta Principal B',
    'conta principal',
    'checking',
    'Banco B',
    2000,
    '2026-09-15',
    0
  );

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000771';

select pg_temp.assert_eq(
  'user A sees only own accounts',
  (select count(*) from public.accounts),
  1
);

update public.accounts
set institution = 'Banco A Atualizado'
where id = '00000000-0000-4000-8000-000000000773';

select pg_temp.assert_true(
  'own positive account update is allowed',
  exists(
    select 1
    from public.accounts
    where id = '00000000-0000-4000-8000-000000000773'
      and institution = 'Banco A Atualizado'
  )
);

with attempted_cross_user_update as (
  update public.accounts
  set institution = 'Cross User Leak'
  where id = '00000000-0000-4000-8000-000000000774'
  returning id
)
select pg_temp.assert_eq(
  'cross-user account update affects zero rows',
  (select count(*) from attempted_cross_user_update),
  0
);

delete from public.accounts
where id = '00000000-0000-4000-8000-000000000774';

reset role;

select pg_temp.assert_true(
  'cross-user account delete is denied by RLS',
  exists(
    select 1
    from public.accounts
    where id = '00000000-0000-4000-8000-000000000774'
  )
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000771';

insert into public.accounts (
  user_id,
  name,
  normalized_name,
  type,
  opening_balance,
  opening_balance_date
)
values (
  '00000000-0000-4000-8000-000000000771',
  'Conta Legada Negativa',
  'conta legada negativa',
  'benefit',
  -10.0000,
  '2026-09-15'
);

select pg_temp.assert_true(
  'negative opening balance is accepted as snapshot',
  exists(
    select 1
    from public.accounts
    where user_id = '00000000-0000-4000-8000-000000000771'
      and normalized_name = 'conta legada negativa'
      and opening_balance = -10.0000
  )
);

do $$
begin
  begin
    insert into public.accounts (
      user_id,
      name,
      normalized_name,
      type,
      opening_balance,
      opening_balance_date,
      overdraft_limit
    )
    values (
      '00000000-0000-4000-8000-000000000771',
      'Cheque Especial Invalido',
      'cheque especial invalido',
      'checking',
      0,
      '2026-09-15',
      -1
    );
  exception when check_violation then
    return;
  end;
  raise exception 'negative overdraft_limit was not rejected';
end;
$$;

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
  '00000000-0000-4000-8000-000000000775',
  '00000000-0000-4000-8000-000000000771',
  'Conta Sem Dependencias',
  'conta sem dependencias',
  'wallet',
  0,
  '2026-09-15'
);

delete from public.accounts
where id = '00000000-0000-4000-8000-000000000775';

select pg_temp.assert_true(
  'unreferenced own account hard delete is allowed',
  not exists(
    select 1
    from public.accounts
    where id = '00000000-0000-4000-8000-000000000775'
  )
);

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
      '00000000-0000-4000-8000-000000000772',
      'Cross User Attempt',
      'cross-user-attempt',
      'checking',
      0,
      '2026-09-15'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'cross-user account insert was not rejected';
end;
$$;

do $$
begin
  begin
    update public.accounts
    set user_id = '00000000-0000-4000-8000-000000000772'
    where id = '00000000-0000-4000-8000-000000000773';
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'ownership hijack update was not rejected';
end;
$$;

reset role;

select pg_temp.assert_true(
  'ownership hijack did not change account owner',
  exists(
    select 1
    from public.accounts
    where id = '00000000-0000-4000-8000-000000000773'
      and user_id = '00000000-0000-4000-8000-000000000771'
  )
);

select pg_temp.assert_true(
  'cross-user update did not change user B account',
  exists(
    select 1
    from public.accounts
    where id = '00000000-0000-4000-8000-000000000774'
      and institution = 'Banco B'
  )
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000771';

do $$
begin
  begin
    insert into public.audit_logs (
      user_id,
      actor_user_id,
      actor_role,
      action,
      resource_type,
      severity,
      metadata
    )
    values (
      '00000000-0000-4000-8000-000000000771',
      '00000000-0000-4000-8000-000000000771',
      'user',
      'accounts.user_scoped_attempt',
      'account',
      'info',
      '{}'::jsonb
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'authenticated user-scoped audit_logs insert was not rejected';
end;
$$;

reset role;

set role service_role;

insert into public.audit_logs (
  user_id,
  actor_user_id,
  actor_role,
  action,
  resource_type,
  resource_id,
  severity,
  metadata
)
values (
  '00000000-0000-4000-8000-000000000771',
  '00000000-0000-4000-8000-000000000771',
  'user',
  'accounts.privileged_runtime_probe',
  'account',
  '00000000-0000-4000-8000-000000000773',
  'info',
  '{"accountStatus":"active","accountType":"checking"}'::jsonb
);

reset role;

select pg_temp.assert_eq(
  'service_role can write account audit log',
  (
    select count(*)
    from public.audit_logs
    where action = 'accounts.privileged_runtime_probe'
  ),
  1
);

set role anon;
set request.jwt.claim.sub = '';

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
      '00000000-0000-4000-8000-000000000771',
      'Anon Attempt',
      'anon-attempt',
      'checking',
      0,
      '2026-09-15'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'anon account insert was not rejected';
end;
$$;

reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000771';

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
      '00000000-0000-4000-8000-000000000771',
      'Conta Principal Duplicada',
      'conta principal',
      'savings',
      0,
      '2026-09-15'
    );
  exception when unique_violation then
    return;
  end;
  raise exception 'duplicate active account normalized name was not rejected';
end;
$$;

update public.accounts
set status = 'archived',
    archived_at = now()
where id = '00000000-0000-4000-8000-000000000773';

insert into public.accounts (
  user_id,
  name,
  normalized_name,
  type,
  opening_balance,
  opening_balance_date
)
values (
  '00000000-0000-4000-8000-000000000771',
  'Conta Principal Nova',
  'conta principal',
  'savings',
  0,
  '2026-09-15'
);

select pg_temp.assert_eq(
  'archived account name no longer blocks new active account',
  (
    select count(*)
    from public.accounts
    where user_id = '00000000-0000-4000-8000-000000000771'
      and normalized_name = 'conta principal'
  ),
  2
);

reset role;

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
  '00000000-0000-4000-8000-000000000771',
  'income',
  'posted',
  'Synthetic income dependency',
  100,
  '2026-09-16',
  '2026-09-16',
  '2026-09-01',
  'cash',
  '00000000-0000-4000-8000-000000000773'
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000771';

do $$
begin
  begin
    delete from public.accounts
    where id = '00000000-0000-4000-8000-000000000773';
  exception when foreign_key_violation then
    return;
  end;
  raise exception 'referenced account hard delete was not blocked';
end;
$$;

select pg_temp.assert_true(
  'referenced account remains after rejected hard delete',
  exists(
    select 1
    from public.accounts
    where id = '00000000-0000-4000-8000-000000000773'
  )
);
`;

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-m07-"));
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  const database = "planner_m07_runtime";
  const port = 55437;

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
    psqlFile(port, database, seedPath);
    psql(port, database, runtimeSql, {
      name: "runtime",
      tempDir,
    });

    console.log("M07 accounts runtime harness passed.");
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
