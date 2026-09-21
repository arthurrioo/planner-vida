import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createJiti } from "jiti";

const repoRoot = process.cwd();
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(repoRoot, "src"),
  },
});
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

function psqlScalar(port, database, sql, options = {}) {
  const sqlPath = path.join(options.tempDir, `${options.name}.sql`);
  fs.writeFileSync(sqlPath, sql);

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
      sqlPath,
    ],
    { capture: true },
  ).trim();
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

function startPsqlFileAsync(port, database, filePath) {
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
  const chunks = [];
  const append = (chunk) => chunks.push(chunk);

  child.stdout.on("data", append);
  child.stderr.on("data", append);

  return {
    child,
    output: () => Buffer.concat(chunks).toString("utf8"),
    result: new Promise((resolve) => {
      child.on("close", (status) => {
        resolve({
          output: Buffer.concat(chunks).toString("utf8"),
          status,
        });
      });
    }),
    waitForOutput(pattern, timeoutMs) {
      const startedAt = Date.now();

      return new Promise((resolve, reject) => {
        const check = () => {
          if (pattern.test(Buffer.concat(chunks).toString("utf8"))) {
            cleanup();
            resolve();
            return;
          }

          if (Date.now() - startedAt > timeoutMs) {
            cleanup();
            reject(
              new Error(
                `Timed out waiting for deterministic overlap marker ${pattern}. Output:\n${Buffer.concat(
                  chunks,
                ).toString("utf8")}`,
              ),
            );
          }
        };
        const onData = () => check();
        const onClose = () => check();
        const timer = setInterval(check, 25);
        const cleanup = () => {
          clearInterval(timer);
          child.stdout.off("data", onData);
          child.stderr.off("data", onData);
          child.off("close", onClose);
        };

        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("close", onClose);
        check();
      });
    },
  };
}

function assertOneSuccessOneConflict(operationName, results) {
  const successes = results.filter((result) => result.status === 0);
  const failures = results.filter((result) => result.status !== 0);

  if (successes.length !== 1 || failures.length !== 1) {
    throw new Error(
      `Expected one ${operationName} success and one conflict. Results:\n${results
        .map((result) => `status=${result.status}\n${result.output}`)
        .join("\n---\n")}`,
    );
  }

  if (!failures[0].output.includes("m10_transfer_conflict")) {
    throw new Error(
      `Expected ${operationName} loser to fail with m10_transfer_conflict. Output:\n${failures[0].output}`,
    );
  }
}

async function runConcurrentSqlPair(
  port,
  database,
  tempDir,
  name,
  firstSql,
  secondSql,
) {
  const firstPath = path.join(tempDir, `${name}-a.sql`);
  const secondPath = path.join(tempDir, `${name}-b.sql`);
  fs.writeFileSync(firstPath, firstSql);
  fs.writeFileSync(secondPath, secondSql);

  const first = startPsqlFileAsync(port, database, firstPath);
  await first.waitForOutput(
    new RegExp(`m10_runtime_overlap_gate:${name}`),
    5000,
  );
  const second = startPsqlFileAsync(port, database, secondPath);
  const results = await Promise.all([first.result, second.result]);

  assertOneSuccessOneConflict(name, results);
}

