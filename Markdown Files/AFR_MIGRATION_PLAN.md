# Planner Vida - AFR_MIGRATION_PLAN.md

Status: FROZEN v1.0 - Migration Strategy for Planner Vida Phase 1  
Primary target contract: `DATABASE_SCHEMA.md` - Frozen Phase 1 Data Contract v1.0  
Functional source references:

- `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`
- `PLANNER_PHASE_1_SPEC.md`

This document defines how to migrate the current AFR Controle Financeiro data model into the Planner Vida Phase 1 data contract safely. It does not redesign the frozen schema, does not create SQL migrations, does not define API/frontend/deploy work, and does not advance into `PHASE_1_IMPLEMENTATION_PLAN.md`.

The migration must be repeatable, deterministic, idempotent, auditable, reconciliable, testable multiple times in DEV/test, and safe for a final controlled PROD execution. It must not be a disposable one-shot script.

---

# 1. Executive Summary

The source system is AFR Controle Financeiro, a React/Vite/TypeScript/Supabase financial control application with a rich personal finance domain: users, roles, accounts, credit cards, categories, transactions, transfers, installments, recurrences, credit card invoices, invoice payments, budgets, goals, simulations, PDF invoice imports, merchant/category learning, reports, and audit records.

The destination state is Planner Vida Phase 1, governed by `DATABASE_SCHEMA.md` as the Frozen Phase 1 Data Contract v1.0. Planner Vida preserves AFR feature parity, but replaces fragile source structures with explicit domain tables and stronger source-of-truth separation:

- `transactions` are realized facts.
- `financial_commitments` are future expected/committed items.
- `planning_items` are plans, not firm obligations.
- `provisions` are economic accruals, not payments.
- `simulation_scenarios` and `simulation_scenario_versions` are hypothetical analysis only.

The largest structural differences are:

- AFR installment purchases use a fake parent transaction with `installment_number = 0` plus child transactions; Planner Vida uses `installment_plans`, `installments`, and realized `transactions`.
- AFR invoices are partially trigger-derived; Planner Vida uses explicit `credit_card_invoices`, `invoice_items`, and `invoice_payments`.
- AFR recurring behavior is embedded in transaction creation semantics; Planner Vida uses `recurrence_rules` and `recurrence_occurrences`.
- AFR category enums mix Portuguese and English; Planner Vida uses canonical internal enums.
- AFR date handling includes timezone workarounds; Planner Vida treats financial dates as date-only local business dates.
- AFR simulator payloads are free JSON; Planner Vida stores versioned scenario containers and immutable scenario versions.

The general migration strategy is:

1. Freeze or snapshot the AFR source.
2. Extract source data read-only.
3. Transform into canonical Planner Vida entities using stable legacy-to-new mappings.
4. Load in dependency order using upsert/idempotency keys.
5. Quarantine invalid or ambiguous records instead of silently correcting or dropping them.
6. Reconcile counts, monthly P&L, account balances, invoices, installments, categories, goals, simulations, imports, and mappings.
7. Repeat in DEV/test until idempotency and reconciliation pass.
8. Execute a short, controlled production cutover with AFR read-only and Planner Vida released only after validation.

Main risks:

- fake parent installment transactions causing double counting;
- trigger-derived invoice totals diverging from item totals;
- recurrence semantics being insufficiently explicit in legacy data;
- date shifts around month boundaries;
- category/payment enum inconsistencies;
- historical data inconsistencies that reports previously tolerated;
- simulation JSON incompatibility;
- dedupe ambiguity for imported invoice items;
- incomplete provenance for legacy PDFs and invoice payments.

The migration is complete only when all expected users and critical entities are mapped, all critical FK ownership checks pass, no cross-user relationships exist, monetary reconciliation has no unexplained differences, idempotent rerun is successful, blocking anomalies are resolved, quarantined records are explicitly reviewed, and manual sampling passes.

---

# 2. Migration Scope

## In scope

The migration must preserve or map all AFR data needed for Planner Vida Phase 1 feature parity:

- profiles;
- user roles;
- accounts;
- credit cards;
- categories and subcategories;
- transactions;
- transfers;
- installment parent/child structures;
- recurrence-related transaction structures or source concepts;
- credit card invoices;
- invoice payments, paid status, paid interest, and hidden-from-report flags;
- budgets;
- financial goals;
- simulation scenarios and simulator payloads;
- investment summary data where available;
- invoice PDF import batches/items or equivalent historical import records;
- imported transactions and imported installment data;
- merchant/category mappings;
- audit logs that are relevant and practically available;
- reporting-relevant historical financial data;
- source metadata needed for traceability, reconciliation, and rollback investigation.

## Out of scope

The following are outside this migration plan:

- redesigning `DATABASE_SCHEMA.md`;
- changing frozen Phase 1 data contract decisions;
- creating SQL migrations;
- creating TypeScript, API routes, frontend, jobs, or deployment scripts;
- creating `PHASE_1_IMPLEMENTATION_PLAN.md`;
- implementing new Planner Vida modules that have no AFR source data;
- migrating non-existent AFR modules such as full vehicle/home/travel modules unless represented in source data;
- creating Phase 2 features;
- implementing CDC or dual-write architecture;
- generating new native Planner Vida records that should be created after cutover;
- copying AFR code parity, triggers, Supabase project IDs, URLs, keys, Lovable configuration, or Deno function structure;
- inventing missing source data such as historical PDF storage paths or detailed payment splits not present in AFR;
- resolving product decisions not already frozen by silently changing historical semantics.

---

# 3. Source System Inventory

This inventory is limited to the legacy entities and concepts supported by the source documents. When a physical table name is not confirmed by the documents, it is marked as `logical/source concept - physical table name to confirm`.

| Legacy name | Function | Main data | Relationships | Important functional rule | Known risks | Probable Planner Vida target |
|---|---|---|---|---|---|---|
| `profiles` | User profile | `id`, `username`, `created_at`, `last_login` | Auth user; `user_roles`; all financial data by user | Username unique; profile tied to authenticated user | Auth/profile inconsistency; email may be synthetic or absent | `profiles` |
| `user_roles` | RBAC | `user_id`, `role` | `profiles` | Admin unlocks admin panel in AFR | Admin must not become cross-user financial access in Planner | `user_roles`, `audit_logs` |
| `accounts` | Bank/wallet/investment/savings accounts | `id`, `user_id`, `name`, `type`, `balance`, `institution`, `description`, `overdraft_limit`, `created_at` | `transactions.account_id`; card preferred account | `balance` acts as initial/base balance; real balance is calculated | Legacy `balance/current balance` may be misunderstood as source of truth | `accounts.opening_balance`, `accounts.opening_balance_date`, status fields |
| `credit_cards` | Credit card configuration | `name`, `credit_limit`, `brand`, `account_id`, `closing_day`, `due_day` | Invoices and card transactions | Purchases assigned to invoice by closing/due cycle | Missing/invalid closing or due day; archived cards | `credit_cards` |
| `categories` | Category tree | `name`, `type`, `parent_id` | Transactions, budgets, goals, merchant mappings | Root category plus subcategory; type inherited/compatible | Mixed enums Portuguese/English; duplicate names; deleted in-use categories | `categories` |
| `transactions` | Realized financial facts and legacy container for installments/recurrences/transfers | `type`, `description`, `amount`, `category_id`, `subcategory_id`, `payment_method`, `account_id`, `credit_card_id`, `date`, `installments`, `installment_number`, `parent_transaction_id`, `source_account_id`, `destination_account_id` | Accounts, cards, categories, parent/children, transfers | Parent installment record uses `installment_number = 0` and should be ignored by reports | Double counting, fake parents, inconsistent payment methods, timezone shifts | `transactions`, `transfers`, `installment_plans`, `installments`, `recurrence_*`, `invoice_items` |
| Transfer transaction concept | Transfers between accounts | Source account, destination account, amount, date | `accounts` source/destination | Transfer does not enter P&L | May be represented as one transaction with both accounts or paired rows | `transfers` plus linked transfer transactions if used |
| Installment transaction group | Parcelled purchase | Parent and children, amount, dates, installment numbers | `transactions.parent_transaction_id` | Parent is semantic control record, not real financial fact | Missing parent/children; quantity/value mismatches; rounding | `installment_plans`, `installments`, realized `transactions`, `financial_commitments` for future if needed |
| Recurrence source concept - physical table name to confirm | Repeated transactions | Frequency/count/created occurrences if persisted | Transactions and future generated items | Recurrences between 1 and 24 in AFR behavior | Metadata may be missing; duplicates may already exist | `recurrence_rules`, `recurrence_occurrences`, target entities |
| `budgets` | Monthly category planning | `id`, `user_id`, `category_id`, `month`, `planned_amount` | Categories; monthly actuals | Unique per user/category/month | Legacy model is simpler than Planner budget envelope | `budgets`, `budget_lines`; maybe `planning_items` only when explicit item exists |
| `credit_card_invoices` | Invoice cycle and payment state | `credit_card_id`, `reference_month`, `due_date`, `closing_date`, `total_amount`, `paid_amount`, `paid_interest`, `status`, `paid_at`, `is_hidden` | Cards, card transactions | Created/updated from card transactions; paid with optional interest; hidden flag independent | Trigger totals may diverge from items; status enum differs | `credit_card_invoices`, `invoice_items`, `invoice_payments` |
| Invoice payment concept - physical table name to confirm | Payment of invoice | Paid amount, interest, paid_at, account when available | Invoice, account, transaction if represented | Payment reduces account balance, purchase does not | AFR may store only aggregate paid fields, not detailed multiple payments | `invoice_payments` and payment `transactions` when evidence exists |
| `financial_goals` | User goals | `goal_type`, `title`, `target_amount`, `target_percentage`, `target_date`, `category_id`, `credit_card_id`, `status`, `baseline_amount` | Categories/cards/accounts as applicable | Progress depends on goal type and historical calculations | Baseline may have been recalculated dynamically; category enum inconsistency | `financial_goals` with persisted baseline fields |
| `simulation_scenarios` | What-if scenarios | `name`, `simulation_months`, `modifications` JSON | User, categories, goals | Up to 5 scenarios; analysis only | JSON free-form/incompatible; no versioning | `simulation_scenarios`, `simulation_scenario_versions` |
| `investment_summary` | Investment position summary | `gross_value`, `update_date`, `user_id` | User; investment transactions | Total applied from investment transactions, gross value manual | Not a granular portfolio | `assets`, `asset_valuations`, possibly reference-only migration note |
| `category_mappings` | Merchant/category learning | `merchant_key`, `category_id`, `hit_count`, `last_used_at` | User/category/imports | Merchant normalized; mapping used for future suggestions | Category deleted/archived; merchant normalization version may differ | `merchant_category_mappings` |
| Invoice PDF import concept - physical table names to confirm | PDF parsing and review | Card, reference month, file metadata, parsed lines, reviewed lines, parser metadata | Cards, invoices, transactions, mappings | Human review before save; dedupe before commit | PDFs may not be retained; passwords must not be persisted | `import_batches`, `import_items`, `merchant_category_mappings`, audit |
| `audit_logs` | Governance and sensitive operations | actor, action, resource, before/after, IP/user agent, success/error | Users, admin operations, import parsing | Sensitive operations logged | May include sensitive details not suitable for admin observability | `audit_logs`, sanitized where needed |
| `notifications` | Global notifications | Message/status data | Users/admin | Optional/may be out of core migration | Not central to Phase 1 financial migration | Out of scope unless needed for audit history; otherwise reference-only |
| `rate_limit_violations` | Security telemetry | Attempts, actor/context | Auth/admin/import | Security monitoring | May include technical/IP data | Reference-only or aggregated audit/security import if retained |
| `credit_availability_*`, `credit_lines`, `credit_update_date` | Credit availability module | Preapproved limits, credit lines | Accounts/cards | Optional/melhorar in AFR context | Not part of frozen core migration unless exact tables/data confirmed and target exists | Out of scope for this migration unless separately mapped to liabilities/assets later |

