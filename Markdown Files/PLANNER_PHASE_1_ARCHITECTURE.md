# Planner Vida — Phase 1 Architecture

Status: Proposed Architecture v0.1  
Escopo de referência: `PLANNER_PHASE_1_SPEC.md`  
Baseline funcional: `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`

---

# 1. Objetivo arquitetural

A arquitetura da Fase 1 deve permitir entregar o Planner Vida com:

- feature parity integral do AFR Controle Financeiro;
- núcleo do Planner Vida;
- aplicação web mobile-first;
- PWA;
- segurança de dados financeiros;
- importação de faturas em PDF;
- integrações com fontes externas;
- jobs e recorrências;
- primeiro deploy produtivo;
- baixo esforço de manutenção;
- expansão para a Fase 2 sem reescrever o núcleo.

A prioridade não é obter a arquitetura teoricamente mais sofisticada.

A prioridade é:

> simplicidade operacional + consistência financeira + segurança + capacidade de evolução.

---

# 2. Arquitetura escolhida

## Arquitetura principal

**Modular Monolith**

O Planner Vida será inicialmente uma única aplicação organizada internamente em módulos de domínio bem separados.

Não utilizar microservices na Fase 1.

Arquitetura conceitual:

```text
                    ┌────────────────────────┐
                    │      Planner Vida      │
                    │       Next.js PWA      │
                    └───────────┬────────────┘
                                │
                   ┌────────────▼────────────┐
                   │ Application / Services  │
                   │      TypeScript         │
                   └────────────┬────────────┘
                                │
       ┌────────────────────────┼──────────────────────┐
       │                        │                      │
┌──────▼───────┐       ┌────────▼────────┐    ┌────────▼────────┐
│   Supabase   │       │ External APIs   │    │ File / AI       │
│ PostgreSQL   │       │ BCB / IBGE /    │    │ Processing      │
│ Auth/Storage │       │ B3 / future     │    │ PDF invoices    │
└──────────────┘       └─────────────────┘    └─────────────────┘
```

---

# 3. Stack recomendada

## Frontend

**Next.js**
**React**
**TypeScript**

Design/UI:

- Tailwind CSS;
- shadcn/ui ou componentes equivalentes;
- componentes próprios do Planner Vida.

Motivos:

- ótima experiência React;
- mobile-first;
- PWA;
- Server Components quando úteis;
- backend web no mesmo projeto;
- API routes/server actions;
- deploy simples;
- excelente suporte das ferramentas de desenvolvimento assistido por IA.

O AFR atual pode servir como referência de UI e comportamento, mas seus componentes não são obrigatórios.

---

# 4. Backend de aplicação

O backend principal ficará dentro do próprio projeto Next.js.

Utilizar:

- Server Actions quando apropriado;
- Route Handlers/API endpoints;
- services de domínio;
- validação server-side;
- integração server-side com Supabase;
- workers/functions externos apenas quando realmente necessários.

Evitar criar um backend separado em Python, FastAPI, Express ou outra aplicação na Fase 1.

Isso evita manter:

```text
frontend
+
backend separado
+
database
+
workers
+
infra própria
```

quando a complexidade atual não exige isso.

---

# 5. Database

## Escolha recomendada

**PostgreSQL gerenciado pelo Supabase**

Motivos:

- domínio financeiro altamente relacional;
- transações;
- constraints;
- integridade referencial;
- queries analíticas;
- suporte a RLS;
- maturidade;
- compatibilidade com o AFR atual;
- baixo esforço operacional.

Supabase não será tratado como arquitetura inteira do Planner.

Ele será principalmente:

```text
PostgreSQL
+
Auth
+
Storage
+
serviços auxiliares
```

O domínio do Planner não deverá depender de detalhes específicos do Supabase quando isso puder ser evitado.

---

# 6. Supabase Auth

Utilizar Supabase Auth na Fase 1.

Responsável por:

- signup;
- login;
- logout;
- recuperação de acesso;
- sessão;
- identidade do usuário.

O modelo antigo de email sintético do AFR não deve ser automaticamente migrado.

Preferência:

**email real + senha**

Posteriormente poderão existir:

- social login;
- passkeys;
- MFA.

Não são obrigatórios para Fase 1.

---

# 7. Autorização e isolamento

Todo dado pessoal deverá possuir proprietário.

Modelo conceitual:

```text
auth user
    │
    └── profile
          │
          ├── accounts
          ├── transactions
          ├── cards
          ├── events
          ├── tasks
          ├── commitments
          └── ...
```

Utilizar:

**RLS — Row Level Security**

como segunda camada de proteção.

A aplicação também validará ownership no backend.

Princípio:

> segurança não deve depender exclusivamente da UI.

Nenhum usuário deve conseguir consultar ou modificar recursos de outro usuário manipulando requests.

---

# 8. Service Role

A chave privilegiada do Supabase:

- nunca ficará no frontend;
- nunca será enviada para navegador;
- nunca será versionada;
- ficará apenas em ambiente server-side.

Seu uso deve ser excepcional.

Fluxos normais deverão respeitar o contexto do usuário autenticado e RLS.

---

# 9. Domain Layer

Este é um dos pontos mais importantes da nova arquitetura.

O AFR atual possui regras espalhadas entre:

- React;
- hooks;
- triggers;
- SQL;
- Edge Functions.

Isso não deverá ser repetido.

Criar uma camada central de domínio.

Exemplo:

```text
src/domain/
    accounts/
    transactions/
    credit-cards/
    invoices/
    installments/
    recurrence/
    forecast/
    goals/
    simulations/
    planning/
    calendar/
    commitments/
    subscriptions/
    obligations/
    assets/
    macro/
```

Cada domínio contém as regras relevantes daquele conceito.

---

# 10. Application Services

Acima da camada de domínio existirão serviços responsáveis pelos casos de uso.

Exemplo:

```text
CreateTransaction
CreateInstallmentPurchase
TransferBetweenAccounts
CalculateAccountBalance
CreateFinancialCommitment
RealizeCommitment
GenerateInvoice
PayInvoice
ImportInvoice
GenerateRecurrences
CalculateForecast
CreateAnnualProvision
```

A UI não deverá implementar diretamente essas regras.

---

# 11. Regra arquitetural principal

Evitar:

```text
Button click
→ INSERT direto
→ trigger faz metade da lógica
→ componente calcula outra metade
→ relatório recalcula diferente
```

Preferir:

```text
UI
↓
Application Service
↓
Domain Rules
↓
Database
```

Assim:

- cálculos são testáveis;
- comportamento fica previsível;
- debugging fica mais fácil;
- Codex/Claude conseguem navegar melhor no sistema.

---

# 12. Operações financeiras atômicas

Operações compostas precisam ser executadas atomicamente.

Exemplos:

- transferências;
- criação de parcelamento;
- confirmação de importação;
- pagamento de fatura;
- conversão de compromisso em realizado.

Quando múltiplas alterações precisam ocorrer juntas:

> todas devem acontecer ou nenhuma deve acontecer.

A implementação poderá usar transações PostgreSQL e funções/RPC explícitas quando necessário.

Evitar utilizar triggers invisíveis como principal engine de negócio.

Triggers poderão existir apenas para funções técnicas muito específicas quando houver benefício claro.

---

# 13. Valores monetários

Nunca usar floating point para valores financeiros persistidos.

Utilizar tipo decimal/numeric apropriado no PostgreSQL.

Conceitualmente:

```text
NUMERIC(18,2)
```

ou precisão superior quando necessária.

Valores financeiros devem ser representados deterministicamente também na camada de aplicação.

---

# 14. Datas e timezone

Regra fundamental herdada das fragilidades encontradas no AFR:

## Datas financeiras

Exemplos:

- data de compra;
- vencimento;
- fechamento;
- competência;
- data de parcela.

Devem ser tratadas como:

**DATE / LocalDate**

e não sofrer conversão automática de timezone.

## Eventos com horário

Exemplos:

- consulta às 15h;
- reunião;
- compromisso.

Utilizar timestamp com timezone.

Timezone padrão inicial:

`America/Sao_Paulo`

O modelo deve permitir expansão futura.

---

# 15. Eventos e finanças devem ser entidades diferentes

Não transformar todo evento de calendário em transação.

Exemplo:

```text
EVENT
Consulta médica
20/09 18:00
R$ 600 previstos
```

gera ou referencia:

```text
FINANCIAL COMMITMENT
R$ 600
20/09
status = expected
```

Quando pago:

```text
TRANSACTION
R$ 600
20/09
status = realized
```

Fluxo:

```text
Event
   │
   └── Financial Commitment
                │
                └── Transaction
```

Isso mantém:

- calendário;
- previsão;
- realizado;

separados corretamente.

---

# 16. Recurrence Engine

Recorrências serão entidade própria.

Evitar criar infinitamente todas as transações futuras no momento da criação.

Modelo conceitual:

```text
RecurrenceRule
    │
    ├── occurrence
    ├── occurrence
    ├── occurrence
    └── ...
```

Fase 1 suporta:

- semanal;
- mensal;
- anual.

O sistema poderá materializar ocorrências dentro de uma janela futura limitada.

Exemplo:

próximos 12 meses.

Isso reduz crescimento desnecessário da base.

---

# 17. Parcelamentos

Não repetir obrigatoriamente o modelo AFR:

```text
parent transaction
+
N child transactions
```

Preferir entidade própria:

```text
InstallmentPlan
      │
      ├── Installment 1
      ├── Installment 2
      ├── Installment 3
      └── ...
```

Cada parcela poderá posteriormente gerar/vincular uma transação.

Isso elimina a necessidade de todos os relatórios lembrarem de excluir `installment_number = 0`.

---

# 18. Faturas

Fatura deve ser domínio explícito.

Conceitos:

```text
CreditCard
    │
InvoiceCycle
    │
Invoice
    │
InvoiceItems
    │
Payment
```

O serviço de faturas será responsável por:

- identificar ciclo;
- calcular fechamento;
- calcular vencimento;
- atribuir compras;
- totalizar;
- registrar pagamento;
- juros;
- status;
- ajustes.

Evitar manter várias versões dessas regras em telas diferentes.

---

# 19. Forecast

O forecast básico será um serviço derivado.

Ele não será uma tabela com números manualmente atualizados.

Entradas:

```text
Account balances
+
future incomes
-
future commitments
-
future invoices
```

Saída:

```text
projected cash position
```

Cada componente da projeção deverá ser rastreável.

---

# 20. Cash vs Economic View

Desde a Fase 1 existirão dois conceitos diferentes:

## Cash View

Quando o dinheiro efetivamente entra ou sai.

## Economic View

Quando o custo é provisionado ou reconhecido para planejamento.

Exemplo:

```text
IPVA = R$ 4.800
Pagamento = janeiro
```

Cash:

```text
Janeiro: -4.800
```

Economic:

```text
R$ 400/mês
```

Provisionamento nunca será tratado como pagamento realizado.

---

# 21. Importação de PDFs

Fluxo:

```text
Browser
  ↓
Private Upload
  ↓
Server Processing
  ↓
Text Extraction
  ↓
Structured Parser / LLM
  ↓
Normalization
  ↓
Deduplication
  ↓
Human Review
  ↓
Commit Import
```

Nenhum item é gravado definitivamente antes da revisão.

---

# 22. Processamento de PDF

Preferência arquitetural:

**Node.js server-side function**

no mesmo ecossistema do Planner.

Isso facilita:

- bibliotecas PDF;
- validação;
- integração com provedores de IA;
- desenvolvimento local;
- debugging.

Não manter Lovable AI Gateway como dependência.

O provedor de IA será abstrato.

Exemplo:

```text
InvoiceParser
      │
      ├── OpenAIInvoiceParser
      ├── GeminiInvoiceParser
      └── FutureProvider
```

O domínio conhece apenas:

```text
InvoiceParser interface
```

e não o provedor utilizado.

---

# 23. PDFs protegidos por senha

Fluxo:

```text
PDF
+
senha temporária
↓
processamento
↓
senha descartada
```

