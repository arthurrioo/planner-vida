# Milestone 03 Schema Verification Report

Status: NOT READY FOR INDEPENDENT MILESTONE 03 REVIEW until local/DEV Supabase apply/reset checks are executed in an environment with Supabase CLI and Docker/PostgreSQL available.

## Canonical Definition

Source: `PHASE_1_IMPLEMENTATION_PLAN.md`, `Milestone 03 - Database Physical Foundation`.

- Objective: translate `DATABASE_SCHEMA.md` into an initial physical Supabase/PostgreSQL foundation without changing the frozen data contract.
- Scope: migration tooling, enums, base tables, constraints, FK strategy, indexes, audit columns, RLS skeleton, seed/reference data, storage bucket planning, and migration metadata support.
- Dependencies: Milestones 01-02.
- Deliverables: initial database migrations, schema verification report, RLS skeleton, seed/reference data.
- Acceptance criteria: physical schema matches the frozen data contract or every deviation is recorded as an issue; no destructive migration behavior is hidden in app deploy.
- Exit gate: Database Foundation Freeze.

## Migration Tooling and Conventions

Tooling selected: Supabase native migrations for PostgreSQL/Supabase.

Repository convention:

- `supabase/config.toml`: local Supabase project configuration with placeholder/local-only identifiers.
- `supabase/migrations/YYYYMMDDHHMMSS_m03_database_physical_foundation.sql`: explicit, ordered, reviewable migration SQL.
- `supabase/seed.sql`: deterministic, idempotent seed/reference data.
- `supabase/tests/m03_preliminary_checks.sql`: reproducible local/DEV SQL checks for schema, constraints, storage, and RLS.
- `scripts/verify-m03-schema.mjs`: static verification used by CI/local gates when a database runtime is unavailable.

No migration is wired into frontend deploy. No production database connection is configured or used.

## Migrations Created

- `supabase/migrations/20260915000100_m03_database_physical_foundation.sql`
  - Enables `pgcrypto`.
  - Creates canonical enum types from `DATABASE_SCHEMA.md`.
  - Creates all Phase 1 public tables.
  - Creates `migration_ops` support tables for AFR migration metadata.
  - Adds PKs, ownership composite keys, FKs, checks, uniqueness, and indexes.
  - Enables RLS.
  - Adds RLS skeleton policies.
  - Creates macro/reference read policies for authenticated users.
  - Creates private `invoice-imports` storage bucket foundation when Supabase Storage is present.
  - Adds a technical `updated_at` trigger only; no financial business trigger is implemented.

## Schema Coverage

Enums implemented:

- `transaction_type`, `transaction_status`, `payment_method`, `category_type`, `account_type`, `account_status`, `credit_card_status`
- `installment_plan_status`, `installment_status`, `recurrence_frequency`, `recurrence_status`, `recurrence_target_type`
- `invoice_status`, `invoice_item_type`, `invoice_payment_status`, `invoice_payment_type`, `invoice_adjustment_type`
- `event_type`, `event_status`, `task_status`, `task_priority`, `commitment_type`, `commitment_status`
- `budget_status`, `planning_item_status`, `financial_goal_type`, `financial_goal_status`, `simulation_status`
- `shopping_list_status`, `shopping_item_status`, `wishlist_status`, `subscription_status`, `asset_type`, `liability_type`
- `annual_obligation_type`, `obligation_status`, `provision_status`, `indicator_code`, `indicator_value_type`
- `import_batch_status`, `import_item_status`, `origin_type`, `audit_severity`

Tables implemented:

- Identity/governance: `profiles`, `user_roles`, `audit_logs`, `system_job_runs`, `admin_observability_metrics`
- Core finance: `accounts`, `credit_cards`, `categories`, `transactions`, `transfers`
- Installments/recurrence: `installment_plans`, `installments`, `recurrence_rules`, `recurrence_occurrences`
- Invoices: `credit_card_invoices`, `invoice_items`, `invoice_payments`
- Planning/goals/simulations: `budgets`, `budget_lines`, `planning_items`, `financial_goals`, `simulation_scenarios`, `simulation_scenario_versions`
- Operational planner: `events`, `tasks`, `financial_commitments`
- Shopping/subscriptions/patrimony/obligations: `shopping_lists`, `shopping_list_items`, `wishlist_items`, `subscriptions`, `assets`, `asset_valuations`, `liabilities`, `liability_balances`, `annual_obligations`, `annual_obligation_installments`, `provisions`
- Macro/import: `economic_indicators`, `economic_indicator_values`, `import_batches`, `import_items`, `merchant_category_mappings`
- AFR migration readiness: `migration_ops.migration_batches`, `migration_ops.migration_entity_map`, `migration_ops.migration_quarantine_records`, `migration_ops.migration_reconciliation_reports`

Constraints and indexes:

- Owned tables have `(user_id, id)` composite uniqueness to support ownership-aware FKs.
- Cross-owned relationships use composite `(user_id, foreign_id)` FKs where both sides are user-owned.
- Monetary values use `numeric`; no float/double/real money fields are introduced.
- Financial dates use `date`; timed events use `timestamptz` plus timezone fields where defined.
- Key access-path indexes from `DATABASE_SCHEMA.md` are implemented for listings, statements, dashboard/P&L, cards/invoices, installments/recurrence, planning, imports, macro, audit, and admin observability.
- Idempotency uniqueness exists for recurrence occurrences, import item fingerprints, system job runs, migration entity mapping, and source occurrence commitments.

## RLS Skeleton

RLS is enabled for all public tables created by M03.

Owned-by-user tables use skeleton policies:

- select: `user_id = auth.uid()`
- insert: `user_id = auth.uid()`
- update: `user_id = auth.uid()` with the same check
- delete: `user_id = auth.uid()`

Special cases:

- `profiles`: self access by `id = auth.uid()`
- `user_roles`: self read only
- `audit_logs`: self read for `user_id` or `actor_user_id`
- `economic_indicators` / `economic_indicator_values`: authenticated global read only
- `system_job_runs` and `admin_observability_metrics`: RLS enabled with no broad human-user policy

The skeleton is intentionally not the final M04 authorization layer.

## Storage Foundation

The migration creates or updates a private Supabase Storage bucket when `storage.buckets` exists:

- bucket id/name: `invoice-imports`
- public: `false`
- MIME type: `application/pdf`
- size limit: `20MiB`
- conceptual object path: `invoice-imports/{user_id}/{import_batch_id}/source.pdf`

Storage object policies allow authenticated users to access only their own first path segment. No parser/import flow is implemented.

## AFR Migration Readiness

Physical support added:

- legacy traceability fields on `transactions` and `financial_commitments`: `legacy_source_system`, `legacy_table`, `legacy_id`, `legacy_payload_hash`, `migration_batch_id`
- `import_batches` / `import_items` metadata for file hashes, parser metadata, review status, dedupe, and source traceability
- `migration_ops.migration_batches` for batch status, source snapshot, code version, counts, reconciliation summary, report URI, and idempotency key
- `migration_ops.migration_entity_map` for legacy-to-new mapping, payload hashes, target references, split migrations, and migration status
- `migration_ops.migration_quarantine_records` for anomaly/quarantine strategy
- `migration_ops.migration_reconciliation_reports` for retained reconciliation artifacts

No AFR data migration, source extraction, cutover, or real personal data is included.

## Seed / Reference Data

`supabase/seed.sql` deterministically upserts macro indicator definitions only:

- `selic`
- `cdi`
- `ipca`
- `di`
- `usd_brl`

No economic values are invented. No personal or financial user data is seeded.

## Verification Commands

Executed locally:

```bash
npm run verify:schema:m03
```

Expected DB/runtime commands for a local/DEV environment with Supabase CLI and Docker/PostgreSQL:

```bash
supabase db reset
supabase test db
supabase db reset
supabase test db
```

Required inherited gates:

```bash
npm ci
npm run validate:env
npm run check:secrets
npm run format:check
npm run lint
npm run typecheck
npm run typecheck:e2e
npm run test
npm run build
git diff --check
```

## Results and Limitations

Verified:

- Static schema verification passed with `npm run verify:schema:m03`.
- The static verifier checks canonical enum values, table coverage, RLS enablement, ownership keys, required indexes/constraints, AFR migration metadata, private storage bucket foundation, seed idempotency, and banned patterns such as float money fields, `current_balance`, broad private `USING (true)`, and `security definer`.

NOT VERIFIED in this environment:

- Empty local/DEV database migration apply.
- Deterministic `supabase db reset` rerun.
- Runtime FK/constraint behavior in PostgreSQL.
- Runtime RLS/cross-user SQL checks.
- Storage bucket creation inside a live Supabase database.

Reason: this execution environment does not have Supabase CLI, Docker, `psql`, or a local PostgreSQL runtime available.

## Frozen Contract Deviations

None intentionally introduced.

Implementation detail within scope:

- AFR migration operational support is implemented under `migration_ops` because `AFR_MIGRATION_PLAN.md` allows migration control structures outside the normal user-facing app schema.
- `updated_at` uses a technical trigger only. No trigger implements financial rules, invoice calculation, recurrence generation, installments, payments, or balances.

## Scope Control

Not implemented:

- M04+ auth UI, signup/login/logout/password recovery/session UI, protected routes, complete authorization UX, or server-side application authorization.
- Repositories, domain services, finance UI, parser/import flow, recurrence engine, invoice engine, forecast, jobs, AFR migration implementation, cutover, product deploy, or Phase 2.
- Any edits to Frozen contracts or `Markdown Files/`.

## Secret / Hygiene Status

No real Supabase URL, project ID, service-role key, password, token, PDF, AFR data, or personal financial data is included. All values are local placeholders or deterministic synthetic UUIDs.
