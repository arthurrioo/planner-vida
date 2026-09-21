# Milestone 10 Review Remediation Report

## 1. Branch and PR

- Branch: `milestone-10-transfers`
- PR: #9, `Milestone 10 - Transfers`
- Reviewed remediation baseline: `3168674f519945491c08318ee33a3eac957c9662`
- Original M10 commits preserved: `e2280f1`, `4888670`, `f12a55d`
- Prior remediation commits preserved: `764d75f`, `3168674`
- Final F6/N1 remediation changes: committed after `3168674` on the same branch
- Merge, squash, force-push, and self-approval: not performed

## 2. Scope of This Finalization

This finalization is limited to the focused independent re-review findings F6 and N1. No product code, RPC logic, migrations, schema redesign, M11+ work, frozen planning documents, or `Markdown Files/` content was changed.

The only code change is in `scripts/run-m10-transfers-runtime-harness.mjs`. This expands committed runtime evidence for existing M10 behavior. The report was updated to reflect only evidence that exists in committed files and was executed locally.

## 3. F6 Harness Coverage Added

`verify:runtime:m10:transfers` now covers these focused gaps with persisted rows in disposable PostgreSQL:

- create with destination account owned by another user -> rejected
- create with source account owned by another user -> rejected
- forged `user_id` payload -> `auth.uid()` wins and no forged ownership persists
- owner reassignment by `UPDATE transfers SET user_id = other_user` -> denied by RLS
- hard-delete of posted transfer leg -> zero rows affected
- hard-delete of posted transfer row -> zero rows affected
- cross-user `reverse_transfer` with a known User A transfer id -> denied
- cross-user `correct_transfer` with a known User A transfer id -> denied
- sequential repeat `reverse_transfer` -> explicit `m10_transfer_conflict`
- direct M09 lifecycle RPCs on M10 transfer legs -> explicit `m09_transaction_conflict`
- anon and authenticated-without-sub RPC access -> denied

The earlier inline SQL balance-impact checks remain only as local rollback/fixture assertions inside the runtime harness. They are not presented as the primary M07 balance-integration evidence.

## 4. Deterministic Concurrency Evidence

The previous timing-assisted concurrency check was strengthened. The harness now starts one `psql` client, waits for a deterministic PostgreSQL `NOTICE` emitted from a disposable trigger inside the first transaction, and only then starts the opposing client while the first transaction is deliberately held open.

Covered races:

- `reverse_transfer` vs `reverse_transfer`
- `correct_transfer` vs `correct_transfer`
- `reverse_transfer` vs `correct_transfer`

For each race, the harness asserts:

- exactly one terminal winner
- exactly one `m10_transfer_conflict` loser
- the original lifecycle has a single terminal outcome
- no duplicate reversal/correction effect survives
- no orphan or partial lifecycle state survives

## 5. Full Fault-Injection Matrix

The harness now installs disposable triggers that fail after the transaction has begun and after specific intermediate steps. For every failpoint, it captures a before-state snapshot, forces the failure, and proves rollback by comparing row counts and posted balance impact after the failed operation. It also checks transfer status and absence of partial rows where applicable.

Covered failpoints:

| Operation | Forced failure point           | Rollback evidence                                                                    |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| create    | outflow leg insert             | no transfer row, no movement rows, counts/balances unchanged                         |
| create    | inflow leg insert              | no partial transfer/movement rows, counts/balances unchanged                         |
| create    | linkage update                 | no partial transfer/movement rows, counts/balances unchanged                         |
| reverse   | second reversal leg insert     | original remains posted, no reversal rows, counts/balances unchanged                 |
| reverse   | original leg update            | original remains posted, no reversal rows, counts/balances unchanged                 |
| reverse   | transfer status update         | original remains posted, counts/balances unchanged                                   |
| correct   | replacement transfer insert    | original remains posted, no reversal rows, no replacement, counts/balances unchanged |
| correct   | replacement outflow leg insert | original remains posted, no replacement rows, counts/balances unchanged              |
| correct   | replacement inflow leg insert  | original remains posted, no replacement rows, counts/balances unchanged              |
| correct   | replacement linkage update     | original remains posted, no replacement rows, counts/balances unchanged              |
| correct   | original status update         | original remains posted, no replacement, counts/balances unchanged                   |

## 6. Real M07 Balance Integration

The runtime harness now includes a committed real integration test that uses:

- rows persisted in disposable PostgreSQL through the real M10 RPCs
- the real `SupabaseAccountRepository.getBalanceMovements`
- the real `calculateAccountBalance`
- exact scaled Money string assertions, not JavaScript `Number` arithmetic

Scenario executed:

