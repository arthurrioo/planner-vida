# Milestone 08 Review Remediation Report

## 1. Branch / PR / Heads

- Branch: `milestone-08-categories-subcategories`
- PR: #7 - Milestone 08 - Categories and Subcategories
- Reviewed old HEAD: `403ec0c`
- Remediation code commit: `ff3643d`
- Original commits preserved: `4936a33`, `d2833b4`, `613dd5a`, `403ec0c`
- No merge, squash, new branch, or new PR was performed.

## 2. F1 Audit Decision Implemented

Decision implemented:

- `audit_logs` remains user-read-only under Frozen RLS. No authenticated owner INSERT policy was added.
- Audit writes are now server-only privileged writes through `SupabasePrivilegedAuditService`.
- The privileged writer lives in `src/infrastructure/audit/supabase-audit-service.ts`, imports `server-only`, and reads `SUPABASE_SERVICE_ROLE_KEY` only inside infrastructure code, not under `app`, `components`, or shared `lib` browser-facing config.
- Categories and Accounts continue to build audit events through M06 `createAuditEvent`, preserving redaction/minimization before persistence.
- Actor/owner comes from authenticated server context in the application service path, not browser payload.

Failure semantics implemented:

- Business mutation remains the source of truth.
- Audit remains an operational target, but is not transaction-coupled in Phase 1.
- If audit fails after persistence, the service logs a sanitized structured event server-side and returns the mutation success.
- User-facing actions no longer report false mutation failure or induce duplicate retry because of audit RLS.

M07 corrective scope:

- Accounts was patched only to use the same server-only audit writer/failure semantics.
- This is explicitly a M07 corrective patch discovered during M08 review.
- No Accounts domain contract, lifecycle rule, schema, RLS, or UX behavior was expanded.

## 3. F2/F8 Type Immutability Rules

Canonical Phase 1 behavior now enforced in the Category service:

- Root category without dependencies and without children may change type.
- Category with any dependency cannot change type.
- Category with children cannot change type.
- Child/subcategory must always match parent type.
- Moving a child to a parent of another type is rejected.
- No automatic cascade of child types was implemented.
- Same-type/no-op edits remain allowed.

State-dependent type immutability uses `CONFLICT`. Payload-level incompatible parent/type uses `VALIDATION_FAILED`.

## 4. F3 Redirect Fixes

Categories:

- `deleteOrArchiveCategoryAction` now computes redirect outcome inside the try/catch and calls `redirect()` after the catch.
- `deleteCategoryAction` was added for explicit hard-delete behavior and follows the same pattern.
- Action tests mock real `NEXT_REDIRECT` behavior and prove hard-delete/archive destinations and messages are not swallowed.

M07 corrective exception:

- `deleteAccountAction` had the same redirect-inside-try bug and was patched narrowly.
- Regression tests prove hard-delete and dependency-blocked delete redirects are not swallowed.

## 5. F4 Dependency-Aware Delete/Archive UI

Implemented:

- Detail page now uses `getCategoryLifecycleState()` to compute dependency count for the exact viewed category/subcategory.
- Root children are counted as dependencies through the Frozen M03 FK coverage.
- Permanent delete is shown only when dependency count is zero and the category is active.
- Permanent delete label is now `Excluir permanentemente`.
- Permanent delete uses M05 `ConfirmationDialog` with irreversible-action copy.
- Archive remains explicit and separate.
- UI no longer labels an action as delete when service outcome may archive.

Service/API:

- Existing `deleteOrArchiveCategory` remains for compatibility.
- UI uses explicit `deleteCategoryIfSafe` plus explicit `archiveCategory`.
- The decision no longer depends on attempting DELETE and interpreting FK failure.

## 6. F5 Input Validation / Public Error Sanitization

Implemented:

- `asCategoryId` now validates UUID shape explicitly.
- Malformed route `categoryId` in the detail page resolves to `notFound()`.
- Malformed submitted `parentId` returns `VALIDATION_FAILED` with `parentId` field detail.
- `sortOrder` is validated against PostgreSQL `integer` int32 representability.
- No extra business min/max was invented beyond int32 integer semantics.
- Category and Account Supabase fallback errors no longer expose raw database messages publicly. Public fallback is a generic storage error with safe details.

## 7. F6 Accepted Phase 1 DB-Layer Risk

Accepted as MINOR/FUTURE:

- No DB triggers/checks/RLS changes were added for depth/type/self-parent/cycle.
- This remains enforced in Domain/Application Service for Phase 1.
- Adversarial service/action tests were expanded for forged payloads.

## 8. F7 Deferred, With Silent Promotion Fixed

Still deferred:

- No archive cascade.
- No reactivate flow for categories.

Fixed:

- Editing a child whose parent is archived no longer silently promotes it to root.
- Detail page includes the current archived parent as a selectable current value.
- Service permits same-parent edits under an archived parent, but still rejects new children/moves into archived parents.

## 9. Ownership / Hierarchy Adversarial Matrix