async function runM10ConcurrentLifecycleChecks(port, database, tempDir) {
  psql(
    port,
    database,
    `
create or replace function public.m10_runtime_assert_true(description text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'M10 runtime assertion failed: %', description;
  end if;
end;
$$;

create or replace function public.m10_runtime_assert_eq(description text, actual numeric, expected numeric)
returns void
language plpgsql
as $$
begin
  if actual <> expected then
    raise exception 'M10 runtime assertion failed: %, expected %, got %', description, expected, actual;
  end if;
end;
$$;

create or replace function public.m10_runtime_overlap_sleep()
returns trigger
language plpgsql
as $$
declare
  v_name text;
begin
  v_name := case new.description
    when 'Concurrent reverse original' then 'concurrent-reverse-reverse'
    when 'Concurrent correct original' then 'concurrent-correct-correct'
    when 'Concurrent reverse correct original' then 'concurrent-reverse-correct'
    else 'unknown'
  end;
  raise notice 'm10_runtime_overlap_gate:%', v_name;
  perform pg_sleep(1.25);
  return new;
end;
$$;

drop trigger if exists m10_runtime_overlap_sleep on public.transfers;
create trigger m10_runtime_overlap_sleep
before update of status on public.transfers
for each row
when (
  old.status = 'posted'
  and new.status = 'reversed'
  and old.description like 'Concurrent %'
)
execute function public.m10_runtime_overlap_sleep();
`,
    { name: "concurrent-overlap-trigger", tempDir },
  );

  try {
    psql(
      port,
      database,
      `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';

select public.create_transfer(jsonb_build_object(
  'amount', '21',
  'description', 'Concurrent reverse original',
  'source_account_id', '00000000-0000-4000-8000-000000001993',
  'destination_account_id', '00000000-0000-4000-8000-000000001994',
  'transfer_date', '2026-10-10'
));
`,
      { name: "concurrent-reverse-setup", tempDir },
    );

    const reverseSql = `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';
select public.reverse_transfer(
  (select id from public.transfers where description = 'Concurrent reverse original'),
  'concurrent reverse'
);
`;

    await runConcurrentSqlPair(
      port,
      database,
      tempDir,
      "concurrent-reverse-reverse",
      reverseSql,
      reverseSql,
    );

    psql(
      port,
      database,
      `
do $$
declare
  v_transfer_id uuid;
begin
  select id
  into v_transfer_id
  from public.transfers
  where description = 'Concurrent reverse original';

  perform public.m10_runtime_assert_eq(
    'reverse/reverse overlap creates exactly two reversal movement rows',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = v_transfer_id
        and reversal_of_transaction_id is not null
    ),
    2
  );

  perform public.m10_runtime_assert_eq(
    'reverse/reverse overlap leaves original transfer reversed once',
    (
      select count(*)::numeric
      from public.transfers
      where id = v_transfer_id
        and status = 'reversed'
    ),
    1
  );
end;
$$;
`,
      { name: "concurrent-reverse-assert", tempDir },
    );

    psql(
      port,
      database,
      `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';

select public.create_transfer(jsonb_build_object(
  'amount', '31',
  'description', 'Concurrent correct original',
  'source_account_id', '00000000-0000-4000-8000-000000001993',
  'destination_account_id', '00000000-0000-4000-8000-000000001994',
  'transfer_date', '2026-10-11'
));
`,
      { name: "concurrent-correct-setup", tempDir },
    );

    const correctASql = `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';
select public.correct_transfer(
  (select id from public.transfers where description = 'Concurrent correct original'),
  'concurrent correct a',
  jsonb_build_object(
    'amount', '32',
    'description', 'Concurrent correct A replacement',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-12'
  )
);
`;
    const correctBSql = `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';
select public.correct_transfer(
  (select id from public.transfers where description = 'Concurrent correct original'),
  'concurrent correct b',
  jsonb_build_object(
    'amount', '33',
    'description', 'Concurrent correct B replacement',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-13'
  )
);
`;

    await runConcurrentSqlPair(
      port,
      database,
      tempDir,
      "concurrent-correct-correct",
      correctASql,
      correctBSql,
    );

    psql(
      port,
      database,
      `
do $$
declare
  v_transfer_id uuid;
begin
  select id
  into v_transfer_id
  from public.transfers
  where description = 'Concurrent correct original';

  perform public.m10_runtime_assert_eq(
    'correct/correct overlap creates exactly two reversal movement rows',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = v_transfer_id
        and reversal_of_transaction_id is not null
    ),
    2
  );

  perform public.m10_runtime_assert_eq(
    'correct/correct overlap posts exactly one replacement transfer',
    (
      select count(*)::numeric
      from public.transfers
      where description in ('Concurrent correct A replacement', 'Concurrent correct B replacement')
        and status = 'posted'
    ),
    1
  );
end;
$$;
`,
      { name: "concurrent-correct-assert", tempDir },
    );

    psql(
      port,
      database,
      `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';

select public.create_transfer(jsonb_build_object(
  'amount', '41',
  'description', 'Concurrent reverse correct original',
  'source_account_id', '00000000-0000-4000-8000-000000001993',
  'destination_account_id', '00000000-0000-4000-8000-000000001994',
  'transfer_date', '2026-10-14'
));
`,
      { name: "concurrent-reverse-correct-setup", tempDir },
    );

    const reverseVsCorrectSql = `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';
select public.reverse_transfer(
  (select id from public.transfers where description = 'Concurrent reverse correct original'),
  'concurrent reverse correct reverse'
);
`;
    const correctVsReverseSql = `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';
select public.correct_transfer(
  (select id from public.transfers where description = 'Concurrent reverse correct original'),
  'concurrent reverse correct correction',
  jsonb_build_object(
    'amount', '42',
    'description', 'Concurrent reverse correct replacement',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-15'
  )
);
`;

    await runConcurrentSqlPair(
      port,
      database,
      tempDir,
      "concurrent-reverse-correct",
      reverseVsCorrectSql,
      correctVsReverseSql,
    );

    psql(
      port,
      database,
      `
do $$
declare
  v_transfer_id uuid;
begin
  select id
  into v_transfer_id
  from public.transfers
  where description = 'Concurrent reverse correct original';

  perform public.m10_runtime_assert_eq(
    'reverse/correct overlap creates exactly two reversal movement rows',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = v_transfer_id
        and reversal_of_transaction_id is not null
    ),
    2
  );

  perform public.m10_runtime_assert_true(
    'reverse/correct overlap creates zero or one correction replacement',
    (
      select count(*)
      from public.transfers
      where description = 'Concurrent reverse correct replacement'
        and status = 'posted'
    ) in (0, 1)
  );
end;
$$;
`,
      { name: "concurrent-reverse-correct-assert", tempDir },
    );
  } finally {
    psql(
      port,
      database,
      `
drop trigger if exists m10_runtime_overlap_sleep on public.transfers;
drop function if exists public.m10_runtime_overlap_sleep();
`,
      { name: "concurrent-overlap-trigger-drop", tempDir },
    );
  }

  console.log("M10 concurrency overlap probes passed.");
}

