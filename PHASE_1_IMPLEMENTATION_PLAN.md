# Planner Vida - Phase 1 Implementation Plan

Status: FROZEN v1.0 — Planner Vida Phase 1 Implementation Contract
Scope: Planner Vida Phase 1  
Date: 2026-09-10  

Reference contracts:

- `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`
- `PLANNER_PHASE_1_SPEC.md`
- `PLANNER_PHASE_1_ARCHITECTURE.md`
- `DATABASE_SCHEMA.md` - Frozen Phase 1 Data Contract v1.0
- `AFR_MIGRATION_PLAN.md` - Frozen v1.0

This document is the master construction plan for Planner Vida Phase 1. It translates the approved functional scope, architecture, data contract, and migration strategy into an incremental, testable, reviewable implementation sequence.

This document does not implement code, migrations, API routes, React components, Supabase functions, deploy configuration, or migration scripts.

---

## Executive Summary

Planner Vida Phase 1 will build a production-usable, secure, mobile-first Next.js PWA that preserves AFR Controle Financeiro feature parity while adding the essential Planner Vida operating core: Today/Home, calendar, tasks, future financial commitments, forecast, shopping lists, wishlist, subscriptions, basic net worth, annual obligations, IPVA/IPTU, provisions, macro data, jobs, auditability, admin observability, deployment, and controlled AFR migration.

The implementation strategy is incremental and milestone-gated. Each milestone is designed to be assigned to a coding agent, implemented, tested, reviewed, and frozen before dependent milestones proceed. Financial rules are built domain-first, with UI as a caller of application services rather than as the owner of business logic.

The main dependency chain is:

```text
Repository / environments / schema / auth
-> shared domain foundations
-> accounts / categories
-> transactions / transfers
-> installments / cards / invoices
-> recurrence / commitments / import / reports
-> calendar / tasks / forecast / life-finance modules
-> Hoje / admin / jobs / PWA / hardening
-> migration implementation / dry run / deploy / cutover
```

AFR feature parity is protected through:

- a dedicated AFR Feature Parity Matrix maintained from the first reporting milestone;
- acceptance tests tied to every preserved AFR capability;
- reconciliation checkpoints for balances, P&L, invoices, installments, imports, goals, simulator, investments, and reports;
- explicit issue logging when source documents diverge or an AFR behavior is ambiguous;
- no silent removal of existing AFR functionality for implementation convenience.

Phase 1 is complete only after the application is feature-complete, deployed, security-tested, migration-tested, AFR data is migrated and reconciled, and production is stable.

---

## Implementation Principles

1. Use vertical slices when a behavior crosses UI, application service, domain rule, persistence, and tests.
2. Use domain-first implementation for critical financial rules: balances, transfers, installments, invoices, payments, recurrence, commitments, forecast, provisions, goals, simulator, imports, and P&L.
3. Deliver incrementally: implement, test, review, freeze milestone, then move forward.
4. Write tests with the implementation, not as a final cleanup phase.
5. Treat `DATABASE_SCHEMA.md` as the frozen data contract. Do not change it silently.
6. Use explicit schema migrations. Do not run destructive automatic migrations as a side effect of frontend deploy.
7. No destructive migrations without an issue, review, backup/recovery path, and explicit approval.
8. Preserve auditability: financial changes must explain actor, source, timestamp, operation, and correlation.
9. Preserve observability: jobs, imports, errors, and key operations must emit structured logs and operational records.
10. Use security by default: authenticated access, server-side ownership checks, RLS, private storage, no secrets in browser.
11. Build mobile-first and verify desktop behavior for analytical workflows.
12. Meet basic accessibility: keyboard usability, labels, focus states, contrast, and non-overlapping responsive text.
13. Develop migration-aware code: schema, services, and domain invariants must support the frozen AFR migration plan.
14. Keep sources of truth separate:
    - `transactions` = realized facts;
    - `financial_commitments` = future expected/committed;
    - `planning_items` = planning;
    - `provisions` = economic accrual;
    - `simulation_scenarios` / versions = hypothetical analysis.
15. Do not implement premature Phase 2 features. Do not remove AFR parity by calling an existing capability "Phase 2".
16. Keep the architecture a modular monolith. Do not introduce microservices, Oracle VM, Streamlit, or Cloudflare into the Phase 1 core.
17. Use provider abstraction for invoice parsing/AI; do not couple the domain to a single provider.
18. Do not depend on UI calculations for financial correctness.
19. Keep business operations atomic when multiple financial records must change together.
20. Prefer explicit domain errors and user-safe messages over silent fallback behavior.

---

## Environment Strategy

Minimum environments:

- Local: developer workstation with local env values, Supabase DEV, seeded non-sensitive fixtures, and resettable test data.
- Preview/Test: Vercel preview builds connected to Supabase DEV or isolated test project; used for PR validation, E2E, and review.
- Production: Vercel Production connected to Supabase PROD, private Storage, production secrets, backups, monitoring, and controlled migrations.

Environment rules:

- Use separate Supabase DEV and PROD projects whenever possible.
- Never copy production financial data into development indiscriminately.
- Use synthetic fixtures for local and CI.
- Store secrets only in approved environment stores.
- Maintain `.env.example` with required variable names and safe descriptions only.
- Migrations must run through explicit migration tooling and reviewed runbooks.
- Test fixtures must include at least two users to validate isolation.

---

## Issue Register

| Issue | Severity | Handling |
|---|---:|---|
| `PLANNER_PHASE_1_ARCHITECTURE.md` is marked Proposed Architecture v0.1, while the user instructed this plan to treat it as an approved contract. | Low | Treat it as approved for this implementation plan because the user explicitly listed it as mandatory reference. |
| AFR Credit Availability is an existing AFR capability but classified as optional/melhorar in the baseline. | Medium | Include a compatibility milestone and parity-matrix entry. If product decides to exclude it, record an explicit scope decision before Phase 1 completion. |
| Exact migration control table physical names are implementation details in `AFR_MIGRATION_PLAN.md`. | Low | Plan for migration metadata support without hardcoding final table names at this stage. |

No blocking implementation issue is identified from the available contracts.

---

## Milestone Template

Every implementation milestone below includes:

- Objective
- Scope
- Dependencies
- Implementation Tasks
- Database Impact
- Domain/Application Impact
- UI Impact
- Security Impact
- Tests
- AFR Feature-Parity Impact
- Migration Impact
- Deliverables
- Acceptance Criteria
- Exit Gate

---

# Wave 0 - Foundation

Goal: create the technical foundation, environments, schema baseline, authentication, application shell, and shared domain primitives needed by every later milestone.

## Milestone 01 - Repository Bootstrap

### Objective

Create the new Planner Vida repository/project foundation.

### Scope

Next.js, TypeScript, linting, formatting, Tailwind, component system, initial folder organization, testing frameworks, CI skeleton, README, `.env.example`, and local workflow.

### Dependencies

Approved contracts and this implementation plan.

### Implementation Tasks

- Create a new repository/project for Planner Vida.
- Initialize Next.js with TypeScript.
- Add linting, formatting, typecheck, test scripts, and build script.
- Configure Tailwind CSS and shadcn/ui or equivalent component foundation.
- Establish conceptual folders:
  - `src/app`
  - `src/domain`
  - `src/application`
  - `src/infrastructure`
  - `src/components`
  - `src/lib`
  - `src/validation`
- Add test framework choices for unit, integration, and E2E.
- Add CI pipeline skeleton for lint, typecheck, tests, and build.
- Add `.env.example` with safe variable names only.
- Add README with local development workflow.

### Database Impact

None beyond documenting expected Supabase variables.

### Domain/Application Impact

Creates module boundaries but no business logic.

### UI Impact

Initial empty app shell placeholder only for verifying app boot, not product functionality.

### Security Impact

No secrets committed. `.env.example` must contain no real credentials.

### Tests

- App boots locally.
- Lint passes.
- Typecheck passes.
- Initial test runner executes.
- CI skeleton runs on PR.

### AFR Feature-Parity Impact

Creates the foundation for parity work. No AFR capability is implemented yet.

### Migration Impact

Repository structure must leave room for migration metadata, reconciliation artifacts, and migration-aware tests later.

### Deliverables

- New repository/project.
- Initial Next.js app.
- Folder structure.
- Tooling configuration.
- `.env.example`.
- README.
- CI skeleton.

### Acceptance Criteria

- A developer can clone, configure local env, install dependencies, run tests, and start the app.
- No implementation placeholder claims product functionality.
- No AFR frozen contract is modified.

### Exit Gate

Foundation repository is frozen for subsequent milestones.

## Milestone 02 - Environment and CI Foundation

### Objective

Create safe environment separation and repeatable validation gates.

### Scope

Local, preview/test, production configuration model; Supabase DEV/PROD expectations; Vercel preview/production expectations; CI checks.

### Dependencies

Milestone 01.

### Implementation Tasks

- Define local env requirements.
- Define preview/test env requirements.
- Define production env requirements.
- Document secrets ownership and rotation expectations.
- Configure CI to run lint, typecheck, unit tests, and build.
- Reserve E2E execution for later once app flows exist.
- Define seed fixture approach using synthetic data only.

### Database Impact

No schema yet. Establish environment naming and migration target expectations.

### Domain/Application Impact

None.

### UI Impact

None.

### Security Impact

Prevents accidental use of production secrets or production data in non-prod.

### Tests

- CI fails on lint/type/build/test failure.
- Local and preview env validation reports missing required variables clearly.

### AFR Feature-Parity Impact

Creates the validation harness where parity tests will later run.

### Migration Impact

Separates DEV/test dry runs from PROD migration.

### Deliverables

- Environment strategy docs.
- CI workflow.
- Safe fixture policy.

### Acceptance Criteria

- CI is mandatory for PR review.
- No production data is required for local tests.
- Secrets are absent from committed files.

### Exit Gate

Environment model is approved before database work begins.

## Milestone 03 - Database Physical Foundation

### Objective

Translate `DATABASE_SCHEMA.md` into an initial physical Supabase/PostgreSQL foundation without changing the frozen data contract.

### Scope

Migration tooling, enums, base tables, constraints, FK strategy, indexes, audit columns, RLS skeleton, seed/reference data, storage bucket planning, and migration metadata support.

### Dependencies

Milestones 01-02.

### Implementation Tasks

- Select migration tooling.
- Create migration sequencing conventions.
- Implement canonical enums from the frozen schema.
- Create physical tables from the frozen logical schema.
- Implement non-destructive constraints and FK relationships.
- Add indexes required for Phase 1 access paths.
- Add `created_at` / `updated_at` conventions.
- Add RLS skeleton policies for owned-by-user tables.
- Add global read policies for macro reference data.
- Add admin observability tables without `user_id`.
- Add private Storage bucket plan for invoice imports.
- Add migration metadata support required by `AFR_MIGRATION_PLAN.md`.
- Add seed/reference data for macro indicator definitions and minimal defaults.

### Database Impact

Major. Establishes the physical Phase 1 schema.

### Domain/Application Impact

Provides persistence targets for later repositories and services.

### UI Impact

None.

### Security Impact

RLS skeleton must exist before user data features.

### Tests

- Migration applies to an empty DEV database.
- Migration reruns or reset workflow is deterministic in DEV.
- Enum values match `DATABASE_SCHEMA.md`.
- Required constraints and key indexes exist.
- RLS default denies cross-user access in preliminary checks.

### AFR Feature-Parity Impact

Creates destination structures needed for AFR parity.

### Migration Impact

Must support frozen mapping concepts: legacy IDs, payload hashes, batch metadata, source traceability, and reconciliation.

### Deliverables

- Initial database migrations.
- Schema verification report.
- RLS skeleton.
- Seed/reference data.

### Acceptance Criteria

- Physical schema matches the frozen data contract or every deviation is recorded as an issue.
- No destructive migration behavior is hidden in app deploy.

