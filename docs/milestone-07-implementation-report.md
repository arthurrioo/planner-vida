# Milestone 07 Implementation Report

Status final: `READY FOR INDEPENDENT MILESTONE 07 REVIEW`

## 1. Definicao canonica exata da M07

Fonte: `PHASE_1_IMPLEMENTATION_PLAN.md`, secao `Milestone 07 - Accounts`.

### Titulo

Milestone 07 - Accounts

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

## 2. Branch, commits e PR

- Branch: `milestone-07-accounts`
- Base: `main` at `129f1bf04b19e73f17c6543361f59c64e81cf919`
- Implementation commit: `5a012b635c740639982248f2a6f0aad7942cef66`
- PR: `https://github.com/arthurrioo/planner-vida/pull/6`
- Merge: not performed.

## 3. Arquivos alterados

- `e2e/bootstrap.spec.ts`
- `package.json`
- `scripts/run-m07-accounts-runtime-harness.mjs`
- `src/app/app/financeiro/page.tsx`
- `src/app/app/financeiro/contas/page.tsx`
- `src/app/app/financeiro/contas/[accountId]/page.tsx`
- `src/app/app/financeiro/contas/actions.ts`
- `src/application/accounts/account-service.ts`
- `src/components/accounts/account-form.tsx`
- `src/components/accounts/account-selector.tsx`
- `src/components/accounts/account-status-message.tsx`
- `src/domain/accounts/accounts.ts`
- `src/domain/accounts/accounts.test.ts`
- `src/domain/accounts/index.ts`
- `src/infrastructure/accounts/index.ts`
- `src/infrastructure/accounts/supabase-account-repository.ts`
- `docs/milestone-07-implementation-report.md`

## 4. Arquitetura e fluxo implementado

O fluxo segue a arquitetura congelada:

```text
UI
-> Server Action / Server Component
-> Application Service
-> Domain Rules
-> Supabase/PostgreSQL
```

Implementacao:

- `src/domain/accounts/accounts.ts` define os contratos de conta, validacao, lifecycle e calculo de saldo.
- `src/application/accounts/account-service.ts` instancia o servico de aplicacao com repositorio e auditoria Supabase server-side.
- `src/infrastructure/accounts/supabase-account-repository.ts` implementa acesso a `accounts`, dependencias, movimentos para saldo calculado e `audit_logs`.
- `src/app/app/financeiro/contas/*` adiciona lista, criacao, detalhe, edicao, arquivamento e encerramento dentro do shell M05.
- `src/components/accounts/account-selector.tsx` entrega seletor reutilizavel para proximos fluxos financeiros sem antecipar M08+.

## 5. Regras de dominio e invariantes

- `opening_balance` e preservado como base do calculo.
- Nenhum `current_balance` mutavel foi introduzido.
- Saldo calculado:

```text
opening_balance
+ posted income in account
- posted expense/investment in account, excluding credit-card purchases
+ incoming transfers
- outgoing transfers
- posted invoice payments from account
```

- Tipos aceitos: `checking`, `savings`, `wallet`, `cash`, `investment`, `benefit`, `other`.
- Status aceitos: `active`, `archived`, `closed`.
- Nome e normalizado por `normalizeName` da M06.
- Nomes ativos duplicados por usuario sao bloqueados no servico e tambem pela unique index congelada.
- Contas `benefit` sao aceitas como contas com saldo proprio.
- Contas `benefit` rejeitam metadado de overdraft positivo.
- Archive/close muda lifecycle server-side e registra auditoria.
- `deleteOrArchiveAccount` arquiva em vez de apagar quando ha dependencias.
- UI normal nao oferece hard delete.

## 6. Uso das foundations M06

Reuso explicito:

- `Money` / `parseMoney` / `addMoney` / `subtractMoney` para calculo decimal exato.
- `LocalDate` / `parseLocalDate` para `opening_balance_date`.
- `AccountType`, `AccountStatus`, `getEnumLabel`, `getEnumOptions` para enums canonicos.
- `DomainError` para validacao, conflito, ownership e invariantes.
- `RepositoryContext`, `UserId`, `assertOwnedByContext` para escopo por usuario.
- `normalizeDisplayText` e `normalizeName` para nomes.
- `AuditService` e `createAuditEvent` com redaction M06.
- Validadores compartilhados `enumField`, `moneyField`, `localDateField`.

Idempotency M06 nao foi usado porque a M07 canonica nao definiu operacao idempotente composta nem job materializador.

## 7. Matriz de autorizacao e ownership

