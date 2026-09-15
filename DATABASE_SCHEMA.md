# Planner Vida - DATABASE_SCHEMA.md

Status: Frozen Phase 1 Data Contract v1.0  
Escopo: Planner Vida Fase 1  
Fontes funcionais:

- `PLANNER_PHASE_1_SPEC.md`
- `AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`
- Arquitetura aprovada: Next.js/TypeScript modular monolith, Supabase PostgreSQL/Auth/Storage, Vercel, regras financeiras centralizadas em servicos de dominio, RLS, valores monetarios em `NUMERIC`/decimal, datas financeiras date-only, eventos com timezone, triggers criticos evitados, operacoes compostas atomicas e jobs idempotentes.

Este documento define o schema logico final aprovado da Fase 1. Ele e o contrato de dados congelado para orientar as migrations SQL e o `AFR_MIGRATION_PLAN.md`. Ele nao e uma migration SQL final, nao define componentes frontend, nao define rotas de API e nao define instrucoes de deploy.

---

# 1. Principios de modelagem

## 1.1 Separar dominio financeiro de implementacao tecnica

O banco deve preservar o comportamento funcional do AFR, mas nao deve carregar suas fragilidades arquiteturais.

Preservar:

- contas;
- cartoes;
- categorias/subcategorias;
- transacoes;
- transferencias;
- parcelamentos;
- recorrencias;
- faturas;
- pagamentos de fatura;
- extrato;
- dashboard;
- P&L;
- metas;
- simulador;
- importacao de fatura PDF com revisao humana;
- aprendizado de categoria por estabelecimento;
- auditoria;
- isolamento por usuario.

Melhorar:

- parcelamento deixa de depender de transacao pai ficticia;
- fatura deixa de depender de triggers espalhados como regra principal;
- enums internos deixam de misturar portugues e ingles;
- datas financeiras passam a ser `date-only`;
- eventos com horario passam a usar timestamp com timezone;
- simulacoes deixam de ser JSON livre sem contrato;
- logica financeira critica fica em servicos de dominio testaveis.

## 1.2 Modular monolith com dominio centralizado

As tabelas suportam modulos internos bem separados, mas continuam no mesmo banco transacional.

Modulos conceituais:

- Identity: `profiles`, `user_roles`;
- Finance core: `accounts`, `credit_cards`, `categories`, `transactions`, `transfers`;
- Installments: `installment_plans`, `installments`;
- Recurrence: `recurrence_rules`, `recurrence_occurrences`;
- Invoices: `credit_card_invoices`, `invoice_items`, `invoice_payments`;
- Planning: `budgets`, `budget_lines`, `planning_items`;
- Goals: `financial_goals`;
- Simulation: `simulation_scenarios`, `simulation_scenario_versions`;
- Calendar/planner: `events`, `tasks`;
- Commitments: `financial_commitments`;
- Shopping/wishlist: `shopping_lists`, `shopping_list_items`, `wishlist_items`;
- Subscriptions: `subscriptions`;
- Net worth: `assets`, `asset_valuations`, `liabilities`, `liability_balances`;
- Obligations/provisions: `annual_obligations`, `annual_obligation_installments`, `provisions`;
- Macro: `economic_indicators`, `economic_indicator_values`;
- Imports: `import_batches`, `import_items`, `merchant_category_mappings`;
- Governance/operations: `audit_logs`, `system_job_runs`, `admin_observability_metrics`.

## 1.3 Valores monetarios

Valores monetarios persistidos devem usar tipo conceitual `money_decimal`, implementado depois como `NUMERIC`/decimal.

Convencao:

- moeda padrao operacional da Fase 1: `BRL`;
- `currency_code` deve existir onde houver valor monetario para evitar reescrita estrutural futura;
- a Fase 1 nao implementa conversao cambial, accounting multi-currency ou FX engine;
- valores sempre positivos quando o tipo ou direcao ja expressa entrada/saida;
- sinal negativo so deve ser usado em campos calculados ou snapshots de variacao quando explicitamente documentado;
- nenhuma regra financeira persistente deve depender de floating point.

## 1.4 Datas financeiras vs eventos com horario

Datas financeiras sao `LocalDate`.

Exemplos:

- `transaction_date`;
- `due_date`;
- `closing_date`;
- `competence_date`;
- `installment_date`;
- `invoice_reference_month`;
- `budget_month`.

Eventos com horario usam `timestamp_with_timezone` mais `timezone`.

Exemplos:

- consulta as 15h;
- reuniao;
- lembrete com horario;
- task com vencimento em horario especifico.

Timezone padrao inicial: `America/Sao_Paulo`.

## 1.5 Nada de triggers criticos como motor de negocio

Triggers devem ser evitados para regra financeira critica.

Aceitavel:

- `updated_at`;
- validacoes tecnicas muito simples;
- eventual auditoria tecnica limitada, se aprovada.

Nao aceitavel como regra principal:

- recalcular fatura;
- criar parcelas;
- gerar recorrencias;
- converter compromisso em transacao;
- pagar fatura;
- recalcular saldo oficial.

Essas operacoes devem ficar em servicos de dominio/aplicacao e rodar dentro de transacoes atomicas.

## 1.6 Operacoes compostas atomicas

Devem ser atomicas:

- criar compra parcelada;
- editar plano de parcelas;
- confirmar lote de importacao;
- pagar fatura;
- reverter pagamento de fatura;
- converter compromisso em transacao;
- criar transferencia;
- gerar ocorrencias de recorrencia;
- criar obrigacao anual com parcelas e provisoes;
- criar assinatura com recorrencia e compromissos futuros.

Se uma etapa falhar, nenhuma alteracao parcial deve permanecer.

## 1.7 Jobs idempotentes

Jobs devem poder rodar novamente sem duplicar dados.

Todo job que materializa algo deve gravar uma chave de idempotencia ou usar unicidade natural controlada, por exemplo:

- `recurrence_occurrences(rule_id, occurrence_date, target_type)`;
- `installments(plan_id, installment_number)`;
- `financial_commitments(source_type, source_id, occurrence_date)`;
- `import_items(batch_id, line_fingerprint)`;
- `economic_indicator_values(indicator_id, reference_date, value_type)`.
- `system_job_runs(job_name, idempotency_key)`.

Recorrencias devem manter uma janela movel de aproximadamente 12 meses. O job idempotente deve completar essa janela sem gerar ocorrencias infinitas.

## 1.8 Soft delete e arquivo

Dados financeiros historicos nao devem ser apagados fisicamente por fluxo normal quando participam de relatorios, auditoria, faturas, importacoes ou calculos.

Usar:

- `archived_at` para esconder entidades configuraveis ainda referenciadas;
- `deleted_at` principalmente para drafts, rascunhos ou registros ainda nao efetivados;
- `voided_at`/`reversed_at` quando a anulacao financeira precisar ser explicita;
- delecao fisica apenas para rascunhos, dados de teste/dev, uploads temporarios sem retencao aprovada ou exclusao manual posterior de arquivo conforme politica da aplicacao.

Transactions financeiras efetivadas (`posted`) nao devem desaparecer por hard delete. Correcoes devem usar `voided`, `reversed`, linkage de reversao e auditoria.

## 1.9 Rastreabilidade

Todo registro financeiro relevante deve permitir responder:

- quem criou;
- quando criou;
- de onde veio;
- se foi manual, importado, recorrente, parcelado ou calculado;
- qual entidade de origem gerou;
- qual lote/job/request esta relacionado;
- se foi revisado ou ajustado manualmente.

## 1.10 Sources of Truth

As camadas abaixo nao podem ser misturadas silenciosamente:

| Camada | Source of truth | Natureza |
|---|---|---|
| Realizado | `transactions` | Fatos financeiros efetivados. |
| Futuro esperado/comprometido | `financial_commitments` | Entradas/obrigacoes futuras esperadas, confirmadas ou vencidas. |
| Planejamento | `planning_items` | Intencoes ou planos ainda nao necessariamente comprometidos. |
| Competencia economica | `provisions` | Apropriacao economica mensal; nao e pagamento e nao e transacao. |
| Hipotetico | `simulation_scenarios` / `simulation_scenario_versions` | Analise isolada, sem alterar fatos reais. |

Forecasts e relatorios podem consumir multiplas camadas, mas devem declarar explicitamente qual camada esta sendo usada. Nenhum fluxo deve transformar previsao em realizado sem operacao explicita, valida e auditada.

## 1.11 Modelo individual da Fase 1

A Fase 1 e estritamente individual.

Todos os dados privados pertencem a exatamente um `user_id`, com isolamento completo entre usuarios. Nao implementar `households`, `shared_spaces`, memberships, ownership compartilhado ou permissoes familiares nesta fase.

O schema nao deve impedir Household/shared finances em Fase 2+, mas nenhuma estrutura especifica sera adicionada agora.

## 1.12 Admin Observability sem acesso financeiro individual

Administrador humano nao possui bypass generico para dados financeiros individualizados.

Permitido para Admin:

- observabilidade consolidada;
- metricas agregadas de saude do sistema;
- erros por modulo/job/importacao;
- estatisticas agregadas de volume, contagem, minimo, maximo, media, mediana e anomalias;
- auditoria tecnica sem expor detalhes financeiros privados.

Nao permitido para Admin humano:

- abrir contas, cartoes, transacoes, faturas, patrimonio, compromissos ou obrigacoes de um usuario especifico;
- consultar detalhes financeiros individualizados;
- usar `service_role` a partir do browser.

Processos privilegiados server-side podem acessar registros quando necessario para jobs, migrations, recovery e operacoes de infraestrutura. Isso e privilegio da aplicacao/infraestrutura, nao permissao navegavel de um Admin humano.

---

# 2. Entidades/tabelas propostas

## 2.1 Tabelas de identidade e governanca

- `profiles`
- `user_roles`
- `audit_logs`
- `system_job_runs`
- `admin_observability_metrics`

## 2.2 Tabelas financeiras centrais

- `accounts`
- `credit_cards`
- `categories`
- `transactions`
- `transfers`

## 2.3 Parcelamento e recorrencia

- `installment_plans`
- `installments`
- `recurrence_rules`
- `recurrence_occurrences`

## 2.4 Faturas

- `credit_card_invoices`
- `invoice_items`
- `invoice_payments`

## 2.5 Planejamento, metas e simulacoes

- `budgets`
- `budget_lines`
- `planning_items`
- `financial_goals`
- `simulation_scenarios`
- `simulation_scenario_versions`

## 2.6 Planner operacional

- `events`
- `tasks`
- `financial_commitments`

## 2.7 Compras, desejos e assinaturas

- `shopping_lists`
- `shopping_list_items`
- `wishlist_items`
- `subscriptions`

## 2.8 Patrimonio e obrigacoes

- `assets`
- `asset_valuations`
- `liabilities`
- `liability_balances`
- `annual_obligations`
- `annual_obligation_installments`
- `provisions`

## 2.9 Dados externos e importacao

- `economic_indicators`
- `economic_indicator_values`
- `import_batches`
- `import_items`
- `merchant_category_mappings`

---

# 3. Colunas principais e tipos conceituais

Tipos conceituais usados neste documento:

| Tipo conceitual | Uso esperado |
|---|---|
| `uuid` | Identificadores principais. |
| `user_ref` | FK para `profiles.id`, alinhado ao usuario autenticado. |
| `text_short` | Texto curto, como nome/titulo. |
| `text_long` | Descricao/observacao. |
| `money_decimal` | Valor monetario decimal. |
| `money_decimal_signed` | Valor monetario decimal que pode ser negativo/positivo para variancias, reversoes ou deltas explicitamente documentados. |
| `decimal_precise` | Taxas, percentuais e indices. |
| `currency_code` | Codigo ISO, `BRL` como default inicial. |
| `local_date` | Data financeira sem timezone. |
| `year_month` | Mes de competencia, conceitualmente `YYYY-MM`. |
| `timestamp_tz` | Instante com timezone. |
| `timezone_name` | Ex.: `America/Sao_Paulo`. |
| `enum_text` | Valor canonico interno. |
| `json_contract` | JSON validado por schema versionado, nao livre. |
| `source_ref` | Par `source_type` + `source_id`. |

---

# 4. PK/FK

## 4.1 Convencoes de PK

- Todas as tabelas principais usam `id: uuid` como PK.
- Tabelas de associacao ou detalhes tambem podem usar `id: uuid` para auditoria e rastreabilidade.
- Nao usar chaves compostas como PK principal quando o registro precisar ser referenciado por auditoria, importacao ou workflow.

## 4.2 Convencoes de FK

- Toda tabela owned-by-user deve possuir `user_id` com FK para `profiles.id`.
- FKs entre tabelas owned-by-user devem ser validadas tambem por servico de dominio para garantir mesmo `user_id`.
- FKs financeiras devem preferir `restrict` ou soft delete, nao cascata destrutiva.
- Cascata fisica so e aceitavel para filhos puramente tecnicos de um rascunho ainda nao confirmado.

## 4.3 Relacionamentos criticos

```text
profiles
  |-- accounts
  |-- credit_cards
  |-- categories
  |-- transactions
  |-- transfers
  |-- installment_plans
  |-- recurrence_rules
  |-- credit_card_invoices
  |-- financial_commitments
  |-- events
  |-- tasks
  |-- budgets
  |-- financial_goals
  |-- simulation_scenarios
  |-- subscriptions
  |-- assets
  |-- liabilities
  |-- annual_obligations
  |-- import_batches
  |-- merchant_category_mappings
```

Dados operacionais globais:

```text
system_job_runs
admin_observability_metrics
```

Essas estruturas nao possuem `user_id` porque nao representam dados financeiros privados. Elas tambem nao podem conter detalhes individualizados ou identificadores que permitam reidentificar um usuario.