### Exit Gate

Database Foundation Freeze.

## Milestone 04 - Authentication, Profiles, Authorization, and RLS

### Objective

Implement secure identity, sessions, profile ownership, roles, protected routes, and user isolation.

### Scope

Signup/login/logout/session/password recovery/profile, protected routes, Supabase Auth, `profiles`, `user_roles`, server-side authorization, RLS policies, admin restriction model.

### Dependencies

Milestones 01-03.

### Implementation Tasks

- Implement signup using real email + password.
- Implement login, logout, session handling, and password recovery.
- Create profile creation flow linked to auth user.
- Implement protected route/session guard.
- Implement user role read path.
- Implement server-side ownership validation helpers.
- Complete RLS policies for profiles and user-owned tables.
- Enforce that human Admin has only aggregate observability permissions.
- Keep `service_role` server-side only.
- Add rate-limit strategy for sensitive auth flows where applicable.

### Database Impact

Uses `profiles`, `user_roles`, audit logs, RLS policies.

### Domain/Application Impact

Introduces authorization helpers used by all application services.

### UI Impact

Auth screens, profile basics, protected shell entry.

### Security Impact

Critical. Establishes user isolation and role boundaries.

### Tests

- Signup/login/logout/password recovery happy paths.
- Protected route rejects anonymous access.
- User A cannot read/update User B owned records.
- Admin cannot fetch individual financial data through product paths.
- `service_role` is not exposed to browser bundle.

### AFR Feature-Parity Impact

Preserves authenticated user, profile, role, isolation, recovery, and admin governance requirements.

### Migration Impact

Auth/profile model must support AFR identity mapping and synthetic email remediation without silently inventing identities.

### Deliverables

- Auth flows.
- Profile model integration.
- Authorization helpers.
- RLS tests.

### Acceptance Criteria

- Two-user isolation tests pass.
- Admin restriction tests pass.
- No browser-accessible privileged secret exists.

### Exit Gate

Auth and Ownership Freeze.

## Milestone 05 - Design System and Application Shell

### Objective

Build the mobile-first application shell and reusable UI primitives.

### Scope

Navigation, responsive shell, layout, forms, dialogs, tables, cards, loading/error/empty states, toasts, date/money formatting, theme, accessibility basics.

### Dependencies

Milestones 01-04.

### Implementation Tasks

- Implement mobile and desktop shell.
- Add Phase 1 navigation:
  - Hoje
  - Calendario
  - Planner
  - Financeiro
  - Compras
  - Patrimonio
  - Recorrentes
  - Configuracoes
- Add form primitives with validation display.
- Add table/list primitives for mobile and desktop.
- Add modal/dialog/confirmation patterns.
- Add toast/feedback pattern.
- Add BRL/date formatting helpers in UI layer.
- Add loading, error, and empty states.
- Add base accessibility checks.

### Database Impact

None.

### Domain/Application Impact

None except consuming shared formatting helpers.

### UI Impact

Major. Creates the visual and navigation foundation for all modules.

### Security Impact

Protected shell must respect authenticated session and role visibility.

### Tests

- Responsive smoke checks for mobile and desktop.
- Keyboard navigation smoke checks.
- Navigation routes resolve.
- Protected shell redirects unauthenticated users.

### AFR Feature-Parity Impact

Preserves AFR-style Portuguese financial UX patterns while adapting to Planner Vida navigation.

### Migration Impact

None directly.

### Deliverables

- App shell.
- Navigation.
- UI primitives.
- Formatting helpers.

### Acceptance Criteria

- Shell works on mobile and desktop.
- No major text overlap or unusable controls.
- All future milestones can mount screens inside the shell.

### Exit Gate

Application Shell Freeze.

## Milestone 06 - Shared Domain Foundations

### Objective

Create shared financial and technical primitives used by every domain module.

### Scope

Money, LocalDate, timezone rules, IDs, canonical enums, validation schemas, domain errors, normalization, audit helpers, structured logging, idempotency helpers, transaction boundaries, repository/service patterns.

### Dependencies

Milestones 01-05.

### Implementation Tasks

- Implement decimal money representation conventions.
- Implement financial date-only helpers.
- Implement event timestamp/timezone helpers.
- Implement canonical enum exports and UI label mapping boundary.
- Implement validation schema conventions.
- Implement domain error taxonomy.
- Implement normalization helpers for names, categories, merchants, and fingerprints.
- Implement structured logging conventions.
- Implement audit service interface.
- Implement idempotency helper pattern.
- Implement transaction boundary pattern for atomic operations.
- Implement repository/service interface conventions.

### Database Impact

May add audit/logging support if not finalized in Milestone 03.

### Domain/Application Impact

Major. Establishes the shared language for financial correctness.

### UI Impact

UI consumes validation errors and formatting helpers.

### Security Impact

Audit/logging helpers must avoid passwords, PDF passwords, tokens, secrets, and excessive financial payloads.

### Tests

- Money precision tests.
- LocalDate month-boundary tests.
- Canonical enum mapping tests.
- Normalization tests.
- Domain error mapping tests.
- Idempotency helper tests.

### AFR Feature-Parity Impact

Directly protects against AFR weaknesses: floating point risk, timezone shifts, mixed enums, and duplicated rules.

### Migration Impact

Migration code later must reuse these normalization, date, money, enum, and fingerprint conventions.

### Deliverables

- Shared domain primitives.
- Validation conventions.
- Error conventions.
- Audit/log/idempotency patterns.

### Acceptance Criteria

- Financial primitives are tested.
- No domain module needs to invent its own money/date/enum logic.

### Exit Gate

Shared Domain Freeze.

---

# Wave 1 - Financial Core

Goal: implement the realized financial foundation: accounts, categories, transactions, transfers, statement/search, and invariant tests.

## Milestone 07 - Accounts

### Objective

Implement financial accounts with opening balance, calculated balance, lifecycle, and benefit/investment compatibility.

### Scope

CRUD, opening balance, calculated balance service, archive/close behavior, benefit accounts, investment accounts, overdraft metadata.

### Dependencies

Milestones 03-06.

### Implementation Tasks

- Implement account create/edit/archive/close flows.
- Preserve opening balance as base, not mutable current balance.
- Implement account balance calculation service.
- Support checking, savings, wallet, cash, investment, benefit, and other account types.
- Add overdraft metadata support.
- Block or safely archive accounts with dependent records.
- Add account list/detail UI.

### Database Impact

Uses `accounts`, audit logs, indexes, RLS.

### Domain/Application Impact

Adds account repository, account service, balance query foundations.

### UI Impact

Finance accounts screens and account selectors.

### Security Impact

User-owned account access only. Archive/close actions audited where relevant.

### Tests

- Account CRUD unit/integration tests.
- Account balance calculation tests with opening balance only.
- Benefit account validation tests.
- Archive/close dependency tests.
- Two-user RLS tests.

### AFR Feature-Parity Impact

Preserves AFR accounts, institution, description, opening balance, account types, overdraft/limit metadata, and calculated balance behavior.

### Migration Impact

Must support AFR mapping of legacy `accounts.balance` to `opening_balance` and reconciliation checkpoints.

### Deliverables

- Account service/repository.
- Account UI.
- Balance calculation base.
- Tests.

### Acceptance Criteria

- Account balances are derived, not manually overwritten.
- Accounts with history are not physically deleted through normal flow.

### Exit Gate

Accounts Freeze.

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

## Milestone 09 - Transactions

### Objective

Implement realized financial facts without mixing future commitments, planning, provisions, or simulation.

### Scope

Income, expense, investment, payment methods, transaction date, competence date, account/card association, void/reversal, filters/search foundation, origin traceability.

### Dependencies

Milestones 06-08.

### Implementation Tasks

- Implement transaction creation/editing for manual posted records.
- Implement income, expense, investment, and transfer-type boundary behavior.
- Validate payment method requirements.
- Enforce account impact rules.
- Enforce credit-card purchase does not reduce account balance.
- Implement `transaction_date` and `competence_date`.
- Implement void/reversal flow for posted transactions.
- Add transaction list/detail/form UI.
- Add transaction search/filter foundations.

### Database Impact

Uses `transactions`, account/category/card FKs, audit logs, RLS.

### Domain/Application Impact

Adds transaction service and core realized financial invariant logic.

### UI Impact

Transaction entry and statement base screens.

### Security Impact

Ownership validation on every referenced account/card/category.

### Tests

- Income/expense/investment creation tests.
- Payment method validation tests.
- Credit-card purchase account-balance exclusion tests.
- Competence date default tests.
- Void/reversal tests.
- Two-user cross-reference rejection tests.

### AFR Feature-Parity Impact

Preserves AFR transaction types, methods, categories, account/card relationships, date behavior, investment transaction support, and controlled correction behavior.

### Migration Impact

Must support legacy transaction classification, source metadata, external fingerprints, and no fake parent installment import as posted transaction.

### Deliverables

- Transaction service/repository.
- Transaction UI.
- Reversal/void path.
- Tests.

### Acceptance Criteria

- Posted transactions are immutable in the sense required by the domain: corrections use void/reversal, not silent hard delete.
- Credit-card purchases do not impact account balance until invoice payment.

### Exit Gate

Transactions Freeze.

## Milestone 10 - Transfers

### Objective

Implement atomic transfers between user-owned accounts and exclude transfers from P&L.

### Scope

Source/destination account validation, atomic transfer operation, reversal/correction, transaction linkage if used by implementation.

### Dependencies

Milestones 07 and 09.

### Implementation Tasks

- Implement transfer service as atomic operation.
- Validate source and destination accounts differ.
- Validate same `user_id` ownership for both accounts.
- Create required transfer and financial movement records.
- Exclude transfers from P&L/reporting expense/income buckets.
- Implement transfer reversal/correction.
- Add transfer UI.

### Database Impact

Uses `transfers`, `transactions`, account FKs, audit logs.

### Domain/Application Impact

Adds atomic transfer use case and balance integration.

### UI Impact

Transfer form and transfer entries in statement.

### Security Impact

Cross-user account transfers must be impossible.

### Tests

- Transfer happy path.
- Same-account rejection.
- Cross-user account rejection.
- Balance impact source/destination.
- P&L exclusion.
- Reversal behavior.

### AFR Feature-Parity Impact

Preserves AFR transfers with source/destination semantics.

### Migration Impact

Must support legacy transfer classification from AFR `transactions`.

### Deliverables

- Transfer service.
- Transfer UI.
- Tests.

### Acceptance Criteria

- Transfer is all-or-nothing.
- Transfer never appears as income or expense in P&L.

### Exit Gate

Transfers Freeze.

## Milestone 11 - Statement, Filters, and Balance Invariants

### Objective

Provide the AFR-style financial statement and lock core realized-finance invariants before advanced mechanics.

### Scope

Statement listing, filters by date/type/category/method/account/card, editing entry points, account balance presentation, invariant test pack.

### Dependencies

Milestones 07-10.

### Implementation Tasks

- Implement statement query service.
- Implement filters/search.
- Show account/card/category/payment method context.
- Connect edit/void/reversal actions.
- Display account balances from the balance service.
- Add invariant regression tests for realized finance.

### Database Impact

Uses transaction indexes for statement/dashboard/P&L access.

### Domain/Application Impact

Adds read/query layer for financial facts.

### UI Impact

Financeiro/Extrato screen.

### Security Impact

Queries scoped to authenticated `user_id`.

### Tests

- Filter combinations.
- Pagination/list ordering.
- Balance invariants after income/expense/investment/transfer.
- RLS read isolation.
- Regression tests for credit-card purchase not reducing account balance.

### AFR Feature-Parity Impact

Preserves AFR extrato filters, editing access, and account-balance behavior.

### Migration Impact

Provides query surfaces used later for reconciliation sampling.

### Deliverables

- Statement service/UI.
- Core finance invariant test pack.

### Acceptance Criteria

