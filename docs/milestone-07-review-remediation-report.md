# Milestone 07 Review Remediation Report

## 1. Branch, PR, and Commits

- Branch: `milestone-07-accounts`
- PR: `#6 - Milestone 07 - Accounts`
- Old HEAD before remediation: `2e1353cb47aa7074eee60e8057d82695ee3f9f98`
- Remediation code commit: `6ad44062bcc1c0065e1f0840ed80aa61fe9671bc`
- Report commit: this document commit, created after the code remediation commit.

## 2. Control Tower Decisions Implemented

### F1 - Opening Balance Sign

Implemented canonical semantics: `opening_balance` is a signed snapshot balance at cutover, not a flow direction.

- `openingBalance` now accepts positive, zero, and negative values for every Phase 1 `account_type`.
- No per-type opening-balance rule was introduced.
- `overdraftLimit` remains non-negative.
- M03 schema and `DATABASE_SCHEMA.md` were not changed.
- Repository mapping now accepts negative `opening_balance` values returned by the database.

Mandatory examples are covered:

- checking `openingBalance = -50.0000` accepted.
- benefit `openingBalance = -10.0000` accepted.
- `overdraftLimit = -1` rejected.

### F2 - Account Lifecycle

Implemented the canonical Phase 1 state machine:

| From     | To       | Status                          |
| -------- | -------- | ------------------------------- |
| active   | archived | allowed                         |
| archived | active   | allowed via `reactivateAccount` |
| active   | closed   | allowed                         |
| archived | closed   | allowed                         |
| closed   | active   | forbidden                       |
| closed   | archived | forbidden                       |
| active   | active   | idempotent no-op via reactivate |
| archived | archived | idempotent no-op via archive    |
| closed   | closed   | idempotent no-op via close      |

Edit permissions:

| Status   | Edit fields         |
| -------- | ------------------- |
| active   | allowed             |
| archived | allowed             |
| closed   | forbidden/read-only |

UI behavior:

- active: `Arquivar`, `Encerrar`, and safe-only `Excluir permanentemente`.
- archived: `Reativar`, `Encerrar`, and safe-only `Excluir permanentemente`.
- closed: no edit/archive/reactivate/close action; safe-only `Excluir permanentemente`.
- `Encerrar` and `Excluir permanentemente` use `ConfirmationDialog`.
- `Arquivar` remains direct because it is reversible.

Audit:

- Existing audit actions preserved for create/update/archive/close/delete.
- Added audit action for `accounts.reactivate`.
- Audit metadata remains minimal: status, type, request id.

### F5 - Delete When Safe

Implemented explicit hard-delete semantics for M07:

- Added `deleteAccountIfSafe`.
- `dependencyCount === 0`: hard delete succeeds.
- `dependencyCount > 0`: hard delete is blocked and no row is deleted.
- UI shows `Excluir permanentemente` only when `dependencyCount === 0`.
- UI does not present hard-delete when the actual service outcome would be archive/block.
- Existing `deleteOrArchiveAccount` remains as an internal safe fallback, but UI does not use it for an `Excluir` action.
- Delete audit is recorded for actual hard delete only.

## 3. Files Changed

Code and UI:

- `src/domain/accounts/accounts.ts`
- `src/infrastructure/accounts/supabase-account-repository.ts`
- `src/app/app/financeiro/contas/actions.ts`
- `src/app/app/financeiro/contas/[accountId]/page.tsx`
- `src/components/accounts/account-form.tsx`
- `src/components/accounts/account-lifecycle-actions.tsx`
- `src/components/accounts/account-selector.tsx`

Tests and harness:

- `src/domain/accounts/accounts.test.ts`
- `src/infrastructure/accounts/supabase-account-repository.test.ts`
- `src/components/accounts/account-form.test.tsx`
- `src/components/accounts/account-lifecycle-actions.test.tsx`
- `src/components/accounts/account-selector.test.tsx`
- `scripts/run-m07-accounts-runtime-harness.mjs`

Report:

- `docs/milestone-07-review-remediation-report.md`

## 4. Opening Balance Signed Semantics and Tests

`parseAccountMutation` now parses `openingBalance` with `allowNegative: true`.

Tests added/updated:

- accepts checking opening balance `-50.0000`.
- accepts benefit opening balance `-10.0000`.
- rejects negative overdraft limit.
- rejects invalid money scale, bad date, and invalid enum.

Repository mapping also parses database `opening_balance` with `allowNegative: true`.

## 5. Lifecycle State Machine and Edit Permissions

Service changes:

- Added `reactivateAccount`.
- Added lifecycle guard for update/archive/reactivate/close.
- Closed accounts are read-only for normal account fields.
- Active and archived accounts remain editable.
- Reactivating an archived account checks active-name conflicts before status change.

Tests added:

- active -> archived.
- archived -> active.
- active -> closed.
- archived -> closed.
- closed -> active forbidden.
- closed -> archived forbidden.
- closed edit forbidden.
- archived edit allowed.
- idempotent self-transitions.

## 6. Safe Delete and Dependency Completeness