```text
categories
  |-- categories.parent_id
  |-- transactions.category_id
  |-- transactions.subcategory_id
  |-- budget_lines.category_id
  |-- financial_commitments.category_id
  |-- merchant_category_mappings.category_id
```

```text
credit_cards
  |-- credit_card_invoices
        |-- invoice_items
        |-- invoice_payments
  |-- transactions.credit_card_id
  |-- subscriptions.credit_card_id
```

## 4.4 Cardinalidades criticas

| Relacao | Cardinalidade | Regra |
|---|---|---|
| `profiles -> accounts` | 1:N | Uma conta pertence a um unico usuario. |
| `profiles -> credit_cards` | 1:N | Um cartao pertence a um unico usuario. |
| `categories -> categories` | 1:N limitado | Fase 1 permite apenas categoria -> subcategoria. |
| `installment_plans -> installments` | 1:N | Cada plano possui 2 a 60 parcelas. |
| `installments -> transactions` | 0:1 | Uma parcela postada gera no maximo uma transacao real. |
| `credit_cards -> credit_card_invoices` | 1:N | Uma fatura por cartao/reference_month. |
| `credit_card_invoices -> invoice_items` | 1:N | Itens pertencem a uma unica fatura. |
| `credit_card_invoices -> invoice_payments` | 1:N | Fatura pode ter multiplos pagamentos parciais. |
| `invoice_payments -> invoice_payments` | 0:1 / 1:1 | Reversao aponta para pagamento original e original aponta para reversao. |
| `financial_commitments -> transactions` | 0:1 | Compromisso realizado aponta para uma unica transacao. |
| `recurrence_rules -> recurrence_occurrences` | 1:N | Janela movel, nao infinita. |
| `annual_obligations -> annual_obligation_installments` | 1:N | Pagamentos de caixa planejados. |
| `annual_obligations -> provisions` | 1:N | Apropriacao economica mensal. |
| `import_batches -> import_items` | 1:N | Lote revisavel antes do commit. |

---

# 5. Ownership por `user_id`

## 5.1 Tabelas obrigatoriamente owned-by-user

Devem conter `user_id`:

- `accounts`
- `credit_cards`
- `categories`
- `transactions`
- `transfers`
- `installment_plans`
- `installments`
- `recurrence_rules`
- `recurrence_occurrences`
- `credit_card_invoices`
- `invoice_items`
- `invoice_payments`
- `budgets`
- `budget_lines`
- `planning_items`
- `financial_goals`
- `simulation_scenarios`
- `simulation_scenario_versions`
- `events`
- `tasks`
- `financial_commitments`
- `shopping_lists`
- `shopping_list_items`
- `wishlist_items`
- `subscriptions`
- `assets`
- `asset_valuations`
- `liabilities`
- `liability_balances`
- `annual_obligations`
- `annual_obligation_installments`
- `provisions`
- `import_batches`
- `import_items`
- `merchant_category_mappings`
- `audit_logs` quando o evento se refere a dado de usuario.

## 5.2 Tabelas globais

Podem nao conter `user_id`:

- `economic_indicators`
- `economic_indicator_values`
- `system_job_runs`
- `admin_observability_metrics`

`economic_indicators` e `economic_indicator_values` sao dados de referencia. Usuarios autenticados podem ler; somente sistema/job pode inserir ou atualizar.

`system_job_runs` e `admin_observability_metrics` sao dados operacionais/agregados. Eles nao devem conter detalhes financeiros individualizados, merchant, conta, cartao, descricao de transacao ou identificadores que permitam reidentificacao de um usuario.

## 5.3 Modelo individual aprovado

Fase 1 suporta multiplos usuarios isolados, mas cada espaco financeiro e individual.

Nao introduzir:

- `households`;
- `shared_spaces`;
- memberships;
- ownership compartilhado;
- leitura cruzada entre usuarios;
- modelo casal/familiar.

Fase 2+ pode adicionar compartilhamento por extensao, mas a Fase 1 nao deve conter tabelas ou FKs preparatorias especificas para isso.

---

# 6. Enums canonicos internos

Enums abaixo sao valores internos. Labels em portugues devem ficar na UI/traducao, nao no banco.

## 6.1 Financeiros

`transaction_type`

- `income`
- `expense`
- `transfer`
- `investment`

`transaction_status`

- `draft`
- `posted`
- `voided`
- `reversed`

`payment_method`

- `cash`
- `debit`
- `credit_card`
- `pix`
- `bank_transfer`
- `boleto`
- `benefit_food`
- `benefit_meal`
- `benefit_culture`
- `other`

Beneficios como vale-refeicao, vale-alimentacao e similares devem ser representados principalmente por `accounts.type = benefit`. Os valores `benefit_food`, `benefit_meal` e `benefit_culture` podem existir como classificacao complementar do uso, mas nao substituem a conta de beneficio nem seu saldo.

`category_type`

- `income`
- `fixed_expense`
- `variable_expense`
- `investment`
- `transfer`

`account_type`

- `checking`
- `savings`
- `wallet`
- `cash`
- `investment`
- `benefit`
- `other`

`account_status`

- `active`
- `archived`
- `closed`

`credit_card_status`

- `active`
- `paused`
- `archived`
- `closed`

## 6.2 Parcelas, recorrencias e faturas

`installment_plan_status`

- `active`
- `completed`
- `cancelled`
- `archived`

`installment_status`

- `scheduled`
- `posted`
- `cancelled`
- `skipped`

`recurrence_frequency`

- `weekly`
- `monthly`
- `yearly`

`recurrence_status`

- `active`
- `paused`
- `ended`
- `cancelled`

`recurrence_target_type`

- `transaction`
- `financial_commitment`
- `event`
- `task`
- `subscription`
- `annual_obligation`

`invoice_status`

- `open`
- `closed`
- `due`
- `overdue`
- `partially_paid`
- `paid`
- `cancelled`

`invoice_item_type`

- `purchase`
- `installment`
- `fee`
- `interest`
- `adjustment`
- `refund`

`invoice_payment_status`

- `draft`
- `posted`
- `reversed`

`invoice_payment_type`

- `payment`
- `payment_reversal`

`invoice_adjustment_type`

- `manual_adjustment`
- `interest`
- `fee`
- `refund`
- `payment_reversal`

## 6.3 Planner

`event_type`

- `personal`
- `financial`
- `payment`
- `income`
- `invoice`
- `annual_obligation`
- `subscription`
- `task`
- `other`

`event_status`

- `scheduled`
- `completed`
- `cancelled`
- `archived`

`task_status`

- `pending`
- `completed`
- `cancelled`
- `archived`

`task_priority`

- `low`
- `medium`
- `high`
- `urgent`

`commitment_type`

- `income`
- `expense`
- `investment`
- `transfer`

`commitment_status`

- `expected`
- `confirmed`
- `overdue`
- `realized`
- `cancelled`

## 6.4 Planejamento e metas

`budget_status`

- `draft`
- `active`
- `closed`
- `archived`

`planning_item_status`

- `planned`
- `expected`
- `committed`
- `realized`
- `cancelled`

`financial_goal_type`

- `save`
- `reduce_expense`
- `increase_income`
- `pay_debt`
- `net_worth`
- `purchase`

`financial_goal_status`

- `active`
- `completed`
- `paused`
- `archived`
- `cancelled`

`simulation_status`

- `draft`
- `active`
- `archived`

## 6.5 Compras, assinaturas e patrimonio

`shopping_list_status`

- `active`
- `archived`
- `deleted`

`shopping_item_status`

- `open`
- `purchased`
- `skipped`
- `deleted`

`wishlist_status`

- `desired`
- `evaluating`
- `purchased`
- `discarded`
- `archived`

`subscription_status`

- `active`
- `paused`
- `cancelled`
- `archived`

`asset_type`

- `cash`
- `investment`
- `vehicle`
- `property`
- `personal_item`
- `other`

`liability_type`

- `credit_card`
- `loan`
- `financing`
- `tax`
- `manual`
- `other`

## 6.6 Obrigacoes, macro, importacao e auditoria

`annual_obligation_type`

- `ipva`
- `iptu`
- `insurance`
- `annuity`
- `professional_fee`
- `maintenance`
- `other`

`obligation_status`

- `draft`
- `active`
- `partially_paid`
- `paid`
- `overdue`
- `cancelled`
- `archived`

`provision_status`

- `active`
- `paused`
- `completed`
- `cancelled`

`indicator_code`

- `selic`
- `cdi`
- `ipca`
- `di`
- `usd_brl`
- `other`

`indicator_value_type`

- `actual`
- `estimated`
- `assumption`

`import_batch_status`

- `uploaded`
- `processing`
- `parsed`
- `reviewing`
- `ready_to_commit`
- `committed`
- `failed`
- `cancelled`

`import_item_status`

- `parsed`
- `included`
- `excluded`
- `duplicate_suspected`
- `committed`
- `failed`

`origin_type`

- `manual`
- `import`
- `recurrence`
- `installment`
- `invoice`
- `subscription`
- `annual_obligation`
- `event`
- `task`
- `simulation`
- `system_job`
- `migration`

Na Fase 1, `origin_type=simulation` nao deve ser usado em `transactions`, `financial_commitments`, `balances`, `provisions` ou `planning_items` reais. Ele fica reservado a artefatos hipoteticos do proprio modulo de simulacao.

`audit_severity`

- `info`
- `warning`
- `critical`

---

# 7. Constraints e unicidades

## 7.1 Globais

- `amount` monetario deve ser `>= 0`, exceto campos de variacao explicitamente assinados.
- `currency` obrigatoria para valores monetarios, default conceitual `BRL`.
- Fase 1 e BRL-first; `currency_code` prepara evolucao, mas nao implica conversao cambial automatica.
- `created_at` obrigatorio.
- `updated_at` obrigatorio para tabelas mutaveis.
- `deleted_at` nao pode coexistir com status ativo.
- FKs owned-by-user devem apontar para registros do mesmo `user_id`.
- Campos de enum devem aceitar apenas valores canonicos.
- Datas financeiras devem ser `local_date`, nao timestamp.
- `competence_date` deve defaultar conceitualmente para `transaction_date` quando nao informada.

## 7.2 Identidade

- `profiles.id` unico e alinhado ao usuario de auth.
- `profiles.username` unico quando usado.
- `user_roles(user_id, role)` unico.

## 7.3 Contas e cartoes

- `accounts(user_id, normalized_name)` unico entre contas nao deletadas/arquivadas ativas.
- `credit_cards(user_id, normalized_name)` unico entre cartoes ativos.
- `credit_cards.closing_day` entre 1 e 31.
- `credit_cards.due_day` entre 1 e 31.
- Dias 29, 30 e 31 em meses menores devem ser normalizados deterministicamente para o ultimo dia valido do mes aplicavel.
- Regras de closing day, due day, atribuicao de fatura e month-end edge cases pertencem ao dominio de invoices, nao a UI/triggers duplicados.
- Cartao com faturas/transacoes nao deve ser deletado fisicamente.
- Contas `type=benefit` sao a representacao primaria para VA/VR/outros beneficios com saldo proprio.

## 7.4 Categorias

- `categories(user_id, parent_id, normalized_name)` unico entre categorias ativas.
- Categoria raiz tem `parent_id` nulo.
- Subcategoria deve ter `parent_id` preenchido.
- Subcategoria deve herdar ou ser compativel com `category_type` do pai.
- Nao permitir ciclo em arvore de categorias.
- Fase 1 permite no maximo dois niveis funcionais: categoria -> subcategoria. O banco pode usar `parent_id`, mas o dominio deve impedir profundidade maior.
- Categoria em uso deve ser arquivada ou reassociada, nao apagada sem controle.

## 7.5 Transacoes

- `transactions.amount > 0` para transacoes postadas.
- `transactions.transaction_date` obrigatoria para status `posted`.
- `income` e `expense` exigem `category_id`.
- `credit_card` como `payment_method` exige `credit_card_id`.
- `debit`, `pix`, `boleto`, `cash`, `bank_transfer` exigem `account_id` quando houver impacto em conta.
- Uso de VA/VR/outros beneficios deve informar `account_id` de conta `type=benefit`; payment method de beneficio e apenas classificacao complementar.
- Compra no cartao nao reduz saldo de conta na data da compra.
- `transfer` deve ter registro correspondente em `transfers`.
- `external_fingerprint` unico por usuario quando preenchido e confirmado como chave de deduplicacao.
- `installment_id` unico em `transactions` quando preenchido.
- `recurrence_occurrence_id` unico em `transactions` quando materializado como transacao.
- `realized_from_commitment_id` unico em `transactions` quando conversao vier de compromisso.
- Transactions `posted` nao devem sofrer hard delete; correcoes usam `voided`, `reversed`, linkage de reversao e audit trail.
- Transacao de reversao deve referenciar a transacao original.

## 7.6 Transferencias

- `transfers.source_account_id <> destination_account_id`.
- `transfers.amount > 0`.
- Contas de origem/destino devem pertencer ao mesmo usuario.
- Criacao deve ser atomica com lancamentos financeiros associados.
- Transferencia nao entra em P&L como receita/despesa.

## 7.7 Parcelamentos

- `installment_plans.total_installments` entre 2 e 60 na modelagem; UI da Fase 1 pode limitar a 24 por parity com AFR.
- O limite 24 e regra de UI para compras parceladas comuns na Fase 1, nao restricao estrutural do banco.
- `installments(plan_id, installment_number)` unico.
- `installment_number` entre 1 e `total_installments`.
- Soma das parcelas deve reconciliar com `installment_plans.total_amount`.
- Plano nao deve gerar transacao pai ficticia.
- Cada parcela postada deve ter no maximo uma transacao/fatura vinculada.

## 7.8 Recorrencias

