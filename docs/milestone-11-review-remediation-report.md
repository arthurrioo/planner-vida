# Milestone 11 Review Remediation Report

## 1. Branch, PR, and Heads

Branch: `milestone-11-statement-filters-balance-invariants`

PR: `#10 - Milestone 11 - Statement, Filters, and Balance Invariants`

Old HEAD before remediation: `01c765a`

Original M11 commits:

- `76dae6e` - `feat: implement milestone 11 statement`
- `1f3088c` - `docs: add milestone 11 implementation report`
- `01c765a` - `docs: update milestone 11 pull request link`

Remediation changes are committed after `01c765a` on the same branch/PR. The final pushed commit list is the range `01c765a..HEAD`.

## 2. F1 Deterministic Ordering and Pagination

Status: RESOLVED.

Implementation:

- `SupabaseTransactionRepository.list` now orders statement rows by:
  - `transaction_date DESC`
  - `created_at DESC`
  - `id DESC`
- Offset pagination remains unchanged; only the ordering was made total and deterministic.
- The data query semantics remain the same for filters, limit, and offset.

Evidence:

- Added repository-level regression coverage that asserts the exact order chain includes `id DESC`.
- Added statement-domain pagination coverage for rows tied on `transaction_date` and `created_at`, proving concatenated pages match the full query order without duplicates.
- Expanded `verify:runtime:m11:statement` with a PostgreSQL dataset containing 12 ordinary rows plus 2 transfer legs sharing the same `transaction_date` and `created_at`; the harness fetches multiple pages through the real `StatementService` and proves:
  - no duplicate rows;
  - no missing rows;
  - concatenated page order equals the full query order;
  - order equals `transaction_date DESC, created_at DESC, id DESC`;
  - tied transfer legs remain visible and stable.

## 3. F2 Inverted Date Range UI Handling

Status: RESOLVED.

Canonical domain behavior is preserved:

- `dateFrom > dateTo` still raises `DomainError` with `VALIDATION_FAILED` from the statement domain/service path.

UI remediation:

- `/app/financeiro/extrato` now catches only `DomainError` with code `VALIDATION_FAILED`.
- The page renders the Extrato screen instead of propagating a 500/error boundary.
- The page preserves typed filter values from the query string.
- The validation message is clear and accessible:
  - text: `Revise o periodo informado: a data inicial deve ser anterior ou igual a data final.`
  - `role="alert"`
- Unexpected errors are rethrown and are not masked as validation.

Evidence:

- Page tests cover:
  - `dateFrom < dateTo` normal render;
  - `dateFrom == dateTo` normal render;
  - `dateFrom > dateTo` renders accessible validation alert and preserves typed filter values;
  - malformed date param remains safely ignored by the existing query parser and does not expose raw storage errors.

## 4. F3 Real Financial Invariant Architecture

Status: RESOLVED.

The M11 runtime harness was rebuilt so the principal evidence goes through real application paths instead of SQL-only recomputation.

Real paths used:

- `StatementService` real domain service.
- `SupabaseTransactionRepository` real repository.
- `SupabaseTransactionReferenceRepository` real reference repository.
- `AccountService` real M07 service.
- `SupabaseAccountRepository.getBalanceMovements` real M07 repository path.
- `calculateAccountBalance` real M07 calculation through `AccountService.listAccounts`.
- `TransactionService` real M09 service path for ordinary transactions.
- `SupabaseTransactionRepository.reverse/correct` real M09 RPC paths.
- `TransferService` real M10 service path for transfers.
- `SupabaseTransferRepository.create/reverse/correct` real M10 RPC paths.
- Disposable PostgreSQL with real migrations, RLS, roles, and synthetic data.

The harness uses a small PostgreSQL-backed Supabase adapter only to route the existing repositories/services to the disposable database. It does not reimplement balance formulas as primary evidence.

## 5. Financial Scenarios Covered

Base scenario:

- Account A opening balance: `100.0000`
- Account B opening balance: `0.0000`
- Account C opening balance: `0.0000`
- Income `+50.0000` on A.
- Expense `-20.0000` on A.
- Investment `-10.0000` on A.
- Credit-card expense `40.0000` with no account impact.
- Transfer A -> B `30.0000`.

Proved with real M07 balance path:

- A = `90.0000`
- B = `30.0000`
- C = `0.0000`
- A+B+C combined = `120.0000`
- Credit-card row appears in statement but does not reduce A.
- Transfer preserves internal combined account value.

M09 lifecycle evidence:

- Void of posted income leaves balances unchanged.
- Reverse of posted expense leaves original/reversal outside balance.
- Correction of posted expense applies only replacement posted effect.
- Reversed and replacement statuses remain visible in statement.

M10 lifecycle evidence:

- Reverse transfer returns A/B to pre-transfer state.
- Correction `30.0000 -> 10.0000` applies only replacement.
- Destination correction B -> C removes effect from B and applies it to C.
- Transfer rows continue routing to M10 transfer detail paths.

## 6. Statement Assertions and Filters

Runtime M11 now covers real statement behavior for:

- own transaction visible;
- foreign transaction hidden;
- own transfer legs visible;
- foreign data hidden through real service/RLS path;
- account filter;
- category/subcategory filter;
- card filter;
- type filter;
- method filter;
- status filter;
- date filter;
- search filter;
- combined filters;
- credit-card statement visibility with no account balance impact;
- historical archived category label display through the real statement path;
- transfer detail routing to `/app/financeiro/transferencias/<transferId>`.

## 7. Ownership and RLS Evidence

Runtime M11 creates User A and User B in the disposable PostgreSQL auth schema.

Evidence:

- User B sees only User B statement rows.
- User A cannot see User B transaction rows by search.
- User B cannot infer User A account rows by filtering with User A account id.
- Anonymous direct statement table read is denied.

## 8. Runtime Harness Expansion

`npm run verify:runtime:m11:statement` now applies M03/M04/M09/M10 migrations and seed data, creates synthetic M11 data, and validates through real TypeScript service/repository paths against PostgreSQL.

Coverage includes:

- persisted rows;
- RLS/auth context;
- M07 balance path;
- M09 lifecycle path;
- M10 transfer lifecycle path;
- deterministic tied timestamp pagination;
- transfer routing context;
- credit-card no-account-impact invariant;
- historical archived category label context;
- ownership isolation.

## 9. Tests and Gates

Executed and passed:

- `npm ci`
- `npm run validate:env:ci`
- `npm run check:secrets`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:e2e`
- `npm run test` - 45 files, 205 tests passed
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

Environment note:

- PostgreSQL runtime harnesses and Playwright E2E required outside-sandbox execution because the sandbox blocks local shared memory and port binding. All reruns passed outside the sandbox against disposable local resources.
- No production or hosted Supabase data was touched.

## 10. M03-M10 Regression Status

- M03 schema verification passed.
- M03 PostgreSQL runtime passed.
- M04 auth/RLS runtime passed.
- M07 accounts runtime passed.
- M08 categories runtime passed.
- M09 transactions runtime passed.
- M10 transfers runtime passed.

No schema migration, RLS change, or M07/M09/M10 lifecycle behavior change was introduced for this remediation.

## 11. Scope Hygiene

Confirmed scope:

- Same branch used.
- Same PR used.
- No merge.
- No squash.
- No force push.
- No M12+ work.
- No Cards/Invoices CRUD.
- No new schema migration.
- No shadow ledger, statement table, cache, or mutable balance source.
- M11 remains a read/composition layer.

Frozen docs and `Markdown Files/` status:

- Frozen canonical docs were not edited.
- `Markdown Files/` was not edited.

## 12. F4-F9 Deferred

The following remain deferred as MINOR/FUTURE per Control Tower scope:

- F4 search wildcards not escaped.
- F5 no direction/lineage field.
- F6 invalid params silently discarded.
- F7 query volume via M07 dependency counts.
- F8 minor pagination/message accessibility gaps beyond the required F2 alert.
- F9 `/extrato` authenticated E2E / main nav.

## 13. Remaining Limitations

- Hosted Supabase/GoTrue was not exercised.
- Runtime evidence uses disposable local PostgreSQL, synthetic users, and synthetic finance data.
- The report commit hash itself is resolved by `git log` after the report is committed; the remediation range is `01c765a..HEAD`.

READY FOR INDEPENDENT MILESTONE 11 RE-REVIEW