| Step                           | Expected A | Expected B | Expected C |   Combined |
| ------------------------------ | ---------: | ---------: | ---------: | ---------: |
| Initial                        | `100.0000` |  `20.0000` |   `0.0000` | `120.0000` |
| Transfer A -> B = 30           |  `70.0000` |  `50.0000` |   `0.0000` | `120.0000` |
| Reverse                        | `100.0000` |  `20.0000` |   `0.0000` | `120.0000` |
| New A -> B = 30, correct to 10 |  `90.0000` |  `30.0000` |   `0.0000` | `120.0000` |
| Destination change B -> C      |  `90.0000` |  `20.0000` |  `10.0000` | `120.0000` |

Additional assertions prove:

- reversal lifecycle rows are not double-counted
- original reversed transfers do not remain posted balance effects
- the final replacement posted transfer is the only surviving correction effect
- the final posted replacement has exactly two linked transfer legs with `transaction_type = 'transfer'`, `payment_method = 'bank_transfer'`, and no category
- combined balance remains invariant at `120.0000`

## 7. P&L / Reporting Isolation

No reporting module exists yet for future income/expense P&L behavior. This report therefore does not claim report-level behavior.

The structural evidence is:

- transfer legs are persisted as `transaction_type = 'transfer'`
- transfer legs use `payment_method = 'bank_transfer'`
- transfer legs have no category/subcategory
- ordinary M09 lifecycle RPCs reject transfer legs
- M07 balance integration uses transfer-specific buckets through `getBalanceMovements`

## 8. N1 Report Corrections

N1 is corrected by aligning this report with committed and executed evidence:

- harness coverage now describes only probes committed in `scripts/run-m10-transfers-runtime-harness.mjs`
- balance integration is described only after adding the real `SupabaseAccountRepository.getBalanceMovements` + `calculateAccountBalance` path over PostgreSQL-persisted M10 rows
- the internal helper grant is corrected: `m10_insert_transfer_from_payload(jsonb)` remains executable by `authenticated`

## 9. Helper Grant / N2

`m10_insert_transfer_from_payload(jsonb)` remains:

- granted to `authenticated`
- `SECURITY INVOKER`
- governed by `auth.uid()` semantics
- constrained by the same user-owned account checks as `create_transfer`

No additional cross-user exposure was found in the focused evidence. Because the independent re-review classified the residual helper exposure as MINOR/FUTURE N2 and explicitly stated no migration change was required for this work, the helper grant was not changed.

## 10. Items Preserved

Preserved without reopening:

- F1 M09 RPC transfer-leg guard
- F2 transfer status alert/status roles
- F3 malformed transfer id -> 404-like handling
- F4 historical account names
- F5 unchanged archived/closed account correction semantics
- F7 existing unit/component coverage, except for the balance integration gap closed under F6
- F10 audit minimization
- F11 anon revocation
- F8/F9/F12/F13/F14 deferred MINOR/FUTURE
- N2/N3 MINOR/FUTURE

## 11. Validation Status

Executed after the F6/N1 harness expansion:

- `npm ci` — passed
- `npm run validate:env:ci` — passed
- `npm run check:secrets` — passed
- `npm run format:check` — passed
- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run typecheck:e2e` — passed
- `npm run test` — passed, 42 files / 193 tests
- `npm run build` — passed
- `npm run test:e2e` — passed outside the sandbox, 14 tests, after the sandbox failed to bind `0.0.0.0:3000`
- `npm run verify:schema:m03` — passed
- `npm run verify:runtime:m03:pg` — passed outside the sandbox in disposable PostgreSQL, 2 clean reset cycles
- `npm run verify:runtime:m04:auth` — passed outside the sandbox in disposable PostgreSQL, 2 clean reset cycles
- `npm run verify:runtime:m07:accounts` — passed outside the sandbox in disposable PostgreSQL
- `npm run verify:runtime:m08:categories` — passed outside the sandbox in disposable PostgreSQL
- `npm run verify:runtime:m09:transactions` — passed outside the sandbox in disposable PostgreSQL
- `npm run verify:runtime:m10:transfers` — passed outside the sandbox in disposable PostgreSQL, including deterministic concurrency, the full fault-injection matrix, and real M07 balance integration
- `node --check scripts/run-m10-transfers-runtime-harness.mjs` — passed

Sandbox limitations encountered and rerun outside the sandbox:

- PostgreSQL disposable runtime harnesses require shared memory not available in the sandbox.
- Playwright E2E requires binding the local web server to port 3000, which the sandbox denied.

## 12. Remaining Limitations

- Hosted Supabase/GoTrue was not exercised.
- No production database was touched.
- Helper authenticated execution remains tracked as MINOR/FUTURE N2.

READY FOR INDEPENDENT MILESTONE 10 FINAL RE-REVIEW