---

# 4. Target Mapping Matrix

| AFR Source | Planner Vida Target | Migration Type | Notes |
|---|---|---|---|
| `profiles` | `profiles` | direct/transformed | Preserve `id` when aligned to auth user; add defaults for `default_currency`, `default_timezone`, `locale`. |
| `user_roles` | `user_roles` | direct/transformed | Preserve `user`/`admin`; add grant metadata when available, otherwise mark as migrated/system-granted. |
| `accounts` | `accounts` | transformed | `balance` becomes `opening_balance`; derive or set `opening_balance_date`; map type/status/currency. |
| `credit_cards` | `credit_cards` | transformed | Preserve card identity, limit, brand, preferred payment account, closing/due days, status. |
| `categories` | `categories` | transformed | Map Portuguese enum values to canonical `category_type`; preserve parent/subcategory within max depth 2. |
| `transactions` normal income/expense/investment | `transactions` | transformed | Canonical enums, date-only financial dates, origin `migration`, source traceability. |
| `transactions` transfers | `transfers` + `transactions` if target service uses linked rows | split | Preserve source/destination accounts; keep out of P&L. |
| `transactions` credit-card purchase | `transactions` + `invoice_items` + `credit_card_invoices` | split | Card purchase remains realized purchase fact; account balance not reduced until invoice payment. |
| `transactions` installment parent/children | `installment_plans` + `installments` + `transactions` | rebuilt/split | Fake parent becomes plan metadata only; child rows become installments and realized transactions where applicable. |
| Legacy recurrence | `recurrence_rules` + `recurrence_occurrences` + target entities | rebuilt/transformed | Preserve rule/history/future separately; do not generate duplicates. |
| `credit_card_invoices` | `credit_card_invoices` | transformed | Rebuild totals from items where possible; preserve hidden flag separately. |
| Card purchases assigned to invoices | `invoice_items` | derived/rebuilt | Derived from card transactions/installments/import items and invoice cycle. |
| Legacy invoice payment aggregate | `invoice_payments` | transformed/rebuilt | Use detailed payments when available; otherwise create documented aggregate payment fallback. |
| `budgets` | `budgets` + `budget_lines` | split/transformed | Monthly/category row becomes monthly budget envelope plus one line. |
| Legacy budget actuals | No direct persisted migration | reference-only/derived | Actuals remain derived from `transactions`, not copied as planning data. |
| `financial_goals` | `financial_goals` | transformed | Preserve baseline if available; otherwise create auditable migrated baseline snapshot. |
| `simulation_scenarios.modifications` JSON | `simulation_scenarios` + `simulation_scenario_versions` | split/transformed | Store legacy payload in versioned `inputs_payload`; validate or quarantine incompatible payloads. |
| `investment_summary` | `assets` + `asset_valuations` or reference-only | transformed/reference-only | If used as position snapshot, create migrated investment asset/valuation; avoid portfolio engine invention. |
| Historical invoice import records | `import_batches` | transformed | Preserve file metadata only if available; do not invent `storage_path`. |
| Historical parsed/reviewed import lines | `import_items` | transformed | Preserve parser/review data, transaction/item links, dedupe keys. |
| Imported transactions | `transactions`, `installment_plans`, `installments`, `invoice_items` | direct/transformed/split | Link via import batch/item mappings. |
| `category_mappings` | `merchant_category_mappings` | direct/transformed | Recompute merchant key only if normalization is versioned and comparable; otherwise preserve legacy key. |
| `audit_logs` | `audit_logs` | transformed/reference-only | Preserve feasible historical audit logs; redact/avoid secrets; add migration audit logs. |
| Legacy jobs/triggers | `system_job_runs` | deprecated/reference-only | Do not migrate triggers as behavior; migration batches may be logged as job-like operational records. |
| Legacy notifications | None or future notification module | reference-only/deprecated | Out of core migration unless product requires historical notifications. |
| Rate limit/security telemetry | `audit_logs` or operational archive | reference-only | Only migrate if useful and sanitized. |

---

# 5. Migration Dependency Order

Recommended dependency order:

1. Migration control structures: `migration_batches`, `migration_entity_map`, quarantine/anomaly structures if implemented outside the frozen app schema.
2. Auth/profile pre-validation.
3. `profiles`.
4. `user_roles`.
5. `categories` root records.
6. `categories` subcategories.
7. `accounts`.
8. `credit_cards`.
9. Stage/classify legacy `transactions` into migration worksets without loading ambiguous posted rows yet.
10. Load standalone realized `transactions`: non-installment, non-recurring, non-transfer, non-invoice-payment facts.
11. `transfers` and linked transfer transactions if applicable.
12. `installment_plans`.
13. `installments`.
14. Realized installment child `transactions`, linked to `installments`; create future `financial_commitments` only where the legacy data clearly represents future expected obligations and not historical realized facts.
15. `recurrence_rules`.
16. `recurrence_occurrences` and their materialized targets, respecting already-realized history.
17. `credit_card_invoices`.
18. `invoice_items`, linked to card purchase transactions and/or installments.
19. `invoice_payments` and payment transactions/links.
20. `budgets`.
21. `budget_lines`.
22. `planning_items` only for explicit legacy planned items; do not infer from budgets or simulations.
23. `financial_goals`.
24. `simulation_scenarios`.
25. `simulation_scenario_versions`.
26. Import history: `import_batches`.
27. Import lines: `import_items`.
28. `merchant_category_mappings`.
29. Investment summary migration to `assets`/`asset_valuations` where supported.
30. Historical `audit_logs`.
31. Migration-generated `audit_logs`, final mapping statuses, reconciliation artifacts.

This order avoids orphan records and double counting because ownership (`profiles`) exists before owned data, parent categories exist before subcategories, accounts/cards/categories exist before financial facts, installment structures exist before installment child transactions are finalized, recurrence structures exist before future targets are materialized, invoices exist before invoice items/payments, and import/audit links can reference the entities created earlier. Legacy transactions must be classified before loading so fake installment parents, invoice payments, transfers, and recurring/future records cannot accidentally enter the target as ordinary posted facts.

---

# 6. User Identity Mapping

Planner Vida Phase 1 is individual by `user_id`; no household/shared ownership is introduced.

Mapping rules:

- `profiles.id` should align with the authenticated user id whenever the AFR auth/profile relationship is valid.
- If AFR `profiles.id` already equals the auth user id, preserve it.
- If AFR auth user id and profile id diverge, migration must block that user until resolved or map using an explicit reviewed identity mapping file/table.
- `email` should use real email when available. Synthetic AFR emails such as `username@financeiro.app` may be migrated only if they are the actual auth email and clearly flagged as legacy/synthetic for later user remediation.
- `username` migrates to `profiles.username` after normalization and uniqueness validation.
- `display_name` should use the best available username/display value, without inventing personal names.
- `default_timezone` defaults to `America/Sao_Paulo` unless a reliable user-specific timezone exists.
- `default_currency` defaults to `BRL`.
- `locale` defaults to `pt-BR`.
- Roles migrate to `user_roles`; admin role does not grant human access to other users' financial data.

Pre-migration validation:

- every financial row must have a resolvable owner;
- every owner must map to exactly one `profiles.id`;
- no source row may point to a different user's account/card/category;
- every admin role must reference an existing profile;
- auth/profile mismatches must be `blocking error` unless explicitly remediated before migration.

---

# 7. Categories and Subcategories Migration

AFR categories map to Planner Vida `categories`.

Rules:

- Root categories have `parent_id = null`.
- Subcategories keep `parent_id` pointing to their migrated root category.
- Phase 1 allows maximum functional depth of 2: category -> subcategory.
- Legacy category grandchildren, if found, must be quarantined or flattened only through reviewed remediation; do not silently create deeper trees.
- Category names should be trimmed, whitespace-normalized, and used to populate `name`.
- `normalized_name` should be deterministic: case-folded, accent-normalized, whitespace-collapsed, and punctuation-normalized according to the future implementation's shared helper.
- Legacy category type mapping:
  - `renda` -> `income`
  - `fixo` -> `fixed_expense`
  - `variavel` -> `variable_expense`
  - `investimento` -> `investment`
  - legacy `income` -> `income`
  - legacy `expense` requires context or quarantine if not fixed/variable
  - legacy transfer category, if any -> `transfer`
- Subcategory type must be compatible with parent category type. If legacy data conflicts, preserve the relationship only after explicit rule-based remediation; otherwise quarantine the category and affected references.
- Duplicate active categories under the same user/parent/normalized name should not become duplicate active rows. Merge only when semantically confirmed by identical type and no conflicting metadata. Otherwise preserve one canonical row and archive/rename the duplicate with mapping notes.
- Archived/deleted/inactive categories, if identifiable, should migrate with `archived_at` rather than being removed when referenced by transactions, budgets, goals, or mappings.
- Category references in transactions, budgets, goals, invoice/import items, and merchant mappings must point to migrated categories or to a reviewed fallback category. Missing required category is a blocking anomaly for posted income/expense/investment records.

Historical integrity rule:

- Do not rewrite historical transactions to a new category merely to clean taxonomy unless a reviewed mapping explicitly states it. The migration must preserve reporting-relevant category history.

---

# 8. Accounts Migration

AFR `accounts` map to Planner Vida `accounts`.

Field mapping:

- `name` -> `accounts.name`
- normalized name -> `accounts.normalized_name`
- `type`:
  - `bank` -> `checking`
  - `wallet` -> `wallet` or `cash` based on legacy usage/name if deterministically known; otherwise `wallet`
  - `investment` -> `investment`
  - `savings` -> `savings`
  - benefit accounts, if present -> `benefit`
  - unknown -> `other` plus warning
- `balance` -> `opening_balance`, not current mutable balance, only when source validation confirms AFR is using this field as initial/base balance.
- `opening_balance_date` must be derived from source evidence. Preferred order:
  1. explicit legacy balance/base date if available;
  2. earliest transaction date for that account minus one day;
  3. migration cutover baseline date only if the account has no historical movements;
  4. quarantine if the account has movements but no safe baseline interpretation.
- `institution`, `description`, `overdraft_limit` migrate directly when available.
- `currency` defaults to `BRL`.
- Active/archived/closed state maps to `account_status` if legacy status exists. If no status exists, default active unless source indicates deletion/archive.

Balance reconciliation:

The legacy `current_balance` or calculated balance must not be blindly copied as the new source of truth. The migration must validate:

```text
opening_balance
+ migrated posted income in account
- migrated posted expense/investment in account, excluding credit-card purchases
+ incoming transfers
- outgoing transfers
- invoice payments from account
= expected historical/current balance
```

For each account, reconcile at:

- opening balance date;
- month-end dates for months with activity;
- final source snapshot date;
- any available AFR calculated balance checkpoints.

If the difference is unexplained:

- zero tolerance for exact account cash movement reconciliation;
- known rounding residuals must be documented;
- material unexplained differences are blocking before production cutover.

Do not create balancing plug transactions to force account reconciliation. If the source `balance` behaves like a mutable current balance rather than an opening/base balance for any account, that account requires remediation before production migration. The correct outcome is a reconciled `opening_balance + migrated movements`, not a hidden adjustment that makes totals look right while corrupting history.

Investment accounts:

- Accounts with `type=investment` migrate as accounts.
- Investment position summary data should not be injected into account balance unless AFR clearly used it as account balance. Separate investment valuation snapshots should migrate to `assets`/`asset_valuations` where supported.

Overdraft/limits:

- `overdraft_limit` migrates as account metadata.
- Preapproved account credit availability data is out of core migration unless a confirmed target mapping is separately approved.

---

# 9. Credit Cards Migration

AFR `credit_cards` map to Planner Vida `credit_cards`.

Rules:

- Preserve card identity: name, brand, description, user owner.
- `credit_limit` migrates to `credit_cards.credit_limit`.
- `account_id` migrates to preferred payment account after account mapping validation.
- `closing_day` and `due_day` migrate directly after validating integer range 1..31.
- Days 29, 30, and 31 are not rejected; Planner Vida domain normalizes to last valid month day during cycle calculation.
- Missing/invalid `closing_day` or `due_day` on a card with transactions or invoices is a blocking anomaly unless manually remediated.
- Archived/closed cards migrate with `status=archived` or `closed` when source indicates inactivity/deletion. Cards with historical invoices must not be physically omitted.
- `currency` for related monetary values remains `BRL`.

Invoice behavior:

- Preserve AFR functional behavior: purchases after the closing date belong to the next invoice reference month.
- Do not copy trigger behavior; reconstruct invoice domain using Planner Vida invoice rules.
- Existing invoice history must remain available even if the card is archived.

Edge cases:

- Closing day after due day is allowed if it matches the cycle rule where due date is in the following month.
- Month-end normalization must be deterministic and tested.
- Manual closing adjustments from AFR, if present, migrate to `manual_closing_adjustment_days` and reason when source metadata exists. Missing reason should be marked as migrated legacy adjustment.

---

# 10. Transactions Migration

AFR `transactions` must be classified before loading into Planner Vida.

## 10.1 Transaction classes

| Legacy class | Destination | Core rule |
|---|---|---|
| Normal income | `transactions` | `transaction_type=income`, posted unless legacy status says otherwise. |
| Normal expense | `transactions` | `transaction_type=expense`, account or card relation based on payment method. |
| Transfer | `transfers` plus linked `transactions` if target service requires | Excluded from P&L. |
| Investment | `transactions` | `transaction_type=investment`; may also support assets/valuations outside transaction fact. |
| Credit-card purchase | `transactions` + `invoice_items` | Purchase fact exists; account not reduced. |
| Installment-related | `installment_plans` + `installments` + linked `transactions` | Fake parent excluded from realized facts. |
| Recurring-related | `recurrence_rules` + `recurrence_occurrences` + target | Separate rule/history/future. |
| Invoice-payment-related | `invoice_payments` + payment transaction | Payment reduces account; settles invoice. |
| Reversed/voided/cancelled | `transactions.status` and reversal links | Preserve status; do not hard delete. |
| Import-created | `transactions` plus `import_items` links | Preserve import provenance/dedupe. |

## 10.2 Field transformations

- `type` -> `transaction_type`:
  - `income` -> `income`
  - `expense` -> `expense`
  - `transfer` -> `transfer`
  - `investment` -> `investment`
- `date` -> `transaction_date` as local date-only.
- `competence_date` defaults to `transaction_date` unless legacy has explicit competence date.
- `competence_month` derives from `competence_date`.
- `amount` remains positive decimal; direction is expressed by `transaction_type`.
- `description` trims whitespace; empty posted descriptions become blocking anomalies unless a deterministic legacy fallback exists.
- `payment_method` canonical mapping:
  - `credit` -> `credit_card`
  - `debit` -> `debit`
  - `transfer` -> `bank_transfer` for non-transfer payment method context; `transaction_type=transfer` maps to transfer domain
  - `cash` -> `cash`
  - `pix` -> `pix`
  - `boleto` -> `boleto`
  - `vale_alimentacao` -> `benefit_food`
  - `vale_refeicao` -> `benefit_meal`
  - `vale_cultura` -> `benefit_culture`
  - unknown -> `other` plus warning or blocking if it affects balance incorrectly
- `account_id`, `credit_card_id`, `category_id`, `subcategory_id` must resolve through `migration_entity_map`.
- `origin_type`:
  - imported -> `import`
  - installment child -> `installment`
  - recurring materialized -> `recurrence`
  - invoice payment -> `invoice`
  - otherwise -> `migration` or `manual` with migration source fields; recommended for migrated historical rows is `origin_type=migration` plus original source metadata.
- `source_type`, `source_id`, `external_fingerprint`, and mapping table preserve traceability.

## 10.3 Status rules

- Legacy effective transactions migrate as `posted`.
- Legacy cancelled/voided/deleted financial records, if present, migrate as `voided` or `reversed` with available reason.
- If legacy has hard-deleted data unavailable to migration, only remaining records can be migrated; reconciliation must document source limitation.
- Import review drafts that were never committed should not become posted transactions.

## 10.4 Dedupe strategy for transactions

Each migrated transaction should have a deterministic `external_fingerprint` or mapping identity built from:

```text
source_system
+ legacy_table
+ legacy_id
+ user_id
+ source_payload_hash
```

Do not dedupe by `date + amount` alone. Same-day same-value transactions may be legitimate.

## 10.5 Avoiding double counting

- Installment fake parents do not migrate as `transactions.posted`.
- Transfer internal inflow/outflow does not become income/expense in P&L.
- Credit-card purchases may appear in purchase-date/accrual-style card and P&L views, but invoice payments are settlement cash movements, not a second expense in the same P&L regime.
- Invoice payment does not duplicate credit-card purchase expense in purchase-date reporting; reports must declare regime.
- Cash-basis views may show invoice payment cash impact, but then must not also count the underlying card purchases as expenses for the same cash-basis total.
- Future commitments are not generated from historical realized transactions unless the source explicitly represents future expected items.
- Simulation payloads never create real transactions.

