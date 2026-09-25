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
  "20260920000300_m10_review_remediation.sql",
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
create function pg_temp.assert_eq(description text, actual numeric, expected numeric)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M11 runtime assertion failed: %, expected %, got %', description, expected, actual;
  end if;
end;
$$;

create function pg_temp.assert_text(description text, actual text, expected text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'M11 runtime assertion failed: %, expected %, got %', description, expected, actual;
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
    '00000000-0000-4000-8000-000000011991',
    'authenticated',
    'authenticated',
    'm11-user-a@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M11 User A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000011992',
    'authenticated',
    'authenticated',
    'm11-user-b@example.invalid',
    'synthetic',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"M11 User B"}'::jsonb
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
    '00000000-0000-4000-8000-000000011993',
    '00000000-0000-4000-8000-000000011991',
    'Conta A',
    'conta-a',
    'checking',
    1000,
    '2026-09-01'
  ),
  (
    '00000000-0000-4000-8000-000000011994',
    '00000000-0000-4000-8000-000000011991',
    'Reserva A',
    'reserva-a',
    'savings',
    100,
    '2026-09-01'
  ),
  (
    '00000000-0000-4000-8000-000000011995',
    '00000000-0000-4000-8000-000000011992',
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
  '00000000-0000-4000-8000-000000011996',
  '00000000-0000-4000-8000-000000011991',
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
  type,
  parent_id
)
values
  (
    '00000000-0000-4000-8000-000000011997',
    '00000000-0000-4000-8000-000000011991',
    'Receitas',
    'receitas',
    'income',
    null
  ),
  (
    '00000000-0000-4000-8000-000000011998',
    '00000000-0000-4000-8000-000000011991',
    'Compras',
    'compras',
    'variable_expense',
    null
  ),
  (
    '00000000-0000-4000-8000-000000011999',
    '00000000-0000-4000-8000-000000011991',
    'Mercado',
    'mercado',
    'variable_expense',
    '00000000-0000-4000-8000-000000011998'
  ),
  (
    '00000000-0000-4000-8000-000000012000',
    '00000000-0000-4000-8000-000000011991',
    'Investimentos',
    'investimentos',
    'investment',
    null
  ),
  (
    '00000000-0000-4000-8000-000000012001',
    '00000000-0000-4000-8000-000000011992',
    'Despesas B',
    'despesas-b',
    'variable_expense',
    null
  );

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000011991';

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
  subcategory_id,
  payment_method,
  account_id,
  credit_card_id,
  posted_at
)
values
  (
    '00000000-0000-4000-8000-000000012010',
    '00000000-0000-4000-8000-000000011991',
    'income',
    'posted',
    'Salario M11',
    1000,
    '2026-09-10',
    '2026-09-10',
    '2026-09-01',
    '00000000-0000-4000-8000-000000011997',
    null,
    'pix',
    '00000000-0000-4000-8000-000000011993',
    null,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000012011',
    '00000000-0000-4000-8000-000000011991',
    'expense',
    'posted',
    'Mercado M11',
    125,
    '2026-09-11',
    '2026-09-11',
    '2026-09-01',
    '00000000-0000-4000-8000-000000011998',
    '00000000-0000-4000-8000-000000011999',
    'pix',
    '00000000-0000-4000-8000-000000011993',
    null,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000012012',
    '00000000-0000-4000-8000-000000011991',
    'investment',
    'posted',
    'Tesouro M11',
    200,
    '2026-09-12',
    '2026-09-12',
    '2026-09-01',
    '00000000-0000-4000-8000-000000012000',
    null,
    'bank_transfer',
    '00000000-0000-4000-8000-000000011993',
    null,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000012013',
    '00000000-0000-4000-8000-000000011991',
    'expense',
    'posted',
    'Cartao M11',
    80,
    '2026-09-13',
    '2026-09-13',
    '2026-09-01',
    '00000000-0000-4000-8000-000000011998',
    null,
    'credit_card',
    null,
    '00000000-0000-4000-8000-000000011996',
    now()
  );