A senha:

- não será persistida;
- não será registrada em logs;
- não será adicionada ao audit log;
- não será enviada para analytics.

---

# 24. File Storage

Utilizar:

**Supabase Storage**

Buckets privados.

Exemplo:

```text
invoice-imports/
    user-id/
        import-id/
            source.pdf
```

Acesso somente mediante autorização.

A arquitetura deverá suportar política futura de retenção:

- apagar após processamento;
- reter arquivo original;
- retenção por período.

A decisão final de retenção será definida no schema/política de dados.

---

# 25. Import Batch

Toda importação deve possuir entidade de lote.

```text
ImportBatch
    │
    ├── ImportItem
    ├── ImportItem
    └── ImportItem
```

Guardar:

- usuário;
- arquivo;
- status;
- horário;
- parser utilizado;
- quantidade identificada;
- quantidade importada;
- erros;
- auditoria.

Isso permite:

- rastreabilidade;
- debugging;
- reprocessamento futuro.

---

# 26. Macro Data

Criar serviço próprio:

```text
MacroDataService
```

Responsável por:

- Selic;
- CDI/DI;
- IPCA.

Fluxo:

```text
Official/Public API
       ↓
Macro Fetcher
       ↓
Normalization
       ↓
Economic Indicator Database
       ↓
Planner calculations
```

A UI nunca deve depender diretamente de uma API externa para cálculos financeiros.

Dados externos devem ser normalizados antes.

---

# 27. Cache de dados macro

Não consultar Banco Central/IBGE/B3 toda vez que uma tela abrir.

Manter dados localmente.

Exemplo:

```text
economic_indicators
economic_indicator_values
```

Atualização por job.

Benefícios:

- performance;
- auditabilidade;
- histórico;
- resiliência se API oficial estiver indisponível.

---

# 28. Jobs

Fase 1 precisará de poucos jobs.

Exemplos:

### diário

- atualizar indicadores macro;
- processar recorrências próximas;
- verificar compromissos vencidos;
- atualizar status de obrigações/faturas quando necessário.

Evitar criar dezenas de jobs independentes.

Preferência:

**um job diário coordenador**, dividido internamente em tarefas idempotentes.

---

# 29. Job Scheduler

Preferência inicial:

**Supabase Cron / pg_cron**

para tarefas simples e periódicas.

O job poderá:

- executar função de banco;
- chamar endpoint seguro do Planner;
- chamar função backend.

Todos os jobs precisam ser:

**idempotentes.**

Rodar duas vezes não pode gerar duas parcelas ou duas assinaturas.

---

# 30. Deploy

## Aplicação

**Vercel**

Responsável por:

- Next.js;
- frontend;
- Server Components;
- API routes;
- server functions;
- previews;
- produção.

## Dados

**Supabase**

Responsável por:

- PostgreSQL;
- Auth;
- Storage;
- RLS;
- Cron quando aplicável.

Arquitetura produtiva:

```text
                 Internet
                    │
                    ▼
                Vercel
            Planner Vida
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
      Supabase          External APIs
 Postgres/Auth/Storage  BCB/IBGE/B3/AI
```

---

# 31. Oracle Cloud

Oracle Cloud não fará parte do núcleo da Fase 1.

Motivo:

uma VM própria adicionaria responsabilidades como:

- sistema operacional;
- patches;
- Docker;
- reverse proxy;
- SSL;
- monitoring;
- backups;
- disponibilidade;
- segurança da VM.

Isso não traz benefício suficiente para o Planner Vida neste estágio.

Oracle poderá entrar futuramente se existir workload que justifique compute dedicado.

---

# 32. Streamlit

Streamlit não será utilizado como frontend do Planner Vida.

Motivos:

- UX mobile inferior para este produto;
- experiência de aplicação consumer menos adequada;
- calendário e interações complexas;
- PWA;
- navegação;
- design system.

Poderá ser utilizado futuramente apenas para:

- protótipos analíticos;
- ferramentas internas;
- experimentos.

---

# 33. Cloudflare

Cloudflare não será o núcleo da Fase 1.