- `recurrence_rules.frequency` em `weekly`, `monthly`, `yearly`.
- Regra deve ter fim por data, quantidade ou indefinido controlado.
- `recurrence_occurrences(rule_id, occurrence_date, target_type)` unico.
- Ocorrencia materializada deve apontar para no maximo um alvo real por tipo.
- Job de recorrencia deve usar `idempotency_key`.
- Materializacao deve manter janela movel aproximada de 12 meses.
- Alteracao de regra afeta somente ocorrencias futuras ainda nao realizadas. Historico realizado nao deve ser reescrito.

## 7.9 Faturas

- `credit_card_invoices(credit_card_id, reference_month)` unico.
- `closing_date <= due_date` para o ciclo normal.
- Ajuste manual de fechamento deve registrar motivo e usuario.
- `invoice_items(invoice_id, transaction_id)` unico quando item vem de transacao.
- `invoice_items(invoice_id, installment_id)` unico quando item vem de parcela.
- `invoice_payments.payment_transaction_id` unico quando pagamento gerar transacao bancaria.
- Fatura paga nao deve aceitar novo item ou alteracao silenciosa.
- Correcao de fatura `paid` deve ocorrer por reversao explicita e auditavel de pagamento: `paid -> payment reversal -> closed` ou status coerente pelo saldo restante.
- `total_paid_amount`, `remaining_amount` e `paid_interest_amount` devem reconciliar com pagamentos postados, reversoes, juros e ajustes.
- Uma invoice pode possuir multiplos `invoice_payments`; o modelo nao assume `1 invoice = 1 payment`.
- Pagamento de reversao deve ter `payment_type=payment_reversal` e `reversal_of_payment_id` preenchido.
- Pagamento original revertido deve preservar registro original e apontar para `reversed_by_payment_id`.
- `is_hidden_from_reports` e flag independente e nao altera `invoice_status`.

## 7.10 Importacoes

- `import_batches.file_sha256` deve ser preenchido quando arquivo for retido ou processado.
- `import_items(batch_id, line_fingerprint)` unico.
- `merchant_category_mappings(user_id, merchant_key)` unico.
- Lote so pode ser `committed` depois de revisao humana.
- Senha de PDF nao deve ser persistida.
- PDF original de fatura deve ser mantido em Supabase Storage privado apos importacao, com exclusao manual posterior conforme politica da aplicacao.
- Matching de importacao pode sugerir vinculo com compromisso existente, mas nao deve criar duplicidade entre commitment e transaction.

## 7.11 Admin Observability e jobs

- `system_job_runs(job_name, idempotency_key)` unico.
- `admin_observability_metrics` nao deve conter `user_id`.
- `admin_observability_metrics` nao deve conter merchant, descricao, conta, cartao, email, nome, documento ou identificador financeiro individualizado.
- Metric dimensions devem ser tecnicas/agregadas.
- Metricas de anomalia podem registrar max/min/media/mediana/contagem, mas nao devem permitir drill-down para pessoa ou transacao.

---

# 8. Indices necessarios

Indices devem ser definidos nas migrations finais, mas o desenho logico exige estes acessos:

## 8.1 Indices por ownership e listagens principais

- `accounts(user_id, status, name)`
- `credit_cards(user_id, status, name)`
- `categories(user_id, parent_id, type, name)`
- `transactions(user_id, transaction_date desc)`
- `events(user_id, start_at)`
- `tasks(user_id, due_date, status)`
- `financial_commitments(user_id, due_date, status)`

## 8.2 Extrato, dashboard e P&L

- `transactions(user_id, transaction_date, transaction_type)`
- `transactions(user_id, category_id, transaction_date)`
- `transactions(user_id, subcategory_id, transaction_date)`
- `transactions(user_id, account_id, transaction_date)`
- `transactions(user_id, credit_card_id, transaction_date)`
- `transactions(user_id, payment_method, transaction_date)`
- `transactions(user_id, competence_month, transaction_type)`

## 8.3 Cartoes e faturas

- `credit_card_invoices(user_id, credit_card_id, reference_month)`
- `credit_card_invoices(user_id, due_date, status)`
- `invoice_items(user_id, invoice_id)`
- `invoice_items(user_id, transaction_id)`
- `invoice_payments(user_id, invoice_id, payment_date)`

## 8.4 Parcelas e recorrencias

- `installment_plans(user_id, status, first_due_date)`
- `installments(user_id, plan_id, due_date)`
- `installments(user_id, due_date, status)`
- `recurrence_rules(user_id, status, frequency)`
- `recurrence_occurrences(user_id, occurrence_date, status)`
- `recurrence_occurrences(rule_id, occurrence_date)`

## 8.5 Planejamento e forecast

- `budget_lines(user_id, budget_id, category_id)`
- `planning_items(user_id, period_month, status)`
- `financial_goals(user_id, status, target_date)`
- `provisions(user_id, provision_month, status)`
- `annual_obligations(user_id, due_date, status)`
- `subscriptions(user_id, next_charge_date, status)`

## 8.6 Importacao e aprendizado

- `import_batches(user_id, created_at desc)`
- `import_batches(user_id, status)`
- `import_items(user_id, batch_id, status)`
- `import_items(user_id, dedupe_key)`
- `merchant_category_mappings(user_id, merchant_key)`

## 8.7 Macro e auditoria

- `economic_indicator_values(indicator_id, reference_date desc)`
- `economic_indicator_values(indicator_id, value_type, reference_date)`
- `audit_logs(user_id, created_at desc)`
- `audit_logs(actor_user_id, created_at desc)`
- `audit_logs(correlation_id)`
- `audit_logs(resource_type, resource_id)`
- `system_job_runs(job_name, idempotency_key)`
- `system_job_runs(status, started_at desc)`
- `admin_observability_metrics(metric_date, module, metric_name)`
- `admin_observability_metrics(is_anomaly, metric_window_end_at desc)`

---

# 9. RLS por entidade em alto nivel

## 9.1 Politica padrao para dados owned-by-user

Para tabelas com `user_id`:

- usuario autenticado pode ler linhas com `user_id = auth.uid()`;
- usuario autenticado pode inserir linhas com `user_id = auth.uid()`;
- usuario autenticado pode atualizar linhas com `user_id = auth.uid()`;
- usuario autenticado pode soft-delete/arquivar linhas com `user_id = auth.uid()` quando regra de dominio permitir;
- delecao fisica deve ser restrita a servicos backend em casos aprovados e auditados.

RLS nao substitui autorizacao server-side. Servicos de dominio devem validar ownership e transicoes de status antes de gravar.

## 9.2 Politica para admin

Administrador humano:

- nao pode acessar dados financeiros individualizados de outros usuarios;
- nao possui bypass generico de `user_id`;
- nao pode navegar livremente por contas, cartoes, transacoes, faturas, patrimonio, compromissos ou obrigacoes de usuario;
- pode acessar apenas observabilidade consolidada, metricas agregadas, erros tecnicos, saude de jobs, anomalias agregadas e auditoria tecnica sem detalhes financeiros privados;
- toda acao administrativa deve gerar `audit_logs`.

Processos server-side privilegiados:

- podem usar `service_role` para jobs, migrations, recovery e operacoes de infraestrutura quando estritamente necessario;
- devem rodar em ambiente server-side;
- devem gerar auditoria/correlation id quando afetarem dados sensiveis;
- nao representam permissao de um Admin humano.

`service_role` nunca deve ser exposto ao browser.

## 9.3 Politica para dados globais

`economic_indicators` e `economic_indicator_values`:

- leitura permitida para usuarios autenticados;
- escrita restrita a sistema/job ou operacao administrativa server-side auditada;
- alteracao manual auditada.

`system_job_runs` e `admin_observability_metrics`:

- leitura permitida para Admin humano apenas quando nao houver dados individualizados;
- escrita restrita a sistema/job/backend;
- payloads devem ser agregados e nao reidentificaveis.

## 9.4 Politica para Storage

Uploads de importacao:

- caminho conceitual: `invoice-imports/{user_id}/{import_batch_id}/source.pdf`;
- usuario so acessa arquivos do proprio `user_id`;
- service role pode acessar durante processamento server-side;
- PDF original fica retido em Storage privado apos importacao para auditoria, rastreabilidade, reprocessamento e investigacao;
- exclusao manual posterior deve ser controlada pela politica da aplicacao e auditada;
- senha de PDF nao entra em Storage, banco, logs ou auditoria.

---

# 10. Modelo de `accounts`, `credit_cards`, `categories`, `transactions`, `transfers`

## 10.1 `accounts`

Representa contas, carteiras, caixa, contas de investimento e beneficios. `current_balance` mutavel nao e source of truth; saldo e sempre derivado conceitualmente de `opening_balance + movements`.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Nome exibido. |
| `normalized_name` | `text_short` | Unicidade/busca. |
| `type` | `account_type` | Conta corrente, poupanca, carteira, beneficio etc. |
| `institution` | `text_short` | Banco/instituicao opcional. |
| `description` | `text_long` | Opcional. |
| `opening_balance` | `money_decimal` | Saldo base informado. |
| `opening_balance_date` | `local_date` | Data-base do saldo inicial. |
| `overdraft_limit` | `money_decimal` | Cheque especial/limite associado. |
| `currency` | `currency_code` | Default `BRL`. |
| `status` | `account_status` | Ativa, arquivada, encerrada. |
| `archived_at` | `timestamp_tz` | Quando escondida. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Saldo deve ser calculado por servico de dominio:

```text
account balance =
  opening_balance
  + posted income in account
  - posted expense/investment in account, excluding credit-card purchases
  + incoming transfers
  - outgoing transfers
  - invoice payments from account
```

Para contas de beneficio (`type=benefit`), o uso reduz saldo como qualquer conta. Payment methods de beneficio podem classificar o tipo de beneficio usado, mas o saldo pertence a conta.

Snapshots/materialized aggregates/cache podem existir futuramente por performance, mas nunca substituem os movimentos financeiros como fonte primaria.

## 10.2 `credit_cards`

Representa cartoes de credito usados para compras, faturas e limite.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Nome do cartao. |
| `normalized_name` | `text_short` | Unicidade/busca. |
| `brand` | `text_short` | Visa, Mastercard etc. |
| `credit_limit` | `money_decimal` | Limite contratado. |
| `account_id` | `uuid` | Conta preferencial para pagamento, opcional. |
| `closing_day` | `integer` | Dia de fechamento. |
| `due_day` | `integer` | Dia de vencimento. |
| `description` | `text_long` | Opcional. |
| `status` | `credit_card_status` | Ativo, pausado, arquivado. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Regras de ciclo:

- `closing_day` e `due_day` sao inputs do dominio de invoices;
- se o dia configurado nao existir em determinado mes, usar o ultimo dia valido daquele mes;
- compra com `transaction_date` maior que a data de fechamento calculada pertence ao ciclo seguinte;
- month-end edge cases devem ser cobertos por testes unitarios do dominio;
- a UI nao deve reimplementar essa logica.

## 10.3 `categories`

Representa categorias e subcategorias financeiras configuraveis.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `parent_id` | `uuid` | FK para `categories.id`, nulo para categoria raiz. |
| `name` | `text_short` | Nome exibido. |
| `normalized_name` | `text_short` | Busca/unicidade. |
| `type` | `category_type` | Tipo canonico. |
| `sort_order` | `integer` | Ordenacao opcional. |
| `color_token` | `text_short` | Opcional, sem regra financeira. |
| `icon_key` | `text_short` | Opcional, sem regra financeira. |
| `is_system_default` | `boolean` | Criada pelo sistema. |
| `archived_at` | `timestamp_tz` | Arquivamento. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Regra de profundidade:

- Fase 1 permite somente `Category -> Subcategory`;
- `parent_id` existe para compatibilidade tecnica, mas o dominio deve impedir netos/bisnetos e arvores arbitrariamente profundas.

## 10.4 `transactions`

Representa fatos financeiros realizados/postados. Compras no cartao sao transacoes, mas nao impactam saldo de conta ate o pagamento da fatura.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `transaction_type` | `transaction_type` | Receita, despesa, transferencia, investimento. |
| `status` | `transaction_status` | Draft, posted, voided, reversed. |
| `description` | `text_short` | Obrigatoria quando postada. |
| `amount` | `money_decimal` | Positivo; direcao vem do tipo. |
| `currency` | `currency_code` | Default `BRL`. |
| `transaction_date` | `local_date` | Data financeira. |
| `competence_date` | `local_date` | Competencia economica; default conceitual = `transaction_date`. |
| `competence_month` | `year_month` | Para P&L/orcamento. |
| `category_id` | `uuid` | FK categoria. |
| `subcategory_id` | `uuid` | FK subcategoria opcional. |
| `payment_method` | `payment_method` | Metodo canonico. |
| `account_id` | `uuid` | FK conta quando afeta conta. |
| `credit_card_id` | `uuid` | FK cartao quando compra no credito. |
| `transfer_id` | `uuid` | FK transferencia, quando aplicavel. |
| `installment_id` | `uuid` | FK parcela, quando aplicavel. |
| `recurrence_occurrence_id` | `uuid` | FK ocorrencia recorrente. |
| `invoice_id` | `uuid` | FK fatura quando item de cartao. |
| `realized_from_commitment_id` | `uuid` | FK compromisso convertido. |
| `reversal_of_transaction_id` | `uuid` | FK transacao original quando esta linha for reversao. |
| `reversed_by_transaction_id` | `uuid` | FK transacao de reversao, se esta linha foi revertida. |
| `origin_type` | `origin_type` | Manual, import, recurrence etc. |
| `source_type` | `enum_text` | Tipo da origem externa/interna. |
| `source_id` | `uuid` | Id da origem. |
| `external_fingerprint` | `text_short` | Deduplicacao. |
| `notes` | `text_long` | Opcional. |
| `posted_at` | `timestamp_tz` | Quando foi efetivada no sistema. |
| `voided_at` | `timestamp_tz` | Anulacao logica. |
| `reversed_at` | `timestamp_tz` | Quando revertida. |
| `reversal_reason` | `text_long` | Motivo/contexto da reversao. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Regras:

- `transactions` sao fatos financeiros realizados;
- `posted` entra em saldo, P&L e relatorios realizados;
- `draft` pode ser removida logicamente;
- `posted` nao sofre hard delete;
- correcoes apos `posted` usam `voided`, `reversed`, transacao de reversao e audit log;
- uma transacao vinda de compromisso preserva o valor realizado, sem sobrescrever o valor esperado do compromisso.

## 10.5 `transfers`

Representa movimentacao entre contas do mesmo usuario, fora de P&L.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `source_account_id` | `uuid` | FK conta origem. |
| `destination_account_id` | `uuid` | FK conta destino. |
| `amount` | `money_decimal` | Positivo. |
| `currency` | `currency_code` | Default `BRL`. |
| `transfer_date` | `local_date` | Data financeira. |
| `description` | `text_short` | Obrigatoria. |
| `status` | `transaction_status` | Posted/voided/reversed. |
| `outflow_transaction_id` | `uuid` | Lancamento de saida, se usado. |
| `inflow_transaction_id` | `uuid` | Lancamento de entrada, se usado. |
| `origin_type` | `origin_type` | Manual, recurrence etc. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

ERD:

```text
accounts(source) --\
                    > transfers --> transactions(type=transfer, excluded from P&L)
accounts(dest)   --/
```

---

# 11. Modelo de `installment_plans` / `installments`

O novo modelo substitui o padrao antigo de "transacao pai + transacoes filhas".

Limites aprovados:

- database/domain maximum: 60 parcelas;
- Phase 1 ordinary-purchase UI maximum: 24 parcelas;
- o limite de 24 nao deve virar constraint estrutural do banco.

## 11.1 `installment_plans`

Representa a compra/obrigacao original parcelada.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `description` | `text_short` | Descricao da compra/plano. |
| `merchant_name` | `text_short` | Opcional. |
| `merchant_key` | `text_short` | Normalizado para aprendizado/dedupe. |
| `total_amount` | `money_decimal` | Valor total. |
| `currency` | `currency_code` | Default `BRL`. |
| `total_installments` | `integer` | Quantidade total. |
| `first_due_date` | `local_date` | Data da primeira parcela. |
| `purchase_date` | `local_date` | Data da compra. |
| `category_id` | `uuid` | Categoria default. |
| `subcategory_id` | `uuid` | Subcategoria default. |
| `payment_method` | `payment_method` | Normalmente `credit_card`, mas nao exclusivamente. |
| `account_id` | `uuid` | Se parcelamento fora do cartao. |
| `credit_card_id` | `uuid` | Se compra no cartao. |
| `status` | `installment_plan_status` | Active/completed/cancelled. |
| `origin_type` | `origin_type` | Manual/import/etc. |
| `source_type` | `enum_text` | Origem. |
| `source_id` | `uuid` | Origem. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

## 11.2 `installments`

Representa cada parcela individual.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `plan_id` | `uuid` | FK `installment_plans`. |
| `installment_number` | `integer` | 1..N. |
| `amount` | `money_decimal` | Valor da parcela. |
| `due_date` | `local_date` | Data financeira da parcela. |
| `competence_date` | `local_date` | Opcional. |
| `status` | `installment_status` | Scheduled/posted/cancelled. |
| `transaction_id` | `uuid` | Transacao gerada/postada, se houver. |
| `financial_commitment_id` | `uuid` | Compromisso futuro associado. |
| `invoice_id` | `uuid` | Fatura atribuida, se cartao. |
| `import_item_id` | `uuid` | Origem importada, se aplicavel. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

ERD:

```text
installment_plans
  |-- installments(1)
  |-- installments(2)
  |-- installments(n)
          |-- financial_commitments, while future
          |-- transactions, when posted
          |-- invoice_items, when credit card
```

Invariante principal:

```text
installment_plan is descriptive/control
installments are schedulable/payable
transactions are realized facts
reports never need to ignore a fake parent transaction
```

---

# 12. `recurrence_rules` / `occurrences`

Recorrencia e uma regra de geracao/projecao, nao uma colecao infinita de transacoes.

## 12.1 `recurrence_rules`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Nome da recorrencia. |
| `target_type` | `recurrence_target_type` | O que a regra gera. |
| `frequency` | `recurrence_frequency` | Weekly/monthly/yearly. |
| `interval_count` | `integer` | A cada N frequencias, default 1. |
| `start_date` | `local_date` | Inicio financeiro/calendario. |
| `end_date` | `local_date` | Opcional. |
| `max_occurrences` | `integer` | Opcional. |
| `day_of_week` | `integer` | Para semanal, se aplicavel. |
| `day_of_month` | `integer` | Para mensal/anual, se aplicavel. |
| `month_of_year` | `integer` | Para anual, se aplicavel. |
| `timezone` | `timezone_name` | Para alvos com horario. |
| `template_payload` | `json_contract` | Payload validado por tipo/alvo. |
| `template_schema_version` | `integer` | Versao do contrato. |
| `status` | `recurrence_status` | Active/paused/ended. |
| `last_generated_until` | `local_date` | Janela ja processada. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

## 12.2 `recurrence_occurrences`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `rule_id` | `uuid` | FK regra. |
| `occurrence_number` | `integer` | Sequencia. |
| `occurrence_date` | `local_date` | Data financeira ou data base. |
| `target_type` | `recurrence_target_type` | Copia para indice/dedupe. |
| `target_id` | `uuid` | Entidade materializada. |
| `status` | `enum_text` | `projected`, `materialized`, `skipped`, `cancelled`. |
| `idempotency_key` | `text_short` | Chave estavel do job. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

ERD:

```text
recurrence_rules
  |-- recurrence_occurrences
          |-- financial_commitments
          |-- transactions
          |-- events
          |-- tasks
```

Regra:

- materializar apenas janela movel limitada, aproximadamente proximos 12 meses;
- nao gerar infinitamente;
- job idempotente mantem essa janela atualizada;
- edicao da regra deve preservar ocorrencias ja realizadas e recalcular somente ocorrencias futuras nao materializadas/nao editadas;
- o modelo deve permitir evoluir para comportamentos "somente esta ocorrencia" e "esta e proximas", mesmo que a UI da Fase 1 seja simples.

---

# 13. `credit_card_invoices` / `invoice_items` / `invoice_payments`

Fatura e dominio explicito. O servico de fatura calcula ciclo, atribuicao de compras, fechamento, vencimento, total, pagamentos parciais, saldo restante, juros, ajustes, reversoes e visibilidade em relatorios.

## 13.1 `credit_card_invoices`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `credit_card_id` | `uuid` | FK cartao. |
| `reference_month` | `year_month` | Mes da fatura. |
| `cycle_start_date` | `local_date` | Inicio do ciclo. |
| `closing_date` | `local_date` | Fechamento. |
| `due_date` | `local_date` | Vencimento. |
| `manual_closing_adjustment_days` | `integer` | Ajuste controlado. |
| `manual_closing_adjustment_reason` | `text_long` | Obrigatorio se ajuste. |
| `calculated_total_amount` | `money_decimal` | Total dos itens calculado pelo servico. |
| `manual_adjustment_amount` | `money_decimal` | Ajustes manuais controlados. |
| `invoice_total_amount` | `money_decimal` | Total financeiro da fatura: itens + ajustes. |
| `total_paid_amount` | `money_decimal` | Soma de pagamentos principais postados, liquida de reversoes. |
| `paid_interest_amount` | `money_decimal` | Juros pagos, liquidos de reversoes. |
| `remaining_amount` | `money_decimal` | Saldo restante. |
| `status` | `invoice_status` | Open/closed/due/overdue/partially_paid/paid/cancelled. |
| `is_hidden_from_reports` | `boolean` | Ocultacao herdada do AFR. |
| `closed_at` | `timestamp_tz` | Quando fechada. |
| `paid_at` | `timestamp_tz` | Quando liquidada. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Regras:

- `is_hidden_from_reports` e flag independente, nao status financeiro;
- invoice pode estar `open`, `closed`, `due`, `overdue`, `partially_paid` ou `paid` independentemente de estar oculta em determinados relatorios;
- uma invoice pode ter multiplos pagamentos;
- status deve ser coerente com `invoice_total_amount`, `total_paid_amount`, `remaining_amount`, datas e reversoes;
- fatura `paid` nao deve ser reaberta/alterada silenciosamente;
- correcao de fatura paga exige operacao explicita de reversao do pagamento.

## 13.2 `invoice_items`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `invoice_id` | `uuid` | FK fatura. |
| `credit_card_id` | `uuid` | FK cartao para consultas. |
| `item_type` | `invoice_item_type` | Compra, parcela, juros etc. |
| `transaction_id` | `uuid` | FK transacao, se compra postada. |
| `installment_id` | `uuid` | FK parcela, se aplicavel. |
| `import_item_id` | `uuid` | Linha importada de origem. |
| `description` | `text_short` | Descricao exibida. |
| `amount` | `money_decimal` | Valor. |
| `purchase_date` | `local_date` | Data da compra. |
| `competence_date` | `local_date` | Opcional. |
| `category_id` | `uuid` | Categoria. |
| `subcategory_id` | `uuid` | Subcategoria. |
| `adjustment_type` | `invoice_adjustment_type` | Obrigatorio apenas para ajuste/juros/taxa/reembolso/reversao. |
| `adjustment_reason` | `text_long` | Motivo para ajuste manual. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

## 13.3 `invoice_payments`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `invoice_id` | `uuid` | FK fatura. |
| `account_id` | `uuid` | Conta usada para pagar. |
| `payment_transaction_id` | `uuid` | Transacao bancaria de pagamento. |
| `payment_type` | `invoice_payment_type` | Pagamento normal ou reversao de pagamento. |
| `payment_date` | `local_date` | Data financeira. |
| `principal_amount` | `money_decimal` | Valor pago da fatura. |
| `interest_amount` | `money_decimal` | Juros/multa. |
| `status` | `invoice_payment_status` | Draft/posted/reversed. |
| `reversal_of_payment_id` | `uuid` | Pagamento original quando este registro for reversao. |
| `reversed_by_payment_id` | `uuid` | Pagamento de reversao, se este pagamento foi revertido. |
| `reversal_transaction_id` | `uuid` | Transacao financeira de reversao, se aplicavel. |
| `reversed_at` | `timestamp_tz` | Quando revertido. |
| `reversal_reason` | `text_long` | Motivo/contexto da reversao. |
| `notes` | `text_long` | Opcional. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Reversao de pagamento:

```text
invoice(status=paid)
  -> create invoice_payment(payment_type=payment_reversal, status=posted, reversal_of_payment_id=original)
  -> mark original payment as reversed with reversed_by_payment_id
  -> create reversing account movement as required
  -> recalculate total_paid_amount and remaining_amount
  -> invoice status returns to closed/partially_paid/overdue according to dates and remaining balance
  -> write audit_log with actor, original payment, reversal, date and reason
```

O pagamento original nunca deve ser apagado como mecanismo de correcao.

ERD:

```text
credit_cards
  |-- credit_card_invoices(reference_month)
        |-- invoice_items
        |     |-- transactions(card purchases)
        |     |-- installments
        |     |-- import_items
        |
        |-- invoice_payments
              |-- transactions(account cash outflow)
              |-- invoice_payments(payment reversal linkage)
```

Regra de saldo:

```text
credit card purchase:
  affects invoice and card reports
  does not reduce account balance

invoice payment:
  reduces account balance
  settles invoice
```

---

# 14. `budgets` / planning

## 14.1 `budgets`

Representa um envelope mensal/anual de planejamento.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Ex.: Orcamento mensal. |
| `period_month` | `year_month` | Competencia mensal. |
| `status` | `budget_status` | Draft/active/closed. |
| `currency` | `currency_code` | Default `BRL`. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Unicidade sugerida:

- um budget ativo por usuario e mes para Fase 1.

## 14.2 `budget_lines`

Representa valores planejados por categoria/subcategoria.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `budget_id` | `uuid` | FK budget. |
| `category_id` | `uuid` | Categoria. |
| `subcategory_id` | `uuid` | Opcional. |
| `planned_amount` | `money_decimal` | Valor planejado. |
| `line_type` | `category_type` | Receita, despesa fixa etc. |
| `notes` | `text_long` | Opcional. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Unicidade:

- `budget_id + category_id + subcategory_id`.

## 14.3 `planning_items`

Itens planejados especificos que ainda nao sao compromissos firmes.

Uso:

- viagem planejada;
- compra desejada com impacto selecionado;
- gasto previsto sem obrigacao;
- receita esperada ainda incerta.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `title` | `text_short` | Titulo. |
| `description` | `text_long` | Opcional. |
| `planning_type` | `transaction_type` | Receita/despesa/investimento. |
| `amount` | `money_decimal` | Valor estimado. |
| `period_month` | `year_month` | Competencia. |
| `planned_date` | `local_date` | Opcional. |
| `category_id` | `uuid` | Opcional. |
| `subcategory_id` | `uuid` | Opcional. |
| `status` | `planning_item_status` | Planned/expected/committed/realized. |
| `affects_forecast` | `boolean` | Se entra na projecao. |
| `commitment_id` | `uuid` | Quando virar compromisso. |
| `transaction_id` | `uuid` | Quando virar realizado. |
| `origin_type` | `origin_type` | Manual/wishlist/etc. Simulation nao cria planning real na Fase 1. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

---

# 15. `financial_goals`

