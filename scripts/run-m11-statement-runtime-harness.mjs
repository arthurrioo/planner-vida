import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
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

const userA = "00000000-0000-4000-8000-000000011991";
const userB = "00000000-0000-4000-8000-000000011992";
const accountA = "00000000-0000-4000-8000-000000011993";
const accountB = "00000000-0000-4000-8000-000000011994";
const accountC = "00000000-0000-4000-8000-000000011995";
const cardA = "00000000-0000-4000-8000-000000011996";
const incomeCategory = "00000000-0000-4000-8000-000000011997";
const expenseCategory = "00000000-0000-4000-8000-000000011998";
const marketSubcategory = "00000000-0000-4000-8000-000000011999";
const investmentCategory = "00000000-0000-4000-8000-000000012000";
const foreignCategory = "00000000-0000-4000-8000-000000012001";
const foreignAccount = "00000000-0000-4000-8000-000000012002";

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

const setupSql = `
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
    '${userA}',
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
    '${userB}',
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
  ('${accountA}', '${userA}', 'Conta A', 'conta-a', 'checking', 100, '2026-09-01'),
  ('${accountB}', '${userA}', 'Conta B', 'conta-b', 'savings', 0, '2026-09-01'),
  ('${accountC}', '${userA}', 'Conta C', 'conta-c', 'checking', 0, '2026-09-01'),
  ('${foreignAccount}', '${userB}', 'Conta B User', 'conta-b-user', 'checking', 500, '2026-09-01');

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
  '${cardA}',
  '${userA}',
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
  ('${incomeCategory}', '${userA}', 'Receitas', 'receitas', 'income', null),
  ('${expenseCategory}', '${userA}', 'Compras', 'compras', 'variable_expense', null),
  ('${marketSubcategory}', '${userA}', 'Mercado', 'mercado', 'variable_expense', '${expenseCategory}'),
  ('${investmentCategory}', '${userA}', 'Investimentos', 'investimentos', 'investment', null),
  ('${foreignCategory}', '${userB}', 'Despesas B', 'despesas-b', 'variable_expense', null);
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
    psql(port, database, setupSql, { name: "setup", tempDir });
    await runRealPathM11Checks(port, database, tempDir);

    console.log("M11 statement runtime harness passed.");
  } finally {
    spawnSync("pg_ctl", ["--pgdata", dataDir, "--wait", "stop"], {
      encoding: "utf8",
      stdio: "ignore",
    });
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

async function runRealPathM11Checks(port, database, tempDir) {
  const { AccountService } = await jiti.import(
    "../src/domain/accounts/index.ts",
  );
  const { StatementService } = await jiti.import(
    "../src/domain/statements/index.ts",
  );
  const { TransactionService } = await jiti.import(
    "../src/domain/transactions/index.ts",
  );
  const { TransferService } = await jiti.import(
    "../src/domain/transfers/index.ts",
  );
  const { asUserId } = await jiti.import("../src/domain/shared/index.ts");
  const { SupabaseAccountRepository } = await jiti.import(
    "../src/infrastructure/accounts/index.ts",
  );
  const {
    SupabaseTransactionReferenceRepository,
    SupabaseTransactionRepository,
  } = await jiti.import("../src/infrastructure/transactions/index.ts");
  const { SupabaseTransferReferenceRepository, SupabaseTransferRepository } =
    await jiti.import("../src/infrastructure/transfers/index.ts");

  const clientA = new PsqlBackedSupabase(port, database, tempDir, userA);
  const clientB = new PsqlBackedSupabase(port, database, tempDir, userB);
  const contextA = { userId: asUserId(userA) };
  const contextB = { userId: asUserId(userB) };
  const accountRepository = new SupabaseAccountRepository(clientA);
  const accountService = new AccountService({ repository: accountRepository });
  const transactionRepository = new SupabaseTransactionRepository(clientA);
  const transactionReferences = new SupabaseTransactionReferenceRepository(
    clientA,
  );
  const transactionService = new TransactionService({
    references: transactionReferences,
    repository: transactionRepository,
  });
  const foreignTransactionService = new TransactionService({
    references: new SupabaseTransactionReferenceRepository(clientB),
    repository: new SupabaseTransactionRepository(clientB),
  });
  const transferService = new TransferService({
    references: new SupabaseTransferReferenceRepository(clientA),
    repository: new SupabaseTransferRepository(clientA),
  });
  const statementService = new StatementService({
    accountService,
    references: transactionReferences,
    transactions: transactionRepository,
  });
  const foreignStatementService = new StatementService({
    accountService: new AccountService({
      repository: new SupabaseAccountRepository(clientB),
    }),
    references: new SupabaseTransactionReferenceRepository(clientB),
    transactions: new SupabaseTransactionRepository(clientB),
  });

  await transactionService.createTransaction(contextA, {
    accountId: accountA,
    amount: "50.0000",
    categoryId: incomeCategory,
    description: "M11 income A",
    paymentMethod: "pix",
    transactionDate: "2026-09-10",
    transactionType: "income",
  });
  await transactionService.createTransaction(contextA, {
    accountId: accountA,
    amount: "20.0000",
    categoryId: marketSubcategory,
    description: "M11 expense A",
    paymentMethod: "pix",
    transactionDate: "2026-09-11",
    transactionType: "expense",
  });
  await transactionService.createTransaction(contextA, {
    accountId: accountA,
    amount: "10.0000",
    categoryId: investmentCategory,
    description: "M11 investment A",
    paymentMethod: "bank_transfer",
    transactionDate: "2026-09-12",
    transactionType: "investment",
  });
  await transactionService.createTransaction(contextA, {
    amount: "40.0000",
    categoryId: marketSubcategory,
    creditCardId: cardA,
    description: "M11 card no account impact",
    paymentMethod: "credit_card",
    transactionDate: "2026-09-13",
    transactionType: "expense",
  });
  const baseTransfer = await transferService.createTransfer(contextA, {
    amount: "30.0000",
    description: "M11 transfer A to B",
    destinationAccountId: accountB,
    sourceAccountId: accountA,
    transferDate: "2026-09-14",
  });

  await assertBalances(accountService, contextA, "base financial scenario", {
    "Conta A": "90.0000",
    "Conta B": "30.0000",
    "Conta C": "0.0000",
    combined: "120.0000",
  });

  let statement = await statementService.getStatement(contextA, {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    pageSize: "50",
  });
  assertEqual(
    "base statement includes income, expense, investment, card, and transfer legs",
    statement.entries.length,
    6,
  );
  assert(
    "credit-card row appears in statement",
    statement.entries.some(
      (entry) => entry.transaction.description === "M11 card no account impact",
    ),
  );
  assert(
    "transfer legs route to M10 transfer lifecycle",
    statement.entries
      .filter((entry) => entry.transaction.transactionType === "transfer")
      .every(
        (entry) =>
          entry.detailPath ===
          `/app/financeiro/transferencias/${baseTransfer.transfer.id}`,
      ),
  );

  await assertStatementCount(
    statementService,
    contextA,
    "type filter",
    { transactionType: "transfer" },
    2,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "account filter",
    { accountId: accountA },
    4,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "card filter",
    { creditCardId: cardA },
    1,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "category filter",
    { categoryId: marketSubcategory },
    2,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "method filter",
    { paymentMethod: "bank_transfer" },
    3,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "status filter",
    { status: "posted" },
    6,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "date filter",
    { dateFrom: "2026-09-11", dateTo: "2026-09-13" },
    3,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "search filter",
    { query: "card no account" },
    1,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "combined filters",
    {
      accountId: accountA,
      dateFrom: "2026-09-10",
      dateTo: "2026-09-12",
      paymentMethod: "pix",
      transactionType: "expense",
    },
    1,
  );

  await foreignTransactionService.createTransaction(contextB, {
    accountId: foreignAccount,
    amount: "9.0000",
    categoryId: foreignCategory,
    description: "M11 foreign transaction",
    paymentMethod: "pix",
    transactionDate: "2026-09-15",
    transactionType: "expense",
  });
  await assertStatementCount(
    foreignStatementService,
    contextB,
    "foreign user sees only own row",
    {},
    1,
  );
  await assertStatementCount(
    statementService,
    contextA,
    "owner A cannot see foreign row",
    { query: "foreign transaction" },
    0,
  );
  await assertStatementCount(
    foreignStatementService,
    contextB,
    "owner B cannot infer owner A account rows",
    { accountId: accountA },
    0,
  );

  const voided = await transactionService.createTransaction(contextA, {
    accountId: accountA,
    amount: "10.0000",
    categoryId: incomeCategory,
    description: "M11 voided income",
    paymentMethod: "pix",
    transactionDate: "2026-09-16",
    transactionType: "income",
  });
  await transactionService.voidTransaction(contextA, voided.id, {
    reason: "M11 void proof",
  });
  await assertBalances(accountService, contextA, "void excludes transaction", {
    "Conta A": "90.0000",
    "Conta B": "30.0000",
    "Conta C": "0.0000",
    combined: "120.0000",
  });

  const reversed = await transactionService.createTransaction(contextA, {
    accountId: accountA,
    amount: "5.0000",
    categoryId: marketSubcategory,
    description: "M11 reversed expense",
    paymentMethod: "pix",
    transactionDate: "2026-09-17",
    transactionType: "expense",
  });
  await transactionService.reverseTransaction(contextA, reversed.id, {
    reason: "M11 reverse proof",
  });
  await assertBalances(accountService, contextA, "reverse excludes both rows", {
    "Conta A": "90.0000",
    "Conta B": "30.0000",
    "Conta C": "0.0000",
    combined: "120.0000",
  });

  const corrected = await transactionService.createTransaction(contextA, {
    accountId: accountA,
    amount: "20.0000",
    categoryId: marketSubcategory,
    description: "M11 correction original expense",
    paymentMethod: "pix",
    transactionDate: "2026-09-18",
    transactionType: "expense",
  });
  const replacement = await transactionService.updateTransaction(
    contextA,
    corrected.id,
    {
      accountId: accountA,
      amount: "7.0000",
      categoryId: marketSubcategory,
      description: "M11 correction replacement expense",
      paymentMethod: "pix",
      transactionDate: "2026-09-18",
      transactionType: "expense",
    },
  );
  await assertBalances(
    accountService,
    contextA,
    "correction replacement only",
    {
      "Conta A": "83.0000",
      "Conta B": "30.0000",
      "Conta C": "0.0000",
      combined: "113.0000",
    },
  );
  statement = await statementService.getStatement(contextA, {
    pageSize: "100",
    query: "M11 correction",
  });
  assert(
    "corrected replacement remains posted in statement",
    statement.entries.some(
      (entry) =>
        entry.transaction.id === replacement.id &&
        entry.transaction.status === "posted",
    ),
  );
  assert(
    "M09 lifecycle statuses are visible in statement",
    (
      await statementService.getStatement(contextA, {
        pageSize: "100",
        status: "reversed",
      })
    ).entries.length >= 3,
  );

  await transferService.reverseTransfer(contextA, baseTransfer.transfer.id, {
    reason: "M11 reverse transfer proof",
  });
  await assertBalances(accountService, contextA, "reverse transfer", {
    "Conta A": "113.0000",
    "Conta B": "0.0000",
    "Conta C": "0.0000",
    combined: "113.0000",
  });
  const transferForCorrection = await transferService.createTransfer(contextA, {
    amount: "30.0000",
    description: "M11 correction transfer 30",
    destinationAccountId: accountB,
    sourceAccountId: accountA,
    transferDate: "2026-09-19",
  });
  await transferService.updateTransfer(
    contextA,
    transferForCorrection.transfer.id,
    {
      amount: "10.0000",
      description: "M11 correction transfer 10",
      destinationAccountId: accountB,
      sourceAccountId: accountA,
      transferDate: "2026-09-19",
    },
  );
  await assertBalances(accountService, contextA, "transfer correction to 10", {
    "Conta A": "103.0000",
    "Conta B": "10.0000",
    "Conta C": "0.0000",
    combined: "113.0000",
  });
  const replacementTransferId = psqlScalar(
    port,
    database,
    `