function runM10FaultInjectionChecks(port, database, tempDir) {
  psql(
    port,
    database,
    `
create or replace function public.m10_runtime_state(p_user_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'transfers', (select count(*) from public.transfers where user_id = p_user_id),
    'transactions', (select count(*) from public.transactions where user_id = p_user_id),
    'posted_transfers', (select count(*) from public.transfers where user_id = p_user_id and status = 'posted'),
    'reversed_transfers', (select count(*) from public.transfers where user_id = p_user_id and status = 'reversed'),
    'posted_source_1993', (
      select coalesce(sum(
        case
          when source_account_id = '00000000-0000-4000-8000-000000001993' then -amount
          when destination_account_id = '00000000-0000-4000-8000-000000001993' then amount
          else 0
        end
      ), 0)::text
      from public.transfers
      where user_id = p_user_id
        and status = 'posted'
    ),
    'posted_destination_1994', (
      select coalesce(sum(
        case
          when source_account_id = '00000000-0000-4000-8000-000000001994' then -amount
          when destination_account_id = '00000000-0000-4000-8000-000000001994' then amount
          else 0
        end
      ), 0)::text
      from public.transfers
      where user_id = p_user_id
        and status = 'posted'
    )
  );
$$;

create or replace function public.m10_runtime_assert_state_unchanged(
  description text,
  before_state jsonb
)
returns void
language plpgsql
as $$
declare
  v_after jsonb;
begin
  v_after := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');

  if v_after <> before_state then
    raise exception 'M10 runtime assertion failed: %, before %, after %', description, before_state, v_after;
  end if;
end;
$$;

create or replace function public.m10_runtime_fail_on_marker()
returns trigger
language plpgsql
as $$
declare
  v_failpoint text := current_setting('m10_runtime.failpoint', true);
begin
  if v_failpoint is null or v_failpoint = '' then
    return new;
  end if;

  if tg_table_name = 'transactions' and tg_op = 'INSERT' then
    if v_failpoint = 'create_outflow_leg' and new.description = 'Transfer out: Fault create outflow leg' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    elsif v_failpoint = 'create_inflow_leg' and new.description = 'Transfer in: Fault create inflow leg' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    elsif v_failpoint = 'reverse_second_reversal_leg' and new.description = 'Reversal: Transfer in: Fault reverse second reversal leg' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    elsif v_failpoint = 'correct_replacement_outflow_leg' and new.description = 'Transfer out: Fault correct replacement outflow leg' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    elsif v_failpoint = 'correct_replacement_inflow_leg' and new.description = 'Transfer in: Fault correct replacement inflow leg' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    end if;
  elsif tg_table_name = 'transactions' and tg_op = 'UPDATE' then
    if v_failpoint = 'reverse_original_leg_update'
      and old.description = 'Transfer out: Fault reverse original leg update'
      and old.status = 'posted'
      and new.status = 'reversed' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    end if;
  elsif tg_table_name = 'transfers' and tg_op = 'INSERT' then
    if v_failpoint = 'correct_replacement_transfer_insert'
      and new.description = 'Fault correct replacement transfer insert' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    end if;
  elsif tg_table_name = 'transfers' and tg_op = 'UPDATE' then
    if v_failpoint = 'create_linkage_update'
      and new.description = 'Fault create linkage update'
      and old.outflow_transaction_id is null
      and new.outflow_transaction_id is not null then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    elsif v_failpoint = 'reverse_transfer_status_update'
      and new.description = 'Fault reverse transfer status update'
      and old.status = 'posted'
      and new.status = 'reversed' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    elsif v_failpoint = 'correct_replacement_linkage_update'
      and new.description = 'Fault correct replacement linkage update'
      and old.outflow_transaction_id is null
      and new.outflow_transaction_id is not null then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    elsif v_failpoint = 'correct_original_status_update'
      and new.description = 'Fault correct original status update'
      and old.status = 'posted'
      and new.status = 'reversed' then
      raise exception 'm10_runtime_injected_failure: %', v_failpoint;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists m10_runtime_fail_transactions on public.transactions;
drop trigger if exists m10_runtime_fail_transaction_updates on public.transactions;
drop trigger if exists m10_runtime_fail_transfers on public.transfers;
drop trigger if exists m10_runtime_fail_transfer_updates on public.transfers;
create trigger m10_runtime_fail_transactions
after insert on public.transactions
for each row
execute function public.m10_runtime_fail_on_marker();
create trigger m10_runtime_fail_transaction_updates
after update on public.transactions
for each row
execute function public.m10_runtime_fail_on_marker();
create trigger m10_runtime_fail_transfers
after insert on public.transfers
for each row
execute function public.m10_runtime_fail_on_marker();
create trigger m10_runtime_fail_transfer_updates
after update on public.transfers
for each row
execute function public.m10_runtime_fail_on_marker();
`,
    { name: "fault-injection-triggers", tempDir },
  );

  try {
    psql(
      port,
      database,
      `
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';

do $$
declare
  v_before jsonb;
  v_transfer_id uuid;
begin
  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'create_outflow_leg', true);
  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '51',
      'description', 'Fault create outflow leg',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-10-16'
    ));
    raise exception 'create fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: create_outflow_leg%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('create outflow-leg rollback leaves counts and balances unchanged', v_before);

  perform public.m10_runtime_assert_eq(
    'create outflow-leg rollback leaves no transfer row',
    (
      select count(*)::numeric
      from public.transfers
      where description = 'Fault create outflow leg'
    ),
    0
  );

  perform public.m10_runtime_assert_eq(
    'create outflow-leg rollback leaves no movement rows',
    (
      select count(*)::numeric
      from public.transactions
      where description in ('Transfer out: Fault create outflow leg', 'Transfer in: Fault create outflow leg')
    ),
    0
  );

  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'create_inflow_leg', true);
  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '52',
      'description', 'Fault create inflow leg',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-10-16'
    ));
    raise exception 'create inflow fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: create_inflow_leg%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('create inflow-leg rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq(
    'create inflow-leg rollback leaves no partial rows',
    (
      select count(*)::numeric
      from public.transfers
      where description = 'Fault create inflow leg'
    ) + (
      select count(*)::numeric
      from public.transactions
      where description in ('Transfer out: Fault create inflow leg', 'Transfer in: Fault create inflow leg')
    ),
    0
  );

  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'create_linkage_update', true);
  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '53',
      'description', 'Fault create linkage update',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-10-16'
    ));
    raise exception 'create linkage fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: create_linkage_update%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('create linkage rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq(
    'create linkage rollback leaves no partial rows',
    (
      select count(*)::numeric
      from public.transfers
      where description = 'Fault create linkage update'
    ) + (
      select count(*)::numeric
      from public.transactions
      where description in ('Transfer out: Fault create linkage update', 'Transfer in: Fault create linkage update')
    ),
    0
  );

  perform public.create_transfer(jsonb_build_object(
    'amount', '61',
    'description', 'Fault reverse second reversal leg',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-17'
  ));

  select id
  into v_transfer_id
  from public.transfers
  where description = 'Fault reverse second reversal leg';

  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'reverse_second_reversal_leg', true);
  begin
    perform public.reverse_transfer(v_transfer_id, 'fault reverse rollback');
    raise exception 'reverse fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: reverse_second_reversal_leg%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('reverse second-reversal-leg rollback leaves counts and balances unchanged', v_before);

  perform public.m10_runtime_assert_eq(
    'reverse second-reversal-leg rollback leaves original transfer posted',
    (
      select count(*)::numeric
      from public.transfers
      where id = v_transfer_id
        and status = 'posted'
    ),
    1
  );

  perform public.m10_runtime_assert_eq(
    'reverse second-reversal-leg rollback leaves original movement rows posted only',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = v_transfer_id
        and status = 'posted'
        and reversal_of_transaction_id is null
    ),
    2
  );

  perform public.m10_runtime_assert_eq(
    'reverse second-reversal-leg rollback leaves no reversal movement rows',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = v_transfer_id
        and reversal_of_transaction_id is not null
    ),
    0
  );

  perform public.create_transfer(jsonb_build_object(
    'amount', '62',
    'description', 'Fault reverse original leg update',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-17'
  ));
  select id into v_transfer_id from public.transfers where description = 'Fault reverse original leg update';
  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'reverse_original_leg_update', true);
  begin
    perform public.reverse_transfer(v_transfer_id, 'fault reverse original update rollback');
    raise exception 'reverse original-leg-update fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: reverse_original_leg_update%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('reverse original-leg-update rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq(
    'reverse original-leg-update rollback leaves no reversal movement rows',
    (select count(*)::numeric from public.transactions where transfer_id = v_transfer_id and reversal_of_transaction_id is not null),
    0
  );

  perform public.create_transfer(jsonb_build_object(
    'amount', '63',
    'description', 'Fault reverse transfer status update',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-17'
  ));
  select id into v_transfer_id from public.transfers where description = 'Fault reverse transfer status update';
  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'reverse_transfer_status_update', true);
  begin
    perform public.reverse_transfer(v_transfer_id, 'fault reverse transfer status rollback');
    raise exception 'reverse transfer-status fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: reverse_transfer_status_update%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('reverse transfer-status rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq(
    'reverse transfer-status rollback leaves original transfer posted',
    (select count(*)::numeric from public.transfers where id = v_transfer_id and status = 'posted'),
    1
  );

  perform public.create_transfer(jsonb_build_object(
    'amount', '71',
    'description', 'Fault correct replacement transfer insert original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-18'
  ));

  select id
  into v_transfer_id
  from public.transfers
  where description = 'Fault correct replacement transfer insert original';

  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'correct_replacement_transfer_insert', true);
  begin
    perform public.correct_transfer(
      v_transfer_id,
      'fault correct rollback',
      jsonb_build_object(
        'amount', '72',
        'description', 'Fault correct replacement transfer insert',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001994',
        'transfer_date', '2026-10-19'
      )
    );
    raise exception 'correct fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: correct_replacement_transfer_insert%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('correct replacement-transfer rollback leaves counts and balances unchanged', v_before);

  perform public.m10_runtime_assert_eq(
    'correct replacement-transfer rollback leaves original transfer posted',
    (
      select count(*)::numeric
      from public.transfers
      where id = v_transfer_id
        and status = 'posted'
    ),
    1
  );

  perform public.m10_runtime_assert_eq(
    'correct replacement-transfer rollback leaves no reversal movement rows',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = v_transfer_id
        and reversal_of_transaction_id is not null
    ),
    0
  );

  perform public.m10_runtime_assert_eq(
    'correct replacement-transfer rollback leaves no replacement transfer',
    (
      select count(*)::numeric
      from public.transfers
      where description = 'Fault correct replacement transfer insert'
    ),
    0
  );

  perform public.create_transfer(jsonb_build_object(
    'amount', '73',
    'description', 'Fault correct replacement outflow leg original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-20'
  ));
  select id into v_transfer_id from public.transfers where description = 'Fault correct replacement outflow leg original';
  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'correct_replacement_outflow_leg', true);
  begin
    perform public.correct_transfer(
      v_transfer_id,
      'fault correct replacement outflow rollback',
      jsonb_build_object(
        'amount', '74',
        'description', 'Fault correct replacement outflow leg',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001994',
        'transfer_date', '2026-10-20'
      )
    );
    raise exception 'correct replacement-outflow fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: correct_replacement_outflow_leg%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('correct replacement-outflow rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq('correct replacement-outflow rollback leaves original posted', (select count(*)::numeric from public.transfers where id = v_transfer_id and status = 'posted'), 1);
  perform public.m10_runtime_assert_eq('correct replacement-outflow rollback leaves no replacement rows', (select count(*)::numeric from public.transfers where description = 'Fault correct replacement outflow leg'), 0);

  perform public.create_transfer(jsonb_build_object(
    'amount', '75',
    'description', 'Fault correct replacement inflow leg original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-21'
  ));
  select id into v_transfer_id from public.transfers where description = 'Fault correct replacement inflow leg original';
  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'correct_replacement_inflow_leg', true);
  begin
    perform public.correct_transfer(
      v_transfer_id,
      'fault correct replacement inflow rollback',
      jsonb_build_object(
        'amount', '76',
        'description', 'Fault correct replacement inflow leg',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001994',
        'transfer_date', '2026-10-21'
      )
    );
    raise exception 'correct replacement-inflow fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: correct_replacement_inflow_leg%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('correct replacement-inflow rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq('correct replacement-inflow rollback leaves original posted', (select count(*)::numeric from public.transfers where id = v_transfer_id and status = 'posted'), 1);
  perform public.m10_runtime_assert_eq('correct replacement-inflow rollback leaves no replacement rows', (select count(*)::numeric from public.transfers where description = 'Fault correct replacement inflow leg'), 0);

  perform public.create_transfer(jsonb_build_object(
    'amount', '77',
    'description', 'Fault correct replacement linkage update original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-22'
  ));
  select id into v_transfer_id from public.transfers where description = 'Fault correct replacement linkage update original';
  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'correct_replacement_linkage_update', true);
  begin
    perform public.correct_transfer(
      v_transfer_id,
      'fault correct replacement linkage rollback',
      jsonb_build_object(
        'amount', '78',
        'description', 'Fault correct replacement linkage update',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001994',
        'transfer_date', '2026-10-22'
      )
    );
    raise exception 'correct replacement-linkage fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: correct_replacement_linkage_update%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('correct replacement-linkage rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq('correct replacement-linkage rollback leaves original posted', (select count(*)::numeric from public.transfers where id = v_transfer_id and status = 'posted'), 1);
  perform public.m10_runtime_assert_eq('correct replacement-linkage rollback leaves no replacement rows', (select count(*)::numeric from public.transfers where description = 'Fault correct replacement linkage update'), 0);

  perform public.create_transfer(jsonb_build_object(
    'amount', '79',
    'description', 'Fault correct original status update',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-10-23'
  ));
  select id into v_transfer_id from public.transfers where description = 'Fault correct original status update';
  v_before := public.m10_runtime_state('00000000-0000-4000-8000-000000001991');
  perform set_config('m10_runtime.failpoint', 'correct_original_status_update', true);
  begin
    perform public.correct_transfer(
      v_transfer_id,
      'fault correct original status rollback',
      jsonb_build_object(
        'amount', '80',
        'description', 'Fault correct original status replacement',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001994',
        'transfer_date', '2026-10-23'
      )
    );
    raise exception 'correct original-status fault injection did not raise';
  exception when others then
    if sqlerrm not like '%m10_runtime_injected_failure: correct_original_status_update%' then
      raise;
    end if;
  end;
  perform set_config('m10_runtime.failpoint', '', true);
  perform public.m10_runtime_assert_state_unchanged('correct original-status rollback leaves counts and balances unchanged', v_before);
  perform public.m10_runtime_assert_eq('correct original-status rollback leaves original posted', (select count(*)::numeric from public.transfers where id = v_transfer_id and status = 'posted'), 1);
  perform public.m10_runtime_assert_eq('correct original-status rollback leaves no replacement transfer', (select count(*)::numeric from public.transfers where description = 'Fault correct original status replacement'), 0);
end;
$$;
`,
      { name: "fault-injection-runtime", tempDir },
    );
  } finally {
    psql(
      port,
      database,
      `
drop trigger if exists m10_runtime_fail_transactions on public.transactions;
drop trigger if exists m10_runtime_fail_transaction_updates on public.transactions;
drop trigger if exists m10_runtime_fail_transfers on public.transfers;
drop trigger if exists m10_runtime_fail_transfer_updates on public.transfers;
drop function if exists public.m10_runtime_fail_on_marker();
drop function if exists public.m10_runtime_assert_state_unchanged(text, jsonb);
drop function if exists public.m10_runtime_state(uuid);
`,
      { name: "fault-injection-triggers-drop", tempDir },
    );
  }

  console.log("M10 fault-injection rollback probes passed.");
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
    '00000000-0000-4000-8000-000000001980',
    '00000000-0000-4000-8000-000000001991',
    'M10 Replacement',
    'm10-replacement',
    'checking',
    0,
    '2026-09-01',
    'active',
    null
  ),
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
  ),
  (
    '00000000-0000-4000-8000-000000001997',
    '00000000-0000-4000-8000-000000001991',
    'M10 Closed',
    'm10-closed',
    'checking',
    0,
    '2026-09-01',
    'closed',
    null
  );

