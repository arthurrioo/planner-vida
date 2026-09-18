# Milestone 06 Review Remediation Report

## 1. Recovery Findings

Recovery was performed before editing.

- Repository remote: `https://github.com/arthurrioo/planner-vida.git`.
- Target branch: `milestone-06-shared-domain-foundations`.
- Pull request: #5, `Milestone 06 - Shared Domain Foundations`, open against `main`.
- Old effective HEAD before remediation: `6aa691ff98be95a350032c89a17c5e762fd06d49`.
- Original M06 commits remained present:
  - `f9364697fa822d9f695673b4aca2156a995470f7` - implementation.
  - `6aa691ff98be95a350032c89a17c5e762fd06d49` - implementation report.
- `6aa691f..origin/milestone-06-shared-domain-foundations`: no commits.
- Local branch vs origin: `0 0`; no ahead/behind delta before remediation.
- Working tree before remediation: clean.
- Stash: empty.
- Worktrees: only the current branch worktree was present.
- Existing remote remediation after interruption: none found.
- Local uncommitted remediation after interruption: none found.

Reconciliation decision: continue from `6aa691f` on the existing branch and PR. No partial remote or local remediation needed to be preserved or reconciled.

## 2. Branch, PR, and Commits

- Branch: `milestone-06-shared-domain-foundations`.
- PR: #5, https://github.com/arthurrioo/planner-vida/pull/5.
- Old effective HEAD: `6aa691ff98be95a350032c89a17c5e762fd06d49`.
- New remediation commits: created after this report file was written; exact pushed commit hashes are recorded in the final handoff response.

## 3. Files Altered

- `src/domain/shared/money.ts`
- `src/domain/shared/money.test.ts`
- `src/domain/shared/normalization.ts`
- `src/domain/shared/normalization.test.ts`
- `src/domain/shared/repository.ts`
- `src/domain/shared/repository.test.ts`
- `src/domain/shared/idempotency.ts`
- `src/domain/shared/idempotency.test.ts`
- `src/domain/shared/redaction.ts`
- `src/domain/shared/audit-logging.test.ts`
- `src/domain/shared/validation.test.ts`
- `docs/milestone-06-review-remediation-report.md`

## 4. F1-F5 Status

| Finding                             | Status   | Evidence                                                                                                                                                                                                                            |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Money scale coherence            | RESOLVED | `Money` now defaults to storage scale 4, exposes `MONEY_STORAGE_SCALE = 4`, keeps `BRL_MINOR_UNIT_SCALE = 2`, serializes minor units as scale-4 money, rejects more than four decimal places, and guards `NUMERIC(19,4)` precision. |
| F2 Fingerprint semantics            | RESOLVED | `createFingerprint` accepts typed tagged parts and preserves merchant/text normalization separately from `local-date` and `money` canonical values. Fingerprint remains versioned with `m06-v1`.                                    |
| F3 DomainError consistency          | RESOLVED | `asUserId` now throws `DomainError('VALIDATION_FAILED', ...)`; `assertOwnedByContext` now throws `DomainError('OWNERSHIP_MISMATCH', ...)`; tests assert class, code, and HTTP mapping.                                              |
| F4 Idempotency concurrency contract | RESOLVED | Repository contract now requires atomic `claimInProgress`; `runIdempotent` handles race loss by re-fetching and resolving replay/conflict/in-progress/failed without running `execute()` twice.                                     |
| F5 Audit/log redaction PII          | RESOLVED | Redaction now covers existing credentials plus email, CPF/CNPJ/document IDs, phone, card/PAN, account number, IBAN aliases, nested arrays/objects, truncation, circular references, non-mutation, and `Error` objects.              |

## 5. Money Evidence

Storage scale and minor-unit semantics are now separate:

- Storage scale: `MONEY_STORAGE_SCALE = 4`; default canonical persisted representation uses four decimal places.
- Currency minor-unit scale: `BRL_MINOR_UNIT_SCALE = 2`; BRL minor units remain cents.
- `moneyFromMinorUnits(123n)` serializes as `1.2300`.
- `parseMoney("10")` -> `10.0000`.
- `parseMoney("10.25")` -> `10.2500`.
- `parseMoney("10.255")` -> `10.2550`.
- `parseMoney("10.2555")` -> `10.2555`.
- Values above four decimal places are rejected.
- Large value inside `NUMERIC(19,4)` tested: `999999999999999.9999`.
- Value exceeding precision tested and rejected: `1000000000000000.0000`.
- Negative values remain rejected by default and allowed only when explicitly requested.
- Core money implementation uses decimal strings and `bigint`; no `parseFloat` or `toFixed` was introduced.

## 6. Fingerprint Evidence

Canonical scheme:

- Version prefix remains `m06-v1`.
- Fingerprint parts are deterministic JSON-serialized tagged records.
- Legacy string parts remain text-normalized.
- Typed parts include `field`, `type`, and canonical `value`.
- `text` uses search-key normalization.
- `merchant` uses merchant normalization.
- `local-date` preserves `YYYY-MM-DD`.
- `money` preserves canonical decimal value, including scale 4.
- Null parts are represented explicitly.
- Tests assert determinism, field order semantics, date preservation, money preservation, and trivial non-collision between reordered fields.

## 7. DomainError Evidence

- Invalid `asUserId(" ")` throws `DomainError`.
- Invalid user ID code: `VALIDATION_FAILED`.
- Invalid user ID HTTP mapping: `422`.
- Ownership mismatch throws `DomainError`.
- Ownership mismatch code: `OWNERSHIP_MISMATCH`.
- Ownership mismatch HTTP mapping: `403`.

## 8. Idempotency Evidence

Contract:

- `IdempotencyRepository` now requires `claimInProgress(record): Promise<'claimed' | 'already_exists'>`.
- The claim must be backed by an atomic insert-if-absent or unique-key operation in the persistence layer.
- `runIdempotent` attempts claim first.
- If claim loses, it re-fetches by key and applies the existing-state decision path.

Tests:

- Completed replay returns original result and does not call `execute()` again.
- Different request fingerprint rejects with `IDEMPOTENCY_CONFLICT`.
- Concurrent same-key callers with an atomic fake repository call `execute()` once.
- In-progress claim returns an explicit in-progress conflict.
- Failed prior claim returns an explicit failed conflict.
- Race-loss without reloadable record returns explicit `CONFLICT`.

No SQL persistence or M07+ idempotency implementation was added.

## 9. Redaction Evidence

PII and sensitive aliases covered:

- Password/senha.
- Token/secret/credential.
- Service role key.
- Authorization/API key/PDF password.
- Email/e-mail.
- CPF/CNPJ/document ID/tax ID/documento.
- Phone/telefone/mobile/cellphone.
- Card number/credit card/PAN.
- Account number/bank account.
- IBAN.

Behavior tested:

- Nested objects.
- Nested arrays.
- String-value PII replacement for high-confidence email, CPF, phone, IBAN, and Luhn-valid card numbers.
- No over-redaction for generic non-sensitive keys such as `accountName` and `cardBrand`.
- Truncation depth remains enforced.
- Inputs are not mutated.
- Circular structures return `[CIRCULAR]`.
- `Error` objects do not leak raw message/stack.

No real PII or production data was used.

## 10. Regression Gates

Executed after remediation:

- `npm ci` - PASSED.
- `npm run validate:env:ci` - PASSED.
- `npm run check:secrets` - PASSED.
- `npm run format:check` - PASSED.
- `npm run lint` - PASSED.
- `npm run typecheck` - PASSED.
- `npm run typecheck:e2e` - PASSED.
- `npx vitest run src/domain/shared/*.test.ts` - PASSED, 9 files / 39 tests.
- `npm run test` - PASSED, 21 files / 85 tests.
- `npm run build` - PASSED.
- `npm run test:e2e` - PASSED outside sandbox, 14 tests.
- `npm run verify:schema:m03` - PASSED.
- `npm run verify:runtime:m03:pg` - PASSED outside sandbox, 2 clean reset cycles.
- `npm run verify:runtime:m04:auth` - PASSED outside sandbox, 2 clean reset cycles.
- `git diff --check` - PASSED.

Sandbox limitations observed:

- `npm run test:e2e` failed inside sandbox with `listen EPERM 0.0.0.0:3000`; rerun outside sandbox passed.
- `npm run verify:runtime:m03:pg` failed inside sandbox on PostgreSQL shared memory `shmget`; rerun outside sandbox passed.
- `npm run verify:runtime:m04:auth` failed inside sandbox on PostgreSQL shared memory `shmget`; rerun outside sandbox passed.

## 11. M03/M04/M05 Regression Status

- M03: schema verifier passed; PostgreSQL runtime harness passed 2 clean reset cycles outside sandbox.
- M04: auth/RLS runtime harness passed 2 clean reset cycles outside sandbox.
- M05: E2E protected-route/deep-link/navigation smoke passed, 14 tests outside sandbox.

## 12. Scope Discipline

Untouched:

- Frozen docs: `PHASE_1_IMPLEMENTATION_PLAN.md`, `DATABASE_SCHEMA.md`, `PLANNER_PHASE_1_ARCHITECTURE.md`, and other frozen planning docs.
- `Markdown Files/`.
- Schema, RLS, Auth, shell/navigation, and M05 UI surfaces.
- M07+ feature work.

No schema migration, persistence table, SQL implementation, account/category/transaction CRUD, import flow, recurrence flow, or future milestone feature was added.

## 13. Secrets and Hygiene

- `npm run check:secrets` passed.
- No `.env` files were changed.
- No production IDs, service-role keys, real financial data, real PII, dumps, or tokens were added.
- `git diff --check` passed.

## 14. Runtime Limitations Remaining

- Hosted Supabase/GoTrue was not exercised; this remediation did not alter hosted auth or schema behavior.
- E2E and PostgreSQL runtime harnesses require outside-sandbox execution because local port binding and shared memory are blocked in the sandbox.

## 15. N1 Micro-Remediation Final Report

### 15.1 Commit Scope

- Old HEAD before N1 micro-remediation: `0abc9bd784615a0ad77b82dcc622afe0d3356669`.
- New N1 micro-remediation commit: this committed change set on `milestone-06-shared-domain-foundations`; the exact Git hash is recorded in the final handoff after commit creation.
- PR: #5, `Milestone 06 - Shared Domain Foundations`, open against `main`.
- Branch: `milestone-06-shared-domain-foundations`.

Files changed for N1:

- `src/domain/shared/redaction.ts`
- `src/domain/shared/audit-logging.test.ts`
- `docs/milestone-06-review-remediation-report.md`

No Money, Fingerprint, DomainError, Idempotency, schema/RLS/Auth, shell/navigation, M05, M07+, Frozen docs, or `Markdown Files/` files were changed.

### 15.2 N1 Status

N1 - over-redaction of common key names by substring matching - is RESOLVED.

The previous single broad regular expression matched sensitive fragments inside unrelated words, including `pan` inside `company`, `expand`, `japan`, `panel`, and `span`; `mobile` inside `automobile`; `document` inside `documentation` and `documentary`; and `tax_id`/`taxId`-style intent inside `taxidermist`.

The final key-name policy now tokenizes key names before matching. It splits camelCase/PascalCase/acronym boundaries and snake_case/kebab-case/non-alphanumeric separators into lowercase tokens, then matches only explicit sensitive tokens or explicit sensitive token sequences. Compact exact aliases are preserved for supported joined aliases such as `taxid`, `cardpan`, `accountnumber`, and `documentnumber`.

Value-level redaction was not reduced or changed.

### 15.3 Alias Matrix

Negative aliases tested and confirmed NOT redacted:

| Key               | Status       |
| ----------------- | ------------ |
| `company`         | NOT REDACTED |
| `companyName`     | NOT REDACTED |
| `expand`          | NOT REDACTED |
| `expandable`      | NOT REDACTED |
| `isExpanded`      | NOT REDACTED |
| `japan`           | NOT REDACTED |
| `panel`           | NOT REDACTED |
| `span`            | NOT REDACTED |
| `automobile`      | NOT REDACTED |
| `automobileValue` | NOT REDACTED |
| `documentation`   | NOT REDACTED |
| `documentary`     | NOT REDACTED |
| `taxidermist`     | NOT REDACTED |
| `accountName`     | NOT REDACTED |
| `cardBrand`       | NOT REDACTED |