| Case                                | Result                                       | Evidence                                      |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------- |
| User A update category of B         | Rejected as `NOT_FOUND`                      | Category service tests                        |
| User A archive category of B        | Rejected as `NOT_FOUND`                      | Category service tests                        |
| User A delete category of B         | Rejected as `NOT_FOUND`                      | Category service tests                        |
| User A use parent of B              | Rejected as not found                        | Category service tests and M08 runtime FK/RLS |
| Self-parent                         | `VALIDATION_FAILED`                          | Category service tests                        |
| Child -> grandchild                 | `VALIDATION_FAILED`                          | Category service tests                        |
| Cycle via parent child              | Blocked by max-depth/parent root requirement | Category service tests                        |
| Archived parent receives new child  | `CONFLICT`                                   | Category service tests                        |
| Child incompatible type             | `VALIDATION_FAILED`                          | Category service tests                        |
| Move child to different-type parent | `VALIDATION_FAILED`                          | Category service tests                        |

## 10. Audit Security Matrix

| Case                                                        | Result                                                                                                  | Evidence                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Authenticated user-scoped INSERT into `audit_logs`          | Denied                                                                                                  | M07 and M08 runtime harnesses                |
| `service_role` INSERT into `audit_logs`                     | Allowed                                                                                                 | M07 and M08 runtime harnesses                |
| Category create/update/archive/delete audit                 | Uses server-only writer                                                                                 | Application service wiring and service tests |
| Account create/update/archive/reactivate/close/delete audit | Uses server-only writer                                                                                 | M7 corrective patch and service tests        |
| Audit payload minimization                                  | No category/account names or financial amounts added; metadata limited to type/status/parent/request id | Domain service code                          |
| Audit writer failure after mutation                         | Mutation succeeds; sanitized log emitted                                                                | Category and Account service tests           |

## 11. Runtime / Test Gates

Executed successfully:

- `npm ci`
- `npm run validate:env:ci`
- `npm run check:secrets`
- `npm run format`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:e2e`
- `npm run test` - 33 files / 151 tests
- `npm run build`
- `npm run test:e2e` - 14/14
- `npm run verify:schema:m03`
- `npm run verify:runtime:m03:pg` - passed outside sandbox, 2 clean reset cycles
- `npm run verify:runtime:m04:auth` - passed outside sandbox, 2 clean reset cycles
- `npm run verify:runtime:m07:accounts` - passed outside sandbox
- `npm run verify:runtime:m08:categories` - passed outside sandbox
- `git diff --check`

Sandbox limitations:

- `npm run test:e2e` was blocked inside sandbox by `listen EPERM 0.0.0.0:3000`; it passed outside sandbox.
- PostgreSQL runtime was blocked inside sandbox by `shmget`; M03/M04/M07/M08 passed outside sandbox.

## 12. M03-M07 Regression Status

- M03 schema verification passed.
- M03 runtime passed.
- M04 auth/RLS contract test and runtime passed; service role remains out of browser-facing `app/components/lib`.
- M05 `ConfirmationDialog` is reused; no primitive changes were made.
- M06 redaction/audit event creation remains reused; no M06 foundation contract was changed.
- M07 Accounts corrective patch is limited to audit writer/failure semantics and `deleteAccountAction` redirect placement.

## 13. Scope / Hygiene

Untouched:

- Frozen docs at repo root.
- `Markdown Files/`.
- Supabase migrations.
- RLS policies.
- Physical schema.
- M09+ business modules.
- Auth flow beyond preserving M04 service-role boundary tests.

Changed scope:

- M08 Categories implementation, tests, UI, actions, runtime harness.
- Shared server-only audit infrastructure required by F1.
- Narrow M07 corrective patch explicitly authorized by Control Tower.

## 14. Remaining MINOR/FUTURE Items

- F6: DB-level depth/type/self-parent/cycle enforcement remains accepted Phase 1 risk.
- F7: archive cascade and category reactivation remain future work.
- Runtime harness proves service-role capability at SQL role level; hosted Supabase deployment secrets were not exercised.

## 15. M07 Corrective Files Changed

| File                                                         | Reason                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/application/accounts/account-service.ts`                | Wire Accounts to server-only privileged audit writer and logger.                           |
| `src/domain/accounts/accounts.ts`                            | Make audit failure non-blocking after persisted mutation and emit sanitized observability. |
| `src/domain/accounts/accounts.test.ts`                       | Prove persisted Account mutation remains success when audit write fails.                   |
| `src/infrastructure/accounts/supabase-account-repository.ts` | Remove user-client audit writer and sanitize fallback storage error.                       |
| `src/app/app/financeiro/contas/actions.ts`                   | Move `deleteAccountAction` redirect outside try/catch.                                     |
| `src/app/app/financeiro/contas/actions.test.ts`              | Regression tests for `NEXT_REDIRECT` hard-delete and dependency-blocked outcomes.          |
| `scripts/run-m07-accounts-runtime-harness.mjs`               | Add audit_logs user-denied/service-role-success matrix and cross-user delete proof.        |

## 16. Final Status

READY FOR INDEPENDENT MILESTONE 08 RE-REVIEW
