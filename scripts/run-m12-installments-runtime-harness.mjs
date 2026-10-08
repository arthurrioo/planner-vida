import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const migrations = [
  "20260915000100_m03_database_physical_foundation.sql",
  "20260915000200_m04_auth_profiles_authorization_rls.sql",
  "20260920000100_m09_transactions_atomic_rpc.sql",
  "20260920000200_m10_transfers_atomic_rpc.sql",
  "20260920000300_m10_review_remediation.sql",
  "20260926000100_m12_installments_atomic_rpc.sql",
].map((file) => path.join(repoRoot, "supabase", "migrations", file));
const seedPath = path.join(repoRoot, "supabase", "seed.sql");

const ids = {
  accountA: "00000000-0000-4000-8000-000000012003",
  accountB: "00000000-0000-4000-8000-000000012004",
  cardA: "00000000-0000-4000-8000-000000012005",
  categoryA: "00000000-0000-4000-8000-000000012006",
  categoryB: "00000000-0000-4000-8000-000000012007",
  userA: "00000000-0000-4000-8000-000000012001",
  userB: "00000000-0000-4000-8000-000000012002",
};

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

function psqlArgs(port, database, filePath) {
  return [
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
  ];
}

function psql(port, database, sql, { name, tempDir }) {
  const filePath = path.join(tempDir, `${name}.sql`);
  fs.writeFileSync(filePath, sql);
  return run("psql", psqlArgs(port, database, filePath));
}

function psqlFile(port, database, filePath) {
  return run("psql", psqlArgs(port, database, filePath));
}

