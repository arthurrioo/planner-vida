import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const migrationPaths = [
  "20260915000100_m03_database_physical_foundation.sql",
  "20260915000200_m04_auth_profiles_authorization_rls.sql",
  "20260920000100_m09_transactions_atomic_rpc.sql",
  "20260920000200_m10_transfers_atomic_rpc.sql",
].map((file) => path.join(repoRoot, "supabase", "migrations", file));
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

function psqlFile(port, database, filePath) {
  return run("psql", [
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
  ]);
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
    raise exception 'M10 runtime assertion failed: %', description;
  end if;
end;
$$;

create function pg_temp.assert_eq(description text, actual numeric, expected numeric)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M10 runtime assertion failed: %, expected %, got %', description, expected, actual;
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
    '00000000-0000-4000-8000-000000001991',
    'authenticated',
    'authenticated',
    'm10-user-a@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M10 User A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000001992',
    'authenticated',
    'authenticated',
    'm10-user-b@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M10 User B"}'::jsonb
  );

insert into public.accounts (
  id,
  user_id,
  name,
  normalized_name,
  type,
  opening_balance,
  opening_balance_date,
  status,
  archived_at
)
values
  (
    '00000000-0000-4000-8000-000000001993',
    '00000000-0000-4000-8000-000000001991',
    'M10 Source',
    'm10-source',
    'checking',
    1000,
    '2026-09-01',
    'active',
    null
  ),
  (
    '00000000-0000-4000-8000-000000001994',
    '00000000-0000-4000-8000-000000001991',
    'M10 Destination',
    'm10-destination',
    'savings',
    100,
    '2026-09-01',
    'active',
    null
  ),
  (
    '00000000-0000-4000-8000-000000001995',
    '00000000-0000-4000-8000-000000001991',
    'M10 Archived',
    'm10-archived',
    'checking',
    0,
    '2026-09-01',
    'archived',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000001996',
    '00000000-0000-4000-8000-000000001992',
    'M10 User B',
    'm10-user-b',
    'checking',
    500,
    '2026-09-01',
    'active',
    null
  );

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';

do $$
declare
  v_created jsonb;
  v_corrected jsonb;
  v_failed jsonb;
  v_reversed jsonb;
  v_reversed_transfer_id uuid;
  v_transfer_id uuid;
