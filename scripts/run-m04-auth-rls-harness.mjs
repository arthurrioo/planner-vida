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
    raise exception 'M04 runtime assertion failed: %', description;
  end if;
end;
$$;

create function pg_temp.assert_eq(description text, actual bigint, expected bigint)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M04 runtime assertion failed: %, expected %, got %', description, expected, actual;
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

select pg_temp.assert_eq(
  'signup trigger creates two aligned profiles',
  (
    select count(*)
    from public.profiles
    where id in (
      '00000000-0000-4000-8000-000000000701',
      '00000000-0000-4000-8000-000000000702'
    )
  ),
  2
);
select pg_temp.assert_eq(
  'signup trigger grants default user roles',
  (
    select count(*)
    from public.user_roles
    where user_id in (
      '00000000-0000-4000-8000-000000000701',
      '00000000-0000-4000-8000-000000000702'
    )
      and role = 'user'
      and revoked_at is null
  ),
  2
);
select pg_temp.assert_eq(
  'profile creation is audited',
  (
    select count(*)
    from public.audit_logs
    where action = 'auth.profile_created'
      and actor_role = 'system'
  ),
  2
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
    '00000000-0000-4000-8000-000000000703',
    '00000000-0000-4000-8000-000000000701',
    'M04 User A Account',
    'm04-user-a-account',
    'checking',
    0,
    '2026-09-15'
  ),
  (
    '00000000-0000-4000-8000-000000000704',
    '00000000-0000-4000-8000-000000000702',
    'M04 User B Account',
    'm04-user-b-account',
    'checking',
    0,
    '2026-09-15'
  );

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000701';

select pg_temp.assert_eq('owner sees only own profile', (select count(*) from public.profiles), 1);
select pg_temp.assert_eq('owner sees only own financial rows', (select count(*) from public.accounts), 1);

update public.profiles
set display_name = 'M04 User A Updated',
    default_timezone = 'America/Sao_Paulo',
    locale = 'pt-BR'
where id = '00000000-0000-4000-8000-000000000701';
select pg_temp.assert_true(
  'owner updates allowed profile fields',
  exists(
    select 1
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000701'
      and display_name = 'M04 User A Updated'
  )
);

do $$
begin
  begin
    update public.profiles
    set email = 'hijack@example.invalid'
    where id = '00000000-0000-4000-8000-000000000701';
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'profile email mutation was not rejected';
end;
$$;

update public.profiles
set display_name = 'Cross User Profile Update'
where id = '00000000-0000-4000-8000-000000000702';
select pg_temp.assert_eq(
  'cross-user profile update reaches no rows',
  (
    select count(*)
    from public.profiles
    where display_name = 'Cross User Profile Update'
  ),
  0
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
      '00000000-0000-4000-8000-000000000702',
      'Cross User Attempt',
      'cross-user-attempt',
      'checking',
      0,
      '2026-09-15'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'cross-user insert was not rejected';
end;
$$;

do $$
begin
  begin
    update public.accounts
    set user_id = '00000000-0000-4000-8000-000000000702'
    where id = '00000000-0000-4000-8000-000000000703';
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'ownership hijack was not rejected';
end;
$$;

do $$
begin
  begin
    insert into public.user_roles (user_id, role)
    values ('00000000-0000-4000-8000-000000000701', 'admin');
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'self-granted admin role was not rejected';
end;
$$;

select pg_temp.assert_true('non-admin role helper returns false', public.current_user_has_role('admin') = false);
select pg_temp.assert_eq('non-admin cannot read admin aggregate metrics', (select count(*) from public.admin_observability_metrics), 0);

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

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000702';
select pg_temp.assert_true('admin role helper returns true', public.current_user_has_role('admin'));
select pg_temp.assert_eq('admin can read aggregate metrics', (select count(*) from public.admin_observability_metrics), 1);
select pg_temp.assert_eq('admin still sees only own financial rows', (select count(*) from public.accounts), 1);

reset role;
set role anon;
do $$
begin
  begin
    perform count(*) from public.profiles;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'anon profile read was not rejected';
end;
$$;
reset role;

set role service_role;
select pg_temp.assert_eq('service role can support backend-only maintenance when granted', (select count(*) from public.accounts), 2);
reset role;
`;

function runCycle(cycleNumber) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `planner-vida-m04-${cycleNumber}-`),
  );
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  fs.mkdirSync(socketDir);
  const port = 56100 + cycleNumber;

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
    psqlFile(port, "postgres", m03MigrationPath);
    psqlFile(port, "postgres", m04MigrationPath);
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
        'profiles', (select count(*) from public.profiles),
        'active_user_roles', (select count(*) from public.user_roles where role = 'user' and revoked_at is null),
        'admin_select_policies', (select count(*) from pg_policies where policyname in ('admin_observability_metrics_admin_select', 'system_job_runs_admin_select')),
        'profile_trigger', (select count(*) from pg_trigger where tgname = 'on_auth_user_created'),
        'profile_identity_guard', (select count(*) from pg_trigger where tgname = 'prevent_profile_identity_mutation')
      )::text as summary;
      `,
      { tempDir, name: "summary", capture: true },
    ).trim();

    console.log(
      `M04 auth/RLS runtime harness cycle ${cycleNumber} passed: ${summary}`,
    );
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

console.log("M04 auth/RLS runtime harness passed 2 clean reset cycles.");