Workers, Queues, Cron e R2 são tecnologicamente interessantes, porém introduzir Cloudflare além de Vercel + Supabase não resolve atualmente um problema necessário.

Pode ser considerado futuramente para:

- edge workloads;
- queues;
- caching;
- storage específico;
- processamento assíncrono.

---

# 34. Microservices

Explicitamente fora da Fase 1.

Não criar:

```text
finance-service
calendar-service
notification-service
macro-service
invoice-service
```

como aplicações independentes.

Eles serão **módulos internos**.

Separação física só deverá ocorrer no futuro caso exista necessidade operacional concreta.

---

# 35. Organização conceitual do código

Estrutura aproximada:

```text
src/

  app/
      today/
      calendar/
      planner/
      finance/
      shopping/
      wishlist/
      assets/
      settings/
      api/

  domain/
      accounts/
      cards/
      categories/
      transactions/
      installments/
      invoices/
      planning/
      goals/
      simulations/
      events/
      tasks/
      commitments/
      recurrence/
      subscriptions/
      obligations/
      assets/
      forecast/
      macro/

  application/
      services/
      commands/
      queries/

  infrastructure/
      database/
      supabase/
      storage/
      auth/
      external-apis/
      ai/
      jobs/

  components/

  lib/

  validation/
```

Essa estrutura é conceitual.

A implementação final pode refiná-la.

---

# 36. Schemas compartilhados

Utilizar schemas fortemente tipados para entrada e saída.

Preferência:

**Zod** ou solução equivalente.

Exemplo:

```text
UI input
↓
Schema validation
↓
Application Service
↓
Domain
```

Evitar `any` e JSON sem contrato.

---

# 37. Enums

Definir vocabulário interno canônico.

Exemplo:

```text
INCOME
EXPENSE
TRANSFER
INVESTMENT
```

UI:

```text
Receita
Despesa
Transferência
Investimento
```

Não misturar labels de apresentação com valores internos.

---

# 38. Audit Log

Criar serviço central de auditoria.

Registrar ações como:

- importação;
- confirmação de lote;
- pagamento de fatura;
- ajuste manual;
- exportação;
- mudança administrativa;
- exclusões críticas;
- override de impostos.

Formato conceitual:

```text
actor
action
resource
resource_id
timestamp
metadata
success
```

Nunca armazenar:

- senha;
- tokens;
- dados secretos.

---

# 39. Logging

Logs técnicos devem ser estruturados.

Exemplo:

```text
request_id
user_id
operation
duration
status
error_code
```

Evitar despejar payloads financeiros completos nos logs.

---

# 40. Error Handling

Utilizar erros de domínio claros.

Exemplos:

```text
INSUFFICIENT_DATA
INVALID_INVOICE_CYCLE
DUPLICATE_IMPORT
INVALID_INSTALLMENT
RESOURCE_NOT_FOUND
UNAUTHORIZED
INVALID_FINANCIAL_DATE
```

A UI traduz o erro técnico para mensagem amigável.

---

# 41. Testing Strategy

## Unit tests

Cobrir principalmente:

- saldo;
- parcelamento;
- recorrência;
- ciclo de fatura;
- P&L;
- forecast;
- provisionamento;
- metas;
- simulação;
- deduplicação;
- merchant normalization.

## Integration tests

Cobrir:

- database;
- RLS;
- importação;
- criação de parcelas;
- pagamento de fatura;
- conversão compromisso → realizado.

## E2E

Utilizar Playwright ou equivalente.

Fluxos críticos:

1. login;
2. criar conta;
3. criar cartão;
4. lançar transação;
5. parcelar compra;
6. visualizar fatura;
7. importar fatura;
8. criar evento financeiro;
9. criar recorrência;
10. visualizar forecast.

---

# 42. CI/CD

Fluxo recomendado:

```text
GitHub
  │
  ├── Pull Request
  │      ↓
  │    lint
  │    typecheck
  │    tests
  │    build
  │
  └── main
         ↓
       Vercel Production
```

Migrations deverão ter processo explícito.