Metas preservam o AFR, mas com baseline persistido para evitar recalc historico instavel.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `goal_type` | `financial_goal_type` | Save/reduce/increase/pay debt etc. |
| `title` | `text_short` | Nome da meta. |
| `description` | `text_long` | Opcional. |
| `target_amount` | `money_decimal` | Para metas em valor. |
| `target_percentage` | `decimal_precise` | Para metas percentuais. |
| `target_date` | `local_date` | Prazo. |
| `start_date` | `local_date` | Data inicial. |
| `baseline_amount` | `money_decimal` | Valor base congelado. |
| `baseline_period_start` | `local_date` | Inicio da base. |
| `baseline_period_end` | `local_date` | Fim da base. |
| `current_amount_override` | `money_decimal` | Opcional/manual. |
| `category_id` | `uuid` | Categoria relevante. |
| `subcategory_id` | `uuid` | Opcional. |
| `credit_card_id` | `uuid` | Para quitar divida/fatura. |
| `account_id` | `uuid` | Conta/reserva associada. |
| `status` | `financial_goal_status` | Active/completed/etc. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `completed_at` | `timestamp_tz` | Conclusao. |

Regras:

- progresso calculado por servico;
- baseline salvo no momento da criacao;
- meta pode ser considerada em forecast quando explicitamente configurada em camada de planejamento;
- categorias usam enum canonico, evitando mistura `renda`/`income` e `investimento`/`investment`.

---

# 16. `simulation_scenarios` com schema validado/versionado

O simulador do AFR e obrigatorio como ferramenta analitica da Fase 1. A melhoria e nao persistir JSON livre sem contrato.

Regra central aprovada:

- simulation e analysis-only na Fase 1;
- dados de simulacao ficam isolados dos fatos financeiros reais;
- um cenario nao modifica automaticamente `transactions`, `financial_commitments`, `balances`, `planning_items` ou `provisions`;
- transformacao explicita de cenario em planejamento pode ser criada em Fase 2+, mas nao pertence a este contrato.

## 16.1 `simulation_scenarios`

Representa o container estavel de um cenario.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Nome. |
| `description` | `text_long` | Opcional. |
| `status` | `simulation_status` | Draft/active/archived. |
| `current_version_id` | `uuid` | FK versao atual. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `archived_at` | `timestamp_tz` | Arquivo. |

Limite de produto herdado:

- ate 5 cenarios ativos por usuario na Fase 1, salvo decisao posterior.

## 16.2 `simulation_scenario_versions`

Guarda versoes imutaveis de parametros, baseline e resultados.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `scenario_id` | `uuid` | FK scenario. |
| `version_number` | `integer` | Sequencial. |
| `schema_version` | `integer` | Versao do contrato de payload. |
| `simulation_months` | `integer` | 1 a 12 na Fase 1. |
| `base_month` | `year_month` | Mes-base. |
| `baseline_period_start` | `local_date` | Inicio usado no baseline. |
| `baseline_period_end` | `local_date` | Fim usado no baseline. |
| `inputs_payload` | `json_contract` | Parametros validados. |
| `baseline_snapshot` | `json_contract` | Snapshot auditavel. |
| `results_payload` | `json_contract` | Resultado reproduzivel. |
| `assumptions_payload` | `json_contract` | Premissas explicitas. |
| `created_at` | `timestamp_tz` | Criacao. |

## 16.3 Contrato logico do payload

`inputs_payload` deve obedecer a schema versionado no codigo, por exemplo:

```text
SimulationInputsV1
  months: 1..12
  incomeChanges[]
  expenseChanges[]
  investmentChanges[]
  oneTimeTransactions[]
  recurringAdjustments[]
  linkedGoalIds[]
```

Cada modificacao deve conter:

- `change_kind`: `category_adjustment` ou `new_transaction`;
- `transaction_type`;
- `amount_mode`: `absolute` ou `percentage`;
- `amount_value`;
- `category_id` opcional;
- `subcategory_id` opcional;
- `start_month`;
- `end_month` opcional;
- `recurrence_mode`: `once` ou `monthly`;
- `description`;
- `affects_cash_view`;
- `affects_economic_view`.

Regra:

- JSON e permitido apenas como documento versionado, validado e testado;
- nenhuma UI deve gravar estrutura arbitraria;
- resultados antigos devem continuar interpretaveis pela versao salva.
- resultados de simulacao nao sao source of truth financeiro e nao devem ser consumidos como fato realizado.

---

# 17. `events` / `tasks`

## 17.1 `events`

Eventos podem ou nao ter impacto financeiro. Evento nao e transacao.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `title` | `text_short` | Titulo. |
| `description` | `text_long` | Opcional. |
| `event_type` | `event_type` | Tipo. |
| `status` | `event_status` | Scheduled/completed/etc. |
| `is_all_day` | `boolean` | Dia inteiro. |
| `start_date` | `local_date` | Para dia inteiro ou agrupamento. |
| `end_date` | `local_date` | Opcional. |
| `start_at` | `timestamp_tz` | Para evento com horario. |
| `end_at` | `timestamp_tz` | Para evento com horario. |
| `timezone` | `timezone_name` | Default `America/Sao_Paulo`. |
| `estimated_amount` | `money_decimal` | Valor previsto opcional. |
| `financial_impact_type` | `commitment_type` | Receita/despesa/etc., opcional. |
| `affects_forecast` | `boolean` | Se entra no forecast. |
| `category_id` | `uuid` | Opcional. |
| `account_id` | `uuid` | Opcional. |
| `credit_card_id` | `uuid` | Opcional. |
| `recurrence_rule_id` | `uuid` | Opcional. |
| `financial_commitment_id` | `uuid` | Quando gerar compromisso. |
| `origin_type` | `origin_type` | Manual/subscription/obligation etc. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `archived_at` | `timestamp_tz` | Arquivamento. |

## 17.2 `tasks`

Tasks sao operacionais e podem se vincular a evento/compromisso/transacao.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `title` | `text_short` | Titulo. |
| `description` | `text_long` | Opcional. |
| `status` | `task_status` | Pending/completed/etc. |
| `priority` | `task_priority` | Baixa/media/alta/urgente. |
| `due_date` | `local_date` | Vencimento sem horario. |
| `due_at` | `timestamp_tz` | Vencimento com horario. |
| `timezone` | `timezone_name` | Default se `due_at`. |
| `category_id` | `uuid` | Categoria opcional. |
| `event_id` | `uuid` | Vinculo com evento. |
| `financial_commitment_id` | `uuid` | Vinculo com compromisso. |
| `transaction_id` | `uuid` | Vinculo com realizado. |
| `recurrence_rule_id` | `uuid` | Opcional. |
| `completed_at` | `timestamp_tz` | Conclusao. |
| `origin_type` | `origin_type` | Manual/recurrence/etc. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `archived_at` | `timestamp_tz` | Arquivamento. |

ERD:

```text
events
  |-- financial_commitments(optional)
  |-- tasks(optional)

tasks
  |-- events(optional)
  |-- financial_commitments(optional)
  |-- transactions(optional)
```

---

# 18. `financial_commitments` e conversao commitment -> transaction sem duplicidade

Compromisso financeiro representa futuro, previsto, confirmado ou vencido. Transacao representa realizado.

Modelo aprovado:

- confirmacao manual e o comportamento padrao para realizar um compromisso;
- automacao so e permitida quando explicitamente configurada e baseada em regra objetiva;
- importacoes/matching podem sugerir vinculo entre transacao realizada e compromisso existente;
- o valor esperado/comprometido deve ser preservado mesmo se o valor realizado for diferente.

## 18.1 `financial_commitments`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `commitment_type` | `commitment_type` | Receita/despesa/investimento/transferencia. |
| `status` | `commitment_status` | Expected/confirmed/overdue/realized/cancelled. |
| `title` | `text_short` | Titulo. |
| `description` | `text_long` | Opcional. |
| `expected_amount` | `money_decimal` | Valor esperado original. |
| `committed_amount` | `money_decimal` | Valor confirmado, se diferente do esperado. |
| `actual_amount` | `money_decimal` | Valor realizado, preenchido pela transacao vinculada. |
| `variance_amount` | `money_decimal_signed` | `actual_amount - expected/committed_amount`. |
| `currency` | `currency_code` | Default `BRL`. |
| `due_date` | `local_date` | Data financeira esperada. |
| `competence_date` | `local_date` | Competencia economica opcional. |
| `category_id` | `uuid` | Categoria. |
| `subcategory_id` | `uuid` | Opcional. |
| `account_id` | `uuid` | Conta esperada. |
| `credit_card_id` | `uuid` | Cartao esperado. |
| `event_id` | `uuid` | Evento relacionado. |
| `task_id` | `uuid` | Task relacionada. |
| `installment_id` | `uuid` | Parcela origem. |
| `subscription_id` | `uuid` | Assinatura origem. |
| `annual_obligation_id` | `uuid` | Obrigacao origem. |
| `recurrence_occurrence_id` | `uuid` | Ocorrencia origem. |
| `invoice_id` | `uuid` | Fatura origem, se aplicavel. |
| `affects_forecast` | `boolean` | Default true. |
| `auto_realization_enabled` | `boolean` | Default false. |
| `auto_realization_rule_key` | `text_short` | Regra objetiva quando automacao for permitida. |
| `matched_transaction_id` | `uuid` | Sugestao/resultado de matching com transacao existente. |
| `match_confidence` | `decimal_precise` | Confianca do matching, opcional. |
| `match_status` | `enum_text` | `suggested`, `accepted`, `rejected`, `auto_accepted`. |
| `origin_type` | `origin_type` | Origem canonica. |
| `source_type` | `enum_text` | Origem generica. |
| `source_id` | `uuid` | Id da origem. |
| `source_occurrence_key` | `text_short` | Dedupe/idempotencia. |
| `realized_transaction_id` | `uuid` | Transacao criada na conversao. |
| `realized_at` | `timestamp_tz` | Quando convertido. |
| `cancelled_at` | `timestamp_tz` | Cancelamento. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

## 18.2 Conversao sem duplicidade

Fluxo atomico:

```text
financial_commitment(status=confirmed/expected/overdue)
  -> validate ownership and status
  -> preserve expected_amount/committed_amount
  -> create transaction with realized_from_commitment_id
  -> set actual_amount from transaction.amount
  -> calculate variance_amount
  -> set commitment.status = realized
  -> set commitment.realized_transaction_id
  -> write audit_log
```

Unicidades:

- `transactions.realized_from_commitment_id` unico;
- `financial_commitments.realized_transaction_id` unico;
- `financial_commitments(user_id, source_type, source_id, source_occurrence_key)` unico quando origem automatica existir.

Matching por importacao:

```text
imported transaction candidate
  -> match existing financial_commitment by user/date/amount tolerance/category/source
  -> suggest matched_transaction_id or commitment link
  -> user accepts by default flow, unless objective auto rule is enabled
  -> no duplicate commitment realization is created
```

Exemplo de variancia:

```text
expected_amount = 1000
actual transaction amount = 1100
variance_amount = +100
```

Invariante:

```text
An amount cannot be counted as forecast commitment and realized transaction in the same view unless the view explicitly compares forecast vs realized.
Expected value is preserved even after realization.
```

---

# 19. `shopping_lists` / items e `wishlist_items`

## 19.1 `shopping_lists`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Nome da lista. |
| `description` | `text_long` | Opcional. |
| `status` | `shopping_list_status` | Active/archived/deleted. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `archived_at` | `timestamp_tz` | Arquivo. |

## 19.2 `shopping_list_items`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `shopping_list_id` | `uuid` | FK lista. |
| `name` | `text_short` | Item. |
| `description` | `text_long` | Opcional. |
| `quantity` | `decimal_precise` | Opcional. |
| `unit` | `text_short` | Opcional. |
| `estimated_unit_price` | `money_decimal` | Opcional. |
| `actual_unit_price` | `money_decimal` | Opcional. |
| `estimated_total_amount` | `money_decimal` | Derivado/snapshot. |
| `status` | `shopping_item_status` | Open/purchased/etc. |
| `affects_planning` | `boolean` | Se entra em planejamento. |
| `affects_forecast` | `boolean` | Se entra em forecast. |
| `category_id` | `uuid` | Opcional. |
| `transaction_id` | `uuid` | Compra confirmada, se criada. |
| `purchased_at` | `timestamp_tz` | Quando comprado. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Regra:

- item de lista nao gera transacao automaticamente.

## 19.3 `wishlist_items`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Item desejado. |
| `description` | `text_long` | Opcional. |
| `estimated_price` | `money_decimal` | Valor estimado. |
| `max_price` | `money_decimal` | Opcional. |
| `currency` | `currency_code` | Default `BRL`. |
| `priority` | `task_priority` | Reaproveita prioridade simples. |
| `url` | `text_long` | Link externo. |
| `desired_date` | `local_date` | Opcional. |
| `status` | `wishlist_status` | Desired/evaluating/etc. |
| `category_id` | `uuid` | Opcional. |
| `affects_planning` | `boolean` | Se entra em planejamento. |
| `affects_forecast` | `boolean` | Se entra em forecast. |
| `planning_item_id` | `uuid` | Se gerar item planejado. |
| `transaction_id` | `uuid` | Se comprado e registrado. |
| `purchased_at` | `timestamp_tz` | Opcional. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

---

# 20. `subscriptions`

Assinaturas sao compromissos recorrentes de servicos.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `service_name` | `text_short` | Nome do servico. |
| `description` | `text_long` | Opcional. |
| `amount` | `money_decimal` | Valor por cobranca. |
| `currency` | `currency_code` | Default `BRL`. |
| `frequency` | `recurrence_frequency` | Weekly/monthly/yearly. |
| `start_date` | `local_date` | Inicio. |
| `end_date` | `local_date` | Opcional. |
| `next_charge_date` | `local_date` | Proxima cobranca. |
| `account_id` | `uuid` | Conta preferencial. |
| `credit_card_id` | `uuid` | Cartao preferencial. |
| `category_id` | `uuid` | Categoria. |
| `subcategory_id` | `uuid` | Opcional. |
| `recurrence_rule_id` | `uuid` | Regra associada. |
| `status` | `subscription_status` | Active/paused/cancelled. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `cancelled_at` | `timestamp_tz` | Cancelamento. |