Positive aliases tested and confirmed redacted:

| Key              | Status   |
| ---------------- | -------- |
| `pan`            | REDACTED |
| `card_pan`       | REDACTED |
| `cardPan`        | REDACTED |
| `mobile`         | REDACTED |
| `mobile_phone`   | REDACTED |
| `mobilePhone`    | REDACTED |
| `document`       | REDACTED |
| `document_id`    | REDACTED |
| `documentNumber` | REDACTED |
| `tax_id`         | REDACTED |
| `taxId`          | REDACTED |
| `account_number` | REDACTED |
| `accountNumber`  | REDACTED |
| `card_number`    | REDACTED |
| `cardNumber`     | REDACTED |
| `email`          | REDACTED |
| `cpf`            | REDACTED |
| `cnpj`           | REDACTED |
| `iban`           | REDACTED |
| `password`       | REDACTED |
| `serviceRoleKey` | REDACTED |
| `authorization`  | REDACTED |
| `apiKey`         | REDACTED |
| `pdfPassword`    | REDACTED |
| `token`          | REDACTED |
| `secret`         | REDACTED |
| `credential`     | REDACTED |

Nested object and nested array redaction tests from the F5 remediation remain covered and passing.

### 15.4 Regression Gates

Executed for N1 micro-remediation:

- `npm ci` - PASSED.
- `npm run validate:env:ci` - PASSED.
- `npm run check:secrets` - PASSED.
- `npm run format:check` - PASSED after formatting `src/domain/shared/redaction.ts` and `docs/milestone-06-review-remediation-report.md`.
- `npm run lint` - PASSED.
- `npm run typecheck` - PASSED.
- `npm run typecheck:e2e` - PASSED.
- `npx vitest run src/domain/shared/audit-logging.test.ts` - PASSED, 1 file / 7 tests.
- `npx vitest run src/domain/shared/*.test.ts` - PASSED, 9 files / 40 tests.
- `npm run test` - PASSED, 21 files / 86 tests.
- `npm run build` - PASSED.
- `npm run test:e2e` - PASSED outside sandbox, 14 tests.
- `npm run verify:schema:m03` - PASSED.
- `npm run verify:runtime:m03:pg` - PASSED outside sandbox, 2 clean reset cycles.
- `npm run verify:runtime:m04:auth` - PASSED outside sandbox, 2 clean reset cycles.

Sandbox limitations observed:

- `npm run test:e2e` failed inside sandbox with `listen EPERM 0.0.0.0:3000`; rerun outside sandbox passed.
- `npm run verify:runtime:m03:pg` failed inside sandbox on PostgreSQL shared memory `shmget`; rerun outside sandbox passed.
- `npm run verify:runtime:m04:auth` failed inside sandbox on PostgreSQL shared memory `shmget`; rerun outside sandbox passed.

### 15.5 Prior Findings, Scope, and Remaining Deferrals

- F1 Money remains RESOLVED; untouched by this micro-remediation.
- F2 Fingerprint remains RESOLVED; untouched by this micro-remediation.
- F3 DomainError remains RESOLVED; untouched by this micro-remediation.
- F4 Idempotency remains RESOLVED; untouched by this micro-remediation.
- F5 PII coverage remains RESOLVED; nested object/array and value-level redaction coverage remains passing.
- N2 generic `Error` residual remains deferred as MINOR/FUTURE; intentionally not fixed in this micro-remediation.
- M03 schema/runtime gates passed with the outside-sandbox runtime limitation noted above.
- M04 auth/RLS runtime gate passed with the outside-sandbox runtime limitation noted above.
- M05 E2E protected-route/deep-link/navigation smoke passed with the outside-sandbox runtime limitation noted above.

## Final Status

READY FOR INDEPENDENT MILESTONE 06 FINAL RE-REVIEW