insert into public.categories (
  id,
  user_id,
  name,
  normalized_name,
  type,
  sort_order
)
values (
  '00000000-0000-4000-8000-000000001998',
  '00000000-0000-4000-8000-000000001991',
  'M10 Runtime Expense',
  'm10-runtime-expense',
  'variable_expense',
  1
);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000001991';

do $$
declare
  v_created jsonb;
  v_corrected jsonb;
  v_failed jsonb;
  v_forged jsonb;
  v_reversed jsonb;
  v_reversed_transfer_id uuid;
  v_deleted integer;
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
  perform set_config('m10_runtime.user_a_transfer_id', v_transfer_id::text, false);

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
    perform public.reverse_transaction(
      (v_created -> 'outflow' ->> 'id')::uuid,
      'ordinary m09 reversal attempt'
    );
    raise exception 'M09 reverse_transaction accepted transfer leg';
  exception when others then
    if sqlerrm not like '%m09_transaction_conflict%' then
      raise;
    end if;
  end;

  begin
    perform public.correct_transaction(
      (v_created -> 'outflow' ->> 'id')::uuid,
      'ordinary m09 correction attempt',
      jsonb_build_object(
        'amount', '1',
        'description', 'Should fail',
        'transaction_type', 'expense',
        'transaction_date', '2026-09-20',
        'competence_date', '2026-09-20',
        'competence_month', '2026-09-01',
        'category_id', '00000000-0000-4000-8000-000000001998',
        'payment_method', 'pix',
        'account_id', '00000000-0000-4000-8000-000000001993'
      )
    );
    raise exception 'M09 correct_transaction accepted transfer leg';
  exception when others then
    if sqlerrm not like '%m09_transaction_conflict%' then
      raise;
    end if;
  end;

  perform pg_temp.assert_true(
    'M09 direct RPC guard leaves transfer row and legs unchanged',
    exists (
      select 1
      from public.transfers
      where id = v_transfer_id
        and status = 'posted'
    )
      and (
        select count(*) = 2
        from public.transactions
        where transfer_id = v_transfer_id
          and status = 'posted'
          and reversal_of_transaction_id is null
      )
  );

  begin
    update public.transfers
    set user_id = '00000000-0000-4000-8000-000000001992'
    where id = v_transfer_id;
    raise exception 'transfer owner reassignment was not rejected';
  exception when others then
    if sqlstate <> '42501' and sqlerrm not like '%row-level security%' then
      raise;
    end if;
  end;

  perform pg_temp.assert_true(
    'owner reassignment attempt leaves transfer owned by auth.uid',
    exists (
      select 1
      from public.transfers
      where id = v_transfer_id
        and user_id = '00000000-0000-4000-8000-000000001991'
    )
  );

  delete from public.transactions
  where id = (v_created -> 'outflow' ->> 'id')::uuid;
  get diagnostics v_deleted = row_count;
  perform pg_temp.assert_eq('posted transfer leg hard-delete affects zero rows', v_deleted, 0);

  delete from public.transfers
  where id = v_transfer_id;
  get diagnostics v_deleted = row_count;
  perform pg_temp.assert_eq('posted transfer hard-delete affects zero rows', v_deleted, 0);

  insert into public.transactions (
    id,
    user_id,
    transaction_type,
    status,
    description,
    amount,
    currency,
    transaction_date,
    competence_date,
    competence_month,
    category_id,
    payment_method,
    account_id,
    origin_type,
    source_type,
    posted_at
  )
  values (
    '00000000-0000-4000-8000-000000001981',
    '00000000-0000-4000-8000-000000001991',
    'expense',
    'posted',
    'M09 ordinary reversal still works',
    11,
    'BRL',
    '2026-09-20',
    '2026-09-20',
    '2026-09-01',
    '00000000-0000-4000-8000-000000001998',
    'pix',
    '00000000-0000-4000-8000-000000001993',
    'manual',
    'manual',
    now()
  );

  perform public.reverse_transaction(
    '00000000-0000-4000-8000-000000001981',
    'ordinary m09 reversal'
  );

  perform pg_temp.assert_eq(
    'non-transfer M09 reverse still creates one reversal',
    (
      select count(*)::numeric
      from public.transactions
      where reversal_of_transaction_id = '00000000-0000-4000-8000-000000001981'
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
    currency,
    transaction_date,
    competence_date,
    competence_month,
    category_id,
    payment_method,
    account_id,
    origin_type,
    source_type,
    posted_at
  )
  values (
    '00000000-0000-4000-8000-000000001982',
    '00000000-0000-4000-8000-000000001991',
    'expense',
    'posted',
    'M09 ordinary correction still works',
    12,
    'BRL',
    '2026-09-20',
    '2026-09-20',
    '2026-09-01',
    '00000000-0000-4000-8000-000000001998',
    'pix',
    '00000000-0000-4000-8000-000000001993',
    'manual',
    'manual',
    now()
  );

  perform public.correct_transaction(
    '00000000-0000-4000-8000-000000001982',
    'ordinary m09 correction',
    jsonb_build_object(
      'amount', '13',
      'description', 'M09 ordinary correction replacement',
      'transaction_type', 'expense',
      'transaction_date', '2026-09-21',
      'competence_date', '2026-09-21',
      'competence_month', '2026-09-01',
      'category_id', '00000000-0000-4000-8000-000000001998',
      'payment_method', 'pix',
      'account_id', '00000000-0000-4000-8000-000000001993'
    )
  );

  perform pg_temp.assert_true(
    'non-transfer M09 correct still reverses original and posts replacement',
    exists (
      select 1
      from public.transactions
      where id = '00000000-0000-4000-8000-000000001982'
        and status = 'reversed'
    )
      and exists (
        select 1
        from public.transactions
        where description = 'M09 ordinary correction replacement'
          and status = 'posted'
    )
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
      'description', 'Cross user source',
      'source_account_id', '00000000-0000-4000-8000-000000001996',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-09-20'
    ));
    raise exception 'cross-user source transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  v_forged := public.create_transfer(jsonb_build_object(
    'amount', '15',
    'description', 'Forged user payload',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-09-20',
    'user_id', '00000000-0000-4000-8000-000000001992'
  ));

  perform pg_temp.assert_true(
    'forged user_id payload is ignored in favor of auth.uid',
    (v_forged -> 'transfer' ->> 'user_id')::uuid = '00000000-0000-4000-8000-000000001991'
      and not exists (
        select 1
        from public.transfers
        where description = 'Forged user payload'
          and user_id = '00000000-0000-4000-8000-000000001992'
      )
  );

  perform public.reverse_transfer(
    (v_forged -> 'transfer' ->> 'id')::uuid,
    'forged payload fixture cleanup'
  );

  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '10',
      'description', 'Archived destination account',
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

  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '10',
      'description', 'Archived source account',
      'source_account_id', '00000000-0000-4000-8000-000000001995',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-09-20'
    ));
    raise exception 'archived-source transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '10',
      'description', 'Closed source account',
      'source_account_id', '00000000-0000-4000-8000-000000001997',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-09-20'
    ));
    raise exception 'closed-source transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  begin
    perform public.create_transfer(jsonb_build_object(
      'amount', '10',
      'description', 'Closed destination account',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001997',
      'transfer_date', '2026-09-20'
    ));
    raise exception 'closed-destination transfer was not rejected';
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

  begin
    perform public.reverse_transfer(v_transfer_id, 'runtime repeat reversal');
    raise exception 'repeat reverse_transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_conflict%' then
      raise;
    end if;
  end;

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

  v_corrected := public.create_transfer(jsonb_build_object(
    'amount', '40',
    'description', 'Runtime archived source original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-09-25'
  ));
  v_reversed_transfer_id := (v_corrected -> 'transfer' ->> 'id')::uuid;

  update public.accounts
  set status = 'archived', archived_at = now()
  where id = '00000000-0000-4000-8000-000000001993';

  v_corrected := public.correct_transfer(
    v_reversed_transfer_id,
    'runtime archived source preserve',
    jsonb_build_object(
      'amount', '41',
      'description', 'Runtime archived source preserved',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-09-26'
    )
  );

  perform pg_temp.assert_true(
    'correction may preserve unchanged archived source account',
    (v_corrected -> 'replacement' -> 'transfer' ->> 'source_account_id')::uuid =
      '00000000-0000-4000-8000-000000001993'
  );

  v_corrected := public.create_transfer(jsonb_build_object(
    'amount', '42',
    'description', 'Runtime active replacement original',
    'source_account_id', '00000000-0000-4000-8000-000000001980',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-09-26'
  ));
  v_reversed_transfer_id := (v_corrected -> 'transfer' ->> 'id')::uuid;

  begin
    perform public.correct_transfer(
      v_reversed_transfer_id,
      'runtime archived source changed reject',
      jsonb_build_object(
        'amount', '43',
        'description', 'Runtime archived source changed',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001994',
        'transfer_date', '2026-09-27'
      )
    );
    raise exception 'changed archived source correction was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  v_corrected := public.correct_transfer(
    v_reversed_transfer_id,
    'runtime active replacement succeeds',
    jsonb_build_object(
      'amount', '44',
      'description', 'Runtime active replacement succeeds',
      'source_account_id', '00000000-0000-4000-8000-000000001980',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-09-28'
    )
  );

  perform pg_temp.assert_true(
    'correction may change to an active replacement account',
    (v_corrected -> 'replacement' -> 'transfer' ->> 'source_account_id')::uuid =
      '00000000-0000-4000-8000-000000001980'
  );

  update public.accounts
  set status = 'active', archived_at = null
  where id = '00000000-0000-4000-8000-000000001993';

  v_corrected := public.create_transfer(jsonb_build_object(
    'amount', '45',
    'description', 'Runtime closed destination original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001994',
    'transfer_date', '2026-09-29'
  ));
  v_reversed_transfer_id := (v_corrected -> 'transfer' ->> 'id')::uuid;

  update public.accounts
  set status = 'closed'
  where id = '00000000-0000-4000-8000-000000001994';

  v_corrected := public.correct_transfer(
    v_reversed_transfer_id,
    'runtime closed destination preserve',
    jsonb_build_object(
      'amount', '46',
      'description', 'Runtime closed destination preserved',
      'source_account_id', '00000000-0000-4000-8000-000000001993',
      'destination_account_id', '00000000-0000-4000-8000-000000001994',
      'transfer_date', '2026-09-30'
    )
  );

  perform pg_temp.assert_true(
    'correction may preserve unchanged closed destination account',
    (v_corrected -> 'replacement' -> 'transfer' ->> 'destination_account_id')::uuid =
      '00000000-0000-4000-8000-000000001994'
  );

  v_corrected := public.create_transfer(jsonb_build_object(
    'amount', '47',
    'description', 'Runtime closed change original',
    'source_account_id', '00000000-0000-4000-8000-000000001993',
    'destination_account_id', '00000000-0000-4000-8000-000000001980',
    'transfer_date', '2026-10-01'
  ));
  v_reversed_transfer_id := (v_corrected -> 'transfer' ->> 'id')::uuid;

  begin
    perform public.correct_transfer(
      v_reversed_transfer_id,
      'runtime closed destination changed reject',
      jsonb_build_object(
        'amount', '48',
        'description', 'Runtime closed destination changed',
        'source_account_id', '00000000-0000-4000-8000-000000001993',
        'destination_account_id', '00000000-0000-4000-8000-000000001994',
        'transfer_date', '2026-10-02'
      )
    );
    raise exception 'changed closed destination correction was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;

  update public.accounts
  set status = 'active'
  where id = '00000000-0000-4000-8000-000000001994';

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
      current_setting('m10_runtime.user_a_transfer_id')::uuid,
      'cross user reversal'
    );
    raise exception 'cross-user reverse_transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_conflict%' then
      raise;
    end if;
  end;

  begin
    perform public.correct_transfer(
      current_setting('m10_runtime.user_a_transfer_id')::uuid,
      'cross user correction',
      jsonb_build_object(
        'amount', '16',
        'description', 'Cross user correction replacement',
        'source_account_id', '00000000-0000-4000-8000-000000001996',
        'destination_account_id', '00000000-0000-4000-8000-000000001996',
        'transfer_date', '2026-09-20'
      )
    );
    raise exception 'cross-user correct_transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_conflict%' then
      raise;
    end if;
  end;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '';