| Operacao                        | Escopo                   | Enforcement                                              |
| ------------------------------- | ------------------------ | -------------------------------------------------------- |
| Listar contas                   | Apenas `context.userId`  | Server-side context + RLS                                |
| Criar conta                     | `user_id = auth user`    | Server action session + repository context + RLS         |
| Editar conta                    | Conta do proprio usuario | `findById(context, id)` + RLS                            |
| Arquivar conta                  | Conta do proprio usuario | `findById(context, id)` + RLS + audit                    |
| Encerrar conta                  | Conta do proprio usuario | `findById(context, id)` + RLS + audit                    |
| Calcular saldo                  | Conta do proprio usuario | `assertOwnedByContext` + repository queries by `user_id` |
| Cross-user insert/update/delete | Negado                   | M04 RLS + M07 runtime harness                            |
| Ownership hijack via `user_id`  | Negado                   | M04 RLS with check + M07 runtime harness                 |
| FK cross-user                   | Preservado               | M03 composite FKs untouched                              |

## 8. Testes executados e resultados

Executados com sucesso:

- `npm ci`
- `npm run validate:env:ci`
- `npm run check:secrets`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:e2e`
- `npm run test`
  - Resultado: `22 passed / 97 tests`
- `npm run build`
- `npm run test:e2e`
  - Resultado: `14 passed`
  - Observacao: bloqueado no sandbox por `listen EPERM 0.0.0.0:3000`; passou fora do sandbox.
- `npm run verify:schema:m03`
- `npm run verify:runtime:m03:pg`
  - Resultado: passed 2 clean reset cycles.
  - Observacao: bloqueado no sandbox por shared memory; passou fora do sandbox.
- `npm run verify:runtime:m04:auth`
  - Resultado: passed 2 clean reset cycles.
  - Observacao: bloqueado no sandbox por shared memory; passou fora do sandbox.
- `npm run verify:runtime:m07:accounts`
  - Resultado: `M07 accounts runtime harness passed.`
  - Observacao: bloqueado no sandbox por shared memory; passou fora do sandbox.
- `git diff --check`

## 9. Runtime environment e limitacoes

- Ambiente local descartavel com dados sinteticos.
- PostgreSQL local via `initdb`/`pg_ctl` para M03/M04/M07 runtimes.
- O sandbox bloqueou shared memory para PostgreSQL e porta `0.0.0.0:3000` para Playwright; os mesmos gates passaram fora do sandbox.
- Nenhum ambiente PROD foi tocado.
- Nenhum dado financeiro real foi usado.

## 10. Regressoes M03/M04/M05/M06 verificadas

- M03 schema: `npm run verify:schema:m03` passou.
- M03 runtime: `npm run verify:runtime:m03:pg` passou fora do sandbox.
- M04 Auth/RLS: `npm run verify:runtime:m04:auth` passou fora do sandbox.
- M05 shell/deep links: E2E atualizado para `/app/financeiro/contas`; `npm run test:e2e` passou fora do sandbox.
- M06 shared foundations: domain tests e typecheck confirmam reuso de `Money`, `LocalDate`, enums, `DomainError`, normalization, audit e repository context.

## 11. Frozen docs, Markdown Files e M08+ status

- `DATABASE_SCHEMA.md`: untouched.
- `PHASE_1_IMPLEMENTATION_PLAN.md`: untouched.
- `PLANNER_PHASE_1_ARCHITECTURE.md`: untouched.
- `PLANNER_PHASE_1_SPEC.md`: untouched.
- `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`: untouched.
- `AFR_MIGRATION_PLAN.md`: untouched.
- `Markdown Files/`: untouched.
- `supabase/migrations/`: untouched.
- `src/domain/shared/`: untouched.
- M08+ not implemented.
- No categories, transactions UX, transfers UX, cards, invoices, migration execution, deploy, cutover, Phase 2, or schema redesign were added.

## 12. Secrets e higiene

- `npm run check:secrets` passed.
- No `.env`, real project ID, service-role key, PDF, dump, real PII, or real financial data added.
- Audit metadata avoids account names/descriptions and records only status/type/request context.
- Service role remains server-side only; no service-role client/key introduced.

## 13. Divergencias ou BLOCKING DECISION

No `BLOCKING DECISION REQUIRED`.

Implementation assumptions:

- The M07 UI exposes archive/close lifecycle, not normal hard delete.
- `deleteOrArchiveAccount` exists in the domain service for safe lifecycle semantics and tests; UI normal flow uses archive/close only.
- Positive overdraft metadata is rejected for `benefit` accounts because benefit accounts represent own-balance instruments, not credit lines.

Status final: `READY FOR INDEPENDENT MILESTONE 07 REVIEW`
