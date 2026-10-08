# Milestone 12 Implementation Report

## 1. Canonical Milestone Definition

### Milestone 12 - Installments

**Objective**

Implement the new installment model without fake parent transactions or double counting.

**Scope**

`installment_plans -> installments -> transactions / commitments`, purchase creation, 24x UI, 60x domain/database, rounding, scheduled/future/posted installments, card/account behavior, cancellation/reversal.

**Dependencies**

Milestones 07-11.

**Implementation Tasks**

- Implement installment plan creation.
- Enforce UI max 24 for ordinary purchases and domain/database max 60.
- Generate installments with deterministic cent rounding.
- Link posted installment to transaction when realized.
- Link credit-card installment to invoice assignment later.
- Support scheduled future installments without making them realized facts.
- Support cancellation/reversal with audit.
- Add installment purchase UI and detail view.

**Database Impact**

Uses `installment_plans`, `installments`, `transactions`, future `financial_commitments` link fields.

**Domain/Application Impact**

Adds installment domain service and rounding invariants.

**UI Impact**

Installment flow in transaction/card purchase forms.

**Security Impact**

All referenced account/card/category records must belong to same user.

**Tests**

- 2x, 3x, 24x, and 60x domain tests.
- Rounding residual tests.
- No fake parent transaction test.
- No double counting in totals.
- Cancellation/reversal tests.
- Cross-user reference rejection.

**AFR Feature-Parity Impact**

Preserves AFR installment behavior while removing parent-transaction fragility.

**Migration Impact**

Must support migration of AFR parent/children installment groups into plan/installment records.

**Deliverables**

- Installment service.
- Installment UI.
- Tests.

**Acceptance Criteria**

- Sum of installments reconciles to plan total.
- Reports never need to ignore a fake parent record.

**Exit Gate**

Installments Freeze.

## 2. Branch, Commits, and PR