do $$
begin
  begin
    perform public.create_transfer('{}'::jsonb);
    raise exception 'authenticated without sub create_transfer was not rejected';
  exception when others then
    if sqlerrm not like '%m10_transfer_validation%' then
      raise;
    end if;
  end;
end;
$$;

set role anon;
set request.jwt.claim.sub = '';

do $$
begin
  begin
    perform public.create_transfer('{}'::jsonb);
    raise exception 'anon create_transfer was not rejected';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.reverse_transfer(
      '00000000-0000-4000-8000-000000001981',
      'anon'
    );
    raise exception 'anon reverse_transfer was not rejected';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.correct_transfer(
      '00000000-0000-4000-8000-000000001981',
      'anon',
      '{}'::jsonb
    );
    raise exception 'anon correct_transfer was not rejected';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.reverse_transaction(
      '00000000-0000-4000-8000-000000001981',
      'anon'
    );
    raise exception 'anon reverse_transaction was not rejected';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.correct_transaction(
      '00000000-0000-4000-8000-000000001981',
      'anon',
      '{}'::jsonb
    );
    raise exception 'anon correct_transaction was not rejected';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
`;

class PsqlBackedSupabase {
  constructor(port, database, tempDir, userId) {
    this.database = database;
    this.port = port;
    this.tempDir = tempDir;
    this.userId = userId;
  }

  from(table) {
    return new PsqlBackedQuery({
      database: this.database,
      port: this.port,
      table,
      tempDir: this.tempDir,
      userId: this.userId,
    });
  }
}

class PsqlBackedQuery {
  constructor(options) {
    this.columns = "*";
    this.filters = [];
    this.orders = [];
    this.options = options;
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({ ascending: options.ascending !== false, column });
    return this;
  }

  async maybeSingle() {
    const { data, error } = await this.execute();

    if (error) {
      return { data: null, error };
    }

    if (data.length > 1) {
      return {
        data: null,
        error: { message: "Expected at most one row from psql-backed query." },
      };
    }

    return { data: data[0] ?? null, error: null };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const selectList = this.columns
      .split(",")
      .map((column) => quoteIdentifier(column.trim()))
      .join(", ");
    const where =
      this.filters.length > 0
        ? `where ${this.filters
            .map(
              (filter) =>
                `${quoteIdentifier(filter.column)} = ${sqlLiteral(filter.value)}`,
            )
            .join(" and ")}`
        : "";
    const orderBy =
      this.orders.length > 0
        ? `order by ${this.orders
            .map(
              (order) =>
                `${quoteIdentifier(order.column)} ${
                  order.ascending ? "asc" : "desc"
                }`,
            )
            .join(", ")}`
        : "";
    const result = psqlScalar(
      this.options.port,
      this.options.database,
      `