Fluxo:

```text
subscriptions
  -> recurrence_rules
  -> recurrence_occurrences
  -> financial_commitments
  -> events/calendar
  -> transactions or invoice_items when charged/paid
```

---

# 21. `assets` / `liabilities` / net worth

Patrimonio liquido e calculado, nao digitado como verdade isolada.

Investimentos na Fase 1 nao usam portfolio engine detalhado. O modelo usa `transactions`, `assets` e `asset_valuations` para preservar feature parity do AFR, sem posicao granular por ticker, quantidade, preco medio ou rentabilidade por produto.

```text
net worth =
  accounts balances
  + assets latest valuations
  - liabilities latest balances
  - unpaid credit card invoices
```

Faturas de cartao ainda nao pagas devem ser consideradas passivos no patrimonio liquido economico. O servico de Net Worth deve evitar double counting quando a mesma obrigacao ja estiver representada por `liabilities` ou outro passivo manual.

## 21.1 `assets`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Nome. |
| `asset_type` | `asset_type` | Investimento, veiculo, imovel etc. |
| `description` | `text_long` | Opcional. |
| `linked_account_id` | `uuid` | Opcional, se conta representa o ativo. |
| `acquisition_date` | `local_date` | Opcional. |
| `acquisition_amount` | `money_decimal` | Opcional. |
| `currency` | `currency_code` | Default `BRL`. |
| `status` | `enum_text` | `active`, `sold`, `archived`. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `archived_at` | `timestamp_tz` | Arquivo. |

## 21.2 `asset_valuations`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `asset_id` | `uuid` | FK ativo. |
| `valuation_date` | `local_date` | Data-base. |
| `gross_value` | `money_decimal` | Valor bruto. |
| `net_value` | `money_decimal` | Valor liquido opcional. |
| `source_type` | `origin_type` | Manual/import/system. |
| `source_description` | `text_short` | Ex.: FIPE/manual. |
| `created_at` | `timestamp_tz` | Criacao. |

## 21.3 `liabilities`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `name` | `text_short` | Nome. |
| `liability_type` | `liability_type` | Emprestimo, financiamento etc. |
| `description` | `text_long` | Opcional. |
| `linked_credit_card_id` | `uuid` | Opcional. |
| `linked_account_id` | `uuid` | Opcional. |
| `start_date` | `local_date` | Opcional. |
| `original_amount` | `money_decimal` | Valor inicial. |
| `currency` | `currency_code` | Default `BRL`. |
| `status` | `enum_text` | `active`, `paid`, `archived`. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `archived_at` | `timestamp_tz` | Arquivo. |

## 21.4 `liability_balances`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `liability_id` | `uuid` | FK passivo. |
| `balance_date` | `local_date` | Data-base. |
| `outstanding_amount` | `money_decimal` | Saldo devedor. |
| `source_type` | `origin_type` | Manual/system. |
| `created_at` | `timestamp_tz` | Criacao. |

---

# 22. `annual_obligations` e `provisions`

Obrigacoes anuais representam despesas como IPVA, IPTU, seguros, anuidades e taxas. Elas devem gerar `financial_commitments` correspondentes aos pagamentos de caixa. Provisionamento separa custo economico mensal do pagamento real.

## 22.1 `annual_obligations`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `obligation_type` | `annual_obligation_type` | IPVA/IPTU/etc. |
| `title` | `text_short` | Titulo. |
| `description` | `text_long` | Opcional. |
| `fiscal_year` | `integer` | Exercicio. |
| `jurisdiction_country` | `text_short` | Default `BR`. |
| `jurisdiction_state` | `text_short` | Para IPVA/IPTU. |
| `jurisdiction_city` | `text_short` | Para IPTU. |
| `asset_id` | `uuid` | Veiculo/imovel, opcional. |
| `assessed_base_amount` | `money_decimal` | Valor venal/base. |
| `rate_percentage` | `decimal_precise` | Aliquota. |
| `calculated_amount` | `money_decimal` | Valor calculado. |
| `manual_amount` | `money_decimal` | Override manual. |
| `final_amount` | `money_decimal` | Valor usado. |
| `currency` | `currency_code` | Default `BRL`. |
| `due_date` | `local_date` | Vencimento principal. |
| `installment_count` | `integer` | 1 para a vista. |
| `payment_method` | `payment_method` | Previsto. |
| `account_id` | `uuid` | Conta prevista. |
| `credit_card_id` | `uuid` | Cartao previsto. |
| `category_id` | `uuid` | Categoria. |
| `subcategory_id` | `uuid` | Opcional. |
| `status` | `obligation_status` | Active/paid/overdue. |
| `provision_enabled` | `boolean` | Ativa provisionamento. |
| `recurrence_rule_id` | `uuid` | Opcional para obrigacoes recorrentes anuais. |
| `manual_override_reason` | `text_long` | Obrigatorio se override relevante. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |
| `archived_at` | `timestamp_tz` | Arquivo. |

## 22.2 `annual_obligation_installments`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `annual_obligation_id` | `uuid` | FK obrigacao. |
| `installment_number` | `integer` | 1..N. |
| `amount` | `money_decimal` | Valor. |
| `due_date` | `local_date` | Vencimento. |
| `status` | `commitment_status` | Expected/realized/etc. |
| `financial_commitment_id` | `uuid` | Compromisso gerado. |
| `transaction_id` | `uuid` | Pagamento realizado. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Unicidade:

- `annual_obligation_id + installment_number`.

## 22.3 `provisions`

Representa custo economico mensal derivado de obrigacao anual.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `annual_obligation_id` | `uuid` | FK obrigacao. |
| `provision_month` | `year_month` | Mes economico. |
| `amount` | `money_decimal` | Valor provisionado. |
| `currency` | `currency_code` | Default `BRL`. |
| `status` | `provision_status` | Active/completed. |
| `affects_economic_view` | `boolean` | Default true. |
| `affects_cash_view` | `boolean` | Deve ser false. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Invariante:

```text
provision is not payment
provision is not transaction
provision affects economic/planning view
transaction affects cash/realized view
annual obligation installments generate financial_commitments for cash payments
```

---

# 23. `economic_indicators` / `economic_indicator_values`

Dados macro sao normalizados e guardados localmente para performance, auditabilidade e reproducibilidade.

## 23.1 `economic_indicators`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `code` | `indicator_code` | Selic/CDI/IPCA. |
| `name` | `text_short` | Nome exibido. |
| `source_name` | `text_short` | BCB/IBGE/B3 etc. |
| `source_url` | `text_long` | Referencia. |
| `frequency` | `enum_text` | Daily/monthly/yearly. |
| `unit` | `enum_text` | Percent/index/rate. |
| `currency` | `currency_code` | Quando aplicavel. |
| `is_active` | `boolean` | Ativo. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

## 23.2 `economic_indicator_values`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `indicator_id` | `uuid` | FK indicador. |
| `reference_date` | `local_date` | Data-base. |
| `reference_month` | `year_month` | Para series mensais. |
| `value` | `decimal_precise` | Taxa/indice. |
| `value_type` | `indicator_value_type` | Actual/estimated/assumption. |
| `source_name` | `text_short` | Fonte do valor. |
| `source_url` | `text_long` | Opcional. |
| `fetched_at` | `timestamp_tz` | Quando consultado. |
| `created_at` | `timestamp_tz` | Criacao. |

Unicidade:

- `indicator_id + reference_date + value_type`.

---

# 24. `import_batches` / `import_items` / `merchant_category_mappings` e upload metadata

Importacao preserva o fluxo AFR: upload, senha opcional em memoria, extracao/parsing, sugestao, aprendizado, revisao humana, commit atomico e auditoria.

## 24.1 `import_batches`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `import_type` | `enum_text` | `credit_card_invoice_pdf` na Fase 1. |
| `status` | `import_batch_status` | Uploaded/processing/etc. |
| `credit_card_id` | `uuid` | Cartao selecionado. |
| `invoice_id` | `uuid` | Fatura alvo/criada. |
| `reference_month` | `year_month` | Mes selecionado. |
| `original_file_name` | `text_short` | Nome do arquivo. |
| `file_mime_type` | `text_short` | Tipo validado. |
| `file_size_bytes` | `integer` | Tamanho. |
| `file_sha256` | `text_short` | Hash para dedupe/auditoria. |
| `storage_bucket` | `text_short` | Bucket privado. |
| `storage_path` | `text_long` | Caminho privado. |
| `retention_policy` | `enum_text` | Default `retain_original`; permite `manual_deleted` depois. |
| `storage_deleted_at` | `timestamp_tz` | Quando PDF original foi excluido manualmente. |
| `storage_deleted_by_user_id` | `uuid` | Quem solicitou exclusao. |
| `password_provided` | `boolean` | Apenas indicador, sem salvar senha. |
| `parser_provider` | `text_short` | Ex.: internal/openai/gemini/etc. |
| `parser_model` | `text_short` | Opcional. |
| `parser_schema_version` | `integer` | Contrato do parser. |
| `parsed_item_count` | `integer` | Quantidade identificada. |
| `included_item_count` | `integer` | Quantidade confirmada. |
| `duplicate_item_count` | `integer` | Suspeitas/ignoradas. |
| `error_message` | `text_long` | Sem segredo. |
| `reviewed_by_user_id` | `uuid` | Usuario que revisou. |
| `reviewed_at` | `timestamp_tz` | Revisao. |
| `committed_at` | `timestamp_tz` | Commit. |
| `created_at` | `timestamp_tz` | Criacao/upload. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

## 24.2 `import_items`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `batch_id` | `uuid` | FK lote. |
| `line_number` | `integer` | Sequencia no parse. |
| `raw_description` | `text_short` | Texto original. |
| `normalized_description` | `text_short` | Normalizado. |
| `merchant_name` | `text_short` | Extraido. |
| `merchant_key` | `text_short` | Normalizado para aprendizado. |
| `transaction_date` | `local_date` | Data da compra. |
| `amount` | `money_decimal` | Valor. |
| `currency` | `currency_code` | Default `BRL`. |
| `installment_number` | `integer` | Parcela atual, se houver. |
| `total_installments` | `integer` | Total, se houver. |
| `suggested_category_id` | `uuid` | Sugestao. |
| `suggested_subcategory_id` | `uuid` | Sugestao. |
| `reviewed_category_id` | `uuid` | Categoria confirmada. |
| `reviewed_subcategory_id` | `uuid` | Subcategoria confirmada. |
| `reviewed_description` | `text_short` | Ajuste humano. |
| `reviewed_amount` | `money_decimal` | Ajuste humano. |
| `reviewed_transaction_date` | `local_date` | Ajuste humano. |
| `status` | `import_item_status` | Parsed/included/etc. |
| `dedupe_key` | `text_short` | Chave normalizada. |
| `duplicate_of_transaction_id` | `uuid` | Se identificado. |
| `duplicate_of_import_item_id` | `uuid` | Duplicidade no lote. |
| `matched_commitment_id` | `uuid` | Compromisso sugerido/encontrado para evitar duplicidade. |
| `match_status` | `enum_text` | `suggested`, `accepted`, `rejected`, `not_applicable`. |
| `transaction_id` | `uuid` | Transacao criada no commit. |
| `installment_plan_id` | `uuid` | Plano criado. |
| `installment_id` | `uuid` | Parcela criada. |
| `invoice_item_id` | `uuid` | Item de fatura criado. |
| `parser_confidence` | `decimal_precise` | Opcional. |
| `parser_payload` | `json_contract` | Saida validada/versionada. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Deduplicacao herdada/melhorada:

```text
dedupe_key =
  user_id
  + credit_card_id
  + normalized_description/merchant_key
  + amount
  + transaction_date or invoice reference window
  + installment_number
  + total_installments
```

## 24.3 `merchant_category_mappings`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Owner. |
| `merchant_key` | `text_short` | Normalizado. |
| `display_merchant_name` | `text_short` | Nome amigavel. |
| `category_id` | `uuid` | Categoria aprendida. |
| `subcategory_id` | `uuid` | Opcional. |
| `hit_count` | `integer` | Contagem. |
| `last_used_at` | `timestamp_tz` | Ultimo uso. |
| `last_import_item_id` | `uuid` | Evidencia. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

Regra:

- aprender somente apos confirmacao humana ou transacao validada;
- correcao humana atualiza mapping;
- mapping e por usuario.

ERD:

```text
import_batches
  |-- import_items
        |-- merchant_category_mappings
        |-- installment_plans / installments
        |-- transactions
        |-- invoice_items
  |-- credit_card_invoices
  |-- audit_logs
```

---

# 25. `audit_logs`

Auditoria registra operacoes sensiveis e eventos relevantes de governanca.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `user_ref` | Usuario dono do recurso afetado, quando aplicavel. |
| `actor_user_id` | `uuid` | Usuario que executou. |
| `actor_role` | `enum_text` | `user`, `admin`, `system`. |
| `action` | `text_short` | Acao canonica. |
| `resource_type` | `enum_text` | Tipo do recurso. |
| `resource_id` | `uuid` | Id do recurso. |
| `severity` | `audit_severity` | Info/warning/critical. |
| `success` | `boolean` | Resultado. |
| `error_code` | `text_short` | Quando falhar. |
| `error_message` | `text_long` | Sem segredo. |
| `before_snapshot` | `json_contract` | Opcional e minimizado. |
| `after_snapshot` | `json_contract` | Opcional e minimizado. |
| `metadata` | `json_contract` | Request/job/import correlation. |
| `correlation_id` | `text_short` | Agrupa operacao. |
| `request_id` | `text_short` | Opcional. |
| `import_batch_id` | `uuid` | Opcional. |
| `ip_address_hash` | `text_short` | Hash, nao IP puro se politica exigir. |
| `user_agent` | `text_long` | Opcional. |
| `created_at` | `timestamp_tz` | Momento do log. |

Acoes obrigatoriamente auditadas:

- login suspeito/bloqueio;
- alteracao de senha;
- exportacao de dados;
- importacao de fatura;
- confirmacao de lote;
- alteracao de papel admin;
- exclusao/arquivamento de dados criticos;
- pagamento/ajuste/reversao de pagamento de fatura;
- alteracoes relevantes em obrigacoes anuais;
- overrides manuais de valores calculados;
- operacoes de service role.

Snapshots de auditoria nao devem armazenar senha de PDF, secrets, service role, tokens ou dados sensiveis alem do minimo necessario. Para operacoes administrativas humanas, snapshots devem evitar valores financeiros individualizados sempre que a finalidade for observabilidade agregada.

RLS/acesso:

- usuario pode ler logs referentes ao proprio `user_id` quando expostos na experiencia do produto;
- Admin humano nao deve receber acesso irrestrito a audit logs com detalhes financeiros individualizados;
- logs tecnicos para Admin devem ser filtrados, mascarados ou agregados;
- processos server-side podem consultar logs detalhados para recovery/migration/investigacao tecnica, com controle e auditoria.

## 25.1 `system_job_runs`

Registra execucoes de jobs idempotentes, falhas e correlacao operacional.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `job_name` | `text_short` | Nome canonico do job. |
| `idempotency_key` | `text_short` | Chave unica por execucao logica. |
| `status` | `enum_text` | `started`, `completed`, `failed`, `skipped`. |
| `started_at` | `timestamp_tz` | Inicio. |
| `finished_at` | `timestamp_tz` | Fim. |
| `processed_count` | `integer` | Quantidade agregada. |
| `created_count` | `integer` | Quantidade agregada. |
| `updated_count` | `integer` | Quantidade agregada. |
| `skipped_count` | `integer` | Quantidade agregada. |
| `error_count` | `integer` | Quantidade agregada. |
| `error_code` | `text_short` | Quando falhar. |
| `error_message` | `text_long` | Sem dados privados. |
| `metadata` | `json_contract` | Agregado, sem dados individualizados. |
| `correlation_id` | `text_short` | Agrupamento. |
| `created_at` | `timestamp_tz` | Criacao. |

Unicidade:

- `job_name + idempotency_key`.

## 25.2 `admin_observability_metrics`

Armazena metricas agregadas para Admin Observability sem permitir acesso a dados financeiros individualizados.

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `metric_date` | `local_date` | Data-base. |
| `metric_window_start_at` | `timestamp_tz` | Inicio da janela. |
| `metric_window_end_at` | `timestamp_tz` | Fim da janela. |
| `module` | `text_short` | Finance/import/jobs/invoices/etc. |
| `metric_name` | `text_short` | Nome canonico. |
| `metric_value` | `decimal_precise` | Valor agregado. |
| `metric_unit` | `text_short` | Count, BRL, ms, percent etc. |
| `aggregation_type` | `enum_text` | Count/sum/min/max/avg/median/p95. |
| `dimension_key` | `text_short` | Dimensao tecnica permitida, opcional. |
| `dimension_value` | `text_short` | Valor tecnico permitido, opcional. |
| `threshold_value` | `decimal_precise` | Opcional para anomalia. |
| `is_anomaly` | `boolean` | Sinal agregada. |
| `source_job_run_id` | `uuid` | FK `system_job_runs`, opcional. |
| `created_at` | `timestamp_tz` | Criacao. |

Regras:

- nao conter `user_id`;
- nao conter merchant, descricao de transacao, conta, cartao, email, nome ou qualquer identificador individual;
- dimensoes permitidas devem ser tecnicas/agregadas, por exemplo modulo, versao do parser, tipo de importacao, status, dia, ambiente;
- metricas podem expor valores agregados como maximo/minimo/media/mediana, inclusive para detectar anomalias financeiras sistemicas, sem permitir drill-down para o registro ou usuario.

---

# 26. `profiles` / `user_roles`

## 26.1 `profiles`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK e FK para usuario de auth. |
| `username` | `text_short` | Opcional/unico se habilitado. |
| `display_name` | `text_short` | Nome exibido. |
| `email` | `text_short` | Preferir email real. |
| `default_currency` | `currency_code` | Default `BRL`. |
| `default_timezone` | `timezone_name` | Default `America/Sao_Paulo`. |
| `locale` | `text_short` | Default `pt-BR`. |
| `last_login_at` | `timestamp_tz` | Ultimo login. |
| `created_at` | `timestamp_tz` | Criacao. |
| `updated_at` | `timestamp_tz` | Atualizacao. |

## 26.2 `user_roles`

Colunas principais:

| Coluna | Tipo conceitual | Observacao |
|---|---|---|
| `id` | `uuid` | PK. |
| `user_id` | `uuid` | FK profile. |
| `role` | `enum_text` | `user`, `admin`. |
| `granted_by_user_id` | `uuid` | Quem concedeu. |
| `granted_at` | `timestamp_tz` | Quando. |
| `revoked_at` | `timestamp_tz` | Revogacao. |

Regra:

- `admin` e papel de governanca e observabilidade consolidada, nao permissao humana para abrir dados financeiros individualizados;
- Admin humano nao possui bypass generico de `user_id`;
- toda promocao/revogacao deve gerar `audit_logs`.

---

# 27. Soft delete/archive strategy onde aplicavel

## 27.1 Arquivar em vez de apagar

Usar `archived_at` para:

- `accounts`;
- `credit_cards`;
- `categories`;
- `budgets`;
- `financial_goals`;
- `simulation_scenarios`;
- `events`;
- `tasks`;
- `shopping_lists`;
- `wishlist_items`;
- `subscriptions`;
- `assets`;
- `liabilities`;
- `annual_obligations`.

## 27.2 Soft delete operacional

Usar `deleted_at` para registros que podem ser removidos da experiencia, mas devem continuar auditaveis:

- `transactions` apenas enquanto `draft` ou ainda nao efetivadas;
- `shopping_list_items`;
- `planning_items`;
- `import_items` em rascunho/revisao.

Transactions `posted` nao devem usar `deleted_at` como mecanismo normal de correcao. Depois de efetivadas, devem usar anulacao/reversao rastreavel.

## 27.3 Anulacao/reversao financeira

Usar `voided_at`, `reversed_at` ou status equivalente para:

- `transactions`;
- `transfers`;
- `invoice_payments`;
- `financial_commitments` realizados por engano.

Reversao deve preservar:

- registro original;
- registro/acao de reversao;
- data;
- ator;
- motivo/contexto quando aplicavel;
- efeitos financeiros correspondentes.

## 27.4 Delecao fisica permitida

Permitida apenas para:

- arquivos temporarios expirados sem necessidade de retencao;
- PDFs originais de fatura somente por exclusao manual posterior, conforme politica da aplicacao e com auditoria;
- rascunhos de importacao cancelados antes de commit;
- dados de teste/dev;
- exclusao completa de conta/usuario em fluxo administrativo atomico e auditado.

---

# 28. `created_at` / `updated_at` conventions

## 28.1 Campos padrao

Tabelas mutaveis:

- `created_at: timestamp_tz`;
- `updated_at: timestamp_tz`.

Tabelas imutaveis/event logs:

- `created_at: timestamp_tz`;
- sem `updated_at`, salvo se houver enriquecimento posterior documentado.

## 28.2 Quem atualiza `updated_at`

Pode ser trigger tecnico simples ou camada de persistencia. Isso e excecao permitida porque nao e regra financeira.

## 28.3 Datas de negocio adicionais

Nao confundir:

- `created_at`: quando entrou no sistema;
- `transaction_date`: data financeira;
- `competence_date`: data de competencia economica;
- `posted_at`: quando foi efetivado;
- `paid_at`: quando pagamento foi registrado;
- `reviewed_at`: quando usuario revisou importacao;
- `fetched_at`: quando dado externo foi consultado.

---

# 29. Traceability/source/origin fields

## 29.1 Campos padrao para entidades financeiras

Entidades financeiras relevantes devem ter:

- `origin_type`;
- `source_type`;
- `source_id`;
- `external_fingerprint`;
- `created_by_user_id` quando diferente de `user_id` for possivel;
- `updated_by_user_id` quando necessario;
- `correlation_id` para operacoes compostas;
- `import_batch_id` ou `job_run_key` quando aplicavel.

## 29.2 Uso por origem

| Origem | Campos esperados |
|---|---|
| Manual | `origin_type=manual`, `created_by_user_id`. |
| Importacao | `origin_type=import`, `import_batch_id`, `import_item_id`, `external_fingerprint`. |
| Recorrencia | `origin_type=recurrence`, `recurrence_rule_id`, `recurrence_occurrence_id`. |
| Parcelamento | `origin_type=installment`, `installment_plan_id`, `installment_id`. |
| Fatura | `origin_type=invoice`, `invoice_id`, `invoice_payment_id`. |
| Assinatura | `origin_type=subscription`, `subscription_id`, `recurrence_occurrence_id`. |
| Obrigacao anual | `origin_type=annual_obligation`, `annual_obligation_id`, `annual_obligation_installment_id`. |
| Migracao AFR | `origin_type=migration`, `legacy_table`, `legacy_id`, `migration_batch_id`. |

## 29.3 Dados legados

Para migracao do AFR, adicionar campos opcionais em tabelas de destino ou tabela auxiliar de mapeamento:

- `legacy_source_system`;
- `legacy_table`;
- `legacy_id`;
- `legacy_payload_hash`;
- `migration_batch_id`.

Esses campos podem ser removidos da experiencia de produto, mas sao uteis na migracao e reconciliacao.

---

# 30. Status lifecycle tables/diagrams

## 30.1 Transacao

```text
draft
  -> posted
       -> voided
       -> reversed
```

Regras:

- somente `posted` entra em saldo, P&L e relatorios realizados;
- `voided` mantem rastro, mas sai de totais operacionais;
- `reversed` aponta para lancamento de reversao quando aplicavel.
- hard delete nao e permitido para `posted`.

## 30.2 Compromisso financeiro

```text
expected
  -> confirmed
       -> realized
       -> overdue
       -> cancelled

expected
  -> overdue
  -> cancelled
```

Regras:

- `expected` e `confirmed` entram no forecast quando `affects_forecast=true`;
- `overdue` continua no forecast ate realizado/cancelado;
- `realized` deve possuir `realized_transaction_id`;
- `expected_amount`/`committed_amount` permanecem preservados apos realizacao;
- `actual_amount` e `variance_amount` sao derivados da transacao realizada;
- `cancelled` nao entra em forecast ativo.

## 30.3 Fatura

```text
open
  -> closed
       -> due
            -> overdue
            -> partially_paid
            -> paid
       -> partially_paid
       -> paid

paid
  -> payment reversal
       -> closed / partially_paid / overdue

open/closed/due/overdue/partially_paid
  -> cancelled
```

Observacao:

- `is_hidden_from_reports` e flag independente e nao faz parte de `invoice_status`;
- fatura paga nao e reaberta silenciosamente; a correcao passa por reversao auditavel de pagamento.

## 30.4 Importacao

```text
uploaded
  -> processing
       -> parsed
            -> reviewing
                 -> ready_to_commit
                      -> committed
                 -> cancelled
       -> failed
```

Regra:

- `committed` exige revisao humana;
- commit do lote e atomico;
- reprocessamento deve criar nova versao/lote ou registrar tentativa, sem sobrescrever silenciosamente dados confirmados.

## 30.5 Recorrencia

```text
active
  -> paused
       -> active
  -> ended
  -> cancelled
```

Ocorrencia:

```text
projected
  -> materialized
  -> skipped
  -> cancelled
```

## 30.6 Obrigacao anual

```text
draft
  -> active
       -> partially_paid
       -> paid
       -> overdue
       -> cancelled
       -> archived
```

## 30.7 Meta

```text
active
  -> completed
  -> paused
       -> active
  -> archived
  -> cancelled
```

---

# 31. Critical invariants

## 31.1 Saldos

- Saldo de conta nao e coluna atualizada manualmente por varias telas.
- `current_balance` mutavel nao e source of truth.
- Saldo deve ser calculado por servico unico a partir de `opening_balance + movements`.
- Snapshots/cache/materializacoes futuras podem existir por performance, mas nao substituem movimentos financeiros.
- Compra de cartao nao reduz conta.
- Pagamento de fatura reduz conta.
- Pagamento revertido deve desfazer/reverter o movimento de conta de forma rastreavel.
- Uso de conta de beneficio reduz o saldo da conta de beneficio.
- Transferencia nao cria receita/despesa em P&L.

## 31.2 P&L e relatorios

- Receita, despesa fixa, despesa variavel e investimento usam `category_type` canonico.
- Transacao de transferencia fica fora de P&L.
- Parcelamento nao duplica total por causa de registro pai.
- Fatura pode ser vista por compra, ciclo ou pagamento, mas a visao deve declarar o regime.
- Faturas de cartao nao pagas entram como passivo no Net Worth economico sem dupla contagem com liabilities manuais.

## 31.3 Datas

- Datas financeiras sao date-only.
- Nenhum calculo financeiro pode converter `transaction_date` por timezone.
- Eventos com horario guardam timestamp com timezone e timezone original.
- Competencia economica e diferente de data de caixa.
- Quando nao houver competencia especifica, `competence_date = transaction_date`.

## 31.4 Faturas

- Uma compra de cartao pertence a uma unica fatura.
- Uma parcela de cartao pertence a uma unica fatura.
- Fatura paga nao recebe itens novos nem alteracao silenciosa.
- Fatura paga so pode ser corrigida por reversao de pagamento explicita e auditavel.
- Fatura suporta pagamentos parciais e multiplos pagamentos.
- `is_hidden_from_reports` nao altera o status financeiro.
- Ajuste manual de fechamento exige motivo.
- Total de fatura deve ser reconciliavel com itens, ajustes e pagamentos.

## 31.5 Parcelamentos

