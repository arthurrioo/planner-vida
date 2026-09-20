# Milestone 10 Review Remediation Report

## 1. Branch and PR

- Branch: `milestone-10-transfers`
- PR: #9, `Milestone 10 - Transfers`
- Original HEAD: `f12a55d`
- Original commits preserved: `e2280f1`, `4888670`, `f12a55d`
- Remediation commits: recorded after this report is committed
- Merge and squash: not performed

## 2. F1: M09 RPC guard hardening

Added an additive M10 remediation migration that recreates `reverse_transaction` and `correct_transaction` only to reject rows whose `transaction_type = 'transfer'` or whose `transfer_id IS NOT NULL`. The guard runs before any reversal or correction insert/update, returns the existing conflict mapping, and preserves the non-transfer M09 path, ownership checks, posted/reversed semantics, atomicity, and `SECURITY INVOKER` behavior.

The TypeScript transaction service also rejects transfer-owned rows for update, void, reverse, and correct. Focused tests cover the service boundary and the runtime harness covers direct RPC reverse/correct denial, unchanged transfer state, and successful non-transfer M09 reverse/correct behavior. This is documented as M09 corrective hardening discovered during the M10 review.

## 3. F2, F3, and F4: UI and historical display

- `TransferStatusMessage` now uses `role="alert"` for errors and `role="status"` for success/info states, with explicit component coverage.
- Invalid transfer route IDs, including malformed UUIDs, are translated to `notFound()` instead of leaking a database error. A focused route test covers this behavior.
- Historical list/detail display resolves names from all owned accounts, including archived and closed accounts. New-transfer selectors remain active-only.
- Correction selectors include only active accounts plus the current historical source/destination, with status labels for inactive historical references.

## 4. F5: historical inactive account correction rule

Correction now follows the Control Tower decision: an unchanged original source or destination may remain archived or closed; a changed target must be active. The database RPC and service enforce the same distinction. Reverse remains available independently of the account's current lifecycle state.

Tests cover archived-source amount-only correction, closed-destination amount-only correction, rejection of changed archived/closed targets, successful active replacement, and preservation of historical IDs/options in the UI.

## 5. F6: runtime harness

`verify:runtime:m10:transfers` now covers ownership, exact two-leg linkage, same-account rejection, cross-user source/destination denial, forged-user handling, owner reassignment denial, anonymous and missing-subject denial, inactive create rejection, repeat reverse conflict, cross-user reverse/correct denial, hard-delete blocking, direct M09 RPC guards, audit behavior, and historical correction rules.

The harness applies the remediation migration in a disposable PostgreSQL database and verifies rollback for invalid correction/replacement paths. The requested dedicated fault-injection and barrier-coordinated concurrency scenarios remain a follow-up harness expansion; they were not claimed as executed evidence in this report.

## 6. F7: unit, component, and integration coverage

Added discriminating coverage for Money boundaries, LocalDate validation, closed-account create rejection, historical inactive correction, repeat reverse, cross-user access, audit non-blocking behavior and minimized metadata, confirmation dialog cancel/confirm behavior, status roles, historical labels, malformed route IDs, and M09 transfer lifecycle guards.

Added a focused balance integration test that calls the real M07 `getBalanceMovements` and `calculateAccountBalance` code over persisted transfer rows. Financial expectations use exact scaled values rather than JavaScript `Number` arithmetic.

## 7. Balance integration and P&L isolation

The integration test proves the source and destination balances are affected exactly once by the persisted transfer rows. It also verifies the rows are `transaction_type = 'transfer'`, use `payment_method = 'bank_transfer'`, have no category, and do not enter the M09 income/expense/investment classification helpers.

## 8. Linked-leg integrity

The runtime and integration tests verify two posted linked legs per transfer, both directions of linkage, no orphan transfer lifecycle rows, and atomic preservation of the original transfer when a correction/reversal path fails.

## 9. Concurrency and fault-injection evidence

No dedicated barrier-coordinated concurrency result is claimed. The existing RPC locking and conflict paths remain covered by the ordinary runtime cases, but reverse-vs-reverse, correct-vs-correct, reverse-vs-correct, and explicit mid-step injected-failure overlap tests require a later disposable-PG harness expansion before a full independent re-review.

## 10. Ownership and RLS matrix

| Case | Expected result | Covered |
| --- | --- | --- |
| Owner creates/reads/reverses/corrects own transfer | Allowed | Service and M10 runtime |
| Cross-user source or destination | Denied | M10 runtime |
| Forged `user_id` payload | Server identity wins/denied | M10 runtime |
| Owner reassignment | Denied | M10 runtime |
| Anonymous RPC call | Denied | M10 runtime and grants |
| Authenticated role without `sub` | Denied | M10 runtime |
| Direct M09 lifecycle on transfer leg | Conflict/denied | Service, migration, runtime |

## 11. Audit minimization

Transfer audit metadata no longer includes amount, account names, descriptions, or other unnecessary financial detail. It retains only identifiers and minimal lifecycle state needed for traceability. Tests cover `transfers.create`, `transfers.reverse`, `transfers.reverse_for_correction`, and `transfers.correct`, and preserve non-blocking audit failure behavior.

## 12. F8-F14 treatment

- F8 deterministic account lock ordering: deferred; no broad RPC rewrite was introduced.
- F9 direct RPC input strictness: existing service validation retained; systemic redesign deferred.
- F10 audit amount: implemented and tested.
- F11 grants: anonymous execution is explicitly revoked; intended authenticated outer RPCs remain granted; the internal payload helper is not granted to authenticated.
- F12-F14: deferred as minor/future items and not expanded.

## 13. Validation and regression status

Passed in this remediation session:

- `npm ci`
- `npm run validate:env:ci`
- `npm run check:secrets`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:e2e`
- `npm run test` — 42 files, 193 tests passed
- `npm run build`
- `npm run verify:schema:m03`
- `npm run verify:runtime:m03:pg` — passed outside the sandbox in a disposable PostgreSQL process
- `npm run verify:runtime:m10:transfers` — passed outside the sandbox in a disposable PostgreSQL process
- `git diff --check`

Not executed to completion in this session:

- M04, M07, M08, and M09 PostgreSQL runtime harnesses: sandbox shared-memory restrictions required elevation, and the elevation request was rejected by the host usage-limit reviewer before execution.
- `npm run test:e2e`: Playwright web server could not bind `0.0.0.0:3000` because the sandbox returned `EPERM`.
- Dedicated barrier-coordinated concurrency and explicit mid-step fault-injection probes described in F6.

## 14. Frozen-surface boundary

No frozen planning/architecture/specification documents, `Markdown Files/`, M11+ work, table/column/enum redesign, RLS weakening, or unrelated M07/M08/M09 refactor was introduced.

## 15. Remaining risks and recommendation

The implementation and focused M10 evidence cover the requested F1-F7 behavioral fixes, with F10/F11 hardening included. The remaining unexecuted regression and concurrency gates are environment/evidence limitations, not silently treated as passes. Independent milestone re-review should run those gates in an environment that permits disposable PostgreSQL shared memory and Playwright port binding.

NOT READY FOR INDEPENDENT MILESTONE 10 RE-REVIEW