function spawnPsql(port, database, filePath) {
  const child = spawn("psql", psqlArgs(port, database, filePath), {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => chunks.push(chunk));

  return {
    child,
    output: () => Buffer.concat(chunks).toString("utf8"),
    result: new Promise((resolve) => {
      child.on("close", (status) =>
        resolve({ output: Buffer.concat(chunks).toString("utf8"), status }),
      );
    }),
  };
}

async function waitForOutput(session, marker, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (!session.output().includes(marker)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${marker}.\n${session.output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
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

create function auth.uid() returns uuid language sql stable as $$
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
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;
grant usage on schema auth, storage to authenticated, anon, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
`;

const setupSql = `
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('${ids.userA}', 'authenticated', 'authenticated', 'm12-a@example.invalid', 'synthetic', now(), now(), now(), '{}'::jsonb, '{"display_name":"M12 User A"}'::jsonb),
  ('${ids.userB}', 'authenticated', 'authenticated', 'm12-b@example.invalid', 'synthetic', now(), now(), now(), '{}'::jsonb, '{"display_name":"M12 User B"}'::jsonb);

insert into public.accounts (
  id, user_id, name, normalized_name, type, opening_balance, opening_balance_date
) values
  ('${ids.accountA}', '${ids.userA}', 'Conta M12 A', 'conta-m12-a', 'checking', 100, '2026-09-01'),
  ('${ids.accountB}', '${ids.userB}', 'Conta M12 B', 'conta-m12-b', 'checking', 500, '2026-09-01');

insert into public.credit_cards (
  id, user_id, name, normalized_name, credit_limit, closing_day, due_day
) values ('${ids.cardA}', '${ids.userA}', 'Cartao M12', 'cartao-m12', 2000, 10, 20);

insert into public.categories (
  id, user_id, name, normalized_name, type, parent_id
) values
  ('${ids.categoryA}', '${ids.userA}', 'Compras M12', 'compras-m12', 'variable_expense', null),
  ('${ids.categoryB}', '${ids.userB}', 'Compras M12 B', 'compras-m12-b', 'variable_expense', null);

create function public.m12_assert(label text, actual numeric, expected numeric)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'M12 assertion failed: %, actual %, expected %', label, actual, expected;
  end if;
end;
$$;
`;

function planJson({ accountId, cardId, count, description, total }) {
  const amount = count === 3 ? null : (Number(total) / count).toFixed(4);
  const schedule =
    count === 3
      ? `jsonb_build_array(
          jsonb_build_object('installment_number', 1, 'amount', '33.3400', 'due_date', '2026-10-01', 'competence_date', '2026-10-01'),
          jsonb_build_object('installment_number', 2, 'amount', '33.3300', 'due_date', '2026-11-01', 'competence_date', '2026-11-01'),
          jsonb_build_object('installment_number', 3, 'amount', '33.3300', 'due_date', '2026-12-01', 'competence_date', '2026-12-01')
        )`
      : `(select jsonb_agg(jsonb_build_object(
          'installment_number', n,
          'amount', '${amount}',
          'due_date', ('2026-10-01'::date + ((n - 1) || ' month')::interval)::date,
          'competence_date', ('2026-10-01'::date + ((n - 1) || ' month')::interval)::date
        ) order by n) from generate_series(1, ${count}) n)`;

  return `jsonb_build_object(
    'description', '${description}',
    'merchant_name', 'Loja sintetica',
    'merchant_key', 'loja-sintetica',
    'total_amount', '${total}',
    'total_installments', ${count},
    'first_due_date', '2026-10-01',
    'purchase_date', '2026-09-26',
    'category_id', '${ids.categoryA}',
    'payment_method', '${cardId ? "credit_card" : "pix"}',
    'account_id', ${accountId ? `'${accountId}'` : "null"},
    'credit_card_id', ${cardId ? `'${cardId}'` : "null"},
    'source_type', 'manual',
    'installments', ${schedule}
  )`;
}

async function runChecks(port, database, tempDir) {
  const accountPlan = planJson({
    accountId: ids.accountA,
    count: 3,
    description: "M12 account 3x",
    total: "100.00",
  });
  const cardPlan = planJson({
    cardId: ids.cardA,
    count: 2,
    description: "M12 card 2x",
    total: "50.00",
  });

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${ids.userA}';
select public.create_installment_plan(${accountPlan});

do $$
declare v_plan_id uuid;
begin
  select id into v_plan_id from public.installment_plans where description = 'M12 account 3x';
  perform public.m12_assert('one real plan', (select count(*) from public.installment_plans where id = v_plan_id), 1);
  perform public.m12_assert('three installments', (select count(*) from public.installments where plan_id = v_plan_id), 3);
  perform public.m12_assert('three commitments', (select count(*) from public.financial_commitments where source_id = v_plan_id), 3);
  perform public.m12_assert('exact residual sum', (select sum(amount) from public.installments where plan_id = v_plan_id), 100.0000);
  perform public.m12_assert('no fake parent transaction', (select count(*) from public.transactions where source_id = v_plan_id), 0);
end;
$$;

select public.create_installment_plan(${planJson({ accountId: ids.accountA, count: 24, description: "M12 domain 24x", total: "24.00" })});
select public.create_installment_plan(${planJson({ accountId: ids.accountA, count: 60, description: "M12 domain 60x", total: "60.00" })});

do $$
begin
  perform public.m12_assert('24x persisted', (select count(*) from public.installments i join public.installment_plans p on p.id = i.plan_id where p.description = 'M12 domain 24x'), 24);
  perform public.m12_assert('60x persisted', (select count(*) from public.installments i join public.installment_plans p on p.id = i.plan_id where p.description = 'M12 domain 60x'), 60);
end;
$$;
`,
    { name: "create-and-limits", tempDir },
  );

  const accountInstallmentId = queryScalar(
    port,
    database,
    `select i.id from public.installments i join public.installment_plans p on p.id = i.plan_id where p.description = 'M12 account 3x' and i.installment_number = 1;`,
    { name: "account-installment-id", tempDir },
  );

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${ids.userA}';
select public.realize_installment('${accountInstallmentId}', '2026-10-31');
do $$
begin
  perform public.m12_assert('one realized fact', (select count(*) from public.transactions where installment_id = '${accountInstallmentId}' and status = 'posted'), 1);
  perform public.m12_assert('one realized commitment', (select count(*) from public.financial_commitments where installment_id = '${accountInstallmentId}' and status = 'realized'), 1);
  perform public.m12_assert('account impact exactly once', (select coalesce(sum(amount), 0) from public.transactions where account_id = '${ids.accountA}' and status = 'posted' and transaction_type = 'expense'), 33.3400);
  begin
    perform public.realize_installment('${accountInstallmentId}', '2026-10-31');
    raise exception 'm12_test_expected_failure';
  exception when others then
    if sqlerrm = 'm12_test_expected_failure' or position('m12_installment_conflict' in sqlerrm) = 0 then raise; end if;
  end;
  perform public.m12_assert('duplicate realization prevented', (select count(*) from public.transactions where installment_id = '${accountInstallmentId}'), 1);
end;
$$;
`,
    { name: "realize-once", tempDir },
  );

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${ids.userB}';
do $$
begin
  perform public.m12_assert('cross-user read denied', (select count(*) from public.installments where id = '${accountInstallmentId}'), 0);
  begin
    perform public.realize_installment('${accountInstallmentId}', '2026-11-01');
    raise exception 'm12_test_expected_failure';
  exception when others then
    if sqlerrm = 'm12_test_expected_failure' or position('m12_installment_conflict' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;
`,
    { name: "cross-user", tempDir },
  );

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${ids.userA}';
do $$
begin
  begin
    perform public.create_installment_plan(${planJson({ accountId: ids.accountB, count: 2, description: "M12 forbidden owner", total: "20.00" })});
    raise exception 'm12_test_expected_failure';
  exception when others then
    if sqlerrm = 'm12_test_expected_failure' or position('m12_installment_validation' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.create_installment_plan(jsonb_set(${cardPlan}, '{total_amount}', '"51.00"'::jsonb));
    raise exception 'm12_test_expected_failure';
  exception when others then
    if sqlerrm = 'm12_test_expected_failure' or position('m12_installment_validation' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.create_installment_plan(jsonb_set(
      ${accountPlan},
      '{installments,0,amount}',
      '"33.3300"'::jsonb
    ));
    raise exception 'm12_test_expected_failure';
  exception when others then
    if sqlerrm = 'm12_test_expected_failure' or position('m12_installment_validation' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.create_installment_plan(${planJson({ accountId: ids.accountA, count: 61, description: "M12 forbidden 61x", total: "61.00" })});
    raise exception 'm12_test_expected_failure';
  exception when others then
    if sqlerrm = 'm12_test_expected_failure' or position('m12_installment_validation' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.m12_assert('cross-owner rollback', (select count(*) from public.installment_plans where description = 'M12 forbidden owner'), 0);
  perform public.m12_assert('invalid-sum rollback', (select count(*) from public.installment_plans where description = 'M12 card 2x'), 0);
  perform public.m12_assert('61x rollback', (select count(*) from public.installment_plans where description = 'M12 forbidden 61x'), 0);
end;
$$;

select public.create_installment_plan(${cardPlan});
`,
    { name: "rollback-and-card-create", tempDir },
  );

  const cardInstallmentId = queryScalar(
    port,
    database,
    `select i.id from public.installments i join public.installment_plans p on p.id = i.plan_id where p.description = 'M12 card 2x' and i.installment_number = 1;`,
    { name: "card-installment-id", tempDir },
  );
  const accountPlanId = queryScalar(
    port,
    database,
    `select id from public.installment_plans where description = 'M12 account 3x';`,
    { name: "account-plan-id", tempDir },
  );

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${ids.userA}';
select public.realize_installment('${cardInstallmentId}', '2026-10-20');
do $$
begin
  perform public.m12_assert('card fact has no account impact', (select count(*) from public.transactions where installment_id = '${cardInstallmentId}' and account_id is null and credit_card_id = '${ids.cardA}' and status = 'posted'), 1);
end;
$$;

select public.cancel_installment_plan('${accountPlanId}', 'Compra duplicada');
select public.cancel_installment_plan('${accountPlanId}', 'Idempotent retry');
do $$
begin
  perform public.m12_assert('plan cancelled', (select count(*) from public.installment_plans where id = '${accountPlanId}' and status = 'cancelled'), 1);
  perform public.m12_assert('all installments cancelled', (select count(*) from public.installments where plan_id = '${accountPlanId}' and status = 'cancelled'), 3);
  perform public.m12_assert('all commitments cancelled', (select count(*) from public.financial_commitments where source_id = '${accountPlanId}' and status = 'cancelled'), 3);
  perform public.m12_assert('original and reversal retained', (select count(*) from public.transactions where installment_id = '${accountInstallmentId}' and status = 'reversed'), 2);
  perform public.m12_assert('cancelled plan has no posted balance impact', (select count(*) from public.transactions where installment_id = '${accountInstallmentId}' and status = 'posted'), 0);
  perform public.m12_assert('idempotent cancellation has one reversal', (select count(*) from public.transactions where reversal_of_transaction_id is not null and installment_id = '${accountInstallmentId}'), 1);
end;
$$;

with deleted as (
  delete from public.installment_plans where id = '${accountPlanId}' returning id
)
select public.m12_assert('owner hard delete denied', (select count(*) from deleted), 0);
`,
    { name: "card-and-cancel", tempDir },
  );

  await runConcurrentRealization(port, database, tempDir);
}

function queryScalar(port, database, sql, { name, tempDir }) {
  const filePath = path.join(tempDir, `${name}.sql`);
  fs.writeFileSync(filePath, sql);
  return run(
    "psql",
    [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--quiet",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--dbname",
      database,
      "--file",
      filePath,
    ],
    { capture: true },
  ).trim();
}

async function runConcurrentRealization(port, database, tempDir) {
  const installmentId = queryScalar(
    port,
    database,
    `select i.id from public.installments i join public.installment_plans p on p.id = i.plan_id where p.description = 'M12 domain 24x' and i.installment_number = 1;`,
    { name: "race-installment-id", tempDir },
  );
  const firstPath = path.join(tempDir, "race-a.sql");
  const secondPath = path.join(tempDir, "race-b.sql");
  fs.writeFileSync(
    firstPath,
    `set role authenticated;
set request.jwt.claim.sub = '${ids.userA}';
begin;
select id from public.installments where id = '${installmentId}' for update;
\\echo M12_LOCK_HELD
select pg_sleep(1);
select public.realize_installment('${installmentId}', '2026-10-01');
commit;`,
  );
  fs.writeFileSync(
    secondPath,
    `set role authenticated;
set request.jwt.claim.sub = '${ids.userA}';
select public.realize_installment('${installmentId}', '2026-10-01');`,
  );

  const first = spawnPsql(port, database, firstPath);
  await waitForOutput(first, "M12_LOCK_HELD");
  const second = spawnPsql(port, database, secondPath);
  const [firstResult, secondResult] = await Promise.all([
    first.result,
    second.result,
  ]);

  if (
    firstResult.status !== 0 ||
    secondResult.status === 0 ||
    !secondResult.output.includes("m12_installment_conflict")
  ) {
    throw new Error(
      `Expected one realization success and one conflict.\nA:\n${firstResult.output}\nB:\n${secondResult.output}`,
    );
  }

  psql(
    port,
    database,
    `select public.m12_assert('concurrent realization exactly once', (select count(*) from public.transactions where installment_id = '${installmentId}'), 1);`,
    { name: "race-assert", tempDir },
  );
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-m12-"));
  const dataDir = path.join(tempDir, "pgdata");
  const socketDir = path.join(tempDir, "socket");
  const database = "planner_m12_runtime";
  const port = 55442;
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
    for (const migration of migrations) psqlFile(port, database, migration);
    psqlFile(port, database, seedPath);
    psql(port, database, setupSql, { name: "setup", tempDir });
    await runChecks(port, database, tempDir);
    console.log("M12 installments runtime harness passed.");
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
