import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = process.cwd();
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260915000100_m03_database_physical_foundation.sql",
);
const seedPath = path.join(repoRoot, "supabase", "seed.sql");

const expectedEnums = {
  transaction_type: ["income", "expense", "transfer", "investment"],
  transaction_status: ["draft", "posted", "voided", "reversed"],
  payment_method: [
    "cash",
    "debit",
    "credit_card",
    "pix",
    "bank_transfer",
    "boleto",
    "benefit_food",
    "benefit_meal",
    "benefit_culture",
    "other",
  ],
  category_type: [
    "income",
    "fixed_expense",
    "variable_expense",
    "investment",
    "transfer",
  ],
  account_type: [
    "checking",
    "savings",
    "wallet",
    "cash",
    "investment",
    "benefit",
    "other",
  ],
  account_status: ["active", "archived", "closed"],
  credit_card_status: ["active", "paused", "archived", "closed"],
  installment_plan_status: ["active", "completed", "cancelled", "archived"],
  installment_status: ["scheduled", "posted", "cancelled", "skipped"],
  recurrence_frequency: ["weekly", "monthly", "yearly"],
  recurrence_status: ["active", "paused", "ended", "cancelled"],
  recurrence_target_type: [
    "transaction",
    "financial_commitment",
    "event",
    "task",
    "subscription",
    "annual_obligation",
  ],
  invoice_status: [
    "open",
    "closed",
    "due",
    "overdue",
    "partially_paid",
    "paid",
    "cancelled",
  ],
  invoice_item_type: [
    "purchase",
    "installment",
    "fee",
    "interest",
    "adjustment",
    "refund",
  ],
  invoice_payment_status: ["draft", "posted", "reversed"],
  invoice_payment_type: ["payment", "payment_reversal"],
  invoice_adjustment_type: [
    "manual_adjustment",
    "interest",
    "fee",
    "refund",
    "payment_reversal",
  ],
  event_type: [
    "personal",
    "financial",
    "payment",
    "income",
    "invoice",
    "annual_obligation",
    "subscription",
    "task",
    "other",
  ],
  event_status: ["scheduled", "completed", "cancelled", "archived"],
  task_status: ["pending", "completed", "cancelled", "archived"],
  task_priority: ["low", "medium", "high", "urgent"],
  commitment_type: ["income", "expense", "investment", "transfer"],
  commitment_status: [
    "expected",
    "confirmed",
    "overdue",
    "realized",
    "cancelled",
  ],
  budget_status: ["draft", "active", "closed", "archived"],
  planning_item_status: [
    "planned",
    "expected",
    "committed",
    "realized",
    "cancelled",
  ],
  financial_goal_type: [
    "save",
    "reduce_expense",
    "increase_income",
    "pay_debt",
    "net_worth",
    "purchase",
  ],
  financial_goal_status: [
    "active",
    "completed",
    "paused",
    "archived",
    "cancelled",
  ],
  simulation_status: ["draft", "active", "archived"],
  shopping_list_status: ["active", "archived", "deleted"],
  shopping_item_status: ["open", "purchased", "skipped", "deleted"],
  wishlist_status: [
    "desired",
    "evaluating",
    "purchased",
    "discarded",
    "archived",
  ],
  subscription_status: ["active", "paused", "cancelled", "archived"],
  asset_type: [
    "cash",
    "investment",
    "vehicle",
    "property",
    "personal_item",
    "other",
  ],
  liability_type: [
    "credit_card",
    "loan",
    "financing",
    "tax",
    "manual",
    "other",
  ],
  annual_obligation_type: [
    "ipva",
    "iptu",
    "insurance",
    "annuity",
    "professional_fee",
    "maintenance",
    "other",
  ],
  obligation_status: [
    "draft",
    "active",
    "partially_paid",
    "paid",
    "overdue",
    "cancelled",
    "archived",
  ],
  provision_status: ["active", "paused", "completed", "cancelled"],
  indicator_code: ["selic", "cdi", "ipca", "di", "usd_brl", "other"],
  indicator_value_type: ["actual", "estimated", "assumption"],
  import_batch_status: [
    "uploaded",
    "processing",
    "parsed",
    "reviewing",
    "ready_to_commit",
    "committed",
    "failed",
    "cancelled",
  ],
  import_item_status: [
    "parsed",
    "included",
    "excluded",
    "duplicate_suspected",
    "committed",
    "failed",
  ],
  origin_type: [
    "manual",
    "import",
    "recurrence",
    "installment",
    "invoice",
    "subscription",
    "annual_obligation",
    "event",
    "task",
    "simulation",
    "system_job",
    "migration",
  ],
  audit_severity: ["info", "warning", "critical"],
};

