# Planner Vida Environment Strategy

Status: Milestone 02 operational contract  
Scope: Phase 1 environment and CI foundation  
Canonical source: `PHASE_1_IMPLEMENTATION_PLAN.md` - Milestone 02

## Purpose

Milestone 02 establishes safe separation between local, preview/test, and production environments before database work begins. This document does not define schema, migrations, authentication implementation, API routes, UI behavior, or product modules.

## Environment Model

| Environment  | Runtime                          | Data Target                           | Purpose                                               | Production Data Allowed                 |
| ------------ | -------------------------------- | ------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| Local        | Developer workstation            | Supabase DEV or local/test project    | Development and targeted validation                   | No                                      |
| Preview/Test | Vercel Preview or CI-like deploy | Supabase DEV or isolated test project | PR validation, reviewer testing, E2E once flows exist | No                                      |
| Production   | Vercel Production                | Supabase PROD                         | Real Planner Vida usage                               | Yes, only in approved production stores |

Production financial data must not be copied indiscriminately into local, preview, test, or CI environments. Any future production-like testing must use approved masking, minimization, or synthetic fixtures and must be tracked as an explicit data-handling decision.

## Required Variables

The executable environment contract lives in `config/environment-contract.json` and is validated by `npm run validate:env:*`.

| Variable                        |    Local | Preview/Test | Production | Browser-Visible | Secret |
| ------------------------------- | -------: | -----------: | ---------: | --------------: | -----: |
| `NEXT_PUBLIC_APP_ENV`           | Required |     Required |   Required |             Yes |     No |
| `NEXT_PUBLIC_APP_URL`           | Required |     Required |   Required |             Yes |     No |
| `NEXT_PUBLIC_SUPABASE_URL`      | Required |     Required |   Required |             Yes |     No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required |     Required |   Required |             Yes |     No |
| `SUPABASE_SERVICE_ROLE_KEY`     | Optional |     Optional |   Required |              No |    Yes |
| `APP_VERSION`                   | Required |     Required |   Required |              No |     No |
| `VERCEL_ENV`                    | Optional |     Required |   Required |              No |     No |

The service role key is server-only. It must never be prefixed with `NEXT_PUBLIC_`, rendered to the browser, committed to the repository, or logged.

## Expected Values

| Environment  | `NEXT_PUBLIC_APP_ENV` | `VERCEL_ENV` |
| ------------ | --------------------- | ------------ |
| Local        | `local`               | Not required |
| Preview/Test | `preview` or `test`   | `preview`    |
| Production   | `production`          | `production` |
| CI           | `test`                | Not required |

CI uses synthetic values only and does not require Supabase secrets. This keeps pull-request validation repeatable without exposing production or service-role credentials.

## Secrets Ownership

| Secret / Config                       | Owner                  | Storage                                                      |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| Local `.env.local` values             | Developer/operator     | Local workstation only                                       |
| Preview Supabase anon key             | Project operator       | Vercel Preview environment variables or approved CI/CD store |
| Preview service role key, when needed | Project operator       | Server-only preview secret store                             |
| Production Supabase anon key          | Project operator       | Vercel Production environment variables                      |
| Production service role key           | Project owner/operator | Server-only production secret store with restricted access   |

Secrets must be rotated when a team member with access leaves the project, when accidental exposure is suspected, or before production cutover if any non-production process reused a production credential. Rotation should update the approved environment store first, then deploy/restart affected runtimes, then verify with `npm run validate:env:production` in the target environment.

## Validation Commands

```bash
npm run validate:env:local
npm run validate:env:preview
npm run validate:env:production
npm run validate:env:ci
```

Missing variables fail with the variable name, target environment, and operational description. CI runs `validate:env:ci`; preview and production validation are intended to run inside their respective configured environments once deployment plumbing exists.

## Migration Target Expectations

Milestone 02 creates naming and safety expectations only. It does not create database schema or migrations.

- DEV/test migration dry runs must target Supabase DEV or an isolated test project.
- PROD migration must target Supabase PROD only during the approved migration/cutover milestone.
- Frontend deploys must not run destructive database migrations automatically.
- Future migration tooling must record target environment, target database identity, and code version before execution.

## Exit Gate

Environment model approval is required before Milestone 03 database physical foundation begins.