select id
from public.transfers
where user_id = '${userA}'
  and description = 'M11 correction transfer 10';
`,
    { name: "replacement-transfer-id", tempDir },
  );
  await transferService.updateTransfer(contextA, replacementTransferId, {
    amount: "10.0000",
    description: "M11 correction transfer destination C",
    destinationAccountId: accountC,
    sourceAccountId: accountA,
    transferDate: "2026-09-20",
  });
  await assertBalances(
    accountService,
    contextA,
    "transfer destination change",
    {
      "Conta A": "103.0000",
      "Conta B": "0.0000",
      "Conta C": "10.0000",
      combined: "113.0000",
    },
  );

  await createTiedPaginationDataset({
    contextA,
    database,
    port,
    tempDir,
    transactionService,
    transferService,
  });
  await assertDeterministicPagination(statementService, contextA);

  psql(
    port,
    database,
    `
update public.accounts
set status = 'closed', archived_at = now()
where id = '${accountB}';

update public.categories
set archived_at = now()
where id = '${expenseCategory}';
`,
    { name: "historical-context-archive", tempDir },
  );
  statement = await statementService.getStatement(contextA, {
    query: "M11 expense A",
  });
  assertEqual(
    "archived category label remains available through real statement path",
    statement.entries[0]?.categoryLabel,
    "Compras / Mercado",
  );

  assertAnonDenied(port, database, tempDir);
}

async function createTiedPaginationDataset({
  contextA,
  database,
  port,
  tempDir,
  transactionService,
  transferService,
}) {
  const fixedTimestamp = "2026-09-28 08:00:00+00";

  for (let index = 0; index < 12; index += 1) {
    await transactionService.createTransaction(contextA, {
      accountId: accountA,
      amount: "1.0000",
      categoryId: marketSubcategory,
      description: `Tie row ${String(index).padStart(2, "0")}`,
      paymentMethod: "pix",
      transactionDate: "2026-09-28",
      transactionType: "expense",
    });
  }

  await transferService.createTransfer(contextA, {
    amount: "2.0000",
    description: "Tie transfer stable",
    destinationAccountId: accountC,
    sourceAccountId: accountA,
    transferDate: "2026-09-28",
  });

  psql(
    port,
    database,
    `