- User can review and filter realized financial history.
- Balance invariant tests are green.

### Exit Gate

Financial Core Freeze.

---

# Wave 2 - Financial Mechanics

Goal: implement the harder financial mechanisms: installments, cards, invoices, payments, and recurrence.

## Milestone 12 - Installments

### Objective

Implement the new installment model without fake parent transactions or double counting.

### Scope

`installment_plans -> installments -> transactions / commitments`, purchase creation, 24x UI, 60x domain/database, rounding, scheduled/future/posted installments, card/account behavior, cancellation/reversal.

### Dependencies

Milestones 07-11.

### Implementation Tasks

- Implement installment plan creation.
- Enforce UI max 24 for ordinary purchases and domain/database max 60.
- Generate installments with deterministic cent rounding.
- Link posted installment to transaction when realized.
- Link credit-card installment to invoice assignment later.
- Support scheduled future installments without making them realized facts.
- Support cancellation/reversal with audit.
- Add installment purchase UI and detail view.

### Database Impact

Uses `installment_plans`, `installments`, `transactions`, future `financial_commitments` link fields.

### Domain/Application Impact

Adds installment domain service and rounding invariants.

### UI Impact

Installment flow in transaction/card purchase forms.

### Security Impact

All referenced account/card/category records must belong to same user.

### Tests

- 2x, 3x, 24x, and 60x domain tests.
- Rounding residual tests.
- No fake parent transaction test.
- No double counting in totals.
- Cancellation/reversal tests.
- Cross-user reference rejection.

### AFR Feature-Parity Impact

Preserves AFR installment behavior while removing parent-transaction fragility.

### Migration Impact

Must support migration of AFR parent/children installment groups into plan/installment records.

### Deliverables

- Installment service.
- Installment UI.
- Tests.

### Acceptance Criteria

- Sum of installments reconciles to plan total.
- Reports never need to ignore a fake parent record.

### Exit Gate

Installments Freeze.

## Milestone 13 - Credit Cards

### Objective

Implement card configuration and card purchase foundations.

### Scope

CRUD, limits, closing day, due day, preferred payment account, card status, card selectors.

### Dependencies

Milestones 07-12.

### Implementation Tasks

- Implement card create/edit/archive/close.
- Validate closing and due days 1-31.
- Support preferred payment account.
- Support card limit metadata.
- Add card list/detail UI.
- Connect card purchases from transaction/installment flows.

### Database Impact

Uses `credit_cards`, account FK, RLS.

### Domain/Application Impact

Adds card service and cycle input validation.

### UI Impact

Card management screens and selectors.

### Security Impact

User-owned card/account validation.

### Tests

- Card CRUD tests.
- Closing/due day validation.
- Preferred account ownership tests.
- Archived card with historical records cannot be physically deleted.

### AFR Feature-Parity Impact

Preserves AFR cards, limits, brands, preferred account, closing, due, and lifecycle.

### Migration Impact

Must support AFR card mapping and invalid cycle anomaly handling.

### Deliverables

- Credit card service/UI.
- Tests.

### Acceptance Criteria

- Card data is ready for invoice cycle engine.

### Exit Gate

Cards Freeze.

## Milestone 14 - Invoice Cycle Engine and Invoice Items

### Objective

Implement deterministic invoice cycle calculation and item assignment.

### Scope

Reference month, cycle start, closing date, due date, 29/30/31 edge cases, purchase on closing date, purchase after closing date, invoice items for purchases/installments/fees/interest/adjustments/refunds.

### Dependencies

Milestones 09, 12, 13.

### Implementation Tasks

- Implement invoice cycle calculation service.
- Normalize days 29/30/31 to last valid day when needed.
- Define purchase assignment rules.
- Generate/open invoice by card/reference month.
- Create invoice items from card purchases and installments.
- Support item types: purchase, installment, fee, interest, adjustment, refund.
- Support manual closing adjustment with reason.
- Add invoice list/detail UI.

### Database Impact

Uses `credit_card_invoices`, `invoice_items`, `transactions`, `installments`.

### Domain/Application Impact

Adds invoice cycle and item services.

### UI Impact

Invoice views and item review.

### Security Impact

Card, invoice, transaction, and installment ownership must match.

### Tests

- Month-end cycle tests.
- Closing-day purchase tests.
- After-closing purchase tests.
- Single invoice assignment tests.
- Manual adjustment reason tests.
- Paid invoice mutation prevention placeholder tests for later payment state.

### AFR Feature-Parity Impact

Preserves AFR invoice cycle, status basis, card report windows, and manual closing adjustment behavior.

### Migration Impact

Supports invoice reconstruction and item assignment from migrated AFR transactions/installments.

### Deliverables

- Invoice cycle service.
- Invoice item service.
- Invoice UI foundation.
- Tests.

### Acceptance Criteria

- Each card purchase/installment maps to exactly one invoice item.
- Invoice totals are explainable by items and adjustments.

### Exit Gate

Invoice Cycle Freeze.

## Milestone 15 - Invoice Payments, Status, and Reversals

### Objective

Implement invoice settlement rules including partial/multiple payments, interest, reversals, and status lifecycle.

### Scope

Full payment, partial payment, multiple payments, interest, payment account impact, payment reversal, open/closed/due/overdue/partially_paid/paid/cancelled status, `is_hidden_from_reports`.

### Dependencies

Milestones 10, 14.

### Implementation Tasks

- Implement pay invoice use case.
- Create account cash movement for payment.
- Separate principal and interest.
- Support multiple partial payments.
- Implement payment reversal preserving original payment.
- Recalculate status and remaining amount.
- Keep `is_hidden_from_reports` independent of status.
- Add payment UI and reversal UI.

### Database Impact

Uses `invoice_payments`, `transactions`, `credit_card_invoices`, audit logs.

### Domain/Application Impact

Adds invoice payment and status services.

### UI Impact

Invoice payment workflows.

### Security Impact

Payment account ownership validation. Payment/reversal audit required.

### Tests

- Full payment.
- Partial payment.
- Multiple payments.
- Interest payment.
- Payment reversal.
- Account balance impact.
- Paid invoice cannot receive silent new item.
- Hidden-from-reports flag independence.

### AFR Feature-Parity Impact

Preserves AFR invoice payment, interest, overdue/paid behavior, hidden invoice flag, and improves partial payment/reversal rigor.

### Migration Impact

Supports aggregate fallback and detailed invoice payment mapping from AFR.

### Deliverables

- Payment service.
- Status service.
- Payment UI.
- Tests.

### Acceptance Criteria

- Invoice totals, paid amounts, interest, reversals, remaining amount, and account balance reconcile.

### Exit Gate

Invoices and Payments Freeze.

## Milestone 16 - Recurrence Engine

### Objective

Implement basic recurrence rules and idempotent occurrence materialization.

### Scope

Weekly/monthly/yearly rules, occurrences, moving 12-month window, pause/end/cancel, future edits, historical immutability, target types.

### Dependencies

Milestones 06, 09, 12, 15.

### Implementation Tasks

- Implement recurrence rule model and service.
- Implement occurrence generation within moving 12-month window.
- Support targets: transaction, financial commitment, event, task, subscription, annual obligation.
- Implement idempotency keys.
- Implement pause, resume, end, cancel.
- Implement future-only edits.
- Add recurrence management UI.

### Database Impact

Uses `recurrence_rules`, `recurrence_occurrences`, `system_job_runs` later.

### Domain/Application Impact

Adds recurrence engine and target adapters.

### UI Impact

Recurring items screen and recurrence controls in forms.

### Security Impact

Generated targets must inherit same user ownership.

### Tests

- Weekly/monthly/yearly generation.
- 12-month window.
- Idempotent rerun.
- Pause/end/cancel behavior.
- Future edit does not rewrite realized history.
- Duplicate occurrence prevention.

### AFR Feature-Parity Impact

Preserves AFR recurrence capability while preventing duplicates and infinite future generation.

### Migration Impact

Supports migration of explicit AFR recurrence metadata and safe `last_generated_until` initialization.

### Deliverables

- Recurrence service.
- Occurrence generation.
- UI controls.
- Tests.

### Acceptance Criteria

- Running recurrence generation twice produces no duplicate targets.
- Realized history is immutable under future rule edits.

### Exit Gate

Financial Mechanics Freeze.

---

# Wave 3 - AFR Feature Parity

Goal: implement the remaining AFR functional baseline: budgets, goals, simulator, PDF import, reporting, investments, credit availability compatibility, and parity tracking.

## Milestone 17 - Planning Budgets

### Objective

Implement monthly budgets and planned-vs-actual behavior without turning budgets into commitments.

### Scope

Monthly budgets, budget lines, category relationships, historical months, monthly view, planned vs actual.

### Dependencies

Milestones 08, 09, 11.

### Implementation Tasks

- Implement budget envelope per month.
- Implement budget lines by category/subcategory.
- Implement planned-vs-actual query from transactions.
- Implement historical month views.
- Add budget UI.
- Prevent automatic commitment creation from budget lines.

### Database Impact

Uses `budgets`, `budget_lines`, `transactions`, `categories`.

### Domain/Application Impact

Adds budget service and planned-vs-actual query.

### UI Impact

Planner/Budgets monthly screen.

### Security Impact

User-owned budget/category validation.

### Tests

- Budget CRUD.
- Unique active budget per user/month.
- Planned-vs-actual calculations.
- Historical month behavior.
- Budget does not create commitment.

### AFR Feature-Parity Impact

Preserves AFR planning/orçamentos by category/month.

### Migration Impact

Supports AFR `budgets -> budgets + budget_lines` mapping.

### Deliverables

- Budget service/UI.
- Tests.

### Acceptance Criteria

- Monthly planned-vs-actual matches transaction categories and does not duplicate planning layers.

### Exit Gate

Budgets Freeze.

## Milestone 18 - Financial Goals

### Objective

Implement financial goals with persisted baseline and AFR-equivalent progress logic.

### Scope

Goal CRUD, targets, baseline, status, goal types, category/account/card relationships, progress calculation.

### Dependencies

Milestones 08, 09, 15, 17.

### Implementation Tasks

- Implement goal types: save, reduce expense, increase income, pay debt, plus approved Phase 1 extended types.
- Persist baseline at creation.
- Implement progress calculation service.
- Support category/subcategory/account/card relationships.
- Add goals UI with active/completed/paused/archive states.
- Add progress summary.

### Database Impact

Uses `financial_goals`, transactions, invoices/payments, categories/cards/accounts.

### Domain/Application Impact

Adds goal domain service and calculation rules.

### UI Impact

Goals screen and summary widgets.

### Security Impact

Ownership validation on linked records.

### Tests

- Goal CRUD.
- Baseline persistence.
- Save/reduce/increase/pay-debt progress.
- Category/card/account link validation.
- Archived/paused behavior.

### AFR Feature-Parity Impact

Preserves AFR goal types, progress behavior, status, and card/category links while fixing unstable baseline recalculation.

### Migration Impact

Supports AFR goals with preserved or derived baseline metadata.

### Deliverables

- Goal service/UI.
- Tests.

### Acceptance Criteria

- Progress is deterministic and baseline is not recalculated silently.

### Exit Gate

Goals Freeze.

## Milestone 19 - Simulator

### Objective

Preserve the AFR "E se...?" simulator as an analysis-only, versioned, validated domain.

### Scope

Scenario CRUD, versions, validated payload schema, baseline snapshot, result calculation, comparison, max scenario behavior, isolation.

### Dependencies

Milestones 09, 17, 18.

### Implementation Tasks

- Implement scenario container.
- Implement immutable scenario versions.
- Implement `SimulationInputsV1` validation.
- Implement baseline snapshot from prior months.
- Implement result calculation for 1-12 months.
- Implement comparison to baseline and goals.
- Enforce active scenario limit if required by AFR parity.
- Add simulator UI.
- Ensure simulation never creates real transactions, commitments, planning items, or provisions.

