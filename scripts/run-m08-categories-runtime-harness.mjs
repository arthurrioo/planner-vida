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
    raise exception 'M08 runtime assertion failed: %', description;
  end if;
end;
$$;

create function pg_temp.assert_eq(description text, actual bigint, expected bigint)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M08 runtime assertion failed: %, expected %, got %', description, expected, actual;
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
    '00000000-0000-4000-8000-000000000881',
    'authenticated',
    'authenticated',
    'm08-user-a@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M08 User A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000882',
    'authenticated',
    'authenticated',
    'm08-user-b@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M08 User B"}'::jsonb
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
    '00000000-0000-4000-8000-000000000883',
    '00000000-0000-4000-8000-000000000881',
    'Moradia',
    'moradia',
    'fixed_expense'
  ),
  (
    '00000000-0000-4000-8000-000000000884',
    '00000000-0000-4000-8000-000000000882',
    'Moradia',
    'moradia',
    'fixed_expense'
  );

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000881';

select pg_temp.assert_eq(
  'user A sees only own categories',
  (select count(*) from public.categories),
  1
);

insert into public.categories (
  id,
  user_id,
  parent_id,
  name,
  normalized_name,
  type
)
values (
  '00000000-0000-4000-8000-000000000885',
  '00000000-0000-4000-8000-000000000881',
  '00000000-0000-4000-8000-000000000883',
  'Aluguel',
  'aluguel',
  'fixed_expense'
);

select pg_temp.assert_true(
  'own subcategory insert is allowed under same owner parent',
  exists(
    select 1
    from public.categories
    where id = '00000000-0000-4000-8000-000000000885'
      and parent_id = '00000000-0000-4000-8000-000000000883'
  )
);

do $$
begin
  begin
    insert into public.categories (
      user_id,
      name,
      normalized_name,
      type
    )
    values (
      '00000000-0000-4000-8000-000000000881',
      'Moradia Duplicada',
      'moradia',
      'variable_expense'
    );
  exception when unique_violation then
    return;
  end;
  raise exception 'duplicate active root category normalized name was not rejected';
end;
$$;

do $$
begin
  begin
    insert into public.categories (
      user_id,
      parent_id,
      name,
      normalized_name,
      type
    )
    values (
      '00000000-0000-4000-8000-000000000881',
      '00000000-0000-4000-8000-000000000884',
      'Cross User Parent',
      'cross-user-parent',
      'fixed_expense'
    );
  exception when foreign_key_violation then
    return;
  end;
  raise exception 'cross-user category parent FK was not rejected';
end;
$$;

do $$
begin
  begin
    insert into public.categories (
      user_id,
      name,
      normalized_name,
      type
    )
    values (
      '00000000-0000-4000-8000-000000000882',
      'Cross User Insert',
      'cross-user-insert',
      'income'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'cross-user category insert was not rejected';
end;
$$;

do $$
begin
  begin
    update public.categories
    set user_id = '00000000-0000-4000-8000-000000000882'
    where id = '00000000-0000-4000-8000-000000000883';
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'category ownership hijack update was not rejected';
end;
$$;

reset role;

select pg_temp.assert_true(
  'ownership hijack did not change category owner',
  exists(
    select 1
    from public.categories
    where id = '00000000-0000-4000-8000-000000000883'
      and user_id = '00000000-0000-4000-8000-000000000881'
  )
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000881';

update public.categories
set name = 'Cross User Update Attempt'
where id = '00000000-0000-4000-8000-000000000884';

reset role;

select pg_temp.assert_true(
  'cross-user category update is denied by RLS',
  exists(
    select 1
    from public.categories
    where id = '00000000-0000-4000-8000-000000000884'
      and name = 'Moradia'
  )
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000881';

delete from public.categories
where id = '00000000-0000-4000-8000-000000000884';

reset role;

select pg_temp.assert_true(
  'cross-user category delete is denied by RLS',
  exists(
    select 1
    from public.categories
    where id = '00000000-0000-4000-8000-000000000884'
  )
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000881';

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
      '00000000-0000-4000-8000-000000000881',
      '00000000-0000-4000-8000-000000000881',
      'user',
      'categories.user_scoped_attempt',
      'category',
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
  '00000000-0000-4000-8000-000000000881',
  '00000000-0000-4000-8000-000000000881',
  'user',
  'categories.privileged_runtime_probe',
  'category',
  '00000000-0000-4000-8000-000000000883',
  'info',
  '{"categoryType":"fixed_expense"}'::jsonb
);

reset role;

select pg_temp.assert_eq(
  'service_role can write category audit log',
  (
    select count(*)
    from public.audit_logs
    where action = 'categories.privileged_runtime_probe'
  ),
  1
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000881';

update public.categories
set archived_at = now()
where id = '00000000-0000-4000-8000-000000000883';

insert into public.categories (
  id,
  user_id,
  name,
  normalized_name,
  type
)
values (
  '00000000-0000-4000-8000-000000000886',
  '00000000-0000-4000-8000-000000000881',
  'Moradia Nova',
  'moradia',
  'fixed_expense'
);

select pg_temp.assert_eq(
  'archived category name no longer blocks new active category',
  (
    select count(*)
    from public.categories
    where user_id = '00000000-0000-4000-8000-000000000881'
      and normalized_name = 'moradia'
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
  category_id,
  payment_method
)
values (
  '00000000-0000-4000-8000-000000000881',
  'expense',
  'posted',
  'Synthetic category dependency',
  100,
  '2026-09-19',
  '2026-09-19',
  '2026-09-01',
  '00000000-0000-4000-8000-000000000886',
  'cash'
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000881';

do $$
begin
  begin
    delete from public.categories
    where id = '00000000-0000-4000-8000-000000000886';
  exception when foreign_key_violation then
    return;
  end;
  raise exception 'referenced category hard delete was not blocked';
end;
$$;

select pg_temp.assert_true(
  'referenced category remains after rejected hard delete',
  exists(
    select 1
    from public.categories
    where id = '00000000-0000-4000-8000-000000000886'
  )
);

insert into public.categories (
  id,
  user_id,
  name,
  normalized_name,
  type
)
values (
  '00000000-0000-4000-8000-000000000887',
  '00000000-0000-4000-8000-000000000881',
  'Temporary Delete',
  'temporary-delete',
  'income'
);

delete from public.categories
where id = '00000000-0000-4000-8000-000000000887';

select pg_temp.assert_eq(
  'owner can hard-delete unreferenced own category',
  (
    select count(*)
    from public.categories
    where id = '00000000-0000-4000-8000-000000000887'
  ),
  0
);

set role anon;
set request.jwt.claim.sub = '';

do $$
begin
  begin
    insert into public.categories (
      user_id,
      name,
      normalized_name,
      type
    )
    values (
      '00000000-0000-4000-8000-000000000881',
      'Anon Attempt',
      'anon-attempt',
      'income'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'anon category insert was not rejected';
end;
$$;

reset role;
`;

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-m08-"));
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  const database = "planner_m08_runtime";
  const port = 55438;

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

    console.log("M08 categories runtime harness passed.");
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
