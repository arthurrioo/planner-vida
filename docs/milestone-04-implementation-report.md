# Milestone 04 Implementation Report

## 1. Canonical M04 Definition

Source: `PHASE_1_IMPLEMENTATION_PLAN.md`, section `Milestone 04 - Authentication, Profiles, Authorization, and RLS`.

Objective: implement secure identity, sessions, profile ownership, roles, protected routes, and user isolation.

Scope: signup/login/logout/session/password recovery/profile, protected routes, Supabase Auth, `profiles`, `user_roles`, server-side authorization, RLS policies, admin restriction model.

Dependencies: Milestones 01-03.

Implementation tasks:

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

Tests:

- Signup/login/logout/password recovery happy paths.
- Protected route rejects anonymous access.
- User A cannot read/update User B owned records.
- Admin cannot fetch individual financial data through product paths.
- `service_role` is not exposed to browser bundle.

Deliverables: auth flows, profile model integration, authorization helpers, RLS tests.

Acceptance criteria: two-user isolation tests pass; admin restriction tests pass; no browser-accessible privileged secret exists.

Exit gate: Auth and Ownership Freeze.

## 2. Branch, Commits, and PR

Branch: `milestone-04-auth-authorization-rls`.

Commits:

- `24db81b` - `feat: implement milestone 04 auth and rls`
- `a0a2e23` - `docs: add milestone 04 implementation report`
- `db95f42` - `docs: add milestone 04 pull request link`
- Final report validation wording commit: latest branch commit after this file update.

PR: https://github.com/arthurrioo/planner-vida/pull/3

Baseline confirmation:

- Branch was created from `origin/main` at `d84dafa` (`Merge pull request #2 from arthurrioo/milestone-03-database-foundation`).
- Required M03 commits are ancestors of the branch: `f460a3e`, `089c1fb`, `d860474`.
- The local worktree was clean before implementation.

## 3. Files Changed

- Auth/session app routes: `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/recover/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/reset/page.tsx`, `src/app/app/page.tsx`, `src/app/app/profile/page.tsx`, `middleware.ts`.
- Auth actions/components/helpers: `src/app/auth/actions.ts`, `src/components/auth/auth-shell.tsx`, `src/components/auth/auth-form-message.tsx`, `src/lib/auth/*`, `src/lib/supabase/*`.
- Database/RLS: `supabase/migrations/20260915000200_m04_auth_profiles_authorization_rls.sql`, `supabase/tests/m04_auth_rls_checks.sql`.
- Validation: `scripts/run-m04-auth-rls-harness.mjs`, `src/validation/m04-auth-contract.test.ts`, `src/lib/auth/authorization.test.ts`, `e2e/bootstrap.spec.ts`.
- Tooling/dependencies: `package.json`, `package-lock.json`, `.env.example`, `.prettierignore`.

## 4. Architecture/Auth Flow Implemented

- Added official Supabase browser/server client setup via `@supabase/supabase-js` and `@supabase/ssr`.
- Added email/password signup, login, logout, password recovery request, recovery callback, password update, protected app shell, and profile update flow.
- Added server-side session guard that redirects anonymous users to `/login?next=...`.
- Added middleware to refresh Supabase sessions and redirect protected/auth routes when Supabase env is configured.
- Added safe `next` path normalization so auth redirects cannot leave the protected app namespace.
- Kept service-role key out of browser and app source paths; no service-role client was added.

## 5. Profiles, Roles, and RLS

- Added `public.handle_new_auth_user()` as a `SECURITY DEFINER` trigger function with fixed `search_path = public, pg_temp`.
- Added `on_auth_user_created` trigger on `auth.users`.
- Trigger creates an aligned `profiles.id = auth.users.id` profile using the real auth email and approved defaults: `BRL`, `America/Sao_Paulo`, `pt-BR`.
- Trigger grants the default active `user` role in `user_roles`.
- Trigger writes an audit record for profile creation.
- Added `public.current_user_has_role(text)` as a `SECURITY DEFINER` helper with fixed `search_path = public, pg_temp`.
- Added profile identity guard trigger to block authenticated users from mutating auth-managed `profiles.id` or `profiles.email`.
- Added admin aggregate-only read policies for `admin_observability_metrics` and `system_job_runs`.
- Preserved M03 owner policies and explicit DELETE matrix; no blanket `owned_rows_delete` was introduced.
- Granted public schema table privileges to `service_role` for backend-only infrastructure behavior while preserving the frontend prohibition.

## 6. Authorization Matrix

| Actor                   | Profiles                                                                   | User-owned financial rows                                          | Admin observability metrics                            | User role mutation              | Service-role behavior               |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------- | ----------------------------------- |
| `anon`                  | Denied direct DB access                                                    | Denied                                                             | Denied                                                 | Denied                          | Not applicable                      |
| Authenticated owner     | Read/update own profile basics; cannot mutate auth-managed identity fields | Read/insert/update own rows; DELETE only per M03 matrix            | Denied unless admin role active                        | Denied by RLS/no write policy   | Not applicable                      |
| Authenticated non-owner | Cannot read/update another profile                                         | Cannot read/insert/update/delete another user's rows               | Denied unless admin role active                        | Denied                          | Not applicable                      |
| Human admin             | Own profile access only                                                    | No cross-user financial access through product paths               | Read aggregate operational metrics and job health only | No product-path self escalation | Not applicable                      |
| `service_role`          | Backend/infrastructure only                                                | Privileged server-side access for approved jobs/recovery/migration | Privileged server-side access                          | Privileged server-side access   | Never exposed to browser/app client |

## 7. Tests Executed and Results

- `npm ci` - passed.
- `npm run validate:env:ci` - passed.
- `npm run check:secrets` - passed.
- `npm run format:check` - passed.
- `npm run lint` - passed.
- `npm run typecheck` - passed.
- `npm run typecheck:e2e` - passed.
- `npm run test` - passed, 6 files / 25 tests.
- `npm run build` - passed.
- `npm run test:e2e` - passed, 2 tests.
- `npm run verify:schema:m03` - passed.
- `npm run verify:runtime:m03:pg` - passed, 2 clean reset cycles.
- `npm run verify:runtime:m04:auth` - passed, 2 clean reset cycles.
- `git diff --check origin/main..HEAD` - passed before final delivery.

## 8. Runtime Environment and Limitations

- Runtime validation used local disposable PostgreSQL clusters created by the harness scripts with synthetic users and no production data.
- Supabase CLI/Docker was not required because the existing M03 harness pattern provides a faithful local PostgreSQL/RLS/Auth-role simulation for the relevant database behavior.
- Real Supabase hosted email delivery was not exercised; signup/login/recovery are implemented against Supabase Auth APIs and validated by build/type/unit/E2E coverage plus database trigger/RLS harnesses.

## 9. M03 Regressions Verified

- M03 schema verifier still passes.
- M03 runtime harness still passes two clean reset cycles.
- M03 DELETE policy count remains 22 in the M03 harness.
- No M03 migration rewrite was performed.
- No frozen money/date/source-of-truth invariants were modified.

## 10. Frozen Docs, Markdown Files, and M05+ Status

- Frozen canonical docs were read for M04 scope alignment and left unmodified.
- `Markdown Files/` was left untouched.
- No M05+ features were implemented: no accounts UI, transactions UI, cards, invoices, import parser, recurrence/installment engine, forecast, calendar/tasks, shopping, subscriptions, patrimony, taxes, macro features, AFR migration execution, deploy, cutover, or Phase 2 work.

## 11. Secrets and Hygiene

- No real secrets, keys, dumps, PDFs, logs, project IDs, or local artifacts were added.
- `SUPABASE_SERVICE_ROLE_KEY` remains documented only as server-only environment configuration.
- `src/validation/m04-auth-contract.test.ts` checks that browser/application source does not reference `SUPABASE_SERVICE_ROLE_KEY` or `service_role`.
- `npm run check:secrets` passed.

## 12. Divergences or Blocking Decisions

- No `BLOCKING DECISION` was required.
- Rate limiting is documented as Supabase Auth/provider-level for this milestone; no custom app-side rate limiter was added because there is no server-owned auth endpoint storing credentials outside Supabase Auth.

Status: `READY FOR INDEPENDENT MILESTONE 04 REVIEW`