update public.transactions
set created_at = '${fixedTimestamp}', updated_at = '${fixedTimestamp}'
where user_id = '${userA}'
  and transaction_date = '2026-09-28'
  and description ilike '%Tie%';
`,
    { name: "tie-timestamp-update", tempDir },
  );
}

async function assertDeterministicPagination(statementService, context) {
  const full = await statementService.getStatement(context, {
    dateFrom: "2026-09-28",
    dateTo: "2026-09-28",
    pageSize: "50",
    query: "Tie",
  });
  const pages = [];

  for (let page = 1; page <= 3; page += 1) {
    pages.push(
      await statementService.getStatement(context, {
        dateFrom: "2026-09-28",
        dateTo: "2026-09-28",
        page: String(page),
        pageSize: "5",
        query: "Tie",
      }),
    );
  }

  const fullIds = full.entries.map((entry) => entry.transaction.id);
  const pagedIds = pages.flatMap((page) =>
    page.entries.map((entry) => entry.transaction.id),
  );
  const expectedIds = [...full.entries]
    .sort(compareStatementEntries)
    .map((entry) => entry.transaction.id);

  assertEqual("tied pagination full result count", fullIds.length, 14);
  assertEqual("tied pagination concatenated count", pagedIds.length, 14);
  assertEqual("tied pagination has no duplicates", new Set(pagedIds).size, 14);
  assertDeepEqual(
    "tied pagination matches full query order",
    pagedIds,
    fullIds,
  );
  assertDeepEqual(
    "tied pagination uses transaction_date, created_at, id order",
    fullIds,
    expectedIds,
  );
  assert(
    "tied transfer legs remain visible and stable",
    full.entries.filter(
      (entry) =>
        entry.transaction.transactionType === "transfer" &&
        entry.transaction.description?.includes("Tie transfer stable"),
    ).length === 2,
  );
}

function compareStatementEntries(left, right) {
  return (
    right.transaction.transactionDate.localeCompare(
      left.transaction.transactionDate,
    ) ||
    (right.transaction.createdAt ?? "").localeCompare(
      left.transaction.createdAt ?? "",
    ) ||
    right.transaction.id.localeCompare(left.transaction.id)
  );
}

async function assertStatementCount(service, context, label, input, expected) {
  const result = await service.getStatement(context, {
    ...input,
    pageSize: "100",
  });

  assertEqual(label, result.entries.length, expected);
}

async function assertBalances(service, context, label, expected) {
  const accounts = await service.listAccounts(context);
  const balances = Object.fromEntries(
    accounts.map((account) => [account.name, account.balance.amount]),
  );
  const combined = sumMoneyStrings(
    accounts
      .filter((account) =>
        ["Conta A", "Conta B", "Conta C"].includes(account.name),
      )
      .map((account) => account.balance.amount),
  );

  for (const [key, value] of Object.entries(expected)) {
    const actual = key === "combined" ? combined : balances[key];

    assertEqual(`${label} ${key}`, actual, value);
  }
}

function sumMoneyStrings(values) {
  return moneyFromScaled(
    values.reduce((total, value) => total + scaledMoney(value), 0n),
  );
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

function assert(description, condition) {
  if (!condition) {
    throw new Error(`M11 runtime assertion failed: ${description}`);
  }
}

function assertEqual(description, actual, expected) {
  if (actual !== expected) {
    throw new Error(
      `M11 runtime assertion failed: ${description}, expected ${expected}, got ${actual}`,
    );
  }
}

function assertDeepEqual(description, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `M11 runtime assertion failed: ${description}, expected ${expectedJson}, got ${actualJson}`,
    );
  }
}

function assertAnonDenied(port, database, tempDir) {
  psql(
    port,
    database,
    `
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
`,
    { name: "anon-denied", tempDir },
  );
}

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

  async rpc(functionName, args = {}) {
    const sql = rpcSql(functionName, args, this.userId);

    try {
      const result = psqlScalar(this.port, this.database, sql, {
        name: `rpc-${functionName}-${Date.now()}-${randomSuffix()}`,
        tempDir: this.tempDir,
      });

      return { data: JSON.parse(result), error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          code:
            error instanceof Error && error.message.includes("P0001")
              ? "P0001"
              : "XX000",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}

class PsqlBackedQuery {
  constructor(options) {
    this.columns = "*";
    this.countMode = null;
    this.filters = [];
    this.head = false;
    this.limitCount = null;
    this.mutation = null;
    this.offsetCount = null;
    this.orders = [];
    this.options = options;
  }

  select(columns, options = {}) {
    this.columns = columns;
    this.countMode = options.count ?? null;
    this.head = options.head === true;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, operator: "=", value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ column, operator: ">=", value });
    return this;
  }

  ilike(column, value) {
    this.filters.push({ column, operator: "ilike", value });
    return this;
  }

  is(column, value) {
    this.filters.push({ column, operator: "is", value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ column, operator: "<=", value });
    return this;
  }

  or(expression) {
    this.filters.push({ expression, operator: "or" });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({
      ascending: options.ascending !== false,
      column,
      nullsFirst: options.nullsFirst === true,
    });
    return this;
  }

  limit(limit) {
    this.limitCount = limit;
    return this;
  }

  range(from, to) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  insert(payload) {
    this.mutation = { payload, type: "insert" };
    return this;
  }

  update(payload) {
    this.mutation = { payload, type: "update" };
    return this;
  }

  async single() {
    const { data, error } = await this.execute();

    if (error) {
      return { data: null, error };
    }

    if (data.length !== 1) {
      return {
        data: null,
        error: { code: "PGRST116", message: "Expected exactly one row." },
      };
    }

    return { data: data[0], error: null };
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
    const result = psqlScalar(
      this.options.port,
      this.options.database,
      this.toSql(),
      {
        name: `query-${this.options.table}-${Date.now()}-${randomSuffix()}`,
        tempDir: this.options.tempDir,
      },
    );
    const parsed = JSON.parse(result || "{}");

    return {
      count: parsed.count ?? null,
      data: parsed.data ?? null,
      error: null,
    };
  }

  toSql() {
    const where = this.whereSql();
    const orderBy = this.orderSql();
    const pagination = this.paginationSql();

    if (this.countMode === "exact" && this.head) {
      return authenticatedSql(
        this.options.userId,
        `