---

# 11. Installment Migration

AFR's fragile model:

```text
parent transaction installment_number = 0
+ child transactions installment_number = 1..N
```

Planner Vida target:

```text
installment_plan
-> installments
-> realized transactions where already posted
-> financial_commitments only for future unpaid/unrealized installments when supported by source data
```

## 11.1 Conceptual algorithm

1. Identify installment candidates:
   - `installments > 1`;
   - `installment_number` present;
   - `parent_transaction_id` present;
   - descriptions containing installment markers only as supporting evidence, not sole proof.
2. Group by stable legacy relationship:
   - prefer `parent_transaction_id`;
   - otherwise group by user, card/account, normalized description, total installments, purchase date/reference, amount pattern, and source import item.
3. Identify parent:
   - parent is transaction with `installment_number = 0`;
   - if no parent exists, create plan from children and mark anomaly `installment_parent_missing`.
4. Identify children:
   - child rows have `installment_number > 0`;
   - each child maps to one `installments` row.
5. Determine `total_amount`:
   - prefer parent amount if it equals or reasonably reconciles to sum of children;
   - otherwise use sum of child amounts;
   - record source of truth in migration metadata.
6. Determine `total_installments`:
   - prefer parent `installments`/total count;
   - verify against max child `installment_number`;
   - if divergent, quarantine or migrate with warning only when all realized totals reconcile and missing future items are explainable.
7. Determine `purchase_date`:
   - prefer parent transaction date;
   - otherwise first child date minus expected monthly offsets only if deterministic;
   - otherwise first child date with warning.
8. Determine due dates:
   - use each child transaction date for realized child due/posting date;
   - generate missing future due dates only if the legacy source explicitly describes total installments and schedule;
   - do not create future installments merely because a parent says `installments=N` when the source does not support the missing children as future obligations.
9. Create `installment_plan` with category/card/account/payment method and source metadata.
10. Create `installments(plan_id, installment_number)`.
11. Link realized child transactions to their `installment_id`.
12. For future installments represented by legacy data but not realized, create `installments.status=scheduled`; create `financial_commitments` only when the legacy record is future expected/committed and not a realized transaction. If a future card installment already exists as a legacy child transaction dated in the future, classify whether AFR treated it as a realized scheduled card purchase or a future commitment before loading; do not count it in both layers.
13. Eliminate semantic fake parent:
   - map parent legacy id to `installment_plans`;
   - do not create a posted real transaction from parent.
14. Reconcile:
   - sum installments = plan total, allowing documented cent rounding residuals;
   - sum realized child transactions = posted installments;
   - card invoice items match posted/scheduled invoice assignment where applicable.

## 11.2 Incomplete or inconsistent groups

| Case | Treatment |
|---|---|
| Parent without all children | Create plan and known installments; missing installments become quarantine unless source clearly indicates future scheduled installments. |
| Children without parent | Rebuild plan from children; warning or error depending on amount/count confidence. |
| Rounding residuals | Allocate residual to last installment only if residual is within documented cents tolerance; otherwise quarantine. |
| Cancelled installment | Migrate installment status `cancelled`/`skipped` if source supports it; do not delete. |
| Divergent quantity | Blocking if it changes totals or future obligations; warning if all realized children reconcile and no future generation is attempted. |
| Duplicate child installment number | Blocking until deduped/reviewed; do not choose arbitrarily. |
| Parent counted in reports historically | Validate AFR reports ignored it; if not, document source inconsistency before cutover. |

No problematic installment record may disappear silently.

---

# 12. Recurrence Migration

Planner Vida separates recurrence rule, occurrence history, and target entity.

Target:

```text
recurrence_rules
+ recurrence_occurrences
+ target: transaction / financial_commitment / event / task / subscription / annual_obligation
```

Rules:

- Historical realized recurring transactions remain `transactions`.
- A recurrence rule is created only when legacy metadata supports a real recurrence concept.
- Future occurrences are created only within the controlled Planner Vida moving window and only after checking they do not duplicate already-existing legacy-generated rows.
- Do not generate 12 future months on top of historical/future rows already present in AFR.

Frequency mapping:

- weekly -> `weekly`;
- monthly -> `monthly`;
- yearly -> `yearly`;
- unsupported/unknown -> quarantine or reference-only migration.

`last_generated_until` initialization:

- If legacy has generated future occurrences, set `last_generated_until` to the latest migrated occurrence date.
- If only historical realized rows exist and no future generated rows exist, set to the latest realized occurrence date and let Planner Vida generate future windows after cutover.
- If rule metadata is incomplete, keep recurrence as reference/quarantine and do not generate future items.

Paused/cancelled/end date:

- Legacy inactive recurring items map to `paused`, `ended`, or `cancelled` based on source state.
- End dates and max occurrences migrate when available.
- If only a count limit exists, map to `max_occurrences`.

Targets:

- Recurring realized financial facts -> occurrence linked to `transactions`.
- Recurring future bills/income -> occurrence linked to `financial_commitments` only if future commitment semantics are explicit.
- Recurring subscription-like records, if confirmed -> `subscriptions` plus recurrence; otherwise stay as recurrence/commitment.

Unknown metadata:

- Do not infer complex recurrence rules from a few similar transactions unless explicitly approved.
- Similar historical monthly transactions may be flagged as recurrence candidates for manual review but should not automatically create active recurrence rules.

---

# 13. Credit Card Invoice Migration

AFR invoice history maps to explicit Planner Vida invoice domain:

- `credit_card_invoices`;
- `invoice_items`;
- `invoice_payments`.

## 13.1 Invoice reconstruction

For each card/reference month:

1. Create or upsert `credit_card_invoices(credit_card_id, reference_month)`.
2. Calculate `cycle_start_date`, `closing_date`, and `due_date` using Planner Vida domain rules and migrated card `closing_day`/`due_day`.
3. Apply legacy manual closing adjustment only if source evidence exists.
4. Assign card purchases/installments to invoice by cycle.
5. Create `invoice_items` for purchases, installment items, fees, interest, adjustments, and refunds when represented by source data.
6. Calculate item total.
7. Migrate payment data into `invoice_payments`.
8. Reconcile calculated totals, paid amount, interest, remaining amount, and status.

## 13.2 Trust hierarchy

When data conflicts, use this hierarchy:

1. Item-level transactions/installments assigned to invoice.
2. Payment records or reliable paid fields.
3. Persisted legacy invoice total.
4. Persisted legacy invoice status.

If item total differs from legacy persisted total:

- If difference is explained by interest/fee/adjustment/refund, create explicit `invoice_items` adjustment with reason.
- If difference is small known rounding, document and reconcile within tolerance.
- If unexplained and material, mark invoice as anomaly/quarantine before production.

## 13.3 Status mapping

Legacy statuses:

- `pending` -> `open`, `closed`, `due`, or `overdue` based on dates and remaining amount.
- `paid` -> `paid` only if paid amount reconciles to invoice total or documented aggregate fallback.
- `overdue` -> `overdue` if remaining amount > 0 and due date has passed.

Planner statuses must be coherent with:

- `invoice_total_amount`;
- `total_paid_amount`;
- `paid_interest_amount`;
- `remaining_amount`;
- `due_date`;
- payment reversals if any.

`is_hidden` migrates to `is_hidden_from_reports` and never changes financial status.

## 13.4 Adjustments, interest, refunds

- Legacy `paid_interest` migrates as `invoice_payments.interest_amount` when tied to payment; otherwise as explicit invoice item/adjustment only if source semantics support it.
- Refunds migrate as `invoice_items.item_type=refund`, not as negative normal purchases unless target contract explicitly allows signed adjustment fields.
- Manual invoice adjustments require reason. Missing legacy reason should use a controlled migration reason such as `legacy_migrated_adjustment_no_reason_available`.

---

# 14. Invoice Payments Migration

Invoice payments are cash movements that settle invoices. Credit-card purchases do not reduce account balance; invoice payments do.

P&L/reporting rule:

- Invoice payments reduce account balance and settle card liability.
- They should not be classified as ordinary expense in the same purchase-date P&L regime that already counts the underlying card purchases.
- If a cash-basis report uses invoice payments, it must explicitly exclude the underlying purchase-date card expenses from that same total.

Supported cases:

- full payment;
- partial payment;
- multiple payments;
- interest/multa;
- payment reversal;
- payment account linkage;
- payment transaction linkage.

Rules:

- If AFR has detailed payment records, migrate each payment to one `invoice_payments` row.
- If AFR only has aggregate fields (`paid_amount`, `paid_interest`, `paid_at`, status), create one aggregate migrated payment only when:
  - invoice is paid/partially paid;
  - amount/date can be determined;
  - payment account can be determined from card preferred account or reliable payment transaction evidence.
- If payment account is unknown, migrate payment record with missing account only if target implementation allows it; otherwise quarantine for remediation.
- Do not invent multiple historical payments from a single aggregate paid amount.
- Do not invent payment transaction linkage unless an actual legacy transaction can be matched.
- Interest must stay separate from principal:
  - `principal_amount` = payment against invoice principal/total;
  - `interest_amount` = interest/multa paid.
- Reversals:
  - preserve original payment;
  - create `payment_type=payment_reversal`;
  - link `reversal_of_payment_id` and `reversed_by_payment_id`;
  - create reversal transaction only if source evidence supports it.

