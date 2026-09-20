# Milestone 09 Review Remediation Report

## 1. Branch / PR / Heads

- Branch: `milestone-09-transactions`
- PR: #8 — Milestone 09 - Transactions
- Old HEAD before remediation: `5fddb3bb9ea17de4ff3eea27bc2348c08951bd29`
- Original M09 commits: `d1cfaa9`, `5fddb3b`
- Remediation code commit: `debc5dcb5d35753a628d5d8830a907d1eabbe050`
- Report commit: the commit containing this file.

## 2. F1 Atomicity Design

F1 was remediated by adding explicit PostgreSQL RPC boundaries for lifecycle operations that need multiple writes:

- `public.reverse_transaction(uuid, text)`
- `public.correct_transaction(uuid, text, jsonb)`

Both functions are `SECURITY INVOKER`, use `auth.uid()` as the user source of truth, and run inside the single PostgreSQL transaction boundary of the function call.

`reverse_transaction`:

- locks the original transaction with `SELECT ... FOR UPDATE`;
- validates authenticated owner, `posted` status, and `manual` origin;
- checks that no reversal row already exists;
- inserts exactly one reversed lineage row;
- marks the original as `reversed`;
- returns original and reversal rows as JSON.

`correct_transaction`:

- locks and validates the original the same way;
- validates the replacement invariants in the database;
- inserts the reversal row;
- marks the original as `reversed`;
- inserts the replacement row as `posted`;
- returns original, reversal, and replacement rows as JSON.

Rollback proof:

- Runtime harness injects a replacement insert failure after reversal/original update steps are attempted.
- Assertion confirms original remains `posted`, no reversal row remains, and no replacement row is persisted.

Concurrency proof:

- Runtime harness opens two concurrent `psql` connections calling `reverse_transaction` for the same original.
- Exactly one call succeeds.
- The second call deterministically receives conflict after the row lock observes the updated state.
- Final persisted state has exactly one reversal row.

## 3. F2 Canonical Lifecycle Semantics

Implemented semantics:

- Void: `posted -> voided`, no new transaction row.
- Reversal: original becomes `reversed`; exactly one lineage row is inserted with `reversal_of_transaction_id = original.id` and `status = reversed`.
- Correction: atomic original `posted -> reversed` + one reversed lineage row + one posted replacement.
- No negative amounts and no artificial income/expense inversion were introduced.
- Reversal rows are audit/lineage records and do not enter balance or realized totals because they are not `posted`.
- Repeat/double/concurrent reverse returns conflict and does not create a second reversal.

## 4. Added RPC / Migration

Added migration:

- `supabase/migrations/20260920000100_m09_transactions_atomic_rpc.sql`

The migration only adds functions and grants:

- no table changes;
- no enum changes;
- no column changes;
- no RLS policy changes;
- no trigger-based financial behavior;
- no service-role mutation path.

The functions revalidate critical invariants:

- authenticated user required;
- forged `user_id` ignored;
- transfer rejected;
- positive posted amount;
- required description;
- valid local dates and competence month;
- account/card payment target rules;
- benefit methods require benefit account;
- category type compatibility;
- active target account/category/card when changing FK;
- unchanged historical account/category references remain correctable.

## 5. F3 Tests / Harness Expansion

Added/expanded tests:

- correction happy path;
- correction rollback fault injection;
- repeat void/reversal;
- void-after-reverse and reverse-after-void;
- archived/closed account rejection;
- archived category rejection;
- card + account rejection;
- income on card rejection;
- invalid payment method;
- amount precision/boundaries;
- LocalDate invalid edge;
- malformed transaction id validation;
- cross-user get/void/reverse/correct denial;
- balance state after correction;
- component tests for M09 transaction form and lifecycle actions.

Runtime harness now covers:

- forged `user_id` ignored in correction payload;
- owner reassignment denied;
- anon RPC denied;
- own UPDATE baseline;
- cross-user UPDATE denied;
- cross-user account/category FK denied;
- posted hard-delete denied;
- reversal RPC success;
- duplicate reversal guard;
- concurrent reversal guard with two simultaneous connections;
- correction success;
- correction atomic rollback;
- persisted-state balance after void/reverse/correct/rollback.

## 6. F4 UI / Accessibility

Implemented:

- removed `transfer` from the transaction type select;
- service still rejects `transactionType=transfer` for M10 boundary;
- credit-card method hides/disables account selector and submits no `accountId`;
- non-card methods hide/disable card selector and submit no `creditCardId`;
- no Cards CRUD added;
- no active cards state is rendered with `role="status"`;
- `Anular` and `Estornar` use shared `ConfirmationDialog`;
- reason inputs have real labels, not placeholder-only UX;
- filters have explicit labels for search/dateFrom/dateTo;
- filter submit uses shared `Button`;
- error message role is `alert`, success/info role is `status`;
- invalid date filters are safely ignored instead of crashing the page.

