# Milestone 08 Implementation Report

Status: `READY FOR INDEPENDENT MILESTONE 08 REVIEW`

## 1. Canonical Milestone 08 Definition

Source: `PHASE_1_IMPLEMENTATION_PLAN.md`.

```text
## Milestone 08 - Categories and Subcategories

### Objective

Implement canonical financial categories and subcategories.

### Scope

Category/subcategory CRUD, max depth 2, normalized names, type compatibility, archive behavior, UI selectors.

### Dependencies

Milestones 03-06.

### Implementation Tasks

- Implement root category and subcategory creation.
- Enforce max functional depth of 2.
- Enforce subcategory type compatibility with parent.
- Implement normalized name uniqueness per user/parent.
- Implement archive behavior for categories in use.
- Add category management UI.
- Add category selector components for later forms.

### Database Impact

Uses `categories`, constraints, RLS, indexes.

### Domain/Application Impact

Adds category validation and normalization service.

### UI Impact

Category management screen and selectors.

### Security Impact

User-owned category access only.

### Tests

- Category CRUD tests.
- Duplicate normalized name tests.
- Max-depth tests.
- Parent/type compatibility tests.
- Archive-in-use tests.
- Two-user isolation tests.

### AFR Feature-Parity Impact

Preserves category/subcategory tree and income/fixed/variable/investment classification while correcting mixed enum fragility.

### Migration Impact

Must support AFR category type mapping and duplicate/category archive handling.

### Deliverables

- Category service/repository.
- Category UI.
- Selector components.
- Tests.

### Acceptance Criteria

- Reports can later rely on canonical `category_type`.
- No category deeper than subcategory can be created in Phase 1.

### Exit Gate

Categories Freeze.
```

## 2. Branch, Commits, and PR

- Branch: `milestone-08-categories-subcategories`
- Implementation commit: `4936a337bc6856b6c536863534733547e3f2d197`
- Initial report commit: `d2833b4c040e5f1224e5ad48a9618864a1249903`
- Final validation metadata commit: `613dd5a78e786e99fcbc6f0a72f8de564cbbbb3c`
- PR: [#7 - Milestone 08 - Categories and Subcategories](https://github.com/arthurrioo/planner-vida/pull/7)
- Base: `main` at `9b8bac7`, which contains `Merge pull request #6 from arthurrioo/milestone-07-accounts`.

## 3. Files Altered

- `package.json`
- `e2e/bootstrap.spec.ts`
- `scripts/run-m08-categories-runtime-harness.mjs`
- `src/domain/categories/*`
- `src/application/categories/*`
- `src/infrastructure/categories/*`
- `src/components/categories/*`
- `src/app/app/financeiro/page.tsx`
- `src/app/app/financeiro/categorias/*`
- `docs/milestone-08-implementation-report.md`

## 4. Architecture and Flow

The M08 flow follows the frozen modular-monolith contract:

`UI -> Server Action -> Application Service -> Domain Service/Rules -> Supabase Repository -> PostgreSQL/RLS`.

- UI pages live under `/app/financeiro/categorias`.
- Server actions validate authentication and create a `RepositoryContext`.
- `CategoryService` owns canonical rules, normalization, conflicts, archive/delete behavior, and audit events.
- `SupabaseCategoryRepository` maps rows to domain records and scopes every query by `context.userId`.
- The physical schema remains the frozen M03 `categories` table, unique active-name index, composite owned FKs, and M04 RLS policies.

## 5. Domain Rules and Invariants

- Root categories use `parent_id = null`.
- Subcategories require a parent root category.
- Phase 1 max functional depth is exactly two: category -> subcategory.
- A subcategory type must match its parent category type.
- Names are display-normalized and search-normalized with M06 `normalizeDisplayText` and `normalizeCategoryName`.
- Active normalized names are unique per `user_id + parent_id`.
- Archived categories are read-only in the application service and hidden from selector defaults.
- Selector defaults include active categories only; subcategories under archived roots are excluded unless explicitly requested.
- Delete is safe-only: categories with dependencies are archived, while dependency-free categories are hard-deleted.
- Category dependency counting covers every Frozen M03 FK to `categories`.

## 6. Use of M06 Foundations and M07 Accounts

M06 reused explicitly:

- `RepositoryContext`
- `UserId`
- `DomainError`
- `AuditService`
- `createAuditEvent`
- canonical `CategoryType` and `categoryTypes`
- `getEnumLabel` / `getEnumOptions`
- `normalizeDisplayText`
- `normalizeCategoryName`
- `assertOwnedByContext`
- `toPublicError`

M07 Accounts was used as implementation reference for service/repository/UI/action patterns. M08 does not alter Accounts behavior, lifecycle, selectors, or balance semantics.

## 7. Authorization and Ownership Matrix

| Operation          | Enforcement                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| List categories    | Repository filters by `context.userId`; database RLS also restricts `user_id = auth.uid()`.                                            |
| Read category      | Repository filters by `context.userId`; service requires ownership via `assertOwnedByContext`.                                         |
| Create category    | Server action derives `context.userId` from authenticated session; repository inserts `user_id = context.userId`; RLS validates owner. |
| Create subcategory | Parent is loaded through same context; cross-user parent resolves as not found in service and is rejected by composite FK/RLS in DB.   |
| Update category    | Repository filters by `context.userId`; archived categories are read-only.                                                             |
| Archive category   | Repository filters by `context.userId`; audit event records owner-scoped entity metadata.                                              |
| Delete category    | Repository filters by `context.userId`; FK dependencies block hard delete; service archives when dependencies exist.                   |

## 8. Tests Executed and Results

Final gate run:

- `npm ci` - PASS
- `npm run validate:env:ci` - PASS
- `npm run check:secrets` - PASS
- `npm run format:check` - PASS
- `npm run lint` - PASS
- `npm run typecheck` - PASS
- `npm run typecheck:e2e` - PASS
- `npm run test` - PASS, 30 files / 131 tests
- `npm run build` - PASS
- `npm run test:e2e` - PASS outside sandbox, 14/14
- `npm run verify:schema:m03` - PASS
- `npm run verify:runtime:m03:pg` - PASS outside sandbox, 2 clean reset cycles
- `npm run verify:runtime:m04:auth` - PASS outside sandbox, 2 clean reset cycles
- `npm run verify:runtime:m07:accounts` - PASS outside sandbox
- `npm run verify:runtime:m08:categories` - PASS outside sandbox

Sandbox notes:

- `npm run test:e2e` initially failed inside sandbox with `listen EPERM` on port 3000, then passed outside sandbox.
- `npm run verify:runtime:m08:categories` initially failed inside sandbox on PostgreSQL shared memory creation, then passed outside sandbox.

## 9. Runtime Environment and Limitations

- Runtime DB validation used a local disposable PostgreSQL 17.11 cluster.
- Test data was synthetic only.
- No production environment was touched.
- Supabase hosted Auth/GoTrue was not exercised; existing M04 local auth/RLS harness remains the relevant regression gate.

## 10. Regression Verification

M08 is additive and leaves frozen milestone contracts intact:

- M03: schema/RLS/FK contracts reused, no migration edits.
- M04: auth/session and RLS patterns reused, no policy relaxation.
- M05: existing shell/cards/forms/responsive table reused.
- M06: shared foundations reused for enum, normalization, errors, audit, repository context.
- M07: Accounts modules untouched except as reference pattern; M07 runtime harness passed after M08 changes.

## 11. Frozen Docs, Markdown Files, and M09+ Status

- `PHASE_1_IMPLEMENTATION_PLAN.md`: untouched.
- `DATABASE_SCHEMA.md`: untouched.
- `PLANNER_PHASE_1_ARCHITECTURE.md`: untouched.
- `PLANNER_PHASE_1_SPEC.md`: untouched.
- `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`: untouched.
- `AFR_MIGRATION_PLAN.md`: untouched.
- `Markdown Files/`: untouched.
- M09+ behavior: not implemented.
- No schema redesign, auth/RLS redesign, shell redesign, M06 contract changes, or M07 Accounts changes were introduced.

## 12. Secrets and Hygiene

- No real secrets, `.env` contents, production IDs, financial data, dumps, PDFs, or personal data were added.
- Runtime data uses deterministic synthetic UUIDs and `.example.invalid` emails.
- Audit metadata uses category type, parent id, request id, and owner-scoped entity metadata only.

## 13. Divergences or Blocking Decisions

No `BLOCKING DECISION REQUIRED` item was found.

Implementation interpretation:

- "Type compatibility" is implemented as strict equality between parent and subcategory `category_type`, matching the Phase 1 canonical taxonomy and AFR migration guidance.
- "Archive behavior for categories in use" is implemented as service-level delete-or-archive: dependencies produce archive; zero dependencies allow hard-delete.

Final status: `READY FOR INDEPENDENT MILESTONE 08 REVIEW`