Fallback:

If AFR lacks enough information to reconstruct detailed multiple payments, create a traceable aggregate payment or quarantine. The fallback must include legacy source fields, payload hash, and reconciliation note. It must not pretend to know details absent from source.

---

# 15. Budgets and Planning Migration

AFR `budgets` are monthly planned amounts by category. Planner Vida separates:

- `budgets`: monthly planning envelope;
- `budget_lines`: planned amounts by category/subcategory;
- `planning_items`: specific planned items not necessarily committed;
- `transactions`: historical actuals.

Rules:

- One AFR budget row becomes or contributes to one `budgets` record for its user/month.
- The amount/category becomes a `budget_lines` row.
- Actuals are not migrated into `budget_lines`; actuals remain derived from `transactions`.
- A budget is not a `financial_commitment`.
- A budget is not a `planning_item` unless the AFR source contains a specific planned item concept beyond category/month amount.
- Preserve planned-vs-actual behavior by ensuring migrated budget lines keep the same category references used by transactions.
- Duplicates by user/category/month should be consolidated only when values match or remediation is explicit; conflicting values are anomalies.

Budget status:

- Current/future monthly budgets may become `active`.
- Old months may become `closed` if the implementation chooses historical closure; otherwise `active` with historical date is acceptable if consistent.
- Deleted/archived legacy budget rows, if present, migrate as `archived`.

---

# 16. Financial Goals Migration

AFR `financial_goals` map to Planner Vida `financial_goals`.

Field mapping:

- `goal_type` maps to canonical:
  - `save`;
  - `reduce_expense`;
  - `increase_income`;
  - `pay_debt`;
  - future/new types only if source supports them; otherwise do not invent.
- `title`, `target_amount`, `target_percentage`, `target_date`, `category_id`, `credit_card_id`, `status`, `baseline_amount` migrate directly after transformation.
- `account_id` migrates only if source has reliable account linkage.
- `subcategory_id` migrates only if source has it.
- `start_date` should use legacy creation date or explicit start date.
- `baseline_period_start` and `baseline_period_end` should be derived from AFR baseline logic only if source does not store them:
  - `reduce_expense` and `increase_income`: three months before creation when following AFR behavior;
  - `save` and `pay_debt`: start date or stored baseline date where available.

Baseline rule:

- Do not recalculate the past using newly migrated data in a way that may produce unstable results.
- If `baseline_amount` exists, preserve it.
- If it must be derived, derive once during migration, store it, and document formula/version in migration metadata.

Progress:

- Historical progress snapshots migrate only if source stores them.
- Otherwise progress remains calculated by Planner Vida services from migrated transactions/invoices plus preserved baseline.

---

# 17. Simulator Migration

AFR simulator maps to:

- `simulation_scenarios`;
- `simulation_scenario_versions`.

The simulator is analysis-only. Migration of simulator data must never create:

- `transactions`;
- `financial_commitments`;
- `planning_items`;
- `provisions`;
- real invoice items/payments.

Rules:

- Create one `simulation_scenarios` row per AFR scenario.
- Create one `simulation_scenario_versions` row for the migrated legacy payload.
- Set `version_number=1` for the first migrated version unless source has version history.
- Set `schema_version` to the migration-defined legacy wrapper schema version.
- Store original `modifications` JSON in `inputs_payload` inside a validated compatibility wrapper.
- Store baseline data in `baseline_snapshot` if source persisted it; otherwise derive from the same source snapshot used by migration and mark as migration-derived.
- Store existing results in `results_payload` only if source persisted results; otherwise allow Planner Vida to recalculate later.
- Validate:
  - `simulation_months` within 1..12;
  - referenced categories/goals exist after mapping;
  - amount modes and recurrence modes are recognized;
  - payload is valid JSON and can be parsed.
- Incompatible payloads go to quarantine with original payload hash and reason; do not drop them.

Baseline preservation:

- If AFR calculated baseline from last 3 months, migration should preserve either the stored baseline or enough metadata to reproduce the result.
- Do not silently replace old scenario baseline with a newly recalculated baseline from a different data interpretation.

---

# 18. Imports and Merchant Mappings Migration

This area covers historical invoice import records, imported transactions, merchant mappings, category learning, dedupe fingerprints, PDFs, and parser metadata.

## 18.1 Import batches

Historical import records map to `import_batches` when source data exists.

Rules:

- `import_type` = `credit_card_invoice_pdf` for AFR PDF invoice imports.
- Preserve selected card and reference month.
- Preserve parser provider/model/schema when known.
- Preserve file metadata:
  - original file name;
  - MIME type;
  - size;
  - SHA-256 hash;
  - storage bucket/path only if the PDF is actually retained and path is known.
- If PDFs are not available, do not invent `storage_path`.
- `password_provided` may be migrated as boolean if source recorded it, but password value must never be migrated.
- `status` should reflect final historical state:
  - committed imports -> `committed`;
  - failed/cancelled/review drafts -> matching import status.

## 18.2 Import items

Import lines map to `import_items`.

Preserve:

- raw and normalized description;
- merchant name/key;
- date;
- amount;
- installment current/total;
- suggested category/subcategory;
- reviewed category/subcategory;
- reviewed description/date/amount;
- status;
- dedupe key;
- duplicate references when available;
- transaction/installment/invoice item links created by the migration;
- parser payload and confidence when available.

## 18.3 Merchant mappings

`category_mappings` maps to `merchant_category_mappings`.

Rules:

- Mapping is per user.
- `merchant_key` should remain stable. If Planner Vida normalization differs from AFR, store the legacy key and version rather than recalculating destructively.
- `hit_count` and `last_used_at` migrate when available.
- Category/subcategory references must resolve to migrated categories.
- Mappings pointing to missing/deleted categories should be quarantined or linked to archived migrated categories, not silently reassigned.

## 18.4 Historical vs new imports

Migrated historical imports:

- have `origin_type=migration` or migration metadata;
- reflect what happened in AFR;
- may lack PDF storage if source lacks files.

New Planner Vida imports:

- use native `import_batches` lifecycle;
- retain PDFs in private storage according to the frozen contract;
- require human review before commit;
- generate native audit trail.

---

# 19. Audit Migration

Audit migration should preserve useful governance history without requiring impossible fidelity.

Separate:

1. Historical AFR audit records.
2. Migration-generated audit records.
3. New Planner Vida audit records after cutover.

Historical AFR audit records:

- Migrate records for sensitive actions when available:
  - admin role changes;
  - user deletion/export;
  - password changes;
  - invoice parsing/import;
  - notifications/global actions if relevant;
  - rate limit/security events if retained and useful.
- Map actor/user/resource where resolvable.
- Redact or omit secrets, tokens, service role keys, PDF passwords, raw sensitive payloads beyond what is needed.
- If before/after snapshots contain financial details, keep them only where user-owned access and recovery purpose justify it.

Migration-generated audit records:

- Every production migration batch must create audit entries or operational records for:
  - batch start/end;
  - operator/system actor;
  - source snapshot reference;
  - reconciliation outcome;
  - major migrated entity counts;
  - blocking anomalies and resolution status.

New Planner audit records:

- Follow `DATABASE_SCHEMA.md`; not implemented by this migration plan.

Do not fabricate audit events that were not recorded historically.

---

# 20. Legacy-to-New ID Mapping

Use a concrete mapping structure, conceptually named `migration_entity_map`.

Recommended fields:

| Field | Purpose |
|---|---|
| `id` | Mapping row id. |
| `migration_batch_id` | Batch/run identifier. |
| `source_system` | Example: `afr_controle_financeiro`. |
| `source_table` | Legacy physical table or logical concept. |
| `source_id` | Legacy row id or stable logical id. |
| `source_payload_hash` | Hash of migration-relevant source payload. |
| `source_owner_id` | Legacy user/profile id. |
| `target_table` | Planner Vida target table. |
| `target_id` | Planner Vida row id. |
| `target_user_id` | Target owner. |
| `migration_status` | `pending`, `mapped`, `created`, `updated`, `skipped`, `quarantined`, `failed`. |
| `error_code` | Machine-readable code when failed/quarantined. |
| `warning_code` | Optional warning. |
| `created_at` | Mapping creation time. |
| `updated_at` | Mapping update time. |

Status behavior:

- If payload hash unchanged and mapping exists, rerun must upsert/update the same target, not create a duplicate.
- If payload hash changed for the same source id, migration should detect drift and either update safely or require a new batch/remediation decision.
- One source row may map to multiple target rows for split migrations. Use one mapping row per target entity.
- Multiple source rows may map to one target row only for documented merge cases, such as duplicate categories after review.

Permanent vs temporary:

- Keep `migration_entity_map` at least throughout Phase 1 stabilization, as preferred.
- It can be outside product UI and excluded from normal user-facing schema.
- It should not be dropped until reconciliation, support, rollback investigation, and first post-cutover close cycle are complete.
- Long-term retention can be revisited after the migration is operationally stable.

---

# 21. Migration Batches

Each execution should create a migration batch record, conceptually `migration_batches`.

Lifecycle:

```text
created
-> extracting
-> transforming
-> loading
-> reconciling
-> validated
-> completed
```

Failure paths:

```text
created/extracting/transforming/loading/reconciling
-> failed
-> remediated
-> rerun or superseded
```

Each batch must store:

- environment (`dev`, `test`, `staging`, `prod`);
- source system name/version;
- source snapshot id/reference;
- source extraction timestamp;
- target database identifier/environment;
- migration code version/commit;
- configuration version;
- operator/system identity;
- started_at;
- finished_at;
- status;
- counts by entity/concept;
- created/updated/skipped/quarantined/failed counts;
- warnings;
- failures;
- reconciliation result summary;
- links/paths to detailed reconciliation reports;
- dry-run vs actual flag;
- idempotency key.