### Database Impact

Uses `simulation_scenarios`, `simulation_scenario_versions`.

### Domain/Application Impact

Adds simulation engine and validation schemas.

### UI Impact

Simulator views and scenario comparison.

### Security Impact

User-owned simulation data only.

### Tests

- Payload validation.
- Baseline calculation.
- Monthly projection.
- Goal impact.
- Scenario limit.
- Analysis-only invariant.

### AFR Feature-Parity Impact

Preserves AFR simulator as a required differentiator.

### Migration Impact

Supports AFR scenario JSON wrapped into versioned validated payloads or quarantine later.

### Deliverables

- Simulation service/UI.
- Tests.

### Acceptance Criteria

- Scenario outputs are reproducible from saved version inputs/baseline.
- No simulation result contaminates real financial sources of truth.

### Exit Gate

Simulator Freeze.

## Milestone 20 - Invoice PDF Import

### Objective

Implement secure invoice PDF import with human review, dedupe, installments, category learning, and atomic commit.

### Scope

Upload, private storage, server-side processing, PDF extraction, parser/provider abstraction, normalization, merchant mapping, dedupe, review, confirmation, import batches/items, failure/retry, atomic final commit, password-protected PDF support.

### Dependencies

Milestones 08, 09, 12, 14, 15, 16.

### Implementation Tasks

- Implement private PDF upload flow.
- Store original PDF in private Supabase Storage.
- Accept optional PDF password for temporary processing only.
- Implement Node server-side PDF processing path.
- Create parser/provider abstraction.
- Validate parsed output through schema.
- Normalize merchants and descriptions.
- Apply merchant-category suggestions.
- Detect duplicates within batch and against existing data.
- Create import batch and import item lifecycle.
- Build human review UI.
- Commit reviewed batch atomically to transactions, installments, invoice items, and merchant mappings.
- Implement failure/retry path.
- Audit upload, parse, review, and commit.

### Database Impact

Uses `import_batches`, `import_items`, `merchant_category_mappings`, `transactions`, `installment_plans`, `installments`, `invoice_items`, audit logs, storage metadata.

### Domain/Application Impact

Adds import orchestration, parser abstraction, dedupe, merchant learning, and atomic commit service.

### UI Impact

PDF upload and line-by-line review screens.

### Security Impact

Private storage, no password persistence, no password logs, owner-only file access, service role server-side only.

### Tests

- Normal PDF flow.
- Password-protected PDF success/failure.
- No password persistence/logging checks.
- Dedupe within batch.
- Dedupe against existing transaction/installment/import item.
- Category suggestion/mapping update.
- Atomic commit rollback on failure.
- Two-user storage isolation.

### AFR Feature-Parity Impact

Preserves AFR PDF import, AI/parser assistance, human review, duplicate protection, installments, and merchant category learning.

### Migration Impact

Native import tables and metadata become targets for migrated historical import records.

### Deliverables

- Import batch/item services.
- Parser abstraction.
- Upload/review/commit UI.
- Storage policies.
- Tests.

### Acceptance Criteria

- No PDF import creates definitive financial records before human review.
- A committed import updates all required financial surfaces without duplicates.

### Exit Gate

PDF Import Freeze.

## Milestone 21 - Reporting and AFR Feature Parity Matrix

### Objective

Implement AFR-equivalent reporting and maintain a formal parity matrix.

### Scope

P&L, monthly analysis, account balances, card reports, invoices, budgets planned vs actual, goals, simulator, investment summary compatibility, credit availability compatibility, parity matrix.

### Dependencies

Milestones 11, 15, 17, 18, 19, 20.

### Implementation Tasks

- Implement monthly dashboard calculations.
- Implement P&L monthly report.
- Implement P&L comparative report.
- Implement card reports by invoice/period/category/all cards.
- Implement account balance reports.
- Implement budget planned-vs-actual report.
- Implement goals report.
- Implement simulator report outputs.
- Create AFR Feature Parity Matrix:
  - AFR capability
  - New implementation milestone
  - Test
  - Status
- Add parity regression tests.
- Add report regime labels where card purchase vs invoice payment treatment matters.

### Database Impact

Uses existing indexes and query paths; may add read model indexes if needed without altering contracts.

### Domain/Application Impact

Adds reporting services and shared report calculation rules.

### UI Impact

Dashboard, Reports, P&L, card reports, report filters.

### Security Impact

Report queries scoped to user. No admin cross-user report access.

### Tests

- Monthly dashboard tests.
- P&L monthly/comparative tests.
- Card report tests.
- Transfer exclusion tests.
- Installment double-counting tests.
- Invoice payment vs purchase regime tests.
- AFR parity matrix status validation.

### AFR Feature-Parity Impact

This is the explicit AFR parity protection milestone.

### Migration Impact

Reports become reconciliation targets for migration dry runs.

### Deliverables

- Reporting services/UI.
- AFR Feature Parity Matrix.
- Regression tests.

### Acceptance Criteria

- No mandatory AFR capability lacks target milestone and test coverage.
- Financial report calculations are consistent across Dashboard, P&L, invoices, and card reports.

### Exit Gate

AFR Reporting Parity Freeze.

## Milestone 22 - Investments and Credit Availability Compatibility

### Objective

Preserve AFR investment summary behavior and address AFR credit availability compatibility without overbuilding Phase 2 finance products.

### Scope

Investment summary compatibility, total applied, gross value, update date, return calculation, available credit compatibility triage, optional credit line records if required by parity decision.

### Dependencies

Milestones 07, 09, 13, 21.

### Implementation Tasks

- Implement investment summary from investment transactions and asset valuations.
- Support manual gross value/update date.
- Calculate return amount and percentage.
- Add investment summary UI.
- Add credit availability parity entry.
- Implement minimal compatibility surface if required to preserve existing AFR user workflow.
- Record explicit issue if credit availability is excluded from Phase 1 acceptance.

### Database Impact

Uses `assets`, `asset_valuations`, possibly account/card metadata. Avoid new unfrozen credit tables unless approved.

### Domain/Application Impact

Adds investment summary service and compatibility assessment.

### UI Impact

Investment summary view; optional credit availability view if approved.

### Security Impact

User-owned financial data only.

### Tests

- Total applied from investment transactions.
- Gross value and return calculation.
- Date-base display.
- No double counting with accounts/assets.
- Credit availability parity decision test/document check.

### AFR Feature-Parity Impact

Preserves AFR investments and handles credit availability as an explicit parity decision instead of silent omission.

### Migration Impact

Supports migration of AFR `investment_summary`; credit availability migration depends on explicit scope decision.

### Deliverables

- Investment summary service/UI.
- Credit availability parity decision artifact.
- Tests.

### Acceptance Criteria

- Investment summary is usable and reconciliable.
- Credit availability has an explicit included/excluded Phase 1 decision.

### Exit Gate

AFR Feature Parity Freeze.

---

# Wave 4 - Planner Core

Goal: implement the Planner Vida operating core: calendar, tasks, financial commitments, and forecast.

## Milestone 23 - Calendar

### Objective

Implement the central calendar without treating events as transactions.

### Scope

Events with title/date/time/all-day/recurrence/notes, optional financial relationship, monthly and list views, links to commitments.

### Dependencies

Milestones 05, 06, 16.

### Implementation Tasks

- Implement event CRUD.
- Support all-day and timed events.
- Store timezone for timed events.
- Support event recurrence integration.
- Add optional estimated amount and financial impact fields.
- Link event to financial commitment when applicable.
- Implement month view and upcoming list view.
- Ensure events do not become transactions directly.

### Database Impact

Uses `events`, recurrence links, financial commitment link fields later.

### Domain/Application Impact

Adds event service and calendar query layer.

### UI Impact

Calendario screen with month/list views.

### Security Impact

User-owned event access.

### Tests

- Event CRUD.
- All-day vs timed timezone behavior.
- Recurring event materialization.
- Optional financial link.
- Event does not create transaction directly.

### AFR Feature-Parity Impact

Adds Planner Vida core beyond AFR, while preserving financial separation.

### Migration Impact

No direct AFR migration expected unless future source has calendar data.

### Deliverables

- Calendar service/UI.
- Tests.

### Acceptance Criteria

- Calendar can show financial and non-financial events without mixing sources of truth.

### Exit Gate

Calendar Freeze.

## Milestone 24 - Tasks / Planner

### Objective

Implement simple operational tasks integrated with Hoje and Calendar.

### Scope

Task CRUD, due date/time, status, priority, optional event/commitment/transaction link, recurrence when applicable.

### Dependencies

Milestones 05, 06, 16, 23.

### Implementation Tasks

- Implement task CRUD.
- Implement status changes: pending, completed, cancelled, archived.
- Add priority.
- Link task to event/commitment/transaction when applicable.
- Support recurrence integration.
- Show dated tasks in calendar.
- Prevent automatic transaction creation from task completion.

### Database Impact

Uses `tasks`, optional event/commitment/transaction links.

### Domain/Application Impact

Adds task service.

### UI Impact

Planner task screens and task widgets.

### Security Impact

User-owned task/link validation.

### Tests

- Task CRUD.
- Complete/cancel/archive.
- Due date/time behavior.
- Calendar integration.
- Recurring task generation.
- Task does not create transaction automatically.

### AFR Feature-Parity Impact

Adds Planner Vida core.

### Migration Impact

No direct AFR migration expected.

### Deliverables

- Task service/UI.
- Tests.

### Acceptance Criteria

- Planner remains simple and operational, not a project-management platform.

### Exit Gate

Tasks Freeze.

## Milestone 25 - Financial Commitments and Realization

### Objective

Implement future financial commitments and atomic conversion to realized transactions without duplication.

### Scope

Expected income, expected expense, committed future payment, due date, status, source, links to events/subscriptions/obligations/installments/invoices, realization, matching.

### Dependencies

Milestones 09, 12, 15, 16, 23, 24.

### Implementation Tasks

- Implement commitment CRUD.
- Support expected/confirmed/overdue/realized/cancelled statuses.
- Preserve `expected_amount`, `committed_amount`, `actual_amount`, and variance.
- Link commitments to event/task/installment/subscription/annual obligation/invoice.
- Implement manual realization to transaction as default.
- Implement duplicate prevention for realization.
- Implement matching suggestion with existing/imported transaction.
- Audit realization/cancellation.

### Database Impact

Uses `financial_commitments`, `transactions`, related source links, audit logs.

### Domain/Application Impact

Adds commitment service, realization service, and matching rules.

### UI Impact

Commitment list/forms, realization flow, matching UI.

### Security Impact

Strict ownership validation across all linked records.

### Tests

- Commitment CRUD/status transitions.
- Manual realization.
- Variance calculation.
- Duplicate realization prevention.
- Import/matching suggestion.
- Overdue status behavior.
- Cross-user link rejection.

### AFR Feature-Parity Impact

Adds Planner Vida future layer while preserving AFR transactions as realized facts.

### Migration Impact

Supports future migration of installments/recurrences/obligations into commitments where source semantics are explicit.

### Deliverables

- Commitment service/UI.
- Realization/matching service.
- Tests.

### Acceptance Criteria

- A commitment and its realized transaction cannot both be counted as active forecast impact and realized fact in the same view unless explicitly comparing forecast vs actual.

### Exit Gate

Commitments Freeze.

## Milestone 26 - Forecast

### Objective

Implement basic traceable forecast derived from current balances and future financial layers.

### Scope

Forecast until end of month and practical horizon, current calculated balances, expected future income, future commitments, future invoices, subscriptions/obligations when available, traceable components, alerts.

### Dependencies

Milestones 11, 15, 16, 25.

### Implementation Tasks

- Implement forecast service.
- Derive from account balances, future income, commitments, future invoices, subscriptions, annual obligations, and selected provisions.
- Keep traceability for every forecast component.
- Display cash vs economic view where provisions apply.
- Add negative projected balance and payment concentration alerts.
- Add forecast UI.
- Do not create a manual forecast source-of-truth table.

### Database Impact

Reads from existing sources; no manual forecast facts.

### Domain/Application Impact

Adds forecast query/calculation service.

### UI Impact

Forecast views and widgets.

### Security Impact

User-scoped calculations only.

### Tests

- Balance + future income - commitments formula.
- Future invoice inclusion.
- Realized commitment exclusion.
- Provision cash/economic separation.
- Traceability output.
- Negative balance alert.

### AFR Feature-Parity Impact

Preserves AFR forecast/prevision concept with clearer methodology and confidence/premise visibility.

### Migration Impact

Forecast outputs later become migration reconciliation checks for future layers.

### Deliverables

- Forecast service/UI.
- Tests.

### Acceptance Criteria

- Forecast is derived, traceable, and does not create or mutate financial facts.

### Exit Gate

Planner Core Freeze.

---

# Wave 5 - Life / Finance Integration

Goal: implement personal life-finance modules that feed planning, commitments, calendar, forecast, provisions, and net worth without corrupting financial facts.

## Milestone 27 - Shopping Lists

### Objective

Implement shopping lists with estimated values and optional transaction linkage.

### Scope

Multiple lists, items, quantity, estimated price, status, purchased flag, notes.

### Dependencies

Milestones 08, 09, 25.

### Implementation Tasks

- Implement shopping list CRUD.
- Implement list item CRUD.
- Support quantities, units, estimated and actual prices.
- Calculate estimated totals.
- Mark items purchased/skipped.
- Optionally link purchased item to transaction.
- Do not create transaction automatically.

### Database Impact

Uses `shopping_lists`, `shopping_list_items`, optional transaction/category links.

### Domain/Application Impact

Adds shopping service.

### UI Impact

Compras list UI.

### Security Impact

User-owned list/item validation.

### Tests

- List/item CRUD.
- Estimated total calculation.
- Purchased status.
- Optional transaction link.
- No automatic transaction creation.

### AFR Feature-Parity Impact

Planner Vida core, no AFR dependency.

### Migration Impact

No direct AFR migration expected.

### Deliverables

- Shopping service/UI.
- Tests.

### Acceptance Criteria

- Shopping estimates stay planning context unless user explicitly records a transaction.

### Exit Gate

Shopping Lists Freeze.

## Milestone 28 - Wishlist

### Objective

Implement basic wishlist without price tracker or automatic purchase decisions.

### Scope

Item, estimated price, priority, target date, link, notes, status, optional planning/transaction link.

### Dependencies

Milestones 08, 09, 25.

### Implementation Tasks

- Implement wishlist item CRUD.
- Support desired/evaluating/purchased/discarded/archived statuses.
- Support estimated and max price.
- Support priority and desired date.
- Support optional category and planning impact.
- Allow manual transaction creation/link when purchased.
- Do not implement price tracker.

### Database Impact

Uses `wishlist_items`, optional planning/transaction/category links.

### Domain/Application Impact

Adds wishlist service.

### UI Impact

Wishlist screen.

### Security Impact

User-owned wishlist validation.

### Tests

- Wishlist CRUD/status.
- Estimated price edits.
- Planning flag behavior.
- Purchased without automatic transaction.
- Optional transaction link.

### AFR Feature-Parity Impact

Planner Vida core, no AFR dependency.

### Migration Impact

No direct AFR migration expected.

### Deliverables

- Wishlist service/UI.
- Tests.

### Acceptance Criteria

- Wishlist remains a decision/planning list, not an automatic transaction engine.

### Exit Gate

Wishlist Freeze.

## Milestone 29 - Subscriptions

### Objective

Implement subscriptions as recurring future financial obligations integrated with calendar and forecast.

### Scope

Subscription CRUD, amount, frequency, next billing, payment method/account/card, active/paused/cancelled, recurrence integration, commitment generation, calendar visibility.

### Dependencies

Milestones 08, 13, 16, 23, 25, 26.

### Implementation Tasks

- Implement subscription CRUD.
- Support weekly/monthly/yearly frequency.
- Link to account or card.
- Link to category/subcategory.
- Generate recurrence rule.
- Generate future financial commitments idempotently.
- Show subscription charges on calendar.
- Feed forecast.
- Support pause/cancel/archive without duplicating future items.

### Database Impact

Uses `subscriptions`, `recurrence_rules`, `recurrence_occurrences`, `financial_commitments`, `events`.

### Domain/Application Impact

Adds subscription orchestration service.

### UI Impact

Recorrentes/Assinaturas screen and calendar/forecast integration.

### Security Impact

Ownership validation across subscription, recurrence, card/account, commitments.

### Tests

- Subscription CRUD.
- Recurrence creation.
- Commitment generation idempotency.
- Pause/cancel behavior.
- Calendar/forecast visibility.
- No duplicate generation between subscription, recurrence, and commitment.

### AFR Feature-Parity Impact

Preserves and extends recurring financial behavior.

### Migration Impact

Supports future classification of subscription-like AFR recurring items if explicit source semantics exist.

### Deliverables

- Subscription service/UI.
- Integration tests.

### Acceptance Criteria

- One subscription occurrence creates at most one active commitment/calendar item for the same period.

### Exit Gate

Subscriptions Freeze.

## Milestone 30 - Patrimony / Net Worth

### Objective

Implement basic assets, liabilities, and net worth with unpaid credit card invoices as liabilities.

### Scope

Assets, asset valuations, liabilities, liability balances, investment summary compatibility, net worth calculation, double-count prevention.

### Dependencies

Milestones 07, 13, 15, 22.

### Implementation Tasks

- Implement asset CRUD.
- Implement asset valuation snapshots.
- Implement liability CRUD.
- Implement liability balance snapshots.
- Integrate account balances and investment summary.
- Include unpaid credit-card invoices as liabilities in economic net worth.
- Avoid double counting when a manual liability represents the same obligation.
- Add net worth UI.

### Database Impact

Uses `assets`, `asset_valuations`, `liabilities`, `liability_balances`, invoices/accounts.

### Domain/Application Impact

Adds net worth calculation service.

### UI Impact

Patrimonio screen.

### Security Impact

User-owned asset/liability validation.

### Tests

- Asset/liability CRUD.
- Latest valuation/balance selection.
- Net worth formula.
- Unpaid invoice liability inclusion.
- Double-count prevention rules.

### AFR Feature-Parity Impact

Preserves investment summary compatibility and adds Phase 1 patrimony.

### Migration Impact

Supports migration of AFR investment summary to assets/valuations where applicable.

### Deliverables

- Asset/liability/net worth services.
- UI.
- Tests.

### Acceptance Criteria

- Net worth separates available cash from patrimony and avoids duplicating card liabilities.

### Exit Gate

Patrimony Freeze.

## Milestone 31 - Annual Obligations and Provisions

### Objective

Implement annual obligations and economic provisions without confusing provision with payment.

### Scope

Generic annual obligations, installments, financial commitments, provisions, calendar integration, cash vs economic separation.

### Dependencies

Milestones 08, 16, 23, 25, 26.

### Implementation Tasks

- Implement annual obligation CRUD.
- Support payment at once or in installments.
- Generate annual obligation installments.
- Generate financial commitments for cash payments.
- Generate provisions for economic monthly accrual.
- Integrate with calendar and forecast.
- Support manual override with reason.
- Add annual obligations UI.

### Database Impact

Uses `annual_obligations`, `annual_obligation_installments`, `provisions`, `financial_commitments`, events.

### Domain/Application Impact

Adds obligation/provision services.

### UI Impact

Obligations/provisions views.

### Security Impact

User-owned links and override audit.

### Tests

- Obligation CRUD.
- Installment generation.
- Commitment generation.
- Provision calculation.
- Cash vs economic view separation.
- Override reason required.
- No provision-to-transaction behavior.

### AFR Feature-Parity Impact

Planner Vida core.

### Migration Impact

Provides target structures for future obligations created after cutover; no direct AFR source expected.

### Deliverables

- Obligation/provision services.
- UI.
- Tests.

### Acceptance Criteria

- Payment commitments and economic provisions remain separate and traceable.

### Exit Gate

Annual Obligations Freeze.

## Milestone 32 - IPVA and IPTU Basic

### Objective

Implement practical IPVA/IPTU support as annual obligations, not full national tax engines.

### Scope

Vehicle/property references, state/municipality, tax year, taxable/venal value, rate/rule, calculated/manual amount, due dates/installments, commitments, provisions, manual override.

### Dependencies

Milestones 30-31.

### Implementation Tasks

- Implement IPVA fields and calculation using entered value/rate.
- Implement IPTU fields and calculation using entered value/rate/rule.
- Support manual override with reason and visible difference.
- Generate obligations/installments/commitments/provisions through existing services.
- Add IPVA/IPTU UI inside annual obligations.
- Avoid claiming national automatic coverage.

### Database Impact

Uses `annual_obligations`, optional `assets`, provisions/commitments.

### Domain/Application Impact

Adds tax-specific validation wrappers over annual obligation service.

### UI Impact

IPVA/IPTU forms and detail views.

### Security Impact

User-owned asset/obligation validation. Override audit.

### Tests

- IPVA calculation and override.
- IPTU calculation and override.
- Installment/commitment/provision generation.
- No automatic national tax rule dependency.

### AFR Feature-Parity Impact

Planner Vida core.

### Migration Impact

No direct AFR migration expected unless legacy data is manually mapped later.

### Deliverables

- IPVA/IPTU validation flows.
- UI.
- Tests.

### Acceptance Criteria

- User can plan IPVA/IPTU manually or semi-automatically without false national coverage promises.

### Exit Gate

IPVA/IPTU Freeze.

## Milestone 33 - Macro Data

### Objective

Implement basic Selic, CDI/DI, and IPCA reference data with local storage and auditability.

### Scope

Official/public source fetchers, normalization, database storage, current value, historical series, source, reference date, updated_at, fetch status, fallback/manual recovery.

### Dependencies

Milestones 03, 06.

### Implementation Tasks

- Implement macro indicator reference records.
- Implement fetcher interfaces for Selic, CDI/DI, IPCA.
- Normalize external values into database.
- Store source and reference date.
- Implement current and historical reads.
- Implement manual recovery/fallback path.
- Add macro UI where useful.

### Database Impact

Uses `economic_indicators`, `economic_indicator_values`, `system_job_runs` later.

### Domain/Application Impact

Adds macro data service.

### UI Impact

Macro reference display and future calculation inputs.

### Security Impact

Read access for authenticated users; writes restricted to server/job/admin audited path.

### Tests

- Fetch normalization tests.
- Historical storage tests.
- Source/date auditability tests.
- External API failure fallback tests.
- UI does not calculate directly from external API.

### AFR Feature-Parity Impact

Planner Vida core.

### Migration Impact

No AFR migration dependency.

### Deliverables

- Macro service.
- Fetcher abstraction.
- UI/reference display.
- Tests.

### Acceptance Criteria

- UI consumes stored normalized macro data, not live external APIs.

### Exit Gate

Life/Finance Integration Freeze.

---

# Wave 6 - Experience and Operations

Goal: finish the operational product experience and system operations: jobs, Hoje, admin observability, audit/observability, and PWA.

## Milestone 34 - Jobs Coordinator

### Objective

Implement a small idempotent scheduled job system for Phase 1 operations.

### Scope

Daily coordinator for macro update, recurrence materialization, overdue commitments, invoice/obligation status updates, retries, failure logging, `system_job_runs`, observability.

### Dependencies

Milestones 16, 25, 31, 33.

### Implementation Tasks

- Implement daily coordinator job entrypoint.
- Implement idempotent subtask orchestration.
- Record `system_job_runs`.
- Update macro data.
- Materialize recurrence window.
- Mark overdue commitments.
- Update invoice/obligation status when necessary.
- Implement retry/failure logging.
- Configure scheduler approach for Supabase Cron/pg_cron without creating excessive jobs.

### Database Impact

Uses `system_job_runs`, recurrence, commitments, invoices, obligations, macro tables.

### Domain/Application Impact

Adds job orchestration and idempotency enforcement.

### UI Impact

Admin/status surfaces later consume job data.

### Security Impact

Server-side privileged execution only. No private payload leakage in job logs.

### Tests

- Idempotent rerun tests.
- Partial subtask failure recording.
- Recurrence duplicate prevention.
- Overdue status update tests.
- Macro fetch failure handling.

### AFR Feature-Parity Impact

Replaces implicit trigger/listener behavior with explicit reliable operations.

### Migration Impact

Job idempotency patterns align with migration batch/run requirements.

### Deliverables

- Daily coordinator.
- Job run logging.
- Tests.

### Acceptance Criteria

- Running the coordinator twice for the same logical date creates no duplicate financial records.

### Exit Gate

Jobs Freeze.

## Milestone 35 - Home / Hoje

### Objective

Implement the operational Home screen as a composition layer, not a new source of truth.

### Scope

Today's events/tasks/commitments/bills, upcoming payments/income, card invoice status, monthly summary, projected end-of-month, next 7 days, alerts, shopping items where appropriate.

### Dependencies

Milestones 21, 23, 24, 25, 26, 29, 31, 34.

### Implementation Tasks

- Implement Hoje query/composition service.
- Aggregate tasks, events, commitments, invoices, forecast, and alerts.
- Include next 7 days.
- Include monthly financial summary.
- Include actionable overdue/due-soon items.
- Add mobile-first Hoje UI.
- Ensure Hoje creates no duplicate data and no new source of truth.

### Database Impact

Read-only composition over existing tables.

### Domain/Application Impact

Adds Today/Home query layer.

### UI Impact

Primary app landing screen.

### Security Impact

User-scoped aggregate only.

### Tests

- Aggregation correctness.
- Due today/upcoming classification.
- Forecast widget consistency.
- No duplicated source creation.
- Mobile responsive checks.

### AFR Feature-Parity Impact

Combines AFR dashboard value with Planner Vida daily operating layer.

### Migration Impact

No direct migration dependency; migrated data should appear naturally after cutover.

### Deliverables

- Hoje service/UI.
- Tests.

### Acceptance Criteria

- Hoje answers what matters today without duplicating records or hiding source traceability.

### Exit Gate

Hoje Freeze.

## Milestone 36 - Admin Observability

### Objective

Implement admin observability using only aggregated, non-reidentifiable operational data.

### Scope

Transaction counts, aggregate volumes, min/max/average/median, import errors, reversals, job failures, reconciliation divergences, anomaly counts, extreme-value alerts.

### Dependencies

Milestones 04, 21, 34.

### Implementation Tasks

- Implement admin-only observability route.
- Populate aggregate metrics without `user_id`.
- Show job failures, import errors, anomaly counts, and aggregate volumes.
- Prevent drill-down to user/account/card/transaction/merchant/individual record.
- Add admin action audit.
- Add explicit tests for prohibited access.

### Database Impact

Uses `admin_observability_metrics`, `system_job_runs`, sanitized audit/log data.

### Domain/Application Impact

Adds admin observability service.

### UI Impact

Admin observability dashboard.

### Security Impact

Critical. Human Admin cannot access individualized financial data.

### Tests

- Admin can read aggregate metrics.
- Admin cannot read another user's financial records.
- Metrics contain no user_id/merchant/account/card/email/name/transaction description.
- Non-admin cannot access admin dashboard.

### AFR Feature-Parity Impact

Preserves admin governance concepts while improving privacy restrictions beyond AFR.

### Migration Impact

Migration anomaly/reconciliation counts can feed admin observability after launch without exposing individual data.

### Deliverables

- Admin observability service/UI.
- Privacy tests.

### Acceptance Criteria

- Admin can monitor system health but cannot inspect individual financial data.

### Exit Gate

Admin Observability Freeze.

## Milestone 37 - Audit and Operational Observability

### Objective

Complete cross-cutting audit logs, structured logs, operation IDs, import errors, anomaly tracking, and domain error reporting.

### Scope

Audit logs, structured logs, request/operation/correlation IDs, domain error codes, import/job errors, anomaly detection, operational metrics, sensitive logging controls.

### Dependencies

Milestones 06, 20, 34, 36.

### Implementation Tasks

- Implement audit log write paths for all required sensitive actions.
- Add correlation IDs to compound operations.
- Add structured logging to application services.
- Add domain error code catalog.
- Add import/job error visibility.
- Add anomaly metric generation without private detail exposure.
- Verify logs never include passwords, PDF passwords, tokens, secrets, or unnecessary full financial payloads.

### Database Impact

Uses `audit_logs`, `system_job_runs`, `admin_observability_metrics`.

### Domain/Application Impact

Cross-cutting across all application services.

### UI Impact

User-facing safe errors; admin aggregate error views.

### Security Impact

Critical sensitive-data logging control.

### Tests

- Audit emitted for required actions.
- Correlation ID propagation.
- Domain error mapping.
- Sensitive data redaction tests.
- Import/job error surfacing.

### AFR Feature-Parity Impact

Preserves AFR audit requirements and improves operational traceability.

### Migration Impact

Required for migration batch audit and cutover investigation.

### Deliverables

- Audit/logging completion.
- Error catalog.
- Tests.

### Acceptance Criteria

- Sensitive actions are audit-visible and logs are safe.

### Exit Gate

Audit and Observability Freeze.

## Milestone 38 - PWA and Responsive Hardening

### Objective

Make Planner Vida installable and reliable as a mobile-first PWA without unsafe offline financial caching.

### Scope

Manifest, icons, installability, standalone mode, responsive behavior, metadata, basic caching strategy.

### Dependencies

Milestones 05, 35.

### Implementation Tasks

- Add PWA manifest.
- Add icons and metadata.
- Configure standalone display.
- Validate installability.
- Implement conservative caching strategy.
- Avoid caching sensitive financial data accidentally.
- Run mobile/desktop responsive pass across critical screens.

### Database Impact

None.

### Domain/Application Impact

None.

### UI Impact

Mobile and desktop polish across critical flows.

### Security Impact

Avoid sensitive offline cache leakage.

### Tests

- Manifest validation.
- Installability smoke check.
- Mobile viewport E2E checks.
- Desktop viewport E2E checks.
- Cache policy review.

### AFR Feature-Parity Impact

Improves delivery over AFR and meets Phase 1 mobile/PWA requirements.

### Migration Impact

No direct migration dependency.

### Deliverables

- PWA configuration.
- Responsive fixes.
- Validation report.

### Acceptance Criteria

- App is installable where supported and critical screens work on mobile and desktop.

### Exit Gate

Experience and Operations Freeze.

---

# Wave 7 - Hardening

Goal: validate security, financial invariants, performance, regression, feature parity, migration readiness, and production readiness.

## Milestone 39 - Security, RLS, and Privacy Hardening

### Objective

Perform full security hardening before migration and production launch.

### Scope

RLS, user isolation, admin restrictions, service role boundaries, upload security, auth flows, rate limits, secret scanning, logs, storage policies.

### Dependencies

Milestones 04, 20, 36, 37, 38.

### Implementation Tasks

- Review all RLS policies.
- Review all server-side authorization checks.
- Verify storage isolation.
- Verify admin restrictions.
- Verify service role never enters browser.
- Verify auth and recovery behavior.
- Review rate limits for sensitive flows.
- Run secret scanning and log redaction checks.

### Database Impact

May adjust RLS policies and security indexes without changing logical contract.

### Domain/Application Impact

May harden service authorization wrappers.

### UI Impact

May improve safe error handling.

### Security Impact

Critical final security gate.

### Tests

- Two-user full E2E isolation.
- Admin restriction E2E.
- Storage cross-user denial.
- Service role browser bundle check.
- Sensitive log redaction.
- Auth abuse/rate-limit checks where implemented.

### AFR Feature-Parity Impact

Protects AFR security/governance parity.

### Migration Impact

Confirms migration infrastructure can use privileged access without changing human admin access.

### Deliverables

- Security hardening fixes.
- Security test report.

### Acceptance Criteria

- No known path exposes another user's financial data.
- No known secret exposure exists.

### Exit Gate

Security Freeze.

## Milestone 40 - Financial Regression and Performance Hardening

### Objective

Validate all critical financial invariants and performance with realistic personal-finance volume.

### Scope

Balances, transfers, installments, invoices, partial payments, payment reversal, recurrence, forecast, provisions, goals, simulator, imports, dedupe, reports, UI performance.

### Dependencies

Milestones 11-38.

### Implementation Tasks

- Build final financial invariant test suite.
- Build representative synthetic fixtures.
- Validate reporting consistency across Dashboard/P&L/card reports/forecast.
- Validate no double counting between sources of truth.
- Run performance checks for main list/report views.
- Fix high-risk regressions.

### Database Impact

May add non-contract-breaking indexes.

### Domain/Application Impact

May fix calculation services.

### UI Impact

May optimize heavy views and loading states.

### Security Impact

No privacy weakening allowed for performance.

### Tests

- Full invariant suite.
- Report regression suite.
- Import dedupe suite.
- Forecast/provision suite.
- E2E critical flows.
- Performance smoke checks.

### AFR Feature-Parity Impact

Ensures no meaningful financial regression from AFR.

### Migration Impact

Creates the baseline tests migration data must satisfy after dry run.

### Deliverables

- Regression suite.
- Performance notes/fixes.
- Test report.

### Acceptance Criteria

- Critical financial tests are green.
- No unresolved double-counting issue remains.

### Exit Gate

Financial Regression Freeze.

## Milestone 41 - Migration Implementation Gate

### Objective

Decide whether real AFR-to-Planner migration script implementation may begin.

### Scope

Gate review only. No migration scripts yet.

### Dependencies

Milestones 03, 04, 11, 12, 15, 16, 17, 18, 19, 20, 21, 25, 37, 39, 40.

### Implementation Tasks

- Confirm physical DB schema is stable.
- Confirm auth/ownership works.
- Confirm finance core works.
- Confirm installments work.
- Confirm invoices/payments work.
- Confirm recurrence works.
- Confirm planning/goals/simulator/import structures exist.
- Confirm commitments and forecast exist.
- Confirm critical automated tests are green.
- Confirm migration metadata support exists.
- Confirm reconciliation queries can be written against implemented schema.

### Database Impact

None unless a noncompliance issue requires a schema fix through approved migration.

### Domain/Application Impact

None unless gate identifies missing service behavior.

### UI Impact

None.

### Security Impact

Confirms privileged migration work will not change human admin restrictions.

### Tests

- Review pass of all required test reports.
- Run targeted migration-readiness smoke tests.

### AFR Feature-Parity Impact

Ensures mandatory AFR capabilities have implementation/test destinations before migration code starts.

### Migration Impact

This is the formal start gate for migration implementation.

### Deliverables

- Migration Implementation Gate report.
- List of blocking gaps if any.

### Acceptance Criteria

- All listed prerequisites are met.
- If not met, migration implementation is blocked until fixed.

### Exit Gate

Migration Ready to Implement.

---

# Wave 8 - Migration and Launch

Goal: implement the frozen migration plan, dry-run it, reconcile results, deploy production, perform cutover, and stabilize Phase 1.

## Milestone 42 - AFR Migration Implementation

### Objective

Implement repeatable, deterministic, idempotent AFR-to-Planner migration tooling according to `AFR_MIGRATION_PLAN.md`.

### Scope

Migration code, source extraction, transformation, load order, mapping, quarantine, reconciliation framework, reports, idempotency tests, runbook draft.

### Dependencies

Milestone 41.

### Implementation Tasks

- Implement source extraction from AFR snapshot.
- Implement transformation rules for all in-scope AFR entities.
- Implement dependency-ordered loading.
- Implement `migration_entity_map` concept.
- Implement migration batch/run metadata.
- Implement quarantine/anomaly handling.
- Implement reconciliation reports.
- Implement idempotency checks.
- Implement test fixtures and migration unit/integration tests.
- Draft production migration runbook.

### Database Impact

Uses migration metadata, target tables, audit logs, and reconciliation artifacts. Does not alter frozen product schema without issue.

### Domain/Application Impact

Uses domain conventions for money, date, enum, normalization, fingerprints, and source traceability.

### UI Impact

No user-facing product UI required, except optional admin aggregate status after launch.

### Security Impact

Migration credentials server-side only. Logs must not expose secrets, PDF passwords, or unnecessary financial detail.

### Tests

- Unit tests for mappings, money, dates, enums, installments, invoice assignment, recurrence, merchant normalization, payload hashes.
- Integration tests from source fixtures to target database.
- Quarantine path tests.
- Idempotency rerun tests.

### AFR Feature-Parity Impact

Preserves AFR historical data needed for feature parity.

### Migration Impact

This milestone implements the migration.

### Deliverables

- Migration tooling.
- Mapping/quarantine/reconciliation framework.
- Test reports.
- Draft runbook.

### Acceptance Criteria

- Migration can run against fixed DEV/test source fixtures and produce reconciliable target data.
- Rerun is idempotent.

### Exit Gate

Migration Implementation Freeze.

## Milestone 43 - Migration Dry Runs and Reconciliation

### Objective

Run controlled migration dry runs before production cutover.

### Scope

Empty/resettable test environment, source snapshot, reconciliation framework, mappings, quarantine, fixtures, feature parity tests, manual sampling.

### Dependencies

Milestone 42.

### Implementation Tasks

- Create read-only source snapshot.
- Run migration into empty/resettable DEV/test target.
- Generate reconciliation reports.
- Review anomalies/quarantine.
- Fix migration code or remediation mappings.
- Reset target and rerun from same snapshot.
- Validate idempotency.
- Run feature parity regression tests against migrated data.
- Run manual sampling plan.
- Freeze migration code version when all gates pass.

### Database Impact

Uses DEV/test target environments only until approved.

### Domain/Application Impact

May reveal required fixes to services or migration mapping.

### UI Impact

Use product screens for manual sample validation.

### Security Impact

Test data controls must comply with environment policy. Production data copied to non-prod only through approved, minimal, protected process.

### Tests

- Record count reconciliation.
- Monthly P&L reconciliation.
- Account balance reconciliation.
- Invoice/item/payment reconciliation.
- Installment reconciliation.
- Category distribution.
- Goals/simulation/import reconciliation.
- Idempotent rerun.
- Manual sample checklist.

### AFR Feature-Parity Impact

Confirms migrated AFR data behaves correctly in Planner Vida.

### Migration Impact

This is the dry-run gate before production migration.

### Deliverables

- Dry-run reports.
- Reconciliation reports.
- Quarantine/anomaly reports.
- Manual sampling evidence.
- Frozen migration version.

### Acceptance Criteria

- Zero blocking anomalies.
- Zero unexplained P&L/account/invoice differences.
- Idempotency passes.
- Manual sample passes.

### Exit Gate

Migration Dry Run Freeze.

## Milestone 44 - Deployment, Cutover, and Launch

### Objective

Deploy Planner Vida production, execute final migration cutover, and stabilize Phase 1.

### Scope

Preview deploys, production env, database migrations, secrets, domain/HTTPS, PWA, monitoring, rollback/recovery, health checks, AFR freeze/read-only, final snapshot, migration, reconciliation, Planner release, AFR read-only fallback.

### Dependencies

Milestones 38, 39, 40, 43.

### Implementation Tasks

- Validate production Vercel and Supabase configuration.
- Apply approved production database migrations.
- Configure production secrets.
- Validate HTTPS/domain/PWA.
- Run production health checks.
- Put AFR into read-only/freeze.
- Take final AFR snapshot.
- Execute production migration.
- Run automated reconciliation.
- Run manual sampling.
- Resolve/accept non-blocking quarantine.
- Release Planner Vida production.
- Keep AFR temporarily read-only as fallback/reference.
- Monitor first production usage and critical financial screens.

### Database Impact

Production schema and migrated data.

### Domain/Application Impact

Production services active.

### UI Impact

Production app available to users.

### Security Impact

Final production security posture must hold during and after cutover.

### Tests

- Production build.
- Production smoke tests.
- Health checks.
- Post-migration reconciliation.
- User login and key flow smoke tests.
- PWA installability check.
- Security smoke tests.

### AFR Feature-Parity Impact

Completes AFR continuity into Planner Vida.

### Migration Impact

Final production migration and cutover.

### Deliverables

- Production deployment.
- Final migration report.
- Reconciliation report.
- Cutover log.
- Post-launch monitoring notes.

### Acceptance Criteria

- Planner Vida is production-usable.
- AFR data is migrated and reconciled.
- AFR remains available read-only as temporary fallback.
- No blocking production issue remains.

### Exit Gate

Production Ready / Phase 1 Launch Freeze.

---

## Critical Path

The real critical path is:

```text
M01 Repository Bootstrap
-> M02 Environment and CI Foundation
-> M03 Database Physical Foundation
-> M04 Authentication, Profiles, Authorization, and RLS
-> M06 Shared Domain Foundations
-> M07 Accounts
-> M08 Categories
-> M09 Transactions
-> M10 Transfers
-> M11 Statement, Filters, and Balance Invariants
-> M12 Installments
-> M13 Credit Cards
-> M14 Invoice Cycle Engine and Invoice Items
-> M15 Invoice Payments, Status, and Reversals
-> M16 Recurrence Engine
-> M20 Invoice PDF Import
-> M21 Reporting and AFR Feature Parity Matrix
-> M25 Financial Commitments and Realization
-> M26 Forecast
-> M34 Jobs Coordinator
-> M35 Home / Hoje
-> M39 Security, RLS, and Privacy Hardening
-> M40 Financial Regression and Performance Hardening
-> M41 Migration Implementation Gate
-> M42 AFR Migration Implementation
-> M43 Migration Dry Runs and Reconciliation
-> M44 Deployment, Cutover, and Launch
```

Blocking relationships:

- DB/Auth/shared domain block almost everything.
- Accounts and categories block transactions.
- Transactions block transfers, reports, goals, simulator, imports, forecast, and migration.
- Installments and cards block invoices and PDF import.
- Invoices block card reports, invoice payments, net worth liability handling, and migration reconciliation.
- Recurrence blocks subscriptions, recurring tasks/events, jobs, and future occurrence materialization.
- Commitments block forecast, subscriptions, annual obligations, Hoje, and cutover readiness.
- Reporting and parity matrix block AFR parity acceptance.
- Migration implementation must not start before the Migration Implementation Gate.

---

## Parallelization Opportunities

Safe parallelization after Wave 0:

- `M07 Accounts` and `M08 Categories` can run in parallel after shared primitives are stable.
- `M05 Design System` can continue in parallel with early database/auth work if route protection contracts are coordinated.
- `M17 Budgets`, `M18 Goals`, and parts of `M19 Simulator` can proceed in parallel after transactions/categories are stable.
- `M23 Calendar` and `M24 Tasks` can proceed in parallel with later AFR reporting work after shell/shared domain/recurrence interfaces are stable.
- `M27 Shopping Lists` and `M28 Wishlist` can proceed in parallel after categories/transactions link contracts are stable.
- `M30 Patrimony` and `M33 Macro Data` can proceed in parallel after database/shared primitives are stable, as long as net worth waits for invoice liability behavior.
- `M36 Admin Observability`, `M37 Audit`, and `M38 PWA` can run partly in parallel after their dependencies are available.

Avoid parallelizing:

- Transaction, transfer, balance, and reporting rule changes before shared financial primitives are frozen.
- Invoice cycle and invoice payment work without a shared invoice status contract.
- PDF import commit logic before installments and invoice items are frozen.
- Migration implementation before the formal gate.
- Multiple agents changing the same financial invariant tests without a single owner.

---

## Agent Allocation Recommendations

Use allocation by work type, not vendor preference:

- Repo-aware implementation: best for Codex or Claude Code when the task requires editing multiple files, running tests, and fixing integration failures.
- Debugging and regression repair: best for Codex or Claude Code with full repository access and the failing test output.
- Independent review: use the other coding agent from the implementer where possible.
- Architecture resolution: use GPT/Chat when a frozen contract ambiguity requires a decision before implementation.
- Long-document consistency review: use Cowork/document-review style work for parity matrix, roadmap, risk register, and cross-contract consistency.
- Migration implementation: use a repo-aware agent, then independent review, then manual runbook review.
- Security/RLS review: use independent review separate from the implementer.

Suggested allocation by wave:

| Wave | Ideal implementation agent | Cross-review |
|---|---|---|
| Wave 0 Foundation | Codex/Claude Code | Other coding agent |
| Wave 1 Financial Core | Repo-aware coding agent with finance invariant focus | Independent coding review |
| Wave 2 Financial Mechanics | Strongest repo-aware agent for installments/invoices | Independent financial regression review |
| Wave 3 AFR Parity | Split implementation by module only after invariant contracts freeze | Cowork/docs review for parity matrix |
| Wave 4 Planner Core | Parallel repo-aware agents for calendar/tasks; one owner for commitments/forecast | Cross-module integration review |
| Wave 5 Life/Finance Integration | Parallel repo-aware agents for low-coupling modules | Central domain-owner review |
| Wave 6 Experience/Ops | Split UI/PWA, jobs, admin/audit | Security/privacy review |
| Wave 7 Hardening | Independent reviewers and test-focused agents | Architecture/product decision review if gaps appear |
| Wave 8 Migration/Launch | One primary migration owner | Independent reconciliation and runbook review |

---

## Formal Checkpoints

### Foundation Freeze

Criteria:

- Repository, CI, environments, physical schema, auth/RLS, shell, and shared domain primitives exist.
- No secrets committed.
- Two-user isolation smoke test passes.

### Financial Core Freeze

Criteria:

- Accounts, categories, transactions, transfers, statement, and balance invariants work.
- Transfers excluded from P&L.
- Credit-card purchases do not reduce account balance.

### Financial Mechanics Freeze

Criteria:

- Installments, cards, invoices, payments, reversals, recurrence work.
- No installment fake parent double counting.
- Invoice totals/payments/status reconcile.
- Recurrence generation is idempotent.

### AFR Parity Freeze

Criteria:

- Budgets, goals, simulator, PDF import, reporting, investments, and credit availability decision are complete.
- AFR Feature Parity Matrix has no mandatory capability without implementation and test.

### Planner Core Freeze

Criteria:

- Calendar, tasks, commitments, and forecast work.
- Events are not transactions.
- Commitments realize into transactions atomically.
- Forecast is traceable and derived.

### Phase 1 Feature Complete

Criteria:

- Shopping, wishlist, subscriptions, patrimony, annual obligations, IPVA/IPTU, macro, jobs, Hoje, admin observability, audit, and PWA are complete.

### Migration Ready

Criteria:

- Migration Implementation Gate passes.
- Schema/services/tests support `AFR_MIGRATION_PLAN.md`.

### Production Ready

Criteria:

- Security hardening passes.
- Financial regression suite passes.
- Migration dry run and reconciliation pass.
- Production deployment runbook is ready.

---

## Migration-Aware Implementation

During construction:

- Tables and services must support the mappings in `AFR_MIGRATION_PLAN.md`.
- Domain services must allow audited migrated records where needed.
- Do not create invariants impossible to satisfy with valid AFR data.
- Maintain source/origin metadata and external fingerprints.
- Support reconciliation queries for counts, P&L, account balances, invoices, installments, categories, goals, simulations, imports, and mappings.
- Do not implement migration scripts before `M41 Migration Implementation Gate`.

Migration implementation begins only when:

- physical DB schema is stable;
- auth/ownership/RLS are functional;
- finance core is functional;
- installments are functional;
- invoices/payments are functional;
- recurrence is functional;
- relevant planning, goals, simulation, import, commitment, and reporting structures exist;
- critical automated tests are green;
- migration metadata and reconciliation support are present.

Dry run begins only when:

- migration code is complete;
- test target environment is empty/resettable;
- source snapshot is available;
- mapping/quarantine/reconciliation framework exists;
- fixtures and idempotency tests pass;
- feature parity regression tests exist.

---

## Explicit Non-Goals

Do not implement these during Phase 1 unless a frozen contract is explicitly changed:

- Advanced Safe-to-Spend.
- Advanced What-if beyond AFR-equivalent simulator.
- Opportunity Cost module.
- Goals Backsolver.
- Advanced Liquidity Ladder.
- Emergency Runway.
- Advanced Stress Test.
- Advanced Forecast Accuracy.
- Advanced KPI Center.
- Advanced Rules Engine.
- Full Travel module.
- Advanced Vehicle module.
- Advanced Home module.
- Price Tracker.
- Advanced Cost of Ownership.
- Advanced warranties.
- Advanced preventive maintenance.
- Apple Shortcuts.
- Voice flows.
- Advanced external APIs.
- Universal Inbox.
- Advanced AI CFO.
- Decision Journal.
- Full nationwide Tax Engine.
- Full advanced Macro Engine.
- Household/shared finance.
- Microservices.
- Oracle VM core deployment.
- Streamlit application frontend.
- Cloudflare as core Phase 1 infrastructure.
- Lovable gateway dependency.
- Code parity with AFR.
- Silent removal of AFR feature parity.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Detection |
|---|---:|---:|---|---|
| Scope creep | High | High | Enforce non-goals and milestone gates | Scope review at every checkpoint |
| Financial double counting | High | Critical | Separate sources of truth and invariant tests | P&L/invoice/installment/forecast tests |
| Duplicated domain rules | Medium | High | Domain-first services, no UI-owned calculations | Code review and regression mismatches |
| Invoice complexity | High | High | Dedicated invoice milestones and edge-case tests | Cycle/payment/status tests |
| Migration incompatibility | Medium | Critical | Migration-aware development and gate | Migration readiness review |
| RLS mistakes | Medium | Critical | Two-user tests and security hardening | RLS/E2E isolation failures |
| PDF parser/provider coupling | Medium | High | Provider abstraction | Parser replacement test |
| Recurrence duplicates | Medium | High | Idempotency keys and unique occurrence rules | Rerun tests |
| Timezone regressions | Medium | High | LocalDate financial helpers | Month-boundary tests |
| Excessive infrastructure | Medium | Medium | Modular monolith only | Architecture review |
| Premature optimization | Medium | Medium | Optimize only after measurement | Performance review |
| Agent parallelization conflicts | Medium | High | Freeze shared contracts before splitting | Merge conflicts/test divergence |
| Phase 2 leakage | High | Medium | Explicit non-goals and parity discipline | Milestone review |
| Admin privacy breach | Low/Medium | Critical | Aggregate-only admin observability | Admin access tests |
| Sensitive log leakage | Medium | Critical | Redaction and structured logging rules | Log inspection tests |
| Migration idempotency failure | Medium | Critical | Mapping table and payload hashes | Rerun/dedupe tests |

---

## Definition of Done - Phase 1

Phase 1 is done only when:

- AFR feature parity relevant to the frozen contracts is preserved.
- No meaningful financial regression exists.
- Auth works.
- User isolation works.
- Accounts/cards/transactions work.
- Transfers work.
- Installments work.
- Invoices and payments work.
- PDF import works.
- Calendar works.
- Tasks work.
- Commitments work.
- Recurrence works.
- Forecast works.
- Budgets/goals/simulator work.
- Shopping/wishlist work.
- Subscriptions work.
- Patrimony works.
- Annual obligations work.
- IPVA/IPTU basic works.
- Macro basic works.
- Hoje works.
- Admin observability respects privacy.
- Audit and observability are active.
- Desktop/mobile work.
- PWA works.
- Critical unit, integration, E2E, security, and regression tests are green.
- AFR migration has been implemented, dry-run, reconciled, executed in production, and validated.
- Production deploy is stable.
- Known limitations are documented and not blocking.
- No placeholders, empty critical flows, or half-implemented mandatory capabilities remain.

---

## Final Roadmap

| # | Wave | Milestone | Depends On | Parallelizable | Primary Output | Exit Gate |
|---:|---|---|---|---|---|---|
| 01 | Wave 0 | Repository Bootstrap | Contracts | No | Repo/app foundation | Foundation repo ready |
| 02 | Wave 0 | Environment and CI Foundation | 01 | Partial | Env/CI gates | Environment model approved |
| 03 | Wave 0 | Database Physical Foundation | 01-02 | No | Physical schema | Database Foundation Freeze |
| 04 | Wave 0 | Authentication, Profiles, Authorization, and RLS | 01-03 | No | Auth/RLS | Auth and Ownership Freeze |
| 05 | Wave 0 | Design System and Application Shell | 01,04 | Partial | Shell/UI primitives | Application Shell Freeze |
| 06 | Wave 0 | Shared Domain Foundations | 01-05 | No | Money/date/errors/audit patterns | Shared Domain Freeze |
| 07 | Wave 1 | Accounts | 03-06 | With 08 | Accounts/balance base | Accounts Freeze |
| 08 | Wave 1 | Categories and Subcategories | 03-06 | With 07 | Categories | Categories Freeze |
| 09 | Wave 1 | Transactions | 06-08 | No | Realized facts | Transactions Freeze |
| 10 | Wave 1 | Transfers | 07,09 | No | Atomic transfers | Transfers Freeze |
| 11 | Wave 1 | Statement, Filters, and Balance Invariants | 07-10 | No | Statement/invariants | Financial Core Freeze |
| 12 | Wave 2 | Installments | 07-11 | No | Plan/installments | Installments Freeze |
| 13 | Wave 2 | Credit Cards | 07-12 | Partial | Cards | Cards Freeze |
| 14 | Wave 2 | Invoice Cycle Engine and Invoice Items | 09,12,13 | No | Invoice cycles/items | Invoice Cycle Freeze |
| 15 | Wave 2 | Invoice Payments, Status, and Reversals | 10,14 | No | Invoice settlement | Invoices and Payments Freeze |
| 16 | Wave 2 | Recurrence Engine | 06,09,12,15 | Partial | Recurrence rules/occurrences | Financial Mechanics Freeze |
| 17 | Wave 3 | Planning Budgets | 08,09,11 | With 18/19 | Budgets | Budgets Freeze |
| 18 | Wave 3 | Financial Goals | 08,09,15,17 | Partial | Goals | Goals Freeze |
| 19 | Wave 3 | Simulator | 09,17,18 | Partial | Versioned simulator | Simulator Freeze |
| 20 | Wave 3 | Invoice PDF Import | 08,09,12,14,15,16 | No | PDF import/review/commit | PDF Import Freeze |
| 21 | Wave 3 | Reporting and AFR Feature Parity Matrix | 11,15,17,18,19,20 | No | Reports/parity matrix | AFR Reporting Parity Freeze |
| 22 | Wave 3 | Investments and Credit Availability Compatibility | 07,09,13,21 | Partial | Investment summary/credit decision | AFR Feature Parity Freeze |
| 23 | Wave 4 | Calendar | 05,06,16 | With 24 | Calendar | Calendar Freeze |
| 24 | Wave 4 | Tasks / Planner | 05,06,16,23 | With 23 | Tasks | Tasks Freeze |
| 25 | Wave 4 | Financial Commitments and Realization | 09,12,15,16,23,24 | No | Commitments/realization | Commitments Freeze |
| 26 | Wave 4 | Forecast | 11,15,16,25 | No | Traceable forecast | Planner Core Freeze |
| 27 | Wave 5 | Shopping Lists | 08,09,25 | With 28 | Shopping lists | Shopping Lists Freeze |
| 28 | Wave 5 | Wishlist | 08,09,25 | With 27 | Wishlist | Wishlist Freeze |
| 29 | Wave 5 | Subscriptions | 08,13,16,23,25,26 | Partial | Subscriptions | Subscriptions Freeze |
| 30 | Wave 5 | Patrimony / Net Worth | 07,13,15,22 | Partial | Net worth | Patrimony Freeze |
| 31 | Wave 5 | Annual Obligations and Provisions | 08,16,23,25,26 | Partial | Obligations/provisions | Annual Obligations Freeze |
| 32 | Wave 5 | IPVA and IPTU Basic | 30-31 | Partial | IPVA/IPTU | IPVA/IPTU Freeze |
| 33 | Wave 5 | Macro Data | 03,06 | Yes | Macro service/data | Life/Finance Integration Freeze |
| 34 | Wave 6 | Jobs Coordinator | 16,25,31,33 | Partial | Daily idempotent job | Jobs Freeze |
| 35 | Wave 6 | Home / Hoje | 21,23,24,25,26,29,31,34 | No | Today screen | Hoje Freeze |
| 36 | Wave 6 | Admin Observability | 04,21,34 | With 37 | Aggregate admin view | Admin Observability Freeze |
| 37 | Wave 6 | Audit and Operational Observability | 06,20,34,36 | With 36/38 | Audit/logging | Audit and Observability Freeze |
| 38 | Wave 6 | PWA and Responsive Hardening | 05,35 | With 36/37 | Installable PWA | Experience and Operations Freeze |
| 39 | Wave 7 | Security, RLS, and Privacy Hardening | 04,20,36,37,38 | No | Security gate | Security Freeze |
| 40 | Wave 7 | Financial Regression and Performance Hardening | 11-38 | No | Regression/performance suite | Financial Regression Freeze |
| 41 | Wave 7 | Migration Implementation Gate | 03,04,11,12,15,16,17,18,19,20,21,25,37,39,40 | No | Gate report | Migration Ready to Implement |
| 42 | Wave 8 | AFR Migration Implementation | 41 | No | Migration tooling | Migration Implementation Freeze |
| 43 | Wave 8 | Migration Dry Runs and Reconciliation | 42 | No | Dry-run/reconciliation reports | Migration Dry Run Freeze |
| 44 | Wave 8 | Deployment, Cutover, and Launch | 38,39,40,43 | No | Production launch | Production Ready / Phase 1 Launch Freeze |

---

## Recommended First Coding Task

The first coding task after this document is approved should be:

**Milestone 01 - Repository Bootstrap**

Objective:

- Create the new Planner Vida repository/project foundation with Next.js, TypeScript, Tailwind, component system baseline, lint/format/type/test/build tooling, CI skeleton, `.env.example`, README, and conceptual folder organization.

Why it is first:

- Every other milestone depends on a clean repository, stable tooling, and repeatable validation.
- It introduces no financial behavior, so it is low domain risk.
- It creates the execution surface for all subsequent coding agents.

Documents the coding agent must receive:

- `PHASE_1_IMPLEMENTATION_PLAN.md`
- `PLANNER_PHASE_1_ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `PLANNER_PHASE_1_SPEC.md`
- `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`
- `AFR_MIGRATION_PLAN.md`

Expected result:

- A bootable Planner Vida Next.js/TypeScript project with validated tooling, safe env example, initial README, CI skeleton, and the approved folder boundaries ready for Milestone 02.

Do not start database schema, financial implementation, migration scripts, or product modules in the first coding task.

---

## Final Readiness Assessment

## Ready to start coding?

YES

`BLOCKING IMPLEMENTATION ISSUE`: None identified.

After review and freeze of this document, Planner Vida can start coding with Milestone 01 - Repository Bootstrap.
