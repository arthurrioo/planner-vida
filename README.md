# Planner Vida

Bootstrap técnico da Fase 1 do Planner Vida.

Este repositório segue os contratos canônicos aprovados:

- `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`
- `PLANNER_PHASE_1_SPEC.md`
- `PLANNER_PHASE_1_ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `AFR_MIGRATION_PLAN.md`
- `PHASE_1_IMPLEMENTATION_PLAN.md`

## Escopo da Milestone 01

Incluído nesta entrega:

- Next.js, React e TypeScript.
- Tailwind CSS.
- Fundação de componentes equivalente ao padrão shadcn/ui, com `src/components/ui` e utilitário `cn`.
- Estrutura inicial do monólito modular.
- ESLint, Prettier, typecheck, testes unitários/iniciais e skeleton de E2E.
- CI skeleton para pull requests e `main`.
- `.env.example` seguro, sem credenciais reais.

Fora do escopo desta milestone:

- Schema físico de banco.
- Supabase client/server integration.
- Auth, RLS ou autorização.
- Migrations de negócio.
- Lógica financeira, importação AFR ou product modules.

## Estrutura inicial

```text
src/app              Next.js App Router
src/application      Application services futuros
src/domain           Regras de domínio futuras
src/infrastructure   Integrações externas futuras
src/components       Componentes React compartilhados
src/components/ui    Component foundation
src/lib              Utilitários técnicos compartilhados
src/validation       Validações futuras
src/test             Setup de testes
e2e                  Testes E2E Playwright
```

## Requisitos locais

- Node.js 22 ou superior.
- npm 10 ou superior.

## Workflow local

Instalar dependências:

```bash
npm install
```

Criar arquivo local de ambiente:

```bash
cp .env.example .env.local
```

Rodar o app:

```bash
npm run dev
```

Abrir:

```text
http://localhost:3000
```

## Validação

Rodar todos os checks principais:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

Rodar E2E quando os browsers do Playwright estiverem disponíveis:

```bash
npm run test:e2e
```

## Ambientes

`.env.example` documenta os nomes esperados para as próximas milestones. Os valores Supabase ainda não são usados pelo código da Milestone 01.

Segredos reais devem ficar apenas em `.env.local`, no ambiente seguro de CI/CD ou no ambiente aprovado de deploy. Nunca commitar credenciais.

## CI

O workflow em `.github/workflows/ci.yml` executa:

- install com `npm ci`;
- lint;
- format check;
- typecheck;
- testes;
- build.

E2E está configurado no projeto, mas não é obrigatório no CI da Milestone 01 porque a matriz completa de fluxos críticos começa nas milestones seguintes.