Batch completion rule:

- A batch cannot be `completed` until reconciliation is `validated`, blocking anomalies are resolved or explicitly waived, and idempotency criteria pass in non-prod rehearsal.

---

# 22. Data Transformation Rules

| Area | Rule |
|---|---|
| Enums | Map legacy values to canonical Planner enums. Unknown values are warnings only when non-critical; otherwise quarantine/block. |
| Money | Parse as decimal string/integer cents/NUMERIC. Never use float as official intermediate. |
| Nulls | Required target fields must be populated from reliable source/default contract or quarantined. Do not invent financial facts. |
| Dates | Financial dates are local date-only. Timestamps remain instants with timezone. |
| Timezone | Default user timezone `America/Sao_Paulo` unless reliable source says otherwise. |
| Strings | Trim, collapse whitespace, preserve display text, compute normalized fields deterministically. |
| Normalization | Use shared normalization for names, merchant keys, category keys, and fingerprints; record version. |
| Archived flags | Deleted/inactive legacy financial config maps to archived/closed when referenced; do not hard delete. |
| Status | Map legacy statuses to canonical lifecycle statuses; derive only when deterministic. |
| Installments | Fake parent becomes plan; children become installments/transactions; no fake parent posted transaction. |
| Recurrence | Rule, occurrences, and realized/future targets remain separate. |
| Invoice status | Derive from totals/payments/dates when possible; legacy status is lower trust than items/payments. |
| Category names | Preserve display names; handle duplicates by user/parent/type with mapping. |
| Payment methods | `credit` becomes `credit_card`; benefit methods require benefit account where balance is affected. |
| Origin types | Use canonical `origin_type`; all migrated records retain legacy source metadata via mapping. |
| Currency | Default `BRL`; do not introduce FX conversion. |
| Ownership | Every owned target row must have one `user_id`; cross-user FK is blocking. |
| Payload hashes | Hash canonicalized migration-relevant source payload, not raw unstable JSON formatting. |

---

# 23. Date Migration Rules

Financial dates in AFR must be treated as local business dates. Do not convert `YYYY-MM-DD` to UTC and back for financial calculations.

## 23.1 Field rules

- `transaction_date`: legacy transaction `date` as local date-only.
- `competence_date`: explicit source competence date when available; otherwise equals `transaction_date`.
- `due_date`: local due date; for card invoices, derive by invoice cycle if not stored reliably.
- `closing_date`: local date; derive from card closing day/reference month unless legacy manual adjustment exists.
- `invoice_reference_month`: `YYYY-MM`; preserve source reference month or derive from cycle assignment.
- `installment_date`/`installments.due_date`: local date of each installment obligation/posting.
- `recurrence_dates`: rule start/end/occurrence dates as local date-only.
- `created_at`/`updated_at`/`paid_at`/`reviewed_at`: timestamp with timezone; preserve source instant when available.

## 23.2 Month boundary and timezone precautions

- AFR used "midday UTC" style helpers to avoid D-1 shifts. Migration must treat stored financial date values as date-only and ignore time offset for business-date meaning.
- If source column is timestamp but used as financial date, extract date in the user's local timezone only when source evidence confirms timestamp semantics.
- Validate samples around:
  - end of month;
  - first day of month;
  - timestamps near midnight;
  - card closing date;
  - due dates on day 29/30/31;
  - historical DST transitions if timestamped source appears.
- Do not shift a transaction into another month merely because of UTC rendering.

## 23.3 Invoice cycle dates

- Closing day/due day are day numbers, not timestamps.
- If configured day is invalid for the month, use last valid day of that month.
- Purchase after calculated closing date belongs to next invoice cycle.
- This rule must be validated against AFR expected invoice assignment before production.

---

# 24. Money and Precision Migration

Rules:

- Use decimal/NUMERIC semantics end to end.
- Official transformation and reconciliation must not use floating point.
- Preserve BRL values with at least 2 decimal places; allow target NUMERIC scale according to implementation.
- Normalize legacy currency formatting (`R$`, thousand separators, comma decimals) deterministically.
- Amounts in `transactions`, `installments`, `invoice_items`, `invoice_payments`, budgets, goals, and balances are positive unless target field explicitly allows signed value.
- Negative source values must be classified:
  - refund/reversal/adjustment;
  - data error;
  - signed variance field;
  - blocking anomaly if unsupported.

Rounding:

- Do not round early.
- For display-scale values, round only at field boundary defined by target schema/service.
- Installment residual cents:
  - sum installment amounts must equal plan total;
  - if source distributes residual unevenly, preserve actual child amounts;
  - if future missing installments are generated, allocate documented residual deterministically, usually to final installment.

Invoice totals:

- `calculated_total_amount` = sum invoice items.
- `invoice_total_amount` = calculated items + manual adjustments.
- `remaining_amount` = invoice total - paid principal, adjusted for reversals.
- Interest must not be silently folded into principal when source separates it.

Balances:

- Account balance reconciliation must use decimal arithmetic.
- Tolerance for exact cash movements is zero unless a documented rounding residual exists.

---

# 25. Deduplication Strategy

Deduplication must distinguish confirmed duplicates, suspected duplicates, and legitimate same-day same-value transactions.

## 25.1 General principles

- Never eliminate records only by `date + amount`.
- Use legacy stable ids first.
- Use payload hash and entity mapping for idempotency.
- Use domain-specific fingerprints for source records without stable ids.
- Confirmed duplicates can be skipped/merged only when evidence is strong and mapping records preserve both source references.
- Suspected duplicates should be quarantined or marked for review, not deleted.

## 25.2 Entity-specific dedupe

| Entity | Dedupe basis |
|---|---|
| Transactions | legacy id; external fingerprint; user, source table/id/hash; import item id; installment id; recurrence occurrence id. |
| Installment plans | legacy parent id or deterministic group key; user/card/account/description/total/total installments/purchase date. |
| Installments | `plan_id + installment_number`; legacy child id mapping. |
| Invoices | `credit_card_id + reference_month`. |
| Invoice items | `invoice_id + transaction_id` or `invoice_id + installment_id`; import item id for imported lines. |
| Invoice payments | legacy payment id; invoice + payment transaction id; aggregate fallback key. |
| Recurrence occurrences | `rule_id + occurrence_date + target_type`. |
| Import items | `batch_id + line_fingerprint`/`dedupe_key`. |
| Merchant mappings | `user_id + merchant_key`. |
| Commitments | `user_id + source_type + source_id + source_occurrence_key`. |
| Categories | `user_id + parent_id + normalized_name` among active categories, with type compatibility. |

Legitimate duplicates:

- Same merchant, same amount, same day may be two purchases.
- Same invoice amount may be paid in multiple partial payments.
- Same category budget amount may recur monthly.

Suspected duplicates must include reason and confidence, not automatic deletion.

---

# 26. Reconciliation Framework

Reconciliation must run before and after migration, by user and globally where safe. Reports must be retained as migration artifacts.

## 26.1 Record counts

Compare counts by source concept and target table:

- profiles/users;
- roles;
- accounts;
- credit cards;
- root categories;
- subcategories;
- normal transactions;
- transfers;
- installment parents/children/plans/installments;
- recurrence rules/occurrences;
- invoices;
- invoice items;
- invoice payments;
- budgets/budget lines;
- goals;
- simulations/scenario versions;
- import batches/items;
- merchant mappings;
- audit logs;
- quarantined/skipped records.

## 26.2 Monthly P&L

By user and month:

- income;
- fixed expense;
- variable expense;
- investment;
- transfers excluded;
- card purchases handled according to the selected AFR-equivalent P&L regime;
- installment fake parents excluded.

Tolerance:

- zero unexplained monetary difference;
- documented rounding residual only for installment cent distribution.

## 26.3 Accounts

For each account:

- opening balance;
- monthly movement totals;
- final balance at source snapshot;
- transfer in/out;
- invoice payments from account;
- non-card expenses/investments;
- income.

Tolerance:

- zero unexplained difference.

## 26.4 Cards

For each card:

- invoice count;
- invoice totals;
- open balances;
- paid totals;
- interest totals;
- hidden invoice count;
- purchases/items by reference month.

Tolerance:

- zero unexplained difference between item totals and invoice totals, except documented adjustments.

## 26.5 Installments

For each plan:

- plan total;
- sum installments;
- realized installments;
- future scheduled installments;
- linked transactions;
- linked invoice items;
- missing/cancelled/skipped installments.

Tolerance:

- plan total equals sum installments, except documented cent residual rules.

## 26.6 Categories

Compare distribution by:

- category type;
- category/subcategory;
- monthly totals;
- transaction counts;
- budget line counts;
- mapping counts.

## 26.7 Goals

Compare:

- goal count;
- status count;
- target amount/percentage totals;
- baseline presence;
- category/card/account link validity.

## 26.8 Simulations

Compare:

- scenario count;
- active/archived count;
- version count;
- valid payload count;
- quarantined incompatible payload count.

## 26.9 Imports

Compare:

- batch count;
- parsed item count;
- included/excluded/duplicate item count;
- committed transaction count;
- mapping count;
- file metadata/hash coverage;
- PDF availability where expected.

---

# 27. Anomaly Detection During Migration

Anomalies must be classified as `warning`, `error`, or `blocking error`.