## 7. Ownership / RLS Matrix

Runtime-covered outcomes:

- owner can read/update own baseline transaction;
- owner cannot reassign `user_id`;
- user B cannot read user A transactions;
- user B cannot update user A transactions;
- user B cannot call reversal RPC on user A transaction;
- anon cannot execute reversal RPC;
- cross-user account FK insert rejected;
- cross-user category FK insert rejected;
- posted hard-delete denied;
- draft hard-delete remains allowed.

## 8. Account / Category / Card / Payment Invariants

Preserved and tested:

- new non-card transaction requires account impact;
- archived/closed accounts rejected for new or changed targets;
- active category required for new or changed target;
- subcategory stores root category plus subcategory id;
- category type must match transaction type;
- credit-card purchase has no immediate account impact;
- card + account combination rejected;
- income on credit card rejected;
- benefit payment methods require benefit account;
- transfer remains rejected for M10.

Correction nuance:

- if historical account/category was archived/closed after original posting, correction may keep the same FK unchanged;
- if correction changes account/category target, the new target must pass active rules.

## 9. Balance Integration

Runtime persisted-state balance checks confirm:

- credit-card purchase does not affect account movement;
- `voided` transaction is excluded;
- original `reversed` transaction is excluded;
- reversal lineage row `reversed` is excluded;
- correction replacement `posted` is included;
- failed correction rollback leaves original `posted` included and no reversal/replacement residue.

## 10. Audit Behavior / Data Minimization

Audit remains server-only and non-blocking after financial commit.

Adjusted metadata:

- removed `amount` from transaction audit metadata;
- no description, account name, category name, or other PII added;
- lifecycle audit metadata includes only trace ids needed for lineage:
  - `reversalId`;
  - `replacementId`;
  - `originalId`;
  - request/status/type/payment method.

Void reason still uses `reversal_reason` because the frozen schema has no separate void reason field.

## 11. F5-F8 Treatment

- F5 accepted as minor/future: no broad DB trigger/RLS business enforcement added. RPC atomicity is the explicit exception for multi-row financial mutations.
- F6 minimal adjustment completed: manual UI no longer exposes `sourceType`, `sourceId`, or `externalFingerprint`; service fixes manual origin.
- F7 bugfixes completed: malformed transaction id becomes validation/not-found flow; invalid date filters no longer crash page.
- F8 completed where directly related: `updatePosted` in-place mutation path removed; audit metadata minimized.

## 12. Tests / Gates

Executed successfully:

- `npm ci`
- `npm run validate:env:ci`
- `npm run check:secrets`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:e2e`
- `npm run test` — 36 files / 168 tests
- `npm run build`
- `npm run test:e2e` — 14 passed
- `npm run verify:schema:m03`
- `npm run verify:runtime:m03:pg`
- `npm run verify:runtime:m04:auth`
- `npm run verify:runtime:m07:accounts`
- `npm run verify:runtime:m08:categories`
- `npm run verify:runtime:m09:transactions`
- focused M09 RPC/runtime harness, including rollback and concurrent reversal
- `git diff --check`

Environment notes:

- initial `npm run test:e2e` inside sandbox failed with local port `EPERM`; rerun outside sandbox passed.
- PostgreSQL runtime harnesses were executed outside sandbox because local `initdb` requires shared memory/port permissions blocked in sandbox.
- No production environment was touched.

## 13. M03-M08 Regression Status

- M03 schema: PASS
- M03 PostgreSQL runtime: PASS
- M04 auth/RLS runtime: PASS
- M07 accounts runtime: PASS
- M08 categories runtime: PASS
- M09 transactions runtime: PASS

## 14. Scope Discipline

Untouched:

- Frozen docs at project root;
- `Markdown Files/`;
- table definitions;
- enum definitions;
- existing columns;
- RLS policies;
- M10 Transfers;
- Cards CRUD;
- invoice/card lifecycle CRUD.

Changed scope is limited to M09 transaction domain/service/repository/UI/tests/runtime plus the additive RPC migration and this report.

## 15. Remaining Risks / Limitations

- Direct generic PostgREST writes remain a broader inherited M03/M04 domain-layer risk, intentionally deferred under F5.
- No physical unique partial index was added for `reversal_of_transaction_id`; row locking on the original transaction plus status transition provides the RPC concurrency guard required for M09. Direct writes outside the RPC are not newly expanded in this remediation.
- Report commit hash cannot be embedded inside the report without changing that same hash; final delivery message should list it.

Final status: `READY FOR INDEPENDENT MILESTONE 09 RE-REVIEW`
