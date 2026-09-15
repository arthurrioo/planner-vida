# Milestone 03 Review Remediation Report

Status: READY FOR INDEPENDENT MILESTONE 03 RE-REVIEW

## Branch, PR, and Commit Context

- Repository: `https://github.com/arthurrioo/planner-vida.git`
- Branch: `milestone-03-database-foundation`
- PR: `#2 - Milestone 03 - Database Physical Foundation`
- Original implementation commit retained in history: `f460a3e985a6c6be2aec29cf05122d30b933adaa`
- Remediation commit: created after validation and push on the same branch/PR
- Scope: remediation of Independent Review findings F1-F6 only
- No merge, squash, M04+ implementation, production deploy, production data, real PDF, or real secret was used

## Canonical M03 Definition

Source: `PHASE_1_IMPLEMENTATION_PLAN.md`, `Milestone 03 - Database Physical Foundation`.

- Objective: translate `DATABASE_SCHEMA.md` into an initial physical Supabase/PostgreSQL foundation without changing the frozen data contract.
- Scope: migration tooling, enums, base tables, constraints, FK strategy, indexes, audit columns, RLS skeleton, seed/reference data, storage bucket planning, and migration metadata support.
- Dependencies: Milestones 01-02.
- Tests: empty DEV database apply, deterministic reset workflow, enum match, required constraints/indexes, and preliminary RLS default-deny cross-user checks.
- Deliverables: initial database migrations, schema verification report, RLS skeleton, seed/reference data.
- Acceptance criteria: physical schema matches the frozen data contract or every deviation is recorded as an issue; no destructive migration behavior is hidden in app deploy.
- Exit gate: Database Foundation Freeze.

## Files Changed by Remediation

- `supabase/migrations/20260915000100_m03_database_physical_foundation.sql`
- `supabase/tests/m03_preliminary_checks.sql`
- `scripts/verify-m03-schema.mjs`
- `scripts/run-m03-runtime-harness.mjs`
- `src/validation/m03-schema-contract.test.ts`
- `package.json`
- `docs/milestone-03-schema-verification-report.md`

Frozen contract files and `Markdown Files/` were not changed.

## Finding Status

| Finding                                               | Status   | Evidence                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 - blanket authenticated hard-delete for owned rows | RESOLVED | Removed dynamic `owned_rows_delete`; added explicit per-table DELETE policies. Runtime harness proves owner cannot hard-delete `transactions.status='posted'`, can delete draft transaction, cannot delete class A transfer, can delete representative class C unreferenced account, and cannot delete cross-user rows. |
| F2 - stale verification report                        | RESOLVED | This report replaces the stale `NOT READY` runtime-gate language and records remediation, PostgreSQL 17.11 compatibility harness evidence, limitations, and final re-review status.                                                                                                                                     |
| F3 - `transactions.amount > 0` unconditional          | RESOLVED | `transactions.amount` now enforces `status <> 'posted' OR amount > 0`. Runtime harness and preliminary checks prove posted zero is rejected and draft zero is accepted.                                                                                                                                                 |
| F4 - annual obligation installment zero accepted      | RESOLVED | `annual_obligation_installments.amount` changed from `>= 0` to `> 0`. Runtime harness and preliminary checks prove zero is rejected and positive value is accepted.                                                                                                                                                     |
| F5 - semantic `CHECK (true)` constraints              | RESOLVED | Removed `provisions_no_real_simulation_origin` and `admin_observability_no_user_column`. Replaced intent with SQL comments. Runtime introspection confirms `admin_observability_metrics` has no `user_id`.                                                                                                              |
| F6 - static verifier missed F1                        | RESOLVED | Verifier now rejects blanket `owned_rows_delete`, dynamic `CREATE POLICY ... FOR DELETE`, authenticated DELETE policies on hard-delete denied tables, missing draft-only DELETE policies, missing class C explicit policies, relaxed F3/F4 constraints, and `CHECK (true)`. Unit tests cover these regression paths.    |

## DELETE Policy Matrix

The matrix is derived from `DATABASE_SCHEMA.md` sections 1.8, 5, 7, and 9. Physical deletion by authenticated owners is narrower than SELECT/INSERT/UPDATE. Backend/service-role maintenance remains outside browser/user policies and must be server-side/audited when used.

| Class                                                  | Tables                                                                                                                                                                                                                                                                                                                          | Authenticated owner hard-delete policy                         | Contract basis                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A - denied for financial/auditable/historical records  | `transfers`, `installment_plans`, `installments`, `recurrence_occurrences`, `credit_card_invoices`, `invoice_items`, `financial_commitments`, `asset_valuations`, `liability_balances`, `annual_obligation_installments`, `provisions`, `import_batches`, `import_items`                                                        | No authenticated DELETE policy                                 | Historical financial facts, source-of-truth layers, import traceability, recurring/materialized history, snapshots, accruals, invoice/payment auditability, and no contract-approved owner hard-delete state.                         |
| B - draft/pre-effect only                              | `transactions(status='draft')`, `invoice_payments(status='draft')`, `budgets(status='draft')`, `annual_obligations(status='draft')`                                                                                                                                                                                             | DELETE only when `user_id = auth.uid()` and `status = 'draft'` | `DATABASE_SCHEMA.md` permits physical deletion for drafts/records not yet effective; posted transactions and financial corrections must use void/reversal/audit trail.                                                                |
| C - configurable/operational/hypothetical owner delete | `accounts`, `credit_cards`, `categories`, `recurrence_rules`, `budget_lines`, `planning_items`, `financial_goals`, `simulation_scenarios`, `simulation_scenario_versions`, `events`, `tasks`, `shopping_lists`, `shopping_list_items`, `wishlist_items`, `subscriptions`, `assets`, `liabilities`, `merchant_category_mappings` | DELETE when `user_id = auth.uid()`                             | Configurable, operational, planner, shopping, goal, simulation, and mapping entities where the frozen contract does not require immutable financial retention. Existing FK constraints still prevent deleting referenced/in-use rows. |

No table remained ambiguous after reviewing the frozen contract; no `CONTROL TOWER DECISION REQUIRED` item is open.

## RLS Changes

- Preserved generic owned-row SELECT/INSERT/UPDATE policies:
  - SELECT: `user_id = auth.uid()`
  - INSERT: `user_id = auth.uid()`
  - UPDATE: `user_id = auth.uid()` with same `WITH CHECK`
- Removed generic owned-row DELETE generation from the loop.
- Added explicit class B draft-only DELETE policies:
  - `transactions_delete_draft_owner`
  - `invoice_payments_delete_draft_owner`
  - `budgets_delete_draft_owner`
  - `annual_obligations_delete_draft_owner`
- Added explicit class C owner DELETE policies.
- Added no authenticated DELETE policy for class A tables.
- Preserved `profiles`, `user_roles`, `audit_logs`, macro read, storage, migration_ops, service_role grant, and admin observability boundaries.

## Constraint Changes

- `transactions.amount`: changed to `CHECK (status <> 'posted' OR amount > 0)`.
- `annual_obligation_installments.amount`: changed to `CHECK (amount > 0)`.
- Removed no-op `CHECK (true)` constraints.
- Added comments documenting structural invariants for `provisions` and `admin_observability_metrics`.
- `admin_observability_metrics` remains physically without `user_id`.

## Static Verifier Changes

`scripts/verify-m03-schema.mjs` now checks:

- no `owned_rows_delete` policy name;
- no dynamic `CREATE POLICY ... FOR DELETE`;
- no authenticated DELETE policy for class A tables;
- required draft-only DELETE policies for class B tables;
- required explicit owner DELETE policies for class C tables;
- `transactions` table block contains the posted-only positive amount rule;
- `annual_obligation_installments` table block rejects zero;
- no semantic `CHECK (true)`;
- comments exist for the two removed no-op constraints.

`src/validation/m03-schema-contract.test.ts` now includes negative regression tests for blanket DELETE, missing transaction draft-only DELETE, relaxed annual installment amount, and relaxed transaction amount.

## Preliminary SQL Test Changes

`supabase/tests/m03_preliminary_checks.sql` was expanded to 35 checks covering:

- schema, enum, index, type, RLS policy, private storage bucket, invalid enum, and seed uniqueness checks;
- class A/B/C DELETE representatives;
- posted transaction hard-delete blocked;
- draft transaction hard-delete allowed;
- cross-user INSERT/UPDATE/DELETE blocked;
- owner cannot update `user_id` to seize ownership;
- posted zero transaction rejected and draft zero transaction accepted;
- annual obligation installment zero rejected and positive installment accepted;
- storage object policies present;
- macro read allowed;
- non-admin authenticated user has no broad admin metrics read policy.

## Runtime Environment and Results

Runtime used:

- PostgreSQL: `psql (PostgreSQL) 17.11 (Homebrew)`
- Harness: `scripts/run-m03-runtime-harness.mjs`
- Execution: local disposable PostgreSQL clusters under OS temp directory
- Supabase compatibility stubs: minimal `auth.users`, `auth.uid()`, `storage.buckets`, `storage.objects`, and `storage.foldername()` for migration/runtime compatibility
- Supabase CLI/Docker: not available in this environment
- Supabase hosted/local real project: not executed

Runtime command:

```bash
npm run verify:runtime:m03:pg
```

Runtime result:

- Clean reset/apply cycle 1: PASSED
- Clean reset/apply cycle 2: PASSED
- Empty-db apply: PASSED in both cycles
- Seed idempotency: PASSED; `economic_indicators` remained at 5 deterministic macro rows after applying seed twice per cycle
- Schema introspection per cycle:
  - public tables: 42
  - public RLS tables: 42
  - public authenticated DELETE policies: 22
  - macro seed rows: 5
  - `invoice-imports` private bucket: true

Runtime adversarial checks passed:

- owner cannot hard-delete `transactions.status='posted'`;
- owner can hard-delete own `transactions.status='draft'`;
- owner cannot hard-delete class A `transfers`;
- owner can hard-delete representative class B draft annual obligation;
- owner can hard-delete representative class C unreferenced account;
- user A cannot insert/update/delete user B rows;
- owner cannot mutate `user_id` to user B;
- posted zero transaction rejected;
- draft zero transaction accepted;
- annual obligation installment zero rejected;
- positive annual obligation installment accepted;
- storage cross-user insert/read blocked by path policy in harness;
- authenticated macro read works;
- authenticated non-admin cannot read admin metrics via broad policy.

## Mandatory Gates

Executed:

```bash
npm ci
npm run verify:schema:m03
npm run validate:env
npm run check:secrets
npm run format:check
npm run lint
npm run typecheck
npm run typecheck:e2e
npm run test
npm run build
npm run verify:runtime:m03:pg
git diff --check
```

Results are recorded in the final delivery message for the remediation commit. No gate is allowed to be treated as passed unless it was executed successfully after remediation.

## Scope and Hygiene

- No Frozen contract file changed.
- No `Markdown Files/` file changed.
- No M04+ auth flow, UI, repository/service layer, parser, recurrence engine, invoice engine, AFR migration execution, deploy, cutover, Phase 2 feature, household/shared ownership, or production behavior was implemented.
- No `SECURITY DEFINER`, floating-point monetary storage, `current_balance`, service-role browser policy, `USING (true)` on private data, broad admin/user bypass, or business trigger was introduced.
- No real Supabase URL, project ID, service-role key, password, token, PDF, AFR source data, dump, runtime log, or personal financial data was committed.

## Limitations

- Supabase CLI and Docker were not available, so `supabase db reset` and `supabase test db` were not executed.
- Supabase hosted/local real Storage/Auth behavior was not claimed as verified.
- Runtime validation was performed through a PostgreSQL 17.11 compatibility harness with minimal Supabase Auth/Storage stubs.
- The static verifier remains a guardrail, not a proof of RLS security; runtime tests remain required for milestone review.

## Final Assessment

F1-F6 are resolved with targeted M03-only changes. The migration applies from an empty PostgreSQL 17.11 database in two clean reset cycles, the seed is idempotent, adversarial RLS/DELETE checks pass, and no Frozen contract or M04+ scope was modified.

Final status: READY FOR INDEPENDENT MILESTONE 03 RE-REVIEW