set role authenticated;
set request.jwt.claim.sub = ${sqlLiteral(this.options.userId)};
select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)::text
from (
  select ${selectList}
  from public.${quoteIdentifier(this.options.table)}
  ${where}
  ${orderBy}
) q;
reset role;
`,
      {
        name: `repo-query-${this.options.table}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`,
        tempDir: this.options.tempDir,
      },
    );

    return { data: JSON.parse(result || "[]"), error: null };
  }
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }

  return `"${value}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function scaledMoney(value) {
  const sign = value.startsWith("-") ? -1n : 1n;
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");

  return sign * (BigInt(integer) * 10000n + BigInt(fraction.padEnd(4, "0")));
}

function moneyFromScaled(value) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const integer = absolute / 10000n;
  const fraction = (absolute % 10000n).toString().padStart(4, "0");

  return `${sign}${integer}.${fraction}`;
}

async function runM10RealBalanceIntegrationCheck(port, database, tempDir) {
  const userId = "00000000-0000-4000-8000-000000002991";
  const accountA = "00000000-0000-4000-8000-000000002993";
  const accountB = "00000000-0000-4000-8000-000000002994";
  const accountC = "00000000-0000-4000-8000-000000002995";

  const { SupabaseAccountRepository } = await jiti.import(
    "../src/infrastructure/accounts/supabase-account-repository.ts",
  );
  const { asAccountId, calculateAccountBalance } = await jiti.import(
    "../src/domain/accounts/index.ts",
  );
  const { asUserId } = await jiti.import("../src/domain/shared/index.ts");

  psql(
    port,
    database,
    `
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
values (
  '${userId}',
  'authenticated',
  'authenticated',
  'm10-balance@example.invalid',
  'synthetic',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{"display_name":"M10 Balance User"}'::jsonb
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
  ('${accountA}', '${userId}', 'Balance A', 'balance-a', 'checking', 100, '2026-09-01', 'active', null),
  ('${accountB}', '${userId}', 'Balance B', 'balance-b', 'checking', 20, '2026-09-01', 'active', null),
  ('${accountC}', '${userId}', 'Balance C', 'balance-c', 'checking', 0, '2026-09-01', 'active', null);
`,
    { name: "real-balance-setup", tempDir },
  );

  const repository = new SupabaseAccountRepository(
    new PsqlBackedSupabase(port, database, tempDir, userId),
  );
  const context = { userId: asUserId(userId) };
  const accounts = {
    A: await repository.findById(context, asAccountId(accountA)),
    B: await repository.findById(context, asAccountId(accountB)),
    C: await repository.findById(context, asAccountId(accountC)),
  };

  if (!accounts.A || !accounts.B || !accounts.C) {
    throw new Error(
      "M10 real balance integration setup accounts were not found.",
    );
  }

  async function actualBalances() {
    const entries = await Promise.all(
      Object.entries(accounts).map(async ([key, account]) => {
        const movements = await repository.getBalanceMovements(
          context,
          account,
        );
        const balance = calculateAccountBalance(account, movements);

        return [key, balance.amount];
      }),
    );
    const balances = Object.fromEntries(entries);
    const combined = moneyFromScaled(
      Object.values(balances).reduce(
        (total, value) => total + scaledMoney(value),
        0n,
      ),
    );

    return { ...balances, combined };
  }

  async function assertBalances(label, expected) {
    const actual = await actualBalances();

    for (const [key, value] of Object.entries(expected)) {
      if (actual[key] !== value) {
        throw new Error(
          `M10 real balance integration failed after ${label}: expected ${key}=${value}, got ${actual[key]}. Full balances: ${JSON.stringify(
            actual,
          )}`,
        );
      }
    }
  }

  await assertBalances("initial state", {
    A: "100.0000",
    B: "20.0000",
    C: "0.0000",
    combined: "120.0000",
  });

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${userId}';

select public.create_transfer(jsonb_build_object(
  'amount', '30.0000',
  'description', 'M10 real balance A to B 30',
  'source_account_id', '${accountA}',
  'destination_account_id', '${accountB}',
  'transfer_date', '2026-10-24'
));
`,
    { name: "real-balance-create", tempDir },
  );

  await assertBalances("A to B transfer", {
    A: "70.0000",
    B: "50.0000",
    C: "0.0000",
    combined: "120.0000",
  });

  const firstTransferId = psqlScalar(
    port,
    database,
    `
select id
from public.transfers
where description = 'M10 real balance A to B 30'
  and user_id = '${userId}';
`,
    { name: "real-balance-first-id", tempDir },
  );

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${userId}';
select public.reverse_transfer('${firstTransferId}', 'real balance reverse');
`,
    { name: "real-balance-reverse", tempDir },
  );

  await assertBalances("reverse", {
    A: "100.0000",
    B: "20.0000",
    C: "0.0000",
    combined: "120.0000",
  });

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${userId}';

