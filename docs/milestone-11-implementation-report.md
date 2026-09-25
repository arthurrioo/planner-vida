# Milestone 11 Implementation Report

## 1. Canonical Milestone 11 Definition

Source: `PHASE_1_IMPLEMENTATION_PLAN.md`.

Title: Milestone 11 - Statement, Filters, and Balance Invariants

Objective: Provide the AFR-style financial statement and lock core realized-finance invariants before advanced mechanics.

Scope: Statement listing, filters by date/type/category/method/account/card, editing entry points, account balance presentation, invariant test pack.

Dependencies: Milestones 07-10.

Implementation Tasks:

- Implement statement query service.
- Implement filters/search.
- Show account/card/category/payment method context.
- Connect edit/void/reversal actions.
- Display account balances from the balance service.
- Add invariant regression tests for realized finance.

Database Impact: Uses transaction indexes for statement/dashboard/P&L access.

Domain/Application Impact: Adds read/query layer for financial facts.

UI Impact: Financeiro/Extrato screen.

Security Impact: Queries scoped to authenticated `user_id`.

Tests:

- Filter combinations.
- Pagination/list ordering.
- Balance invariants after income/expense/investment/transfer.
- RLS read isolation.
- Regression tests for credit-card purchase not reducing account balance.

AFR Feature-Parity Impact: Preserves AFR extrato filters, editing access, and account-balance behavior.

Migration Impact: Provides query surfaces used later for reconciliation sampling.

Deliverables:

- Statement service/UI.
- Core finance invariant test pack.

Acceptance Criteria:

- User can review and filter realized financial history.
- Balance invariant tests are green.

Exit Gate: Financial Core Freeze.

## 2. Branch, Commits, and PR

Branch: `milestone-11-statement-filters-balance-invariants`

Commits:

- `76dae6e` - `feat: implement milestone 11 statement`

Pull Request: pending at initial report creation; will be updated after PR creation.

## 3. Files Changed

Created:

- `docs/milestone-11-implementation-report.md`
- `scripts/run-m11-statement-runtime-harness.mjs`
- `src/app/app/financeiro/extrato/page.tsx`
- `src/application/statements/statement-service.ts`
- `src/domain/statements/index.ts`
- `src/domain/statements/statements.ts`
- `src/domain/statements/statements.test.ts`

Updated:

- `package.json`
- `src/app/app/financeiro/page.tsx`
- `src/domain/transactions/transactions.ts`
- `src/infrastructure/transactions/supabase-transaction-repository.ts`

## 4. Architecture and Flow Implemented

Flow: UI -> `createStatementService` -> `StatementService` -> existing Supabase-backed repositories and M07 balance service.

The new statement module is read/query only:

- `StatementService.getStatement` parses and validates statement filters.
- `SupabaseTransactionRepository.list` now supports bounded `limit` and `offset` for pagination while preserving existing ordering by `transaction_date desc, created_at desc`.
- Statement results enrich transaction facts with account, credit-card, category/subcategory, payment method, status, and detail-path context.
- Account balances are loaded through the existing `AccountService.listAccounts`, preserving M07 calculated-balance semantics.
- The `/app/financeiro/extrato` screen displays account balances, full filter controls, paginated realized history, and links each row to the existing lifecycle detail surface.

No schema redesign, RLS change, mutation path, transfer RPC change, transaction RPC change, audit infrastructure change, or M12+ behavior was added.

## 5. Domain Rules and Invariants

- Statement queries are scoped by `RepositoryContext.userId`.
- Returned transactions, account references, category references, credit-card references, and account balances are asserted as owned by the context.
- Filters cover date range, transaction type, category/subcategory, payment method, account, card, status, and description search.
- Pagination uses one extra fetched row to determine `hasNextPage` without exposing that row.
- Transfer rows keep M10 semantics and route to transfer detail when `transfer_id` is present.
- Non-transfer rows route to transaction detail, where M09 edit/void/reversal controls already enforce lifecycle rules.
- Account balances remain derived from opening balance plus movements; no mutable current balance was introduced.
- Credit-card purchase rows remain realized facts in statement history but do not reduce account balance until future invoice payment mechanics.

## 6. Reuse of Frozen Foundations

M06 shared foundations:

- Reused `RepositoryContext`, `UserId`, `DomainError`, `assertOwnedByContext`, canonical enums, enum labels, `LocalDate`, and exact `Money`.
- Reused M06 validation style for filter parsing and public domain errors.

M07 Accounts:

- Reused `AccountService.listAccounts` so displayed balances are calculated by the frozen balance service.
- Preserved opening-balance + movement source-of-truth behavior.

M08 Categories:

- Reused category IDs and category/subcategory hierarchy for filters and display context.
- Filters match either `category_id` or `subcategory_id`.

M09 Transactions:

- Reused `TransactionRepository.list` and transaction lifecycle detail pages.
- Preserved posted fact lifecycle: statement links to existing correction/void/reversal controls instead of adding a parallel mutation path.
- Added only bounded read pagination support to the repository search contract.

M10 Transfers:

- Transfer statement rows remain `transaction_type='transfer'`, `payment_method='bank_transfer'`, no category/P&L classification.
- Transfer rows route to M10 transfer details and lifecycle controls.

Audit infrastructure:

- M11 adds no new mutations, so no new audit writer path was needed.
- Existing M09/M10 mutation detail pages remain the audited lifecycle entry points.

## 7. Authorization and Ownership Matrix

| Surface                     |       Required actor | Ownership / authorization behavior                                                             | Evidence                           |
| --------------------------- | -------------------: | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| Statement page              |   authenticated user | `getAuthenticatedSession` gates access and preserves `nextPath`                                | E2E protected-route suite          |
| Statement transaction query |   authenticated user | repository filters by `transactions.user_id = context.userId`; service asserts ownership again | unit tests and M11 runtime harness |
| Statement references        |   authenticated user | account/category/card reference lists are scoped by user and service-owned assertions          | unit tests                         |
| Account balances            |   authenticated user | `AccountService.listAccounts` uses M07 repository scoping and calculated balances              | unit tests and M07/M11 runtime     |
| Cross-user reads            | authenticated user B | user B sees only user B rows; user A rows are hidden by RLS                                    | M11 runtime harness                |
| Anonymous reads             |                 anon | direct table read is denied                                                                    | M11 runtime harness                |

## 8. Atomicity and Consistency

M11 itself is read-only and performs no financial multi-record mutation.

Consistency is inherited from frozen mutation boundaries:

- M09 transaction correction/reversal remains atomic through PostgreSQL RPC.
- M10 transfer create/reverse/correct remains atomic through PostgreSQL RPC.
- Statement output reads the realized facts produced by those boundaries and does not mutate or reconcile them.

The new M11 runtime harness validates statement-visible invariants over persisted PostgreSQL rows created through existing M09/M10-compatible data paths, including transfer rows and credit-card purchase exclusion from account balance.

## 9. Tests Executed and Results

Executed successfully:

- `npm ci`
- `npm run validate:env:ci`
- `npm run check:secrets`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:e2e`
- `npm run test` - 43 files, 199 tests passed
- `npm run build`
- `npm run test:e2e` - 14 tests passed
- `npm run verify:schema:m03`
- `npm run verify:runtime:m03:pg`
- `npm run verify:runtime:m04:auth`
- `npm run verify:runtime:m07:accounts`
- `npm run verify:runtime:m08:categories`
- `npm run verify:runtime:m09:transactions`
- `npm run verify:runtime:m10:transfers`
- `npm run verify:runtime:m11:statement`
- `git diff --check`

M11-specific tests added:

- Filter combination by date/type/category/method/account/search.
- Pagination and deterministic ordering.
- Account/card/category/payment method context enrichment.
- Transfer row routing to transfer lifecycle detail.
- Card row routing to transaction lifecycle detail.
- Cross-user denial when a repository returns leaked rows.
- Balance invariant after income, expense, investment, and transfer movements.
- Credit-card purchase not reducing account balance.
- Runtime RLS read isolation for owner A, owner B, and anon.

## 10. Runtime Environment and Limitations

Runtime environment:

- Local disposable PostgreSQL clusters created by milestone harnesses.
- Synthetic users, accounts, categories, card, transactions, and transfer data only.
- Playwright local web server for E2E.

Limitations:

- Hosted Supabase/GoTrue was not exercised.
- Production data and production services were not touched.
- PostgreSQL and Playwright gates required execution outside the sandbox because the sandbox blocks shared memory or local port binding.

## 11. Regression Gates M03-M10

Verified:

- M03 schema and PostgreSQL runtime passed.
- M04 auth/RLS runtime passed.
- M05 shell/navigation remained covered by build and E2E protected-route/navigation suite.
- M06 shared foundation unit tests passed as part of full unit suite.
- M07 accounts runtime passed.
- M08 categories runtime passed.
- M09 transactions runtime passed.
- M10 transfers runtime passed.

## 12. Frozen Docs, Markdown Files, and M12+ Status

- Frozen canonical docs were not modified.
- `Markdown Files/` was not modified.
- No M12+ schema, installments, credit-card invoice cycle, recurrence, commitment, provision, planning, simulation, forecast, deployment, or migration cutover work was implemented.

## 13. Secrets and Hygiene

- `npm run check:secrets` passed.
- No `.env`, real Supabase project ID, service-role key, token, dump, PDF, or personal/financial production data was added.
- M11 runtime data is synthetic and generated inside disposable local PostgreSQL clusters.

## 14. Divergences or Blocking Decisions

No `BLOCKING DECISION REQUIRED`.

No frozen contract change was needed.

Status: `READY FOR INDEPENDENT MILESTONE 11 REVIEW`