select jsonb_build_object(
  'data', null,
  'count', count(*)
)::text
from public.${quoteIdentifier(this.options.table)}
${where};
`,
      );
    }

    if (this.mutation?.type === "insert") {
      const payload = this.mutation.payload;
      const columns = Object.keys(payload).filter(
        (key) => payload[key] !== undefined,
      );
      const values = columns.map((column) => sqlLiteral(payload[column]));

      return authenticatedSql(
        this.options.userId,
        `
with changed as (
  insert into public.${quoteIdentifier(this.options.table)} (
    ${columns.map(quoteIdentifier).join(", ")}
  )
  values (${values.join(", ")})
  returning ${selectList(this.columns)}
)
select jsonb_build_object(
  'data', coalesce(jsonb_agg(to_jsonb(changed)), '[]'::jsonb),
  'count', null
)::text
from changed;
`,
      );
    }

    if (this.mutation?.type === "update") {
      const assignments = Object.entries(this.mutation.payload)
        .filter(([, value]) => value !== undefined)
        .map(
          ([column, value]) =>
            `${quoteIdentifier(column)} = ${sqlLiteral(value)}`,
        )
        .join(", ");

      return authenticatedSql(
        this.options.userId,
        `
with changed as (
  update public.${quoteIdentifier(this.options.table)}
  set ${assignments}
  ${where}
  returning ${selectList(this.columns)}
)
select jsonb_build_object(
  'data', coalesce(jsonb_agg(to_jsonb(changed)), '[]'::jsonb),
  'count', null
)::text
from changed;
`,
      );
    }

    return authenticatedSql(
      this.options.userId,
      `