const expectedPublicTables = [
  "profiles",
  "user_roles",
  "accounts",
  "credit_cards",
  "categories",
  "transactions",
  "transfers",
  "installment_plans",
  "installments",
  "recurrence_rules",
  "recurrence_occurrences",
  "credit_card_invoices",
  "invoice_items",
  "invoice_payments",
  "budgets",
  "budget_lines",
  "planning_items",
  "financial_goals",
  "simulation_scenarios",
  "simulation_scenario_versions",
  "events",
  "tasks",
  "financial_commitments",
  "shopping_lists",
  "shopping_list_items",
  "wishlist_items",
  "subscriptions",
  "assets",
  "asset_valuations",
  "liabilities",
  "liability_balances",
  "annual_obligations",
  "annual_obligation_installments",
  "provisions",
  "economic_indicators",
  "economic_indicator_values",
  "import_batches",
  "import_items",
  "merchant_category_mappings",
  "audit_logs",
  "system_job_runs",
  "admin_observability_metrics",
];

const ownedTables = [
  "accounts",
  "credit_cards",
  "categories",
  "transactions",
  "transfers",
  "installment_plans",
  "installments",
  "recurrence_rules",
  "recurrence_occurrences",
  "credit_card_invoices",
  "invoice_items",
  "invoice_payments",
  "budgets",
  "budget_lines",
  "planning_items",
  "financial_goals",
  "simulation_scenarios",
  "simulation_scenario_versions",
  "events",
  "tasks",
  "financial_commitments",
  "shopping_lists",
  "shopping_list_items",
  "wishlist_items",
  "subscriptions",
  "assets",
  "asset_valuations",
  "liabilities",
  "liability_balances",
  "annual_obligations",
  "annual_obligation_installments",
  "provisions",
  "import_batches",
  "import_items",
  "merchant_category_mappings",
];

const deleteDeniedTables = [
  "transfers",
  "installment_plans",
  "installments",
  "recurrence_occurrences",
  "credit_card_invoices",
  "invoice_items",
  "financial_commitments",
  "asset_valuations",
  "liability_balances",
  "annual_obligation_installments",
  "provisions",
  "import_batches",
  "import_items",
];

const conditionalDeletePolicies = {
  transactions:
    "create policy transactions_delete_draft_owner on public.transactions for delete to authenticated using (user_id = auth.uid() and status = 'draft')",
  invoice_payments:
    "create policy invoice_payments_delete_draft_owner on public.invoice_payments for delete to authenticated using (user_id = auth.uid() and status = 'draft')",
  budgets:
    "create policy budgets_delete_draft_owner on public.budgets for delete to authenticated using (user_id = auth.uid() and status = 'draft')",
  annual_obligations:
    "create policy annual_obligations_delete_draft_owner on public.annual_obligations for delete to authenticated using (user_id = auth.uid() and status = 'draft')",
};

const ownerDeleteAllowedTables = [
  "accounts",
  "credit_cards",
  "categories",
  "recurrence_rules",
  "budget_lines",
  "planning_items",
  "financial_goals",
  "simulation_scenarios",
  "simulation_scenario_versions",
  "events",
  "tasks",
  "shopping_lists",
  "shopping_list_items",
  "wishlist_items",
  "subscriptions",
  "assets",
  "liabilities",
  "merchant_category_mappings",
];