Nunca permitir que deploy de frontend execute alterações destrutivas no banco automaticamente sem controle.

---

# 43. Ambientes

Mínimo:

```text
LOCAL
PREVIEW/TEST
PRODUCTION
```

Idealmente Supabase também separado entre:

- development;
- production.

Dados reais nunca deverão ser copiados indiscriminadamente para desenvolvimento.

---

# 44. PWA

O Planner deverá possuir:

- web manifest;
- ícones;
- metadados apropriados;
- instalação na Home Screen;
- layout mobile;
- standalone display quando suportado.

Offline financeiro completo não entra na Fase 1.

Evitar cachear inadvertidamente dados sensíveis.

---

# 45. APIs futuras

A arquitetura deve permitir posteriormente:

```text
Apple Shortcut
       ↓
Planner API
       ↓
Create Transaction
```

Por isso os casos de uso não podem existir apenas dentro de componentes React.

Eles devem ser acessíveis por application services.

Na Fase 2 poderão entrar:

- Shortcuts;
- voz;
- integrações;
- webhooks;
- Open Finance quando viável.

---

# 46. Household / múltiplos usuários

Fase 1 preservará isolamento completo por usuário.

Compartilhamento familiar/casal não precisa ser implementado nesta fase.

A modelagem futura deverá permitir introduzir conceitos como:

```text
Household
Membership
Shared Account
Shared Expense
```

sem transformar todas as entidades atuais em globais.

Essa decisão será aprofundada no Database Schema.

---

# 47. Decisões arquiteturais resumidas

| Área | Decisão |
|---|---|
| Arquitetura | Modular Monolith |
| Linguagem | TypeScript |
| Frontend | Next.js / React |
| Backend web | Next.js server-side |
| Database | PostgreSQL |
| DB Provider | Supabase |
| Auth | Supabase Auth |
| Autorização | Backend + RLS |
| Storage | Supabase Storage privado |
| Deploy app | Vercel |
| Jobs | Supabase Cron inicialmente |
| PDF processing | Node server-side |
| IA | Provider abstraction |
| PWA | Sim |
| Mobile-first | Sim |
| Oracle VM | Não na Fase 1 |
| Streamlit | Não como app principal |
| Microservices | Não |
| Triggers críticos | Evitar |
| Financial domain | Services centralizados |
| Valores monetários | Decimal/Numeric |
| Datas financeiras | Date-only |
| Eventos | Timestamp/timezone |
| Tests | Unit + Integration + E2E |
| CI/CD | GitHub + Vercel |

---

# 48. Princípios que não podem ser violados

1. Feature parity com AFR é obrigatória.
2. Code parity não é obrigatória.
3. Regras financeiras críticas não ficam na UI.
4. Não duplicar regras entre telas.
5. Não usar floating point para dinheiro.
6. Datas financeiras são date-only.
7. Eventos e transações são conceitos diferentes.
8. Previsto não é realizado.
9. Provisionado não é pago.
10. Operações compostas devem ser atômicas.
11. RLS não substitui validação server-side.
12. Service Role nunca vai para o browser.
13. Importação sempre passa por revisão humana.
14. Jobs devem ser idempotentes.
15. APIs externas não são fonte de cálculo em tempo real da UI.
16. Toda premissa financeira relevante deve ser auditável.
17. Fase 1 não usa microservices.
18. Fase 1 prioriza simplicidade operacional.
19. Infra própria só entra quando houver necessidade concreta.
20. A arquitetura deve suportar Fase 2 sem reescrita estrutural do núcleo.

---

# 49. Próximo documento

Depois da aprovação desta arquitetura:

`DATABASE_SCHEMA.md`

deverá definir:

- tabelas;
- colunas;
- PK/FK;
- enums;
- constraints;
- RLS;
- índices;
- modelo de parcelas;
- modelo de recorrências;
- compromissos;
- eventos;
- faturas;
- import batches;
- macro data;
- auditoria;
- ownership;
- migrations iniciais.

Depois:

`AFR_MIGRATION_PLAN.md`

e então:

`PHASE_1_IMPLEMENTATION_PLAN.md`.