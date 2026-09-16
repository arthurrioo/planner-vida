# Milestone 05 Review Remediation Report

## 1. Branch, PR and Commits

- Branch: `milestone-05-design-system-application-shell`
- PR: `#4 - Milestone 05 - Design System and Application Shell`
- Old HEAD before remediation: `adcf0357b2bb9c878384f5192a702f1fec389388`
- Remediation code commit: `839c3c04d2d04d3298568536084886255b3bf005`
- Report commit: created after the remediation code commit on the same branch.

## 2. Files Altered

- `e2e/bootstrap.spec.ts`
- `src/app/app/layout.tsx`
- `src/app/app/page.tsx`
- `src/app/app/profile/page.tsx`
- `src/app/app/calendario/page.tsx`
- `src/app/app/planner/page.tsx`
- `src/app/app/financeiro/page.tsx`
- `src/app/app/compras/page.tsx`
- `src/app/app/patrimonio/page.tsx`
- `src/app/app/recorrentes/page.tsx`
- `src/app/app/configuracoes/page.tsx`
- `src/components/app/app-shell.tsx`
- `src/components/app/app-shell.test.tsx`
- `src/components/app/protected-app-shell.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/form.tsx`
- `src/components/ui/responsive-table.tsx`
- `src/components/ui/ui-primitives.test.tsx`
- `docs/milestone-05-review-remediation-report.md`

## 3. Findings Status

| Finding                                      | Status   | Evidence                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 - Protected deep link lost                | RESOLVED | `/app` layout no longer hardcodes `getAuthenticatedSession("/app")`. Each canonical M05 page calls the shared server-side protected shell with its exact `nextPath`. E2E asserts exact `next` for `/app`, `/app/profile`, `/app/financeiro`, and all canonical routes.             |
| F2 - `Field` missing `aria-describedby`      | RESOLVED | `Field` now applies `aria-describedby` to the real input child, separates label text from hint/error descriptions, and adds semantic invalid state on error. Unit tests cover hint-only, error-only, hint+error, and no-description cases.                                         |
| F3 - Mobile bottom nav overlaps content      | RESOLVED | `AppShell` main content now reserves `pb-[calc(10rem+env(safe-area-inset-bottom))]` on mobile and returns to `md:pb-8` on desktop/tablet. Component test verifies the mobile budget and fixed bottom nav.                                                                          |
| F4 - `ResponsiveTable` clips desktop columns | RESOLVED | Desktop/tablet table container changed from `overflow-hidden` to `overflow-x-auto`, with natural-width table and nowrap cells. Unit test proves wide content has `scrollWidth > clientWidth` and horizontal scroll remains reachable.                                              |
| F5 - `ConfirmationDialog` visual-only        | RESOLVED | Dialog is now client-side and supports confirm/cancel callbacks, Escape close, focus trap, initial focus, focus restoration, modal semantics, body scroll lock, and mobile-friendly sizing. Unit test covers open, Tab, Shift+Tab, Escape, confirm, cancel, and focus restoration. |

## 4. Deep-Link Solution and Redirect Matrix

The remediation removes the hardcoded session guard from `src/app/app/layout.tsx`. Route protection now has two server-side layers:

1. `middleware.ts` still rejects anonymous `/app` requests using `request.nextUrl.pathname`, preserving the real path in `getLoginPath(pathname)`.
2. Each implemented M05 leaf route renders through `ProtectedAppShell` or `getProtectedAppShellContext(nextPath)`, so the server component guard also receives the exact canonical path.

No client-side state is used for authorization or redirect safety.

| Direct protected request | Anonymous redirect                   |
| ------------------------ | ------------------------------------ |
| `/app`                   | `/login?next=%2Fapp`                 |
| `/app/profile`           | `/login?next=%2Fapp%2Fprofile`       |
| `/app/financeiro`        | `/login?next=%2Fapp%2Ffinanceiro`    |
| `/app/calendario`        | `/login?next=%2Fapp%2Fcalendario`    |
| `/app/planner`           | `/login?next=%2Fapp%2Fplanner`       |
| `/app/compras`           | `/login?next=%2Fapp%2Fcompras`       |
| `/app/patrimonio`        | `/login?next=%2Fapp%2Fpatrimonio`    |
| `/app/recorrentes`       | `/login?next=%2Fapp%2Frecorrentes`   |
| `/app/configuracoes`     | `/login?next=%2Fapp%2Fconfiguracoes` |

Existing M04 safe redirect behavior remains intact:

- `/auth/reset` remains allowed for password recovery.
- unsafe external or protocol-relative `next` values continue to normalize to `/app`.
- no middleware/client-only redirect was added as a replacement for server authorization.

## 5. Field Accessibility

`Field` now renders a real `<label htmlFor>` for the accessible name and keeps hint/error text outside the label. The control child receives:

- `aria-describedby="<field>-hint"` for hint-only;
- `aria-describedby="<field>-error"` and `aria-invalid="true"` for error-only;
- both ids in order for hint+error;
- no `aria-describedby` when no description exists.

The previous sr-only id string rendering was removed.

## 6. Mobile Nav Layout Measurements

The bottom nav is a fixed mobile grid with eight canonical items in four columns, therefore two rows. The shell now reserves `10rem + env(safe-area-inset-bottom)` below main content on mobile. This covers:

- two `min-h-14` nav rows;
- row gap and nav vertical padding;
- safe-area inset on mobile devices.

Validation:

- unit component assertion confirms the main padding class and fixed mobile bottom nav;
- E2E runs on desktop Chromium and mobile Chrome;
- explicit mobile viewport check: `375x812`;
- compact landscape viewport check: `844x390`.

The unauthenticated local E2E environment redirects protected routes before rendering an authenticated shell, so the direct bounding-box overlap proof is covered at component level rather than through an authenticated browser session.

## 7. ResponsiveTable Overflow

Desktop/tablet rendering now uses:

- wrapper: `overflow-x-auto`;
- table: `w-max min-w-full`;
- headers/cells: `whitespace-nowrap`.

Mobile `<dl>` rendering is unchanged.

Test evidence:

- wide test data with multiple columns and long content;
- asserted `scrollWidth > clientWidth`;
- asserted `scrollLeft` can move horizontally;
- asserted `overflow-x-auto` on the scroll region.

## 8. ConfirmationDialog API and Behavior

API:

- `open: boolean`
- `title: string`
- `confirmLabel: string`
- `cancelLabel?: string`
- `destructive?: boolean`
- `onConfirm?: () => void`
- `onCancel?: () => void`
- `children: React.ReactNode`

Behavior:

- `role="dialog"`;
- `aria-modal="true"`;
- generated `aria-labelledby` and `aria-describedby`;
- initial focus moves to the first dialog action;
- Tab and Shift+Tab are trapped inside the dialog;
- Escape invokes cancel;
- confirm and cancel invoke callbacks;
- focus returns to the previously focused trigger when closed;
- body scroll is locked while open;
- fixed overlay prevents background pointer interaction while open.

No delete, transaction, or domain behavior was added.

## 9. Regression Gates

| Gate                              | Result                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm ci`                          | PASS                                                                                                         |
| `npm run validate:env:ci`         | PASS                                                                                                         |
| `npm run check:secrets`           | PASS                                                                                                         |
| `npm run format:check`            | PASS after isolated rerun; initial parallel run raced with `npm ci` while `node_modules` was being recreated |
| `npm run lint`                    | PASS                                                                                                         |
| `npm run typecheck`               | PASS                                                                                                         |
| `npm run typecheck:e2e`           | PASS                                                                                                         |
| `npm run test`                    | PASS - 12 files, 46 tests                                                                                    |
| `npm run build`                   | PASS                                                                                                         |
| `npm run test:e2e`                | PASS outside sandbox - 14 tests across desktop Chromium and mobile Chrome                                    |
| `npm run verify:schema:m03`       | PASS                                                                                                         |
| `npm run verify:runtime:m03:pg`   | PASS outside sandbox - 2 clean reset cycles                                                                  |
| `npm run verify:runtime:m04:auth` | PASS outside sandbox - 2 clean reset cycles                                                                  |
| `git diff --check`                | PASS                                                                                                         |

## 10. M03/M04 Regression Status

- No schema, migration, RLS, DELETE matrix, grants, storage, service role, auth trigger, profile policy, or role policy files were modified.
- `npm run verify:schema:m03` passed.
- `npm run verify:runtime:m03:pg` passed 2 clean reset cycles outside sandbox.
- `npm run verify:runtime:m04:auth` passed 2 clean reset cycles outside sandbox.
- Password recovery `/auth/reset` and open redirect protections remain covered by existing M04 tests and unchanged route helper logic.

## 11. Frozen Docs, Markdown Files and M06+

- `Markdown Files/` untouched.
- Frozen root docs untouched:
  - `DATABASE_SCHEMA.md`
  - `PHASE_1_IMPLEMENTATION_PLAN.md`
  - `PLANNER_PHASE_1_ARCHITECTURE.md`
  - `PLANNER_PHASE_1_SPEC.md`
  - `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`
  - `AFR_MIGRATION_PLAN.md`
- No M06+ domain behavior was added.
- No financial repositories, services, calculations, imports, reports, jobs, schema changes, or migration tooling were added.

## 12. Secrets and Hygiene

- `npm run check:secrets` passed.
- No `.env` files were added.
- No real user data, financial data, production identifiers, project IDs, tokens, service role keys, or secret material were added.
- `git diff --check` passed.

## 13. Environment and Runtime Limitations

- Sandboxed `npm run test:e2e` failed because Next.js could not bind port `3000` (`listen EPERM`). The same command passed with approved local runtime permission.
- Sandboxed M03/M04 runtime harnesses failed because local PostgreSQL `initdb` could not create shared memory (`shmget Operation not permitted`). The same commands passed with approved local runtime permission.
- Authenticated shell browser rendering was not available in the unauthenticated local E2E environment without Supabase auth configuration. Deep-link redirects were tested by E2E; mobile nav non-overlap budget was tested at component level.

## Final Status

READY FOR INDEPENDENT MILESTONE 05 RE-REVIEW