- Branch: `milestone-12-installments`
- Implementation commit: `f2d6c6b` (`feat: implement milestone 12 installments`)
- Report commit: branch HEAD containing this report
- Pull request: [#11 - Milestone 12 - Installments](https://github.com/arthurrioo/planner-vida/pull/11)
- Base: `main`
- Baseline: `8e2767b` (merge of PR #10 / frozen M11)
- Merge status: not merged

## 3. Files Changed

- Domain: `src/domain/installments/` with service contracts, exact rounding, lifecycle rules, ownership checks, and tests.
- Application/infrastructure: `src/application/installments/` and `src/infrastructure/installments/` with server-side composition, Supabase repositories, and RPC adapters.
- UI: `src/app/app/financeiro/parcelamentos/`, `src/components/installments/`, and the Finance module entry in `src/app/app/financeiro/page.tsx`.
- Database: `supabase/migrations/20260926000100_m12_installments_atomic_rpc.sql`.
- Verification: `scripts/verify-m12-installments.mjs`, `scripts/run-m12-installments-runtime-harness.mjs`, `package.json`, and `e2e/bootstrap.spec.ts`.
- Report: `docs/milestone-12-implementation-report.md`.

## 4. Architecture and Implemented Flow

The implemented flow is `UI -> server action -> InstallmentService -> domain validation -> Supabase repository -> atomic PostgreSQL RPC`.

Plan creation writes one `installment_plans` row, N `installments` rows, and N linked `financial_commitments` rows in one database transaction. It writes no transaction parent. A scheduled installment becomes a realized fact only through `realize_installment`, which atomically creates one M09-compatible posted expense transaction, links it to the installment and commitment, and updates both states. Cancellation locks the complete plan, reverses posted installment facts, cancels future installments and commitments, then cancels the plan.

The UI provides a mobile-first list/create page and a detail page with schedule, totals, realization action, cancellation confirmation, account/card context, validation alerts, and historical status.

## 5. Rules and Invariants

- Ordinary UI creation is limited to 24 installments; domain and database boundaries allow at most 60.
- BRL totals must use cent precision. Distribution is deterministic: quotient cents are assigned to all installments and residual cents to the earliest installments.
- Due dates use monthly `LocalDate` increments with end-of-month clamping; the database independently verifies amount and date schedules.
- Installment sums must equal the plan total exactly.
- Scheduled installments and commitments are not realized transactions.
- A realization can create exactly one posted transaction; row locking prevents concurrent double realization.
- Credit-card installments carry `credit_card_id`, no `account_id`, and therefore no immediate account balance impact. `invoice_id` remains null for later M13 assignment.
- Account methods require an active account; benefit methods require a benefit account. Credit-card method requires an active card.
- Expense category/subcategory must be active and type-compatible.
- Plans and posted facts are never hard-deleted.
- M09 ordinary correction/reversal remains unavailable because installment facts use `origin_type = installment`, not `manual`.

## 6. Foundation and Dependency Reuse

- M06: `Money`, BRL minor units, `LocalDate`, enum contracts/labels, normalization, `DomainError`, validation issues, repository context, audit events, redacted privileged audit writer, and structured logging.
- M07: account references/status rules and the existing calculated-balance semantics; no mutable balance field was added.
- M08: active category selection, parent/subcategory ownership, and expense type compatibility.
- M09: posted transaction schema, lifecycle ownership by origin, reversal lineage fields, and account/card impact semantics.
- M10: no transfer rows or transfer lifecycle were changed.
- M11: installment transactions remain ordinary statement rows with the frozen ordering/filtering path; no statement source-of-truth was introduced.
- M03/M04: existing composite ownership foreign keys, RLS policies, and no-delete matrix remain unchanged.

## 7. Authorization and Ownership Matrix

| Operation                       | Owner                                   | Other user                     | Anonymous               | Human admin                     |
| ------------------------------- | --------------------------------------- | ------------------------------ | ----------------------- | ------------------------------- |
| List/read plan and installments | Allowed by owner RLS                    | No rows                        | Denied/no rows          | No cross-user financial bypass  |
| Create plan                     | Allowed with owned active references    | Cross-user references rejected | Authentication required | Same individual ownership rules |
| Realize installment             | Allowed for owned scheduled installment | Rejected as inaccessible       | Authentication required | No cross-user financial bypass  |
| Cancel/reverse plan             | Allowed for owned plan                  | Rejected as inaccessible       | Authentication required | No cross-user financial bypass  |
| Hard delete                     | No owner delete policy                  | Denied                         | Denied                  | No financial superuser behavior |

Ownership is checked in the service and repeated inside `SECURITY INVOKER` RPCs using `auth.uid()`, RLS, user-scoped row locks, and frozen composite foreign keys.

## 8. Atomicity and Multi-record Consistency

`create_installment_plan`, `realize_installment`, and `cancel_installment_plan` are single PostgreSQL RPC transactions with `SECURITY INVOKER` and fixed `search_path`. There are no independent client writes and no hidden triggers. Validation failures roll back plans, installments, commitments, and transactions together. Realization and cancellation lock their plan/installment/transaction rows. The M12 runtime forces two overlapping realization sessions and proves one success, one `m12_installment_conflict`, and exactly one transaction.

## 9. Tests and Results

- `npm ci`: passed.
- Environment, secrets, format, lint, app typecheck, and E2E typecheck: passed.
- Unit/component suite: 48 files, 221 tests passed.
- M12-focused unit/component tests: 3 files, 16 tests passed.
- Production build: passed; list and detail routes compiled.
- Playwright: 14/14 passed on desktop Chromium and mobile Chrome, including protected M12 deep links.
- Schema verification: M03 and M12 passed.
- M12 PostgreSQL: passed 2x/3x/24x/60x, residual and cent precision, deterministic schedule, no parent transaction, no double count, rollback, account/card behavior, cancellation/reversal, idempotent cancellation, hard-delete denial, cross-user denial, and forced concurrent realization.
- `git diff --check`: passed.

## 10. Runtime Environment and Limitations

All database evidence used a disposable local PostgreSQL 17 cluster with synthetic users and financial data. PostgreSQL harnesses and Playwright ran outside the restricted sandbox because shared-memory allocation and local port binding are blocked inside it. No production or hosted project was accessed.

Hosted Supabase/GoTrue behavior was not exercised. Credit-card invoice assignment is intentionally deferred to M13 as required by the canonical M12 wording; M12 preserves `invoice_id` for that later link.

## 11. M03-M11 Regression Status

- M03 PostgreSQL/schema: passed, including two clean reset cycles.
- M04 Auth/RLS: passed, including two clean reset cycles.
- M07 Accounts: passed.
- M08 Categories: passed.
- M09 Transactions: passed.
- M10 Transfers: passed, including real M07 balance integration.
- M11 Statement: passed.

No frozen M03-M11 contract was rewritten. The M12 migration is additive and uses tables/links already defined by the frozen schema.

## 12. Frozen Docs, Markdown Files, and M13+ Status

`PHASE_1_IMPLEMENTATION_PLAN.md`, `DATABASE_SCHEMA.md`, `PLANNER_PHASE_1_ARCHITECTURE.md`, `PLANNER_PHASE_1_SPEC.md`, AFR canonical documents, all other Frozen docs, and `Markdown Files/` are untouched. No M13 invoice calculation, assignment, payment, or card lifecycle was implemented. No M13+ feature was anticipated.

## 13. Secrets and Repository Hygiene

`npm run check:secrets` passed. No `.env`, token, project ID, production data, personal data, dumps, build artifacts, service-role client, or generated database cluster is included. Runtime data uses reserved synthetic UUIDs and `.invalid` email addresses. Final diff review was performed against `origin/main`.

## 14. Divergences and Blocking Decisions

No frozen-contract change or blocking ambiguity was required. The dedicated installment purchase flow is linked from Finance instead of modifying the frozen M09 transaction form; later card invoice assignment remains explicitly deferred to M13. AFR migration execution is not part of M12 runtime scope, while the plan/installment/source fields required for future AFR group migration are preserved.

`READY FOR INDEPENDENT MILESTONE 12 REVIEW`