| Check | Classification guidance |
|---|---|
| R$1.000 becoming R$1 billion | Blocking error. |
| Unexpected negative amount | Error/blocking depending on entity; allowed only for explicit signed adjustments/variance. |
| Dates outside reasonable range | Error; blocking for financial facts until reviewed. |
| 10,000 installments | Blocking error. |
| Invoice total far above items | Error/blocking unless explained by adjustments/interest. |
| Transaction without owner | Blocking error. |
| Cross-user FK | Blocking error. |
| Duplicate transaction confirmed | Error; skip/merge only with mapping. |
| Duplicate transaction suspected | Warning/quarantine. |
| Duplicate invoice for same card/month | Blocking unless merge is deterministic. |
| Orphan installment | Error/quarantine. |
| Child installment without plan | Error; can rebuild plan with warning only if deterministic. |
| Account balance explosion | Blocking error. |
| Unknown enum | Error; blocking if required for financial behavior. |
| Missing required category | Blocking for posted income/expense/investment. |
| Impossible card cycle | Blocking for card with invoices/transactions. |
| Invoice item linked to wrong user card | Blocking error. |
| Payment account not owned by invoice user | Blocking error. |
| Simulation payload invalid JSON | Error/quarantine, not blocker for financial cutover unless simulator acceptance requires it. |
| Missing PDF storage path for historical PDF | Warning if PDF unavailable; do not invent path. |

Blocking errors stop production cutover. Non-blocking errors can proceed only if quarantined and accepted. Warnings must be reported and sampled.

---

# 28. Error Handling and Quarantine

Invalid records must not disappear, be silently fixed, or necessarily block the whole migration when isolable.

Use a quarantine/review concept with fields:

- `migration_batch_id`;
- `source_system`;
- `source_entity`;
- `source_table`;
- `source_id`;
- `source_owner_id`;
- `payload_hash`;
- `error_code`;
- `severity`;
- `reason`;
- `suggested_remediation`;
- `source_payload_reference`;
- `retry_status` (`pending_review`, `remediated`, `ignored_with_approval`, `retry_ready`, `resolved`);
- `reviewed_by`;
- `reviewed_at`;
- `target_entity_if_partial`;
- `created_at`;
- `updated_at`.

Examples:

- `missing_owner`;
- `cross_user_fk`;
- `unknown_category_type`;
- `installment_duplicate_number`;
- `invoice_total_mismatch`;
- `invalid_financial_date`;
- `simulation_payload_invalid`;
- `payment_account_unknown`.

Retry behavior:

- After remediation, rerun only affected entity groups or rerun full batch idempotently.
- Quarantine records should remain auditable even after resolution.

---

# 29. Dry Run Strategy

Before first real production migration:

1. Create read-only source snapshot.
2. Run migration in DEV against empty/reset target.
3. Generate reconciliation report.
4. Review anomalies/quarantine.
5. Fix migration code or source remediation mapping.
6. Reset target.
7. Rerun from the same source snapshot.
8. Repeat until reconciliation and idempotency pass.

Then:

1. Run staging/test migration using production-like target schema and representative data volume.
2. Run final pre-production validation:
   - counts;
   - P&L;
   - balances;
   - invoices;
   - installments;
   - sampling.
3. Freeze migration code version.
4. Prepare production runbook and rollback/recovery materials.

Dry runs must use stable batch ids or run ids so results can be compared across runs. Source snapshots used for dry run must remain available until acceptance.

---

# 30. Idempotency Test

After one valid migration from a fixed source snapshot:

1. Run the same migration again against the same target.
2. Verify target row counts do not grow except for explicitly versioned batch/job log records.
3. Verify financial totals do not change:
   - monthly P&L;
   - account balances;
   - invoice totals;
   - installment totals;
   - payment totals.
4. Verify `migration_entity_map` points to the same target IDs.
5. Verify no duplicate:
   - transaction;
   - installment plan;
   - installment;
   - invoice;
   - invoice item;
   - invoice payment;
   - recurrence occurrence;
   - import item;
   - merchant mapping.
6. Verify source payload hashes are unchanged.
7. Verify rerun emits `skipped`/`updated_same` statuses rather than creating new rows.

Acceptance:

- Idempotency test must pass in DEV/test before production cutover.
- Any non-idempotent behavior in financial tables is blocking.

---

# 31. Rollback / Recovery Strategy

No promise of magic rollback is made. Recovery differs before and after go-live.

## Pre-go-live rollback

Safe options:

- target database snapshot/backup restore;
- drop/reset target environment;
- delete only rows from a failed migration batch if:
  - no user has used Planner Vida yet;
  - all affected rows are tagged/mapped by batch;
  - FK dependencies are understood;
  - deletion is scripted and validated;
- keep source untouched/read-only;
- rerun migration from same snapshot after fix.

## Post-go-live recovery

After Planner Vida receives new production data, destructive full rollback should be avoided.

Safe options:

- restore only if the entire cutover is aborted before user activity resumes;
- targeted correction scripts based on `migration_entity_map`;
- compensating financial reversals/voids where required by domain rules;
- re-run specific idempotent migration segments only for failed/quarantined records;
- use mapping table and audit logs for investigation;
- keep AFR read-only temporarily as fallback/reference.

Post-go-live recovery must preserve new Planner Vida data created after cutover.

Backups:

- Take target backup before production migration.
- Keep source snapshot immutable.
- Store reconciliation and mapping artifacts securely.

---

# 32. Cutover Strategy

Recommended cutover is a short, controlled maintenance/read-only window, without dual-write or CDC.

Rationale:

- Initial migration likely has limited user count.
- Finance data consistency is more important than continuous write availability.
- Dual-write would add unnecessary complexity and reconciliation risk.

Recommended flow:

1. Announce/prepare maintenance window.
2. Put AFR into read-only mode or otherwise block writes.
3. Take final source snapshot.
4. Run final delta extraction only if a previous pre-cutover snapshot was used.
5. Execute production migration from final snapshot.
6. Run automated reconciliation.
7. Run manual sampling.
8. Resolve/accept non-blocking quarantine.
9. Switch user access to Planner Vida.
10. Retain AFR temporarily as read-only fallback/reference.

Abort if:

- source cannot be frozen;
- backup/snapshot fails;
- critical reconciliation differs;
- blocking anomaly appears;
- idempotency assumptions fail;
- user identity mapping is uncertain;
- invoice/account balance reconciliation fails materially.

---

# 33. Production Migration Runbook

## Before

- Confirm approved migration code version.
- Confirm target schema equals Frozen Phase 1 contract implementation.
- Confirm source snapshot procedure.
- Confirm target backup/restore procedure.
- Confirm service credentials and least-privilege access.
- Confirm no secrets will be logged.
- Put AFR in maintenance/read-only mode.
- Take final source snapshot.
- Record snapshot id/hash/timestamp.
- Run source health checks:
  - user count;
  - ownerless rows;
  - cross-user FK scan;
  - critical table counts;
  - invoice/account baseline totals.
- Create migration batch in `created` status.

## Execute

- Mark batch `extracting`; extract source data.
- Mark batch `transforming`; transform and validate.
- Load in dependency order:
  1. profiles/roles;
  2. categories;
  3. accounts;
  4. credit cards;
  5. base transactions/transfers;
  6. installments;
  7. recurrence structures;
  8. invoices/items/payments;
  9. budgets/planning/goals;
  10. simulations;
  11. imports/mappings;
  12. audit/migration metadata.
- Reconcile after major stages, not only at the end.
- Quarantine invalid isolable records.

## Validate

- Run automated reconciliation:
  - record counts;
  - P&L;
  - account balances;
  - card invoice totals;
  - invoice payments;
  - installments;
  - categories;
  - goals;
  - simulations;
  - imports.
- Run FK/ownership checks.
- Run duplicate scans.
- Run manual sampling plan.
- Confirm all blocking anomalies are resolved.

## Complete

- Mark batch `validated`.
- Mark batch `completed`.
- Save final migration summary.
- Save reconciliation report.
- Save quarantine/anomaly report.
- Release Planner Vida to user(s).
- Keep AFR read-only.
- Monitor first login/use, invoices, account balances, and reports.

## Abort criteria

Stop cutover if any of the following occur:

- backup/snapshot unavailable;
- migration cannot complete;
- user mapping mismatch;
- cross-user data relation;
- missing critical FK;
- unexplained account balance difference;
- unexplained P&L difference;
- invoice totals unreconciled beyond accepted tolerance;
- duplicate installment totals;
- unexpected row growth on idempotency test;
- security credential/logging issue;
- production target receives partial financial data with failed batch and no clean recovery path.

---

# 34. Manual Sampling Plan

Automated totals are necessary but insufficient. Mandatory sample cases:

- account with many transactions;
- account with oldest history;
- account with transfers in/out;
- account with investment transactions;
- archived/closed account with history;
- credit card with many invoices;
- credit card with installments;
- paid invoice;
- partially paid invoice if source has one;
- unpaid/open invoice;
- overdue invoice;
- hidden invoice;
- imported invoice;
- imported invoice item with merchant mapping;
- recurrent transaction;
- transfer;
- normal income;
- normal fixed expense;
- normal variable expense;
- investment transaction;
- installment parent/children group;
- incomplete/problematic installment group if any exists;
- financial goal;
- simulation scenario;
- month-boundary transaction;
- purchase on closing day and after closing day;
- PDF import with password flag if any exists;
- category/subcategory used in reports and mappings.

For each sample:

- compare source UI/source query to target data;
- verify owner;
- verify category/account/card links;
- verify amounts and dates;
- verify report impact;
- verify traceability through mapping table.

---

# 35. Security During Migration

Rules:

- Use service role only server-side/infrastructure-side.
- Service role must never be exposed to browser/frontend.
- Use least privilege for source and target credentials.
- Source credentials are read-only when possible.
- Target write credentials are restricted to migration runtime.
- Logs must not include secrets, service keys, tokens, PDF passwords, raw credentials, or unnecessary financial detail.
- PDF passwords are never persisted.
- Production data should not be copied unnecessarily outside approved DEV/test/staging flows.
- Migration artifacts must be protected:
  - source snapshot references;
  - mapping table;
  - anomaly reports;
  - reconciliation reports;
  - import/parser payloads;
  - audit extracts.
- Admin human still cannot navigate another user's financial data through product UI.
- Migration infrastructure may access data as authorized backend infrastructure; this does not change Admin Observability rules.
- If data is moved to non-prod for testing, use approved controls, masking, or minimal necessary snapshots according to environment policy.

---

# 36. Performance Considerations

Priority is consistency and auditability, not maximum speed.

Guidelines:

- Process by user and entity group to simplify ownership validation.
- Use reasonable batch sizes for bulk insert/upsert.
- Avoid N+1 lookups by preloading mapping dictionaries for accounts/cards/categories/users.
- Use transactions around coherent groups where rollback is practical.
- Keep large all-or-nothing transactions small enough to avoid operational risk.
- Use permanent/temporary indexes needed for mapping, source lookup, and reconciliation.
- Upsert by deterministic keys rather than insert-then-dedupe.
- Run reconciliation queries with indexed date/user/card/account/category fields.
- Throttle only if source/target load requires it.
- Persist progress so a failed run can be investigated and safely rerun.

No performance optimization may bypass:

- idempotency;
- mapping creation;
- ownership validation;
- monetary precision;
- audit/reconciliation artifacts.

---

# 37. Migration Tests

Future migration code must include tests before production use.

## Unit tests

- enum mapping;
- payment method mapping;
- category type mapping;
- account type mapping;
- date-only conversion;
- month-boundary handling;
- closing/due day normalization;
- installment grouping;
- installment residual rounding;
- invoice assignment;
- invoice status derivation;
- recurrence frequency/count/end-date mapping;
- merchant/category normalization;
- fingerprint/dedupe key generation;
- decimal parsing and rounding;
- payload hashing.

## Integration tests

- source fixture -> target database;
- user/profile/role mapping;
- FK ownership and cross-user blocking;
- category parent/subcategory mapping;
- account/card/category reference resolution;
- transaction migration;
- transfer migration;
- installment plan reconstruction;
- invoice reconstruction;
- invoice payment reconstruction;
- recurrence reconstruction;
- import batch/item reconstruction;
- merchant mapping;
- upsert/idempotency;
- RLS/access expectations at target behavior level;
- quarantine path for invalid records.

## Reconciliation tests

- record counts;
- monthly P&L;
- account balances;
- invoice totals/payments/remaining amounts;
- installment plan totals;
- category distributions;
- goals count/status/targets;
- simulation count/version count;
- import counts and duplicate handling.

---

# 38. Migration Acceptance Criteria

Migration is approved only when all criteria below are met:

- 100% expected users mapped.
- 100% profiles have valid `user_id` identity alignment or approved remediation.
- 100% critical FK integrity.
- Zero cross-user relationships.
- Zero ownerless financial records in target.
- Zero unexplained monthly P&L difference.
- Zero unexplained account balance difference.
- Zero duplicate installment totals.
- Installment plan totals reconcile to installments.
- Invoice totals reconcile to items, payments, adjustments, and documented exceptions.
- Payment totals reconcile to account movements where payment transactions exist.
- Hidden invoice flags preserved independently from financial status.
- Category references valid or explicitly quarantined/reviewed.
- Goals migrated with target/baseline/status preserved or documented.
- Simulation scenarios migrated or incompatible payloads quarantined.
- Import batches/items/mappings migrated or source absence documented.
- Idempotent rerun successful.
- All blocking anomalies resolved.
- Quarantine items explicitly reviewed.
- Manual sample passed.
- Migration artifacts saved and linked to the completed batch.
- Source remains untouched/read-only during migration.

---

# 39. Known Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation | Validation |
|---|---:|---:|---|---|
| Installment fake parents duplicate totals | High | High | Parent maps to plan only; children map to installments/transactions | Installment reconciliation; P&L monthly comparison |
| Trigger-derived invoice totals differ from items | High | High | Rebuild items; use trust hierarchy; create explicit adjustments | Invoice total/payment reconciliation |
| Recurrence semantics incomplete | Medium | Medium | Create rules only from explicit metadata; quarantine inferred rules | Recurrence sample and duplicate scan |
| Mixed enums Portuguese/English | High | Medium | Central enum mapping table and unknown enum quarantine | Unit tests and anomaly report |
| Timezone/date helper shifts | Medium | High | Treat financial dates as local date-only | Month-boundary samples; P&L by month |
| Inconsistent historical source data | Medium | High | Quarantine, reconciliation, no silent fixes | Anomaly report; manual review |
| Simulation JSON incompatible | Medium | Low/Medium | Versioned legacy wrapper; quarantine invalid payloads | Payload validation report |
| Dedupe ambiguity for imports | High | High | Use source ids/fingerprints; suspected duplicates reviewed | Import dedupe reconciliation |
| Missing PDFs or storage paths | Medium | Medium | Do not invent paths; mark metadata unavailable | Import artifact coverage report |
| Aggregated invoice payments lacking detail | Medium | High | Use aggregate fallback only when traceable; do not invent splits | Invoice payment reconciliation |
| Cross-user FK due legacy inconsistency | Low/Medium | Critical | Pre-scan ownership; block on mismatch | FK ownership validation |
| Account balance copied incorrectly | Medium | High | Treat legacy balance as opening balance and reconcile movements | Account balance framework |
| Category duplicates/archives | Medium | Medium | Deterministic normalization and mapping; preserve archived refs | Category distribution and FK checks |
| Benefit payment methods without benefit accounts | Medium | Medium | Prefer `account.type=benefit`; quarantine impossible balance records | Account/payment method validation |
| Admin logs exposing financial detail | Medium | Medium | Sanitize audit migration; restrict admin observability | Security review |

---

# 40. Migration Deliverables

At future implementation completion, expected artifacts are:

- migration code;
- migration configuration/version file;
- source snapshot reference;
- entity mapping table (`migration_entity_map`);
- migration batch execution log;
- anomaly/quarantine report;
- reconciliation report;
- idempotency test report;
- manual sampling evidence;
- final migration summary;
- code/version identifier;
- rollback/recovery notes;
- production runbook execution checklist with timestamps.

This document only describes these deliverables. It does not implement them.

---

# 41. AFR Migration Decision Register

| Decision | Type | Rationale |
|---|---|---|
| Use `DATABASE_SCHEMA.md` as non-negotiable target contract. | Migration Decision | Prevents schema redesign during migration planning. |
| Keep source read-only during production migration. | Migration Decision | Preserves deterministic final snapshot. |
| Use short controlled cutover, not CDC/dual-write. | Migration Decision | Simpler and safer for expected scope. |
| Keep `migration_entity_map` through Phase 1 stabilization. | Migration Decision | Supports reconciliation, support, and investigative rollback. |
| Treat AFR installment parent as plan metadata, not posted transaction. | Migration Decision | Avoids double counting and aligns with frozen model. |
| Rebuild invoice items from transactions/installments where possible before trusting legacy invoice totals. | Migration Decision | Item-level facts are more reliable and reconciliable. |
| Preserve simulation as analysis-only. | Migration Decision | Aligns with frozen source-of-truth separation. |
| Do not infer active recurrence rules from similar transactions alone. | Migration Decision | Avoids creating unsupported future obligations. |
| Do not invent historical PDF `storage_path` when PDFs are unavailable. | Migration Decision | Preserves audit honesty. |
| Use aggregate invoice payment fallback only when detailed source payments are absent. | Migration Decision | Avoids fabricated payment history while preserving paid state. |
| Use quarantine for isolable invalid records. | Migration Decision | Prevents silent loss and avoids blocking entire migration unnecessarily. |
| Map legacy `balance` to opening balance and reconcile movements. | Migration Decision | Planner balance source of truth is `opening_balance + movements`. |
| Technical batch table names and storage location are implementation details. | Implementation Detail - Non-blocking | May be implemented inside app DB, separate ops schema, or migration tooling. |
| Exact payload hash canonicalization format is implementation detail. | Implementation Detail - Non-blocking | Must be deterministic but can be chosen during migration implementation. |
| Exact report file format for reconciliation artifacts is implementation detail. | Implementation Detail - Non-blocking | CSV/JSON/Markdown/PDF can be selected later. |

No `BLOCKING MIGRATION ISSUE` is identified from the available documents. Known risks are manageable through validation, quarantine, and reconciliation.

---

# 42. Final Readiness Assessment

## Ready for implementation?

YES.

This plan is ready to guide a technical migration implementation because it defines:

- source inventory;
- target mapping;
- dependency order;
- transformation rules;
- date and money handling;
- installment, recurrence, invoice, payment, budget, goal, simulator, import, mapping, and audit strategy;
- idempotency controls;
- reconciliation framework;
- anomaly/quarantine handling;
- dry-run, rollback, cutover, runbook, sampling, security, performance, and test expectations.

The recommended next step is `PHASE_1_IMPLEMENTATION_PLAN.md`. A detailed technical migration implementation plan should come later, after the Planner Vida implementation has enough concrete architecture, services, and persistence code for the migration scripts to target. The intended sequence is:

```text
AFR_MIGRATION_PLAN.md
-> PHASE_1_IMPLEMENTATION_PLAN.md
-> Planner Vida construction
-> technical migration implementation
-> dry runs
-> cutover
```