select public.create_transfer(jsonb_build_object(
  'amount', '30.0000',
  'description', 'M10 real balance correction original 30',
  'source_account_id', '${accountA}',
  'destination_account_id', '${accountB}',
  'transfer_date', '2026-10-25'
));
`,
    { name: "real-balance-correction-original", tempDir },
  );

  const correctionOriginalId = psqlScalar(
    port,
    database,
    `
select id
from public.transfers
where description = 'M10 real balance correction original 30'
  and user_id = '${userId}';
`,
    { name: "real-balance-correction-original-id", tempDir },
  );

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${userId}';
select public.correct_transfer(
  '${correctionOriginalId}',
  'real balance correct to 10',
  jsonb_build_object(
    'amount', '10.0000',
    'description', 'M10 real balance correction replacement 10',
    'source_account_id', '${accountA}',
    'destination_account_id', '${accountB}',
    'transfer_date', '2026-10-26'
  )
);
`,
    { name: "real-balance-correct-to-10", tempDir },
  );

  await assertBalances("correction to 10", {
    A: "90.0000",
    B: "30.0000",
    C: "0.0000",
    combined: "120.0000",
  });

  const replacementId = psqlScalar(
    port,
    database,
    `
select id
from public.transfers
where description = 'M10 real balance correction replacement 10'
  and user_id = '${userId}';
`,
    { name: "real-balance-replacement-id", tempDir },
  );

  psql(
    port,
    database,
    `
set role authenticated;
set request.jwt.claim.sub = '${userId}';
select public.correct_transfer(
  '${replacementId}',
  'real balance change destination to C',
  jsonb_build_object(
    'amount', '10.0000',
    'description', 'M10 real balance destination C replacement 10',
    'source_account_id', '${accountA}',
    'destination_account_id', '${accountC}',
    'transfer_date', '2026-10-27'
  )
);
`,
    { name: "real-balance-destination-change", tempDir },
  );

  await assertBalances("destination change B to C", {
    A: "90.0000",
    B: "20.0000",
    C: "10.0000",
    combined: "120.0000",
  });

  const finalReplacementId = psqlScalar(
    port,
    database,
    `
select id
from public.transfers
where description = 'M10 real balance destination C replacement 10'
  and user_id = '${userId}';
`,
    { name: "real-balance-final-replacement-id", tempDir },
  );

  psql(
    port,
    database,
    `
do $$
begin
  perform public.m10_runtime_assert_eq(
    'real balance original reversed transfer does not remain posted',
    (
      select count(*)::numeric
      from public.transfers
      where user_id = '${userId}'
        and description in ('M10 real balance correction original 30', 'M10 real balance correction replacement 10')
        and status = 'posted'
    ),
    0
  );

  perform public.m10_runtime_assert_eq(
    'real balance final replacement is the only posted transfer effect',
    (
      select count(*)::numeric
      from public.transfers
      where user_id = '${userId}'
        and description = 'M10 real balance destination C replacement 10'
        and status = 'posted'
    ),
    1
  );

  perform public.m10_runtime_assert_eq(
    'real balance reversal lifecycle rows are not posted transfer rows',
    (
      select count(*)::numeric
      from public.transactions
      where user_id = '${userId}'
        and reversal_of_transaction_id is not null
        and status = 'posted'
    ),
    0
  );

  perform public.m10_runtime_assert_eq(
    'real balance final posted transfer has exactly two posted linked legs',
    (
      select count(*)::numeric
      from public.transactions
      where transfer_id = '${finalReplacementId}'
        and status = 'posted'
        and transaction_type = 'transfer'
        and payment_method = 'bank_transfer'
        and category_id is null
    ),
    2
  );
end;
$$;
`,
    { name: "real-balance-structural-asserts", tempDir },
  );

  console.log("M10 real M07 balance integration passed.");
}

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
    await runM10ConcurrentLifecycleChecks(port, database, tempDir);
    runM10FaultInjectionChecks(port, database, tempDir);
    await runM10RealBalanceIntegrationCheck(port, database, tempDir);

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