- Plano de parcelas nao e transacao.
- Cada parcela tem identidade propria.
- Soma das parcelas deve bater com total do plano.
- Edicao de plano deve tratar parcelas futuras e preservar realizadas.

## 31.6 Recorrencias

- Job pode rodar duas vezes sem duplicar ocorrencias.
- Regra recorrente materializa janela movel aproximada de 12 meses, nao infinito.
- Ocorrencia manualmente realizada bloqueia duplicata automatica.
- Edicoes de regra nao reescrevem historico realizado.

## 31.7 Compromissos

- Compromisso futuro nao e realizado.
- Converter compromisso em transacao e operacao atomica, por confirmacao manual como padrao.
- Automacao de realizacao exige configuracao explicita e regra objetiva.
- Import/matching pode sugerir vinculo com transacao existente sem duplicar realizado.
- Um compromisso realizado aponta para uma unica transacao.
- Uma transacao originada de compromisso aponta para um unico compromisso.
- Valor esperado/comprometido e valor realizado permanecem separados para variance analysis.

## 31.8 Importacoes

- PDF importado nao cria dados definitivos antes de revisao humana.
- PDF original de fatura e retido em Storage privado apos importacao, salvo exclusao manual posterior auditada.
- Senha de PDF nao e persistida.
- Deduplicacao roda dentro do lote e contra dados existentes.
- Aprendizado de merchant so ocorre apos confirmacao humana.
- Commit de importacao e atomico.

## 31.9 Auditoria e seguranca

- Usuario nao acessa dados de outro usuario.
- Operacao sensivel gera audit log.
- Admin humano nao acessa dados financeiros individualizados de outros usuarios.
- Admin Observability usa apenas metricas agregadas e nao reidentificaveis.
- Service role nunca aparece no frontend.

## 31.10 Sources of truth

- `transactions` sao fatos realizados.
- `financial_commitments` sao obrigacoes/entradas futuras esperadas ou comprometidas.
- `planning_items` sao planejamento ainda nao necessariamente comprometido.
- `provisions` sao apropriacao economica, nao pagamento.
- `simulation_scenarios` sao hipotese analitica isolada.
- Relatorios e forecasts podem combinar camadas, mas precisam tratar cada camada pelo seu significado.
- Nenhuma camada futura/hipotetica deve contaminar fatos financeiros realizados.

---

# 32. Migration considerations from AFR

## 32.1 Nao migrar code parity

Nao migrar:

- triggers antigas como fonte de regra;
- Edge Functions Deno como formato obrigatorio;
- Lovable AI Gateway como dependencia;
- enums misturados;
- transacao pai ficticia de parcelamento;
- helpers de "meio-dia UTC" como solucao permanente;
- JSON livre de simulacao sem schema.
- script descartavel one-shot sem idempotencia/reconciliacao.

## 32.1.1 Principios obrigatorios da migracao AFR

A migracao AFR deve ser:

- repetivel;
- deterministica;
- idempotente;
- reconciliavel;
- executavel multiplas vezes em DEV/test antes de PROD;
- auditavel por lote de migracao.

Mesmo que inicialmente exista apenas um usuario a migrar, nao criar processo descartavel one-shot.

## 32.2 Mapeamento conceitual

| AFR | Planner Vida |
|---|---|
| `profiles` | `profiles` com email real preferencial e timezone/defaults. |
| `user_roles` | `user_roles` com concessao/revogacao auditavel. |
| `accounts` | `accounts` com saldo base e status/archive. |
| `credit_cards` | `credit_cards` com ciclo formal. |
| `categories.parent_id` | `categories` preservando arvore e tipo canonico. |
| `transactions` parceladas pai/filho | `installment_plans` + `installments` + transacoes reais. |
| `transactions` recorrentes | `recurrence_rules` + `recurrence_occurrences` + alvo materializado. |
| `credit_card_invoices` recalculada por triggers | `credit_card_invoices` + `invoice_items` + servico de fatura. |
| `budgets` | `budgets` + `budget_lines` + eventual `planning_items`. |
| `financial_goals` | `financial_goals` com baseline persistido. |
| `simulation_scenarios.modifications JSON` | `simulation_scenarios` + `simulation_scenario_versions` com schema versionado. |
| `category_mappings` | `merchant_category_mappings`. |
| `audit_logs` | `audit_logs` com correlation/request/import ids. |
| jobs/triggers implicitos | `system_job_runs` e servicos explicitos idempotentes. |

## 32.3 Estrategia de migracao de parcelamentos

Para cada grupo antigo:

1. identificar transacao pai `installment_number = 0`, se existir;
2. identificar filhos `installment_number > 0`;
3. criar `installment_plan` com total, quantidade, categoria e origem;
4. criar `installments` para cada parcela;
5. vincular transacoes reais existentes as parcelas correspondentes;
6. garantir que o pai antigo nao entre como transacao real;
7. reconciliar soma das parcelas contra total do plano.

O banco deve aceitar ate 60 parcelas. Quando o dado legado representar compra comum do AFR, a validacao de UI continua limitada a 24 na Fase 1.

## 32.4 Estrategia de migracao de faturas

1. migrar cartoes com `closing_day` e `due_day`;
2. recriar `credit_card_invoices` por cartao e `reference_month`;
3. vincular compras/parcelas a faturas por ciclo;
4. migrar status e pagamentos conhecidos;
5. migrar pagamentos parciais como multiplos `invoice_payments` quando existirem;
6. registrar reversoes de pagamento de forma explicita, sem apagar pagamento original;
7. registrar ajustes manuais quando houver divergencia;
8. manter `is_hidden_from_reports` separado de `invoice_status`;
9. reconciliar totais, pagos, juros, reversoes e saldo restante antes/depois.

## 32.5 Estrategia de migracao de enums

Criar tabela de mapeamento temporaria:

```text
legacy enum -> canonical enum -> label pt-BR
```

Exemplos:

- categoria `renda` -> `income`;
- categoria `fixo` -> `fixed_expense`;
- categoria `variavel` -> `variable_expense`;
- categoria `investimento` -> `investment`;
- pagamento `credit` -> `credit_card`;
- pagamento `transfer` -> `bank_transfer` ou `transfer`, conforme contexto.
- beneficios VA/VR devem preferir conta `type=benefit`; payment methods de beneficio sao classificacao complementar.

## 32.6 Estrategia de migracao de datas

- Tratar colunas financeiras antigas como datas locais de negocio.
- Nao reinterpretar data como instante UTC.
- Validar amostras de transacoes proximas da meia-noite e virada de mes.
- Reconciliar P&L mensal antes/depois.

## 32.7 Reconciliacoes obrigatorias

Antes de considerar migracao correta:

- total de transacoes por mes;
- receitas/despesas/investimentos por mes;
- saldo por conta em datas-chave;
- total por fatura;
- saldo restante por fatura;
- pagamentos de fatura;
- reversoes de pagamento;
- parcelas futuras;
- commitments esperados vs realizados e variancias;
- metas ativas;
- mappings de merchant/categoria;
- contagem de registros por usuario.

## 32.8 Controles de idempotencia da migracao

Cada execucao deve possuir:

- `migration_batch_id`;
- mapeamento legado -> destino;
- hash do payload legado relevante;
- status por etapa;
- relatorio de reconciliacao;
- audit log de execucao.

Chaves naturais/mapeamentos devem impedir duplicar transacoes, parcelas, faturas, commitments, pagamentos e mappings se a migracao for executada novamente.

---

# 33. Resolved Architecture Decisions

As decisoes abaixo estavam abertas na versao logica inicial e ficam resolvidas para o contrato congelado da Fase 1.

1. Modelo da Fase 1 e estritamente individual por `user_id`; sem households/shared spaces.

2. Parcelamentos suportam ate 60 no banco/dominio; UI de compra comum da Fase 1 limita a 24.

3. Fatura paga nao e alterada silenciosamente; correcao ocorre por reversao auditavel de pagamento.

4. Regras de fechamento/vencimento/atribuicao de fatura ficam centralizadas no dominio de invoices, incluindo edge cases de fim de mes.

5. Commitment -> Transaction usa modelo conservador: confirmacao manual por padrao, automacao apenas se explicitamente configurada e objetiva.

6. Valor esperado/comprometido e valor realizado ficam separados para variance analysis.

7. PDF original de fatura deve ser retido em Supabase Storage privado, com exclusao manual posterior auditada.

8. Pagamentos parciais de fatura entram na Fase 1; uma invoice pode possuir multiplos pagamentos.

9. VA/VR/beneficios sao principalmente contas `type=benefit`; payment methods especificos sao complementares.

10. Investimentos na Fase 1 usam `transactions`, `assets` e `asset_valuations`, sem portfolio engine granular.

11. Simulador da Fase 1 e analysis-only e nao altera fatos reais ou planejamento real.

12. Admin humano possui apenas observabilidade agregada; nao acessa dados financeiros individualizados.

13. Migration AFR deve ser repetivel, deterministica, idempotente e reconciliavel.

14. `is_hidden_from_reports` e flag independente e nao status financeiro de invoice.

15. Transactions `posted` nao sofrem hard delete; correcoes usam void/reversal com auditoria.

16. Saldo de contas e derivado de `opening_balance + movements`; cache/snapshot futuro nao e source of truth.

17. `competence_date` e separado de `transaction_date`; default conceitual e `competence_date = transaction_date`.

18. Recorrencias materializam janela movel de aproximadamente 12 meses por job idempotente.

19. Alteracoes em recorrencias afetam somente ocorrencias futuras ainda nao realizadas.

20. Categorias possuem no maximo dois niveis funcionais na Fase 1: categoria -> subcategoria.

21. Modelo e BRL-first com `currency_code`, sem FX engine na Fase 1.

22. Annual obligations geram `financial_commitments` de caixa; `provisions` sao apenas apropriacao economica.

23. Faturas de cartao nao pagas entram como passivo no Net Worth economico, evitando double counting.

24. Sources of truth ficam formalmente separados: transactions, commitments, planning_items, provisions e simulation.

Nao ha `BLOCKING ISSUE` estrutural identificado neste contrato.

---

# ERD consolidado critico

```text
profiles
  |-- accounts
  |     |-- transactions(account_id)
  |     |-- transfers(source_account_id / destination_account_id)
  |     |-- invoice_payments(account_id)
  |
  |-- credit_cards
  |     |-- credit_card_invoices
  |     |     |-- invoice_items
  |     |     |-- invoice_payments
  |     |
  |     |-- transactions(credit_card_id)
  |
  |-- categories
  |     |-- categories(parent_id)
  |     |-- transactions
  |     |-- budget_lines
  |     |-- financial_commitments
  |     |-- merchant_category_mappings
  |
  |-- installment_plans
  |     |-- installments
  |           |-- transactions
  |           |-- invoice_items
  |           |-- financial_commitments
  |
  |-- recurrence_rules
  |     |-- recurrence_occurrences
  |           |-- financial_commitments
  |           |-- events
  |           |-- tasks
  |           |-- transactions
  |
  |-- financial_commitments
  |     |-- transactions(realized_from_commitment_id)
  |     |-- events
  |     |-- tasks
  |
  |-- import_batches
  |     |-- import_items
  |           |-- transactions
  |           |-- installment_plans/installments
  |           |-- invoice_items
  |
  |-- budgets
  |     |-- budget_lines
  |     |-- planning_items
  |
  |-- financial_goals
  |-- simulation_scenarios
  |     |-- simulation_scenario_versions
  |
  |-- subscriptions
  |-- shopping_lists
  |     |-- shopping_list_items
  |-- wishlist_items
  |
  |-- assets
  |     |-- asset_valuations
  |-- liabilities
  |     |-- liability_balances
  |
  |-- annual_obligations
        |-- annual_obligation_installments
        |-- provisions

economic_indicators
  |-- economic_indicator_values

system_job_runs
  |-- admin_observability_metrics

audit_logs
  |-- references any sensitive resource by resource_type/resource_id
```

---

# Requirement self-check

| Requested item | Covered |
|---|---|
| Principios de modelagem | Section 1 |
| Entidades/tabelas propostas | Section 2 |
| Colunas principais e tipos conceituais | Sections 3 and entity sections |
| PK/FK | Section 4 |
| Cardinalidades | Section 4.4 |
| Ownership por `user_id` | Section 5 |
| Enums canonicos internos | Section 6 |
| Constraints e unicidades | Section 7 |
| Indices necessarios | Section 8 |
| RLS por entidade em alto nivel | Section 9 |
| Accounts/cards/categories/transactions/transfers | Section 10 |
| Installment plans/installments | Section 11 |
| Recurrence rules/occurrences | Section 12 |
| Credit card invoices/items/payments | Section 13 |
| Budgets/planning | Section 14 |
| Financial goals | Section 15 |
| Simulation scenarios versionados | Section 16 |
| Events/tasks | Section 17 |
| Financial commitments e conversao sem duplicidade | Section 18 |
| Shopping lists/items e wishlist | Section 19 |
| Subscriptions | Section 20 |
| Assets/liabilities/net worth | Section 21 |
| Annual obligations/provisions | Section 22 |
| Economic indicators/values | Section 23 |
| Imports, merchant mapping e upload metadata | Section 24 |
| Audit logs | Section 25 |
| System job runs | Section 25.1 |
| Admin Observability without individual financial data | Sections 1.12, 9.2, 25.2, 31.9 |
| Profiles/user roles | Section 26 |
| Soft delete/archive | Section 27 |
| `created_at`/`updated_at` | Section 28 |
| Traceability/source/origin | Section 29 |
| Status lifecycles/diagrams | Section 30 |
| Critical invariants | Section 31 |
| Migration considerations from AFR | Section 32 |
| Resolved architecture decisions | Section 33 |
| ERD-style text diagrams | Throughout, plus consolidated ERD |
| No frontend/API/deploy/full SQL migrations | Respected |