select jsonb_build_object(
  'data', coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb),
  'count', null
)::text
from (
  select ${selectList(this.columns)}
  from public.${quoteIdentifier(this.options.table)}
  ${where}
  ${orderBy}
  ${pagination}
) q;
`,
    );
  }

  whereSql() {
    if (this.filters.length === 0) {
      return "";
    }

    return `where ${this.filters.map(filterSql).join(" and ")}`;
  }

  orderSql() {
    if (this.orders.length === 0) {
      return "";
    }

    return `order by ${this.orders
      .map(
        (order) =>
          `${quoteIdentifier(order.column)} ${order.ascending ? "asc" : "desc"}${
            order.nullsFirst ? " nulls first" : ""
          }`,
      )
      .join(", ")}`;
  }

  paginationSql() {
    return [
      this.limitCount === null ? "" : `limit ${Number(this.limitCount)}`,
      this.offsetCount === null ? "" : `offset ${Number(this.offsetCount)}`,
    ]
      .filter(Boolean)
      .join(" ");
  }
}

function filterSql(filter) {
  if (filter.operator === "or") {
    return `(${filter.expression
      .split(",")
      .map((part) => {
        const [column, operator, ...rest] = part.split(".");
        const value = rest.join(".");

        if (operator !== "eq") {
          throw new Error(`Unsupported PostgREST or expression: ${part}`);
        }

        return `${quoteIdentifier(column)} = ${sqlLiteral(value)}`;
      })
      .join(" or ")})`;
  }

  if (filter.operator === "is") {
    return filter.value === null
      ? `${quoteIdentifier(filter.column)} is null`
      : `${quoteIdentifier(filter.column)} is not distinct from ${sqlLiteral(
          filter.value,
        )}`;
  }

  return `${quoteIdentifier(filter.column)} ${filter.operator} ${sqlLiteral(
    filter.value,
  )}`;
}

function rpcSql(functionName, args, userId) {
  const calls = {
    correct_transaction: () =>
      `select public.correct_transaction(
        ${sqlLiteral(args.p_transaction_id)}::uuid,
        ${sqlLiteral(args.p_reversal_reason)},
        ${jsonbLiteral(args.p_replacement)}
      )::text;`,
    correct_transfer: () =>
      `select public.correct_transfer(
        ${sqlLiteral(args.p_transfer_id)}::uuid,
        ${sqlLiteral(args.p_reversal_reason)},
        ${jsonbLiteral(args.p_replacement)}
      )::text;`,
    create_transfer: () =>
      `select public.create_transfer(${jsonbLiteral(args.p_transfer)})::text;`,
    reverse_transaction: () =>
      `select public.reverse_transaction(
        ${sqlLiteral(args.p_transaction_id)}::uuid,
        ${sqlLiteral(args.p_reversal_reason)}
      )::text;`,
    reverse_transfer: () =>
      `select public.reverse_transfer(
        ${sqlLiteral(args.p_transfer_id)}::uuid,
        ${sqlLiteral(args.p_reversal_reason)}
      )::text;`,
  };
  const call = calls[functionName];

  if (!call) {
    throw new Error(`Unsupported RPC in M11 harness: ${functionName}`);
  }

  return authenticatedSql(userId, call());
}

function authenticatedSql(userId, body) {
  return `
set role authenticated;
set request.jwt.claim.sub = ${sqlLiteral(userId)};
${body}
reset role;
`;
}

function selectList(columns) {
  if (columns === "*") {
    return "*";
  }

  return columns
    .split(",")
    .map((column) => quoteIdentifier(column.trim()))
    .join(", ");
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }

  return `"${value}"`;
}

function sqlLiteral(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonbLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function randomSuffix() {
  return Math.random().toString(16).slice(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