`countDependencies` now checks all Frozen M03 FKs that reference `accounts`:

- `annual_obligations.account_id`
- `assets.linked_account_id`
- `credit_cards.account_id`
- `events.account_id`
- `financial_commitments.account_id`
- `financial_goals.account_id`
- `installment_plans.account_id`
- `invoice_payments.account_id`
- `liabilities.linked_account_id`
- `subscriptions.account_id`
- `transactions.account_id`
- `transfers.destination_account_id`
- `transfers.source_account_id`

The dependency-reference test reads the M03 migration and fails if a Frozen FK to `accounts` is not represented in the repository list.

Behavior tests:

- safe-delete zero dependencies succeeds.
- dependency blocks explicit hard-delete and preserves account.
- `deleteOrArchiveAccount` remains archive fallback for dependent records.

## 7. Field-Level Validation UX and Accessibility

`AccountForm` now uses action state for create/update errors:

- Validation details from `DomainError.details` are mapped only for known account form fields.
- Field errors render through the existing M05 `Field` primitive.
- Inputs/selects receive `aria-describedby` and `aria-invalid`.
- User-entered values remain in the form on validation failure without redirect.
- A general sanitized banner remains visible for form-level context.

Covered cases:

- empty/whitespace name.
- invalid money / more than 4 decimals.
- bad date.
- invalid enum.
- accessible field association.

## 8. Selector Default Active-Only

Implemented at both layers:

- `AccountService.listSelectableAccounts()` defaults to `active`.
- `AccountSelector` filters to `active` by default.
- Explicit `includeStatuses` opt-in can include archived/closed for future historical/admin consumers.
- Selector remains presentational and does not query Supabase from the client.

## 9. Ownership and RLS Matrix

Preserved ownership model:

- Owner is derived from `RepositoryContext`/session.
- Browser payload never supplies `user_id`.
- Repository operations filter by `context.userId`.
- Cross-user access resolves to not found or zero affected rows.
- RLS migrations were not changed.

Coverage:

| Case                                 | Evidence                              |
| ------------------------------------ | ------------------------------------- |
| own positive update                  | M07 runtime harness                   |
| cross-user update denied             | M07 runtime harness and service tests |
| forged ownership reassignment denied | M07 runtime harness                   |
| cross-user archive denied            | service tests                         |
| cross-user reactivate denied         | service tests                         |
| cross-user close denied              | service tests                         |
| cross-user delete denied             | service tests                         |
| anon insert denied                   | M07 runtime harness                   |

## 10. Audit Actions

Audit actions after remediation:

- `accounts.create`
- `accounts.update`
- `accounts.archive`
- `accounts.reactivate`
- `accounts.close`
- `accounts.delete`

Delete audit is recorded after safe hard-delete using the existing audit contract. No PII/name/balance payload is logged.

## 11. Tests and Regression Gates

Executed successfully:

- `npm ci`
- `npm run validate:env:ci`
- `npm run check:secrets`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:e2e`
- `npm run test` - 26 files / 116 tests passed
- `npm run build`
- `npm run test:e2e` - 14 passed
- `npm run verify:schema:m03`
- `npm run verify:runtime:m03:pg`
- `npm run verify:runtime:m04:auth`
- `npm run verify:runtime:m07:accounts`

Environment note:

- Playwright and PostgreSQL runtime harnesses were initially blocked by sandbox restrictions (`listen EPERM` and `shmget Operation not permitted`).
- They were rerun outside the sandbox and passed.

## 12. M03-M06 Regression Status

- M03 schema verification: passed.
- M03 PostgreSQL runtime harness: passed 2 clean reset cycles.
- M04 auth/RLS runtime harness: passed 2 clean reset cycles.
- M05 UI primitives remain covered by existing tests and new Account form/lifecycle UI tests.
- M06 shared domain foundations were used as-is; no shared foundation refactor was introduced.

## 13. Scope Discipline

Untouched by this remediation:

- Frozen schema migrations.
- Frozen docs including `DATABASE_SCHEMA.md`.
- `Markdown Files/`.
- M08+ transaction/card behavior.
- General ApplicationService architecture.
- Generic Supabase raw-error mapping.

## 14. Remaining Limitations and Risks

- UI/E2E remains anonymous-route smoke only; authenticated account lifecycle UI is covered by component tests and service/runtime tests, not by a browser-authenticated E2E journey.
- `deleteOrArchiveAccount` remains available as an internal fallback for callers that need archive-on-dependency behavior, but M07 UI uses explicit safe-delete semantics.
- Report commit hash is recorded in final delivery after this file is committed.

## 15. Deferred Findings

Explicitly deferred per Control Tower:

- F6 pending submit protection: deferred as MINOR/FUTURE.
- F7 broader generic Supabase raw-error mapping: deferred as MINOR/FUTURE.
- F8 broader test gaps beyond remediation scope: deferred except for tests needed by F1/F2/F3/F4/F5.
- F9 AccountService vs ApplicationService.execute architecture refactor: deferred as MINOR/FUTURE.

## Final Status

`READY FOR INDEPENDENT MILESTONE 07 RE-REVIEW`