begin
  v_created := public.create_transfer(jsonb_build_object(
    'amount', '250.4500',
    'description', 'Runtime transfer',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-09-20'
  ));
  v_transfer_id := (v_created -> 'transfer' ->> 'id')::uuid;

  perform pg_temp.assert_true(
    'create_transfer returns linked outflow and inflow rows',
    (v_created -> 'transfer' ->> 'outflow_transaction_id')::uuid = (v_created -> 'outflow' ->> 'id')::uuid
      and (v_created -> 'transfer' ->> 'inflow_transaction_id')::uuid = (v_created -> 'inflow' ->> 'id')::uuid
      and (v_created -> 'outflow' ->> 'transaction_type') = 'transfer'
      and (v_created -> 'inflow' ->> 'transaction_type') = 'transfer'
  );

  perform pg_temp.assert_eq(
    'source account posted transfer balance impact',
    (
      select coalesce(sum(
        case
          when source_account_id = '00000000-0000-4000-8000-000000001993' then -amount
          when destination_account_id = '00000000-0000-4000-8000-000000001993' then amount
          else 0
        end
      ), 0)
      from public.transfers
      where user_id = '00000000-0000-4000-8000-000000001991'
        and status = 'posted'
    ),
    -250.4500
  );

  perform pg_temp.assert_eq(
    'destination account posted transfer balance impact',
    (
      select coalesce(sum(
        case
          when source_account_id = '00000000-0000-4000-8000-000000001994' then -amount
          when destination_account_id = '00000000-0000-4000-8000-000000001994' then amount
          else 0
        end
      ), 0)
      from public.transfers
      where user_id = '00000000-0000-4000-8000-000000001991'
        and status = 'posted'
    ),
    250.4500
  );

  perform pg_temp.assert_eq(
    'transfer transactions are excluded from income expense P&L buckets',
    (
      select count(*)::numeric
      from public.transactions
      where user_id = '00000000-0000-4000-8000-000000001991'
        and transfer_id = v_transfer_id
        and transaction_type in ('income', 'expense')
    ),
    0
  );

  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '10',
      'description', 'Same account',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001993',
      'transfer_date', '2026-09-20'
    ));
    raise exception 'same-account transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '10',
      'description', 'Cross user',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001996',
      'transfer_date', '2026-09-20'
    ));
    raise exception 'cross-user transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '10',
      'description', 'Archived account',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001995',
      'transfer_date', '2026-09-20'
    ));
    raise exception 'archived-account transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  v_reversed := public.reverse_transfer(v_transfer_id, 'runtime reversal');

  perform pg_temp.assert_true(
    'reverse_transfer marks original transfer and linked movements reversed',
    (v_reversed -> 'original' ->> 'status') = 'reversed'
      and (v_reversed -> 'reversal_outflow' ->> 'status') = 'reversed'
      and (v_reversed -> 'reversal_inflow' ->> 'status') = 'reversed'
  );

  perform pg_temp.assert_eq(
    'reversed transfer no longer impacts source balance',
    (
      select coalesce(sum(
        case
          when source_account_id = '00000000-0000-4000-8000-000000001993' then -amount
          when destination_account_id = '00000000-0000-4000-8000-000000001993' then amount
          else 0
        end
      ), 0)
      from public.transfers
      where user_id = '00000000-0000-4000-8000-000000001991'
        and status = 'posted'
    ),
    0
  );

  v_corrected := public.create_transfer(jsonb_build_object(
    'amount', '90',
    'description', 'Runtime correction original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-09-21'
  ));
  v_reversed_transfer_id := (v_corrected -> 'transfer' ->> 'id')::uuid;

  v_corrected := public.correct_transfer(
    v_reversed_transfer_id,
    'runtime correction',
    jsonb_build_object(
      'amount', '120',
      'description', 'Runtime correction replacement',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-09-22'
    )
  );

  perform pg_temp.assert_true(
    'correct_transfer reverses original and posts replacement atomically',
    (v_corrected -> 'original' ->> 'status') = 'reversed'
      and (v_corrected -> 'replacement' -> 'transfer' ->> 'status') = 'posted'
      and (v_corrected -> 'replacement' -> 'transfer' ->> 'amount')::numeric = 120
  );

  v_failed := public.create_transfer(jsonb_build_object(
    'amount', '70',
    'description', 'Runtime correction failure original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-09-23'
  ));
  v_reversed_transfer_id := (v_failed -> 'transfer' ->> 'id')::uuid;

  begin
    perform public.correct_transfer(
      v_reversed_transfer_id,
      'runtime rollback',
      jsonb_build_object(
        'amount', '71',
        'description', 'Runtime correction failure replacement',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001993',
        'transfer_date', '2026-09-24'
      )
    );
    raise exception 'failed correction did not raise';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  perform pg_temp.assert_eq(
    'failed correction leaves original transfer posted',
    (
      select count(*)::numeric
      from public.transfers
      where id = v_reversed_transfer_id
        and status = 'posted'
    ),
    1
  );

  perform pg_temp.assert_eq(
    'failed correction leaves no reversal movement rows',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = v_reversed_transfer_id
        and reversal_of_transaction_id is not null
    ),
    0
  );

  begin
    insert into public.audit_logs (
      id,
      user_id,
      actor_user_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      '00000000-0000-4000-8000-000000001999',
      '00000000-0000-4000-8000-000000001991',
      '00000000-0000-4000-8000-000000001991',
      'user',
      'transfers.create',
      'transfer',
      v_transfer_id,
      '{}'::jsonb
    );
    raise exception 'authenticated audit insert was not rejected';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001992';

do $$
begin
  perform pg_temp.assert_eq(
    'user B cannot read user A transfers through RLS',
    (
      select count(*)::numeric
      from public.transfers
      where user_id = '00000000-0000-4000-8000-000000001991'
    ),
    0
  );

  begin
    perform public.reverse_transfer(
      (
        select id
        from public.transfers
        where description = 'Runtime correction replacement'
        limit 1
      ),
      'cross user reversal'
    );
    raise exception 'cross-user reverse_transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_conflict%' then
      raise;
    end if;
  end;
end;
$$;

reset role;
`;

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-m10-"));
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  const database = "planner_m10_runtime";
  const port = 55440;

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

    psql(port, database, preludeSql, { name: "prelude", tempDir });
    for (const migrationPath of migrationPaths) {
      psqlFile(port, database, migrationPath);
    }
    psqlFile(port, database, seedPath);
    psql(port, database, runtimeSql, { name: "runtime", tempDir });

    console.log("M10 transfers runtime harness passed.");
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