const requiredIndexesOrConstraints = [
  "accounts_user_status_name_idx",
  "credit_cards_user_status_name_idx",
  "categories_user_parent_type_name_idx",
  "transactions_user_date_desc_idx",
  "transactions_user_date_type_idx",
  "transactions_user_category_date_idx",
  "transactions_user_account_date_idx",
  "transactions_user_credit_card_date_idx",
  "transactions_user_competence_month_type_idx",
  "credit_card_invoices_user_card_month_idx",
  "invoice_items_user_invoice_idx",
  "invoice_payments_user_invoice_payment_date_idx",
  "recurrence_occurrences_rule_date_target_uniq",
  "import_items_batch_line_fingerprint_uniq",
  "merchant_category_mappings_user_merchant_uniq",
  "system_job_runs_job_idempotency_uniq",
  "admin_observability_metric_idx",
  "migration_entity_map_source_target_uniq",
];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function compact(sql) {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

function extractEnumValues(sql, enumName) {
  const pattern = new RegExp(
    `create\\s+type\\s+public\\.${enumName}\\s+as\\s+enum\\s*\\(([^;]+)\\)`,
    "i",
  );
  const match = sql.match(pattern);

  if (!match) {
    return null;
  }

  return [...match[1].matchAll(/'([^']+)'/g)].map(
    (valueMatch) => valueMatch[1],
  );
}

function extractCreateTableBlock(sql, schemaName, tableName) {
  const pattern = new RegExp(
    `create\\s+table\\s+${schemaName}\\.${tableName}\\s*\\((.*?)\\n\\);`,
    "is",
  );
  const match = sql.match(pattern);

  return match ? compact(match[1]) : null;
}

function arraysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function fail(message, failures) {
  failures.push(message);
}

