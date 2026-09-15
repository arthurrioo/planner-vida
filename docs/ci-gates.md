# Planner Vida CI Gates

Status: Milestone 02 CI foundation  
Scope: Repeatable validation gates for pull requests and `main`

## Mandatory PR Validation

Planner Vida code changes must pass CI before milestone review can approve or freeze the milestone. The repository workflow is `.github/workflows/ci.yml` and runs on pull requests and pushes to `main`.

## Gate Order

The CI validation job runs:

1. Dependency install with `npm ci`.
2. Environment contract validation for CI with synthetic values.
3. Secret hygiene scan for committed files.
4. ESLint.
5. Prettier format check.
6. App TypeScript typecheck.
7. E2E TypeScript typecheck.
8. Unit tests.
9. Next.js build.

E2E browser execution is intentionally reserved for later milestones once real user flows exist. This follows the Milestone 02 contract while keeping E2E configuration typechecked.

## Local Gate Commands

```bash
npm run validate:env:ci
npm run check:secrets
npm run lint
npm run format:check
npm run typecheck
npm run typecheck:e2e
npm run test
npm run build
```

For developer workstation validation, use:

```bash
npm run validate:env:local
```

For configured deployment environments, use:

```bash
npm run validate:env:preview
npm run validate:env:production
```

## Branch Protection Expectation

GitHub branch protection should require the `Validate` workflow result before merging pull requests to `main`. If repository settings cannot be changed from code, reviewers must enforce this manually until owner-level branch protection is configured.