select public.create_transfer(
  jsonb_build_object(
    'amount', '50',
    'description', 'Reserva M11',
    'source_account_id', '00000000-0000-4000-8000-000000011993',
    'destination_account_id', '00000000-0000-4000-8000-000000011994',
    'transfer_date', '2026-09-14'
  )
);

select pg_temp.assert_eq(
  'owner A statement rows include income expense investment card purchase and two transfer legs',
  (select count(*) from public.transactions),
  6
);

select pg_temp.assert_eq(
  'filter by date type category method account returns the mercado row',
  (
    select count(*)
    from public.transactions
    where transaction_date between '2026-09-01' and '2026-09-30'
      and transaction_type = 'expense'
      and payment_method = 'pix'
      and account_id = '00000000-0000-4000-8000-000000011993'
      and (
        category_id = '00000000-0000-4000-8000-000000011999'
        or subcategory_id = '00000000-0000-4000-8000-000000011999'
      )
  ),
  1
);

select pg_temp.assert_text(
  'statement ordering newest first',
  (
    select description
    from public.transactions
    order by transaction_date desc, created_at desc
    offset 2
    limit 1
  ),
  'Cartao M11'
);

select pg_temp.assert_eq(
  'credit-card filter returns card purchase only',
  (
    select count(*)
    from public.transactions
    where credit_card_id = '00000000-0000-4000-8000-000000011996'
  ),
  1
);

select pg_temp.assert_eq(
  'account balance invariant excludes credit-card purchase and includes transfer out',
  (
    select
      a.opening_balance
      + coalesce(sum(t.amount) filter (where t.transaction_type = 'income'), 0)
      - coalesce(sum(t.amount) filter (
          where t.transaction_type = 'expense'
            and t.payment_method <> 'credit_card'
            and t.credit_card_id is null
        ), 0)
      - coalesce(sum(t.amount) filter (
          where t.transaction_type = 'investment'
            and t.payment_method <> 'credit_card'
            and t.credit_card_id is null
        ), 0)
      - coalesce((select sum(amount) from public.transfers where source_account_id = a.id and status = 'posted'), 0)
      + coalesce((select sum(amount) from public.transfers where destination_account_id = a.id and status = 'posted'), 0)
    from public.accounts a
    left join public.transactions t
      on t.account_id = a.id
     and t.status = 'posted'
     and t.transaction_type <> 'transfer'
    where a.id = '00000000-0000-4000-8000-000000011993'
    group by a.id, a.opening_balance
  ),
  1625
);

set request.jwt.claim.sub = '00000000-0000-4000-8000-000000011992';

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
  '00000000-0000-4000-8000-000000012020',
  '00000000-0000-4000-8000-000000011992',
  'expense',
  'posted',
  'Despesa B M11',
  10,
  '2026-09-15',
  '2026-09-15',
  '2026-09-01',
  '00000000-0000-4000-8000-000000012001',
  'pix',
  '00000000-0000-4000-8000-000000011995',
  now()
);

select pg_temp.assert_eq(
  'owner B statement rows exclude owner A facts',
  (select count(*) from public.transactions),
  1
);

select pg_temp.assert_eq(
  'owner B cannot read owner A accounts for statement balances',
  (select count(*) from public.accounts where id = '00000000-0000-4000-8000-000000011993'),
  0
);

set role anon;
reset request.jwt.claim.sub;

do $$
begin
  begin
    perform count(*) from public.transactions;
  exception when insufficient_privilege then
    return;
  end;

  raise exception 'M11 runtime assertion failed: anon statement read was not denied';
end;
$$;

reset role;
`;

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-m11-"));
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  const database = "planner_m11_runtime";
  const port = 55441;

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

    console.log("M11 statement runtime harness passed.");
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