export function verifyM03Schema({ migrationSql, seedSql }) {
  const failures = [];
  const normalized = compact(migrationSql);

  for (const [enumName, expectedValues] of Object.entries(expectedEnums)) {
    const actualValues = extractEnumValues(migrationSql, enumName);

    if (!actualValues) {
      fail(`Missing enum ${enumName}.`, failures);
    } else if (!arraysEqual(actualValues, expectedValues)) {
      fail(
        `Enum ${enumName} mismatch. Expected ${expectedValues.join(", ")}; got ${actualValues.join(", ")}.`,
        failures,
      );
    }
  }

  for (const tableName of expectedPublicTables) {
    if (!normalized.includes(`create table public.${tableName} `)) {
      fail(`Missing public table ${tableName}.`, failures);
    }

    const hasLiteralRls = normalized.includes(
      `alter table public.${tableName} enable row level security`,
    );
    const hasDynamicRls =
      normalized.includes("enable row level security") &&
      normalized.includes(`'${tableName}'`);

    if (!hasLiteralRls && !hasDynamicRls) {
      fail(`Missing RLS enablement for public.${tableName}.`, failures);
    }
  }

  for (const tableName of ownedTables) {
    if (
      !normalized.includes(`${tableName}_user_id_id_key unique (user_id, id)`)
    ) {
      fail(`Missing composite ownership key for ${tableName}.`, failures);
    }
  }

  for (const name of requiredIndexesOrConstraints) {
    if (!normalized.includes(name.toLowerCase())) {
      fail(`Missing required index/constraint ${name}.`, failures);
    }
  }

  if (!normalized.includes("create schema if not exists migration_ops")) {
    fail("Missing migration_ops schema for AFR migration metadata.", failures);
  }

  for (const migrationTable of [
    "migration_batches",
    "migration_entity_map",
    "migration_quarantine_records",
    "migration_reconciliation_reports",
  ]) {
    if (!normalized.includes(`create table migration_ops.${migrationTable} `)) {
      fail(`Missing migration metadata table ${migrationTable}.`, failures);
    }
  }

  if (
    !normalized.includes("values ('invoice-imports', 'invoice-imports', false")
  ) {
    fail(
      "Storage bucket invoice-imports is not configured as private.",
      failures,
    );
  }

  if (/owned_rows_delete/i.test(migrationSql)) {
    fail(
      "Blanket owned_rows_delete policy name detected; DELETE policies must remain explicit by table/class.",
      failures,
    );
  }

  if (
    /execute\s+format\s*\(\s*'create policy[^']*for delete/i.test(migrationSql)
  ) {
    fail(
      "Dynamic CREATE POLICY ... FOR DELETE detected; DELETE policies must not be generated by a blanket loop.",
      failures,
    );
  }

  for (const tableName of deleteDeniedTables) {
    const deletePolicyPattern = new RegExp(
      `on\\s+public\\.${tableName}\\s+for\\s+delete\\s+to\\s+authenticated`,
      "i",
    );

    if (deletePolicyPattern.test(normalized)) {
      fail(
        `Unexpected authenticated DELETE policy for hard-delete denied table ${tableName}.`,
        failures,
      );
    }
  }

  for (const [tableName, expectedPolicy] of Object.entries(
    conditionalDeletePolicies,
  )) {
    if (!normalized.includes(expectedPolicy)) {
      fail(
        `Missing conditional draft-only authenticated DELETE policy for ${tableName}.`,
        failures,
      );
    }
  }

  for (const tableName of ownerDeleteAllowedTables) {
    const expectedPolicy = `create policy ${tableName}_delete_owner on public.${tableName} for delete to authenticated using (user_id = auth.uid())`;

    if (!normalized.includes(expectedPolicy)) {
      fail(
        `Missing explicit owner DELETE policy for class C table ${tableName}.`,
        failures,
      );
    }
  }

  const transactionsBlock = extractCreateTableBlock(
    migrationSql,
    "public",
    "transactions",
  );

  if (!transactionsBlock?.includes("amount numeric(19,4) not null,")) {
    fail(
      "transactions.amount must remain numeric(19,4) and NOT NULL.",
      failures,
    );
  }

  if (
    !transactionsBlock?.includes(
      "constraint transactions_amount_non_negative check (amount >= 0)",
    )
  ) {
    fail(
      "transactions.amount must enforce the global non-negative money_decimal invariant.",
      failures,
    );
  }

  if (
    !transactionsBlock?.includes(
      "constraint transactions_posted_amount_positive check (status <> 'posted' or amount > 0)",
    )
  ) {
    fail(
      "transactions.amount must enforce > 0 specifically for posted transactions.",
      failures,
    );
  }

  const annualInstallmentBlock = extractCreateTableBlock(
    migrationSql,
    "public",
    "annual_obligation_installments",
  );

  if (
    !annualInstallmentBlock?.includes(
      "amount numeric(19,4) not null check (amount > 0)",
    )
  ) {
    fail(
      "annual_obligation_installments.amount must reject zero-value installments.",
      failures,
    );
  }

  if (/check\s*\(\s*true\s*\)/i.test(migrationSql)) {
    fail("Semantic no-op CHECK (true) constraint detected.", failures);
  }

  for (const expectedComment of [
    "comment on table public.provisions is",
    "comment on table public.admin_observability_metrics is",
  ]) {
    if (!normalized.includes(expectedComment)) {
      fail(`Missing documentation comment: ${expectedComment}.`, failures);
    }
  }

  const permissivePolicyLines = migrationSql
    .split(/\r?\n/)
    .filter((line) => /using\s*\(\s*true\s*\)/i.test(line));
  const unexpectedPermissivePolicies = permissivePolicyLines.filter(
    (line) =>
      !line.includes("economic_indicators_authenticated_read") &&
      !line.includes("economic_indicator_values_authenticated_read"),
  );

  if (unexpectedPermissivePolicies.length > 0) {
    fail(
      `Unexpected permissive USING (true) policy outside approved macro reference data: ${unexpectedPermissivePolicies.join(" | ")}.`,
      failures,
    );
  }

  for (const forbiddenPattern of [
    /\bcurrent_balance\b/i,
    /\bdouble\s+precision\b/i,
    /\breal\b/i,
    /\bsecurity\s+definer\b/i,
    /service_role\s*=/i,
    /password\s+text/i,
  ]) {
    if (forbiddenPattern.test(migrationSql)) {
      fail(`Forbidden pattern detected: ${forbiddenPattern}.`, failures);
    }
  }

  for (const seedCode of ["selic", "cdi", "ipca", "di", "usd_brl"]) {
    if (!seedSql.includes(`'${seedCode}'`)) {
      fail(`Missing deterministic macro seed for ${seedCode}.`, failures);
    }
  }

  if (!/on\s+conflict\s*\(code\)\s+do\s+update/i.test(seedSql)) {
    fail("Seed file is not idempotent on economic_indicators.code.", failures);
  }

  return failures;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const failures = verifyM03Schema({
    migrationSql: read(migrationPath),
    seedSql: read(seedPath),
  });

  if (failures.length > 0) {
    console.error("M03 schema verification failed:");

    for (const failure of failures) {
      console.error(`- ${failure}`);
    }

    process.exitCode = 1;
  } else {
    console.log("M03 schema verification passed.");
  }
}
