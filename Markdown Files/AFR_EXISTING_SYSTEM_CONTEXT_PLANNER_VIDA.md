# AFR Controle Financeiro - Existing System Context para Planner Vida

Documento consolidado a partir da inspeção do arquivo `afr-controlefinanceiro-main.zip`.

Objetivo: transformar o sistema AFR Controle Financeiro existente em contexto funcional reutilizável para construção do novo app Planner Vida, preservando funcionalidades, regras de negócio, fluxos, dados e UX relevantes, mas sem contaminar a nova arquitetura com detalhes da pilha antiga.

## 1. Leitura Executiva

O código analisado não é uma base Laravel/PHP. O pacote entregue contém uma aplicação React/Vite/TypeScript com Supabase, funções serverless Deno, migrações SQL, componentes shadcn/Radix, Recharts e integração de IA via gateway Lovable para leitura de faturas em PDF.

Para o Planner Vida, o AFR deve ser tratado como referência funcional e de domínio, não como arquitetura-base. A lógica financeira útil está distribuída entre:

- páginas React;
- hooks de cálculo;
- triggers/funções SQL no Supabase;
- funções serverless para autenticação, administração, exportação e importação de faturas;
- convenções de UI, filtros e nomenclatura em português.

O novo app deve preservar o modelo mental do usuário: contas, cartões, transações, categorias, extrato, dashboards, faturas, relatórios, P&L, metas, previsões, simulador, investimentos e disponibilidade de crédito. Porém deve reimplementar as regras em uma arquitetura limpa, centralizada e testável, evitando acoplamento direto a Supabase, Lovable, Deno, React state espalhado, triggers Postgres específicas ou qualquer eventual legado Laravel/PHP citado em contexto anterior.

## 2. Classificação Geral de Migração

| Área | Classificação | Decisão para Planner Vida |
|---|---|---|
| Conceito de usuário com dados financeiros isolados | Preservar como requisito | Todo dado financeiro deve ser multiusuário, isolado por proprietário e auditável. |
| Contas bancárias e saldo inicial | Preservar como requisito | Reimplementar como entidade principal de contas/caixas/carteiras. |
| Cartões de crédito, limite, fechamento e vencimento | Preservar como requisito | Reimplementar com regras formais de ciclo de fatura. |
| Transações: receita, despesa, transferência, investimento | Preservar como requisito | Reimplementar com modelo transacional consistente e validações fortes. |
| Categorias e subcategorias | Preservar como requisito | Reimplementar como taxonomia financeira configurável. |
| Parcelamento e recorrência | Preservar como requisito | Reimplementar com engine própria para séries/parcelas. |
| Extrato com filtros e edição | Preservar como requisito | Reimplementar com melhor paginação, busca e rastreabilidade. |
| Dashboard mensal e gráficos | Adaptar/reimplementar | Manter KPIs e visão mensal, melhorar consistência dos cálculos. |
| Faturas e relatórios de cartão | Preservar como requisito | Reimplementar como domínio robusto de ciclos, status e pagamentos. |
| Importação de fatura PDF com revisão humana | Adaptar/reimplementar | Manter fluxo funcional; trocar mecanismo técnico se necessário. |
| Aprendizado de categoria por estabelecimento | Preservar como requisito | Reimplementar como mapeamento auditável de merchant/category. |
| P&L mensal e comparativo | Preservar como requisito | Reimplementar como relatório financeiro central do Planner Vida. |
| Previsões/tendências | Opcional/melhorar | Manter como feature analítica, mas recalibrar metodologia. |
| Simulador "E se...?" | Preservar como diferencial | Reimplementar com engine financeira clara e testável. |
| Metas financeiras | Preservar como requisito | Integrar metas a planejamento e simulação. |
| Resumo de investimentos | Adaptar/reimplementar | Melhorar separação entre valor aplicado, valor bruto e rendimento. |
| Créditos disponíveis | Opcional/melhorar | Útil, mas pode ser módulo posterior se Planner Vida focar planejamento pessoal. |
| Painel admin | Adaptar/reimplementar | Preservar conceitos de auditoria, usuários, exportação, notificações. |
| Notificações globais | Opcional/melhorar | Reimplementar se houver necessidade operacional. |
| Lovable AI Gateway | Não migrar como dependência | Preservar capacidade de IA, não o provedor específico. |
| Supabase client, RLS, Edge Functions, triggers | Não migrar como arquitetura obrigatória | Usar apenas como referência de comportamento. |
| React/Vite/shadcn/Recharts/Radix | Não migrar como obrigação | Podem inspirar UX, mas não devem definir arquitetura. |
| Laravel/PHP | Não migrar | Não aparece no zip analisado; se existir em contexto antigo, descartar como detalhe legado. |

## 3. Estrutura do Projeto Analisado

### 3.1 Raiz

- `package.json`: app Vite React TypeScript.
- `src/`: frontend, páginas, componentes, hooks, validações e cliente Supabase.
- `supabase/migrations/`: evolução do banco e regras SQL.
- `supabase/functions/`: funções serverless Deno.
- `.env`: contém URL e chave pública Supabase do projeto antigo.
- `.lovable/plan.md`: sinal de origem Lovable.
- `public/`: assets estáticos.

### 3.2 Dependências principais

- Frontend: React 18, React Router, TypeScript, Vite.
- UI: shadcn/Radix, Tailwind, lucide-react, sonner.
- Formulários/validação: react-hook-form, zod.
- Dados: `@supabase/supabase-js`.
- Gráficos: Recharts.
- Datas: date-fns com locale pt-BR.
- PDF/IA em função serverless: `unpdf`, Lovable AI Gateway, modelo Gemini via gateway.

Classificação:

- Preservar: padrões de UX e nomenclatura financeira em português.
- Adaptar: componentes e gráficos para a stack nova.
- Não migrar: dependência direta de Supabase, Lovable, Deno, Vite ou shadcn como premissa arquitetural.

## 4. Rotas, Telas e Módulos

### 4.1 Navegação principal

Rotas existentes:

- `/`: Dashboard.
- `/auth`: Login/cadastro/recuperação.
- `/extrato`: Extrato transacional.
- `/planejamento`: Orçamentos por categoria.
- `/categorias`: Gestão de categorias.
- `/contas`: Contas e cartões.
- `/faturas`: Faturas de cartão.
- `/relatorios`: Relatórios de cartão.
- `/reports/pl`: P&L.
- `/previsoes`: Previsões e simulador.
- `/metas`: Metas financeiras.
- `/simulador`: redireciona para `/previsoes?tab=simulador`.
- `/credit-availability`: Créditos disponíveis.
- `/investments-summary`: Resumo de investimentos.
- `/admin`: Administração.

Itens visíveis no menu principal:

- Dashboard.
- Contas.
- Faturas.
- Extrato.
- Previsões.
- Relatórios.
- P&L.
- Metas.
- Admin apenas para usuários com papel admin.

Há uma rota de Planejamento, mas o item fica oculto no menu.

Classificação:

- Preservar como requisito: Dashboard, Contas, Faturas, Extrato, Previsões/Simulador, Relatórios, P&L, Metas.
- Adaptar/reimplementar: Auth, Admin, Categorias, Planejamento.
- Opcional/melhorar: Créditos disponíveis e resumo de investimentos, dependendo do escopo do Planner Vida.

## 5. Modelo de Dados de Domínio

### 5.1 Usuários e perfis

Entidades:

- `profiles`: `id`, `username`, `created_at`, `last_login`.
- `user_roles`: `user_id`, `role` (`admin`, `user`).

Regras:

- Username único.
- Username usa formato restrito. O histórico das migrações mostra ajustes: inicialmente alfanumérico, depois minúsculas, números, `_` e `.`.
- Criação de perfil vinculada a usuário de autenticação.
- Papel admin libera painel administrativo.

Classificação:

- Preservar como requisito: usuário, perfil, papel admin, isolamento por usuário.
- Adaptar/reimplementar: autenticação por username/email, recuperação e políticas de senha.
- Não migrar: Supabase Auth e `auth.users` como acoplamento.

### 5.2 Contas

Entidade `accounts`:

- `id`, `user_id`.
- `name`.
- `type`.
- `balance`: saldo inicial/base.
- `institution`.
- `description`.
- `overdraft_limit`.
- `created_at`.

Tipos atuais evoluíram para:

- `bank`.
- `wallet`.
- `investment`.
- `savings`.

Uso funcional:

- Cadastro, edição e exclusão de contas.
- Associação de transações a contas.
- Associação opcional de cartão de crédito a conta.
- Cálculo de saldo real por função `calculate_account_balance`.
- Controle de cheque especial e crédito pré-aprovado por conta.

Classificação:

- Preservar como requisito: conta, instituição, saldo inicial, limite de cheque especial, saldo real calculado.
- Adaptar/reimplementar: tipos de conta e cálculo de saldo em serviço de domínio testável.
- Melhorar: impedir exclusões perigosas quando houver transações dependentes; hoje o uso depende de FK/erro.

### 5.3 Cartões de crédito

Entidade `credit_cards`:

- `id`, `user_id`.
- `name`.
- `credit_limit`.
- `description`.
- `brand`.
- `account_id`.
- `closing_day`.
- `due_day`.
- `created_at`.

Uso funcional:

- Cadastro, edição e exclusão de cartões.
- Definição de limite, bandeira, conta vinculada, dia de fechamento e dia de vencimento.
- Geração de faturas por transações no crédito.
- Cálculo de limite usado, limite futuro e limite disponível.

Classificação:

- Preservar como requisito: cartão, limite, bandeira, conta vinculada, fechamento, vencimento.
- Adaptar/reimplementar: cálculo de fatura e status em domínio próprio.
- Melhorar: validar fechamento/vencimento obrigatórios para cartão usado em fatura.

### 5.4 Categorias e subcategorias

Entidade `categories`:

- `id`, `user_id`.
- `name`.
- `type`.
- `parent_id`.
- `created_at`.

Tipos atuais:

- `renda`.
- `variavel`.
- `fixo`.
- `investimento`.

Uso funcional:

- Categorias principais sem `parent_id`.
- Subcategorias herdam o tipo da categoria pai.
- Filtros e relatórios agrupam por categoria e subcategoria.
- Transações de receita usam categorias `renda`.
- Transações de despesa usam `variavel` ou `fixo`.
- Transações de investimento usam `investimento`.

Classificação:

- Preservar como requisito: árvore categoria/subcategoria e tipos financeiros.
- Adaptar/reimplementar: normalizar nomes de tipos e evitar mistura entre inglês e português no modelo interno.
- Melhorar: impedir exclusão de categorias em uso sem reassociação planejada.

### 5.5 Transações

Entidade `transactions`:

- `id`, `user_id`.
- `type`: `income`, `expense`, `transfer`, `investment`.
- `description`.
- `amount`.
- `category_id`.
- `subcategory_id`.
- `payment_method`.
- `account_id`.
- `credit_card_id`.
- `date`.
- `installments`.
- `installment_number`.
- `parent_transaction_id`.
- `source_account_id`.
- `destination_account_id`.
- `created_at`.

Métodos de pagamento observados:

- `credit`.
- `debit`.
- `transfer`.
- `cash`.
- `pix`.
- `boleto`.
- Valores adicionados no frontend, mas com potencial inconsistência de constraint: `vale_alimentacao`, `vale_refeicao`, `vale_cultura`.

Regras:

- Valor positivo.
- Descrição obrigatória e limitada.
- Parcelas entre 1 e 24.
- Recorrências entre 1 e 24.
- Uso de data "meio-dia UTC" no frontend para evitar deslocamento de fuso.
- Transações parceladas criam um registro pai com `installment_number = 0` e registros filhos com `installment_number` de 1 a N.
- Relatórios geralmente ignoram o registro pai e contam apenas `installment_number > 0` ou nulo.
- Transferências possuem conta origem e destino.
- Investimentos são transações próprias, não apenas categoria.

Classificação:

- Preservar como requisito: tipos de transação, forma de pagamento, parcelas, recorrências, origem/destino, categoria/subcategoria.
- Adaptar/reimplementar: modelagem de parcelas/recorrências com uma entidade de série ou agendamento mais limpa.
- Melhorar: centralizar regra de data/fuso, validação de métodos de pagamento e consistência entre frontend/backend.

### 5.6 Orçamentos

Entidade `budgets`:

- `id`, `user_id`.
- `category_id`.
- `month`.
- `planned_amount`.
- `created_at`.
- unicidade por usuário, categoria e mês.

Tela `Planning`:

- Carrega orçamento por categoria.
- Compara planejado com transações por categoria no mês.

Classificação:

- Preservar como requisito se Planner Vida incluir planejamento mensal.
- Adaptar/reimplementar: transformar em orçamento mensal por categoria com realizado, variação e status.
- Melhorar: aparecer no menu ou integrar ao P&L/metas.

### 5.7 Faturas de cartão

Entidade `credit_card_invoices`:

- `id`, `user_id`.
- `credit_card_id`.
- `reference_month`.
- `due_date`.
- `closing_date`.
- `total_amount`.
- `paid_amount`.
- `paid_interest`.
- `status`: `pending`, `paid`, `overdue`.
- `paid_at`.
- `is_hidden`.
- `created_at`.

Regras:

- A fatura é criada/atualizada automaticamente quando há transação de cartão.
- `calculate_invoice_dates(transaction_date, closing_day, due_day)`:
  - se o dia da transação for maior que o dia de fechamento, a transação pertence à fatura do mês seguinte;
  - fechamento é o dia de fechamento no mês de referência;
  - vencimento é o dia de vencimento no mês seguinte ao de referência.
- Totais são recalculados em triggers de insert/update/delete.
- Status pode ser derivado na UI:
  - `aberta`: hoje entre fechamento anterior e fechamento atual;
  - `a_vencer`: após fechamento, antes do vencimento, status pendente;
  - `paid`, `pending`, `overdue`.
- Faturas podem ser marcadas como pagas com ou sem juros.
- Fechamento pode ser ajustado manualmente por offset em dias para faturas abertas/a vencer.
- Faturas podem ser ocultadas em relatórios.

Classificação:

- Preservar como requisito: ciclo de fatura, status, pagamento, juros, ocultação, ajuste manual controlado.
- Adaptar/reimplementar: não usar triggers dispersos como única fonte; criar serviço de fatura com testes.
- Melhorar: armazenar histórico de ajustes de fechamento e pagamentos.

### 5.8 Metas financeiras

Entidade `financial_goals`:

- `goal_type`: `save`, `reduce_expense`, `increase_income`, `pay_debt`.
- `title`.
- `target_amount`.
- `target_percentage`.
- `target_date`.
- `category_id`.
- `credit_card_id`.
- `status`: `active`, `completed`, `archived`.
- `baseline_amount`.

Regras de progresso:

- `save`: soma transações desde criação da meta; se houver categoria, filtra por categoria; se não, tenta somar categorias de investimento.
- `reduce_expense`: compara média dos 3 meses antes da criação com média após criação para uma categoria.
- `increase_income`: compara média dos 3 meses antes com média após criação, podendo filtrar por categoria.
- `pay_debt`: soma `paid_amount` de faturas do cartão desde a criação.
- Percentual de progresso = atual / alvo.

Classificação:

- Preservar como requisito: tipos de metas, progresso, status e vínculo com categorias/cartões.
- Adaptar/reimplementar: corrigir inconsistências de tipo de categoria; hoje algumas consultas usam `investimento`/`renda` enquanto transação usa `investment`/`income`.
- Melhorar: persistir baseline da meta no momento da criação para evitar recalcular baseline histórico de forma instável.

### 5.9 Simulador de cenários

Entidade `simulation_scenarios`:

- `name`.
- `simulation_months`, entre 1 e 12.
- `modifications` JSON.
- limite de 5 cenários por usuário.

Estrutura de modificação:

- Receitas:
  - por categoria existente;
  - por nova transação;
  - mudança percentual ou absoluta;
  - recorrência mensal ou única.
- Despesas:
  - por categoria existente;
  - por nova transação;
  - fixa ou variável;
  - mudança percentual ou absoluta;
  - recorrência mensal ou única.
- Investimentos:
  - percentual do saldo mensal;
  - valor fixo.

Baseline:

- Usa últimos 3 meses.
- Calcula médias mensais de renda, despesas fixas, despesas variáveis, investimentos, saldo e taxa de poupança.

Projeção:

- Para cada mês simulado, parte do baseline.
- Aplica modificações de receita/despesa.
- Calcula despesas totais, saldo, investimento e saldo acumulado.
- Calcula impacto médio contra baseline:
  - receita;
  - despesas;
  - saldo;
  - taxa de poupança.
- Calcula impacto em metas ativas.

Classificação:

- Preservar como diferencial do Planner Vida.
- Adaptar/reimplementar: substituir JSON livre por modelo versionado ou schema validado; centralizar engine de simulação.
- Melhorar: suportar inflação, sazonalidade, periodicidade customizada e metas por data.

### 5.10 Investimentos

Entidades:

- Transações do tipo `investment`.
- `investment_summary`: `gross_value`, `update_date`, `user_id`.

Regras:

- Total aplicado = soma de transações do tipo investimento.
- Valor bruto é informado manualmente.
- Rendimento = valor bruto - total aplicado.
- Percentual de rendimento = rendimento / total aplicado.
- Gráficos de investimento usam evolução mensal, total acumulado, taxa de investimento sobre renda e distribuição por categoria.

Classificação:

- Adaptar/reimplementar.
- Preservar como requisito se Planner Vida tiver módulo de patrimônio/investimentos.
- Melhorar: separar aportes, posição, rentabilidade, classes de ativos e data-base.

### 5.11 Créditos disponíveis

Entidades:

- `credit_availability_cards`: limite pré-aprovado por cartão existente.
- `credit_preapproved_cards`: cartões pré-aprovados ainda não contratados.
- `credit_availability_accounts`: limite pré-aprovado por conta.
- `credit_lines`: consórcios, financiamentos e créditos.
- `credit_update_date`: data de atualização.

Categorias de crédito:

- Cartões existentes: limite atual e limite pré-aprovado.
- Cartões pré-aprovados por conta.
- Cheque especial atual e pré-aprovado.
- Consórcios:
  - Automóvel.
  - Imóvel.
  - Motocicleta.
  - Embarcações.
  - Outros.
  - Total = valor por carta x quantidade de cartas.
- Financiamentos:
  - Automóvel.
  - Imóvel.
  - Outros.
  - Total = limite disponível.
- Créditos:
  - Crédito pessoal.
  - Consignado.
  - Com garantia de imóvel.
  - Com garantia de automóvel.
  - Outros.

Classificação:

- Opcional/melhorar.
- Preservar se Planner Vida for além de orçamento e incluir capacidade de crédito.
- Não deixar que esse módulo complique o MVP se o foco inicial for planejamento de vida e finanças pessoais.

### 5.12 Administração, auditoria e notificações

Entidades:

- `audit_logs`.
- `notifications`.
- `rate_limit_violations`.

Funcionalidades:

- Ver dashboard sistêmico:
  - total de usuários;
  - transações;
  - contas;
  - receitas totais;
  - despesas totais;
  - saldo geral;
  - novos usuários nos últimos 7 dias.
- Gerenciar usuários:
  - listar perfis;
  - promover/remover admin;
  - excluir usuário e dados relacionados;
  - ver contagem de transações e contas.
- Trocar senha de usuário via admin.
- Exportar dados sensíveis dos últimos 6 meses em JSON.
- Visualizar últimas 100 transações.
- Enviar notificações globais.
- Ativar/desativar notificações.
- Visualizar logs de auditoria.
- Monitorar violações de rate limit.

Classificação:

- Preservar como requisito: auditoria, exportação de dados, papéis administrativos.
- Adaptar/reimplementar: gerenciamento de usuário conforme nova autenticação.
- Opcional/melhorar: notificações globais e dashboard sistêmico no MVP.

## 6. Regras Financeiras e Cálculos a Preservar

### 6.1 Saldo de conta

Regra atual:

```
saldo_real = saldo_inicial
  + receitas ate a data
  - despesas nao pagas no credito ate a data
  - investimentos nao pagos no credito ate a data
  + transferencias recebidas ate a data
  - transferencias enviadas ate a data
```

Observações:

- O código atual tem versões sucessivas da função SQL `calculate_account_balance`.
- A versão final considera investimentos e transferências.
- Transações de cartão de crédito não reduzem saldo da conta no momento da compra.

Classificação:

- Preservar como requisito.
- Reimplementar em serviço único e coberto por testes.

### 6.2 Dashboard mensal

KPIs:

- Receita do mês.
- Despesas na conta.
- Despesas no cartão.
- Investimentos.
- Saldo = receitas - despesas na conta.
- Gráficos de fluxo por mês.
- Distribuição por categoria.
- Distribuição por método de pagamento.
- Filtros por mês, período, conta e opção de incluir/excluir cartão.

Regra relevante:

- Despesa de cartão é separada de despesa de conta.
- Parcelas válidas excluem registro pai (`installment_number = 0`).

Classificação:

- Preservar como requisito.
- Melhorar nomenclatura para evitar confusão entre saldo financeiro, saldo disponível e despesas de competência.

### 6.3 P&L mensal

Buckets:

- Receitas.
- Despesas fixas.
- Despesas variáveis.
- Investimentos.

Cálculos:

- `totalIncome`.
- `totalFixed`.
- `totalVariable`.
- `totalInvestments`.
- `balance = totalIncome - totalFixed - totalVariable`.
- `availableBalance = balance - totalInvestments`.
- saldo bancário inicial e final do mês via cálculo de saldo por conta.

Classificação:

- Preservar como requisito central.
- Reimplementar como relatório financeiro formal, com opção de regime:
  - caixa;
  - competência;
  - cartão por compra;
  - cartão por pagamento/fatura.

### 6.4 P&L comparativo

Comparações:

- período 1 vs período 2.
- suporta mês único (`YYYY-MM`) ou intervalo (`YYYY-MM:YYYY-MM`).
- compara:
  - receitas;
  - despesas fixas;
  - despesas variáveis;
  - despesas totais;
  - investimentos;
  - saldo;
  - taxa de poupança.
- variação absoluta = período 2 - período 1.
- variação percentual = variação / valor absoluto do período 1.
- categorias ordenadas por maior variação absoluta.

Classificação:

- Preservar como requisito.
- Melhorar com narrativa automática de drivers, variações relevantes e drill-down por subcategoria.

### 6.5 Fatura de cartão

Regras:

- Data de fechamento e vencimento derivadas de `closing_day` e `due_day`.
- Compra após fechamento entra na fatura do mês seguinte.
- Compra em parcela gera lançamentos futuros mensais.
- O registro pai do parcelamento não entra em totais.
- Pagamento pode ter juros.
- Total de fatura pode vir do banco ou ser recalculado por janela, dependendo do status.
- Ajuste manual de fechamento altera a janela de cálculo.

Classificação:

- Preservar como requisito.
- Reimplementar com cuidado para evitar inconsistência entre trigger, UI e relatório.

### 6.6 Importação de fatura PDF

Fluxo:

1. Usuário escolhe cartão.
2. Escolhe mês de referência.
3. Informa senha opcional do PDF.
4. Envia PDF até 10MB.
5. Função extrai texto.
6. IA identifica lançamentos.
7. IA sugere categoria.
8. Sistema aplica aprendizados anteriores de estabelecimento.
9. Usuário revisa:
   - incluir/excluir linha;
   - data;
   - descrição;
   - parcela atual/total;
   - categoria;
   - valor.
10. Sistema salva:
   - parcela atual;
   - parcelas futuras;
   - proteção contra duplicidade;
   - mapeamento de categoria por estabelecimento.

Regras de deduplicação:

- Normaliza descrição removendo sufixos de parcela.
- Chave = descrição normalizada + valor + total de parcelas + parcela atual.
- Evita duplicar contra transações existentes e dentro do próprio lote.

Regras de aprendizado:

- `normalizeMerchantKey`:
  - converte para minúsculas;
  - remove acentos;
  - remove ruído de adquirentes;
  - remove parcelas e datas;
  - remove números/símbolos;
  - remove stopwords;
  - usa as duas primeiras palavras significativas.
- `category_mappings` guarda `merchant_key`, `category_id`, `hit_count`, `last_used_at`.

Classificação:

- Preservar fluxo e aprendizado como requisito.
- Adaptar/reimplementar IA e parsing de PDF conforme nova stack.
- Não migrar Lovable gateway como dependência obrigatória.

### 6.7 Previsões e tendências

Regras atuais:

- Determina quantidade de meses disponíveis pelo histórico.
- Seleciona período automaticamente:
  - 12 meses se houver pelo menos 12 meses;
  - 6 meses se houver pelo menos 6;
  - senão, mínimo de 3 ou meses disponíveis.
- Confiança:
  - menos de 3 meses: insuficiente;
  - menos de 6: baixa;
  - menos de 12: média;
  - 12 ou mais: alta.
- Agrupa receita/despesa por mês.
- Projeta próximos 3 meses por média com pequeno fator de tendência.
- Alertas:
  - saldo negativo projetado;
  - despesas subindo mais de 10%;
  - taxa de poupança abaixo de 10%;
  - sinal positivo se receita sobe e despesa cai.

Fragilidade:

- Despesa fixa/variável é estimada por `payment_method === debit`, o que não corresponde à classificação real por categoria.
- Tendência divide por média sem proteção robusta contra zero.
- Projeção é heurística simples.

Classificação:

- Opcional/melhorar.
- Preservar o conceito de confiança, alertas e projeção.
- Reimplementar metodologia com base nas categorias reais e premissas explícitas.

### 6.8 Simulador

Regras atuais:

- Baseline de últimos 3 meses.
- Modificações por categoria ou nova transação.
- Mudança percentual ou absoluta.
- Recorrência mensal ou única.
- Horizonte de 1 a 12 meses.
- Investimento projetado por percentual do saldo ou valor fixo.
- Saldo acumulado soma saldos mensais.
- Impacto nas metas calcula aceleração/atraso com base na melhoria do saldo.

Classificação:

- Preservar como diferencial.
- Reimplementar com engine de simulação versionada, testável e separada da UI.

## 7. Importações, Exportações, Jobs e Integrações

### 7.1 Importações

Importação relevante:

- Fatura de cartão via PDF.

Dependências atuais:

- `unpdf` para extração de texto.
- Lovable AI Gateway com modelo Gemini.
- Edge Function `parse-invoice-pdf`.
- Rate limit de 10 importações por hora.

Classificação:

- Preservar fluxo.
- Adaptar motor de IA/parsing.
- Melhorar com:
  - upload seguro;
  - armazenar arquivo original opcionalmente;
  - trilha de auditoria do lote;
  - tela de histórico de importações;
  - suporte a formatos OFX/CSV no futuro.

### 7.2 Exportações

Exportação atual:

- Admin exporta JSON dos últimos 6 meses contendo perfis, transações e contas.
- Ação gera log de auditoria.

Classificação:

- Preservar como requisito de governança.
- Melhorar com escopo selecionável, mascaramento/anônimização e formatos CSV/XLSX.

### 7.3 Jobs/automação

Não há jobs agendados explícitos no pacote. Há automação via:

- triggers SQL;
- funções serverless sob demanda;
- listeners realtime no Extrato.

Classificação:

- Adaptar/reimplementar.
- No Planner Vida, mover regras críticas para serviços transacionais explícitos e, se necessário, jobs agendados para:
  - marcar faturas vencidas;
  - gerar recorrências futuras;
  - recalcular saldos/materializações;
  - enviar alertas.

### 7.4 Integrações

Integrações existentes:

- Supabase Auth, Database, RLS, RPC, Realtime, Edge Functions.
- Lovable AI Gateway.
- PDF text extraction via `unpdf`.

Classificação:

- Não migrar como acoplamento.
- Preservar capacidades:
  - autenticação;
  - banco relacional;
  - funções backend;
  - IA para leitura/categorização;
  - auditoria.

## 8. Autenticação, Segurança e Governança

### 8.1 Autenticação

Funcionalidades:

- Login por username/email e senha.
- Signup com username, email opcional e senha.
- Se email não informado, gera email sintético `username@financeiro.app`.
- Recuperação de senha recebe username e tenta reset pelo email sintético, sem revelar existência do usuário.
- Senha:
  - mínimo 12 caracteres;
  - pelo menos uma letra maiúscula;
  - pelo menos uma minúscula;
  - pelo menos um número.

Rate limits:

- Login: 5 tentativas por 15 minutos; bloqueio UX de 5 minutos.
- Signup: 3 tentativas por 15 minutos; bloqueio UX de 10 minutos.
- Backend também aplica rate limit.

Classificação:

- Preservar como requisito: login seguro, senha forte, rate limit, não enumeração de usuário.
- Adaptar/reimplementar conforme nova autenticação.
- Melhorar: evitar email sintético se Planner Vida usar email real; suportar MFA se necessário.

### 8.2 Autorização

Funcionalidades:

- `user_roles` define admin.
- Painel admin verifica admin via função server-side.
- RLS protege dados por `user_id`.

Classificação:

- Preservar modelo RBAC básico.
- Adaptar para nova stack.

### 8.3 Auditoria

Audit logs registram:

- mudança de senha;
- criação/promocão/remoção admin;
- exclusão de usuário;
- envio de notificação;
- exportação de dados;
- parsing de fatura.

Campos:

- usuário;
- ação;
- recurso;
- valores antigo/novo;
- IP;
- user agent;
- sucesso;
- erro.

Classificação:

- Preservar como requisito de governança.
- Melhorar com correlação por request, lote/importação e severidade.

### 8.4 Achados de segurança/configuração

- O zip contém `.env` com URL e chave pública Supabase do projeto antigo. Embora chave pública de Supabase não seja service role, ainda é configuração de ambiente e não deve ser versionada/publicada sem intenção.
- Funções serverless dependem de `SUPABASE_SERVICE_ROLE_KEY`, não exposto no zip, mas há uso de admin client.
- Há logs em console com IDs de usuário e eventos sensíveis em funções.
- Uso de `confirm()` no frontend para ações destrutivas.
- Algumas rotas/telas dependem de validação no cliente e de RLS/Edge Functions.

Classificação:

- Não migrar segredos/config antiga.
- Preservar governança e auditoria.
- Melhorar fluxo de confirmação, permissões e observabilidade.

## 9. UX e Padrões de Produto a Preservar

Padrões úteis:

- Interface em português brasileiro.
- Moeda BRL.
- Datas em pt-BR.
- Tema claro/escuro.
- Navbar fixa, com versão mobile em drawer.
- Cards de KPIs.
- Tabelas com filtros.
- Badges de status.
- Fluxos com revisão antes de salvar importações.
- Separação mental entre:
  - despesas na conta;
  - despesas no cartão;
  - investimentos;
  - saldo.
- Alertas de fatura vencida/a vencer.
- Tela de metas com resumo: ativas, concluídas, em progresso, próxima meta.
- Previsões com nível de confiança, para não fingir precisão quando há poucos dados.

Classificação:

- Preservar como requisito de experiência.
- Adaptar visual/design system ao Planner Vida.
- Melhorar consistência de nomenclatura e navegação.

## 10. Dependências Técnicas que Não Devem Contaminar a Nova Arquitetura

Não carregar para o Planner Vida como decisão arquitetural:

- Supabase específico do projeto antigo:
  - URL;
  - anon key;
  - RLS policies;
  - Edge Functions;
  - RPCs;
  - triggers PL/pgSQL.
- Lovable:
  - `.lovable`;
  - `lovable-tagger`;
  - AI gateway `https://ai.gateway.lovable.dev`.
- Deno serverless como formato obrigatório.
- shadcn/Radix como dependência obrigatória.
- Recharts como dependência obrigatória.
- React Query/Vite/React Router como acoplamento obrigatório.
- Convenções de arquivo do projeto antigo.
- Uso de JSON livre para cenários sem schema versionado.
- Triggers duplicadas/sucessivas para cálculo de fatura/saldo.
- Mistura de enums em português e inglês.
- Qualquer eventual Laravel/PHP mencionado em contexto anterior.

Capacidades a preservar sem acoplamento:

- banco relacional transacional;
- autenticação segura;
- RBAC;
- auditoria;
- importação assistida por IA;
- cálculo financeiro determinístico;
- dashboards e relatórios;
- simulação e metas.

## 11. Pontos Frágeis e Dívida Técnica

### 11.1 Regras espalhadas

As regras financeiras estão espalhadas entre frontend, hooks, SQL, triggers e funções serverless.

Risco:

- comportamento divergente entre Dashboard, P&L, Relatórios e Faturas.

Recomendação:

- No Planner Vida, criar camada de domínio financeira central:
  - serviço de transações;
  - serviço de faturas;
  - serviço de saldo;
  - serviço de relatórios;
  - serviço de simulação.

### 11.2 Enums inconsistentes

Exemplos:

- `transactions.type`: inglês (`income`, `expense`, `investment`, `transfer`).
- `categories.type`: português (`renda`, `fixo`, `variavel`, `investimento`).
- Algumas validações antigas esperavam `income`/`expense` em categoria.
- Frontend oferece métodos de pagamento que podem não estar aceitos pela constraint SQL.

Recomendação:

- Definir vocabulário canônico interno e labels de UI separados.

### 11.3 Parcelamento modelado como transações pai/filho

Funciona, mas traz complexidade:

- todo relatório precisa lembrar de ignorar `installment_number = 0`;
- edição de transação parcelada não parece atualizar série inteira;
- dedupe depende de descrição/valor/parcela.

Recomendação:

- Modelar `transaction_series`, `installment_plan` ou `recurrence_rule`.

### 11.4 Faturas recalculadas por triggers

Há várias migrações alterando funções de fatura e saldo.

Risco:

- difícil saber regra final sem banco migrado;
- comportamento invisível ao frontend;
- testes mais difíceis.

Recomendação:

- Centralizar geração/recalculo de fatura em backend service, com transações de banco e testes.

### 11.5 Datas e fuso horário

O código contém helpers "anti-fuso" e persiste data como meio-dia UTC em alguns fluxos.

Risco:

- inconsistência entre colunas DATE e TIMESTAMP;
- deslocamento D-1 em relatórios.

Recomendação:

- Definir tipo `LocalDate` no domínio.
- Persistir datas financeiras como date-only.
- Proibir conversão implícita por timezone em cálculos financeiros.

### 11.6 Tipagem fraca

Há bastante `any`, casts e dados JSON livres.

Risco:

- regressões silenciosas em relatórios e simulações.

Recomendação:

- Schemas compartilhados frontend/backend.
- Testes unitários para cálculos.
- Tipos de domínio estáveis.

### 11.7 Métricas preditivas simplificadas

Previsões atuais são heurísticas simples.

Risco:

- usuário interpretar como previsão precisa.

Recomendação:

- Manter nível de confiança visível.
- Explicitar premissas.
- Separar forecast simples, orçamento planejado e simulação manual.

### 11.8 Exclusões perigosas

Há deleções por UI com `confirm()` e deleção de usuário em cascata manual por várias tabelas.

Risco:

- perda de dados;
- deleção parcial se uma etapa falhar.

Recomendação:

- Soft delete ou confirmação forte.
- Transação backend para exclusão completa.
- Export antes de deleção.

## 12. Mapa de Funcionalidades por Classificação

### 12.1 Preservar como requisito

- Usuário autenticado com dados isolados.
- Perfil e papel admin.
- Contas com saldo inicial, instituição, descrição e cheque especial.
- Cartões com limite, bandeira, conta vinculada, fechamento e vencimento.
- Transações de receita, despesa, transferência e investimento.
- Métodos de pagamento.
- Categorias e subcategorias.
- Parcelamento em até 24x.
- Recorrências semanais/mensais em até 24 ocorrências.
- Extrato com filtros por data, tipo, categoria, método e conta/cartão.
- Dashboard mensal com receitas, despesas de conta, despesas de cartão, investimentos e saldo.
- Faturas com ciclo, status, pagamento, juros e ajuste.
- Relatórios de cartão por fatura, período, categoria e todos os cartões.
- P&L mensal e comparativo.
- Metas financeiras.
- Simulador de cenários.
- Importação de fatura com revisão.
- Aprendizado de categorização por estabelecimento.
- Auditoria administrativa.

### 12.2 Adaptar/reimplementar

- Autenticação e recuperação de senha.
- Rate limit.
- Admin panel.
- Exportação de dados.
- Notificações globais.
- Resumo de investimentos.
- Créditos disponíveis.
- Previsões/tendências.
- Orçamentos.
- Realtime updates.
- Triggers SQL de saldo/fatura.
- Edge Functions.

### 12.3 Opcional/melhorar

- Créditos disponíveis.
- Notificações globais.
- Dashboard sistêmico admin.
- Planejamento por orçamento, se não for prioridade do MVP.
- Resumo simples de investimentos.
- Previsões estatísticas.
- Suporte a consultor/admin fazendo simulações para usuários, pois existem tabelas `consultant_notes` e `consultant_simulations` nos tipos, mas não há fluxo principal suficientemente consolidado no código lido.

### 12.4 Não migrar

- `.env` do projeto antigo.
- IDs, URLs e chaves Supabase antigas.
- Lovable-specific code/config.
- Supabase-specific RLS/triggers/functions como arquitetura.
- Deno como formato obrigatório.
- Nomes de tabelas como contrato final se a nova modelagem pedir ajuste.
- Mistura atual de enums português/inglês.
- Qualquer código Laravel/PHP se existir em outra fonte antiga.

## 13. Prompt/Contexto Reutilizável para Construção do Planner Vida

Use o texto abaixo como contexto de construção do novo app.

---

Construir o Planner Vida usando o AFR Controle Financeiro como referência funcional, não como arquitetura a copiar.

O sistema antigo analisado é um app React/Vite/Supabase, não Laravel/PHP. A nova solução não deve herdar Supabase, Edge Functions, triggers PL/pgSQL, Lovable, Deno, shadcn ou qualquer dependência específica. Ela deve herdar o domínio financeiro, fluxos e regras úteis.

Domínio essencial:

- Usuário autenticado com dados financeiros isolados.
- Contas financeiras com nome, instituição, descrição, saldo inicial, tipo e limite de cheque especial.
- Cartões de crédito com nome, bandeira, limite, conta vinculada, dia de fechamento e dia de vencimento.
- Categorias e subcategorias configuráveis, com tipos: renda, despesa fixa, despesa variável e investimento.
- Transações com tipo: receita, despesa, transferência e investimento.
- Transações possuem descrição, valor positivo, data financeira date-only, categoria, subcategoria, método de pagamento, conta, cartão, conta origem/destino quando transferência, e informações de parcelamento/recorrência.
- Compras parceladas devem gerar parcelas futuras e manter vínculo com a compra original sem duplicar totais.
- Recorrências semanais/mensais devem gerar ou projetar ocorrências de forma controlada.
- Transações de cartão não reduzem saldo de conta no momento da compra; entram em fatura.
- Saldo de conta deve considerar saldo inicial, receitas, despesas não-cartão, investimentos não-cartão e transferências recebidas/enviadas.
- Faturas de cartão devem ser calculadas por ciclo: fechamento e vencimento. Compra após o fechamento entra na fatura seguinte. Faturas têm status aberta, a vencer, pendente, vencida e paga. Devem suportar pagamento, juros, ajuste manual de fechamento e ocultação em relatórios.
- Extrato deve permitir filtros por data, tipo, categoria, método, conta/cartão, edição e exclusão com controle seguro.
- Dashboard deve mostrar receitas, despesas de conta, despesas de cartão, investimentos, saldo, gráficos por período, categorias e métodos de pagamento.
- P&L deve ser relatório central: receitas, despesas fixas, despesas variáveis, investimentos, saldo, saldo disponível e comparativo entre períodos, com variação absoluta/percentual e drill-down por categoria/subcategoria.
- Relatórios de cartão devem permitir visão por fatura, período, categoria e todos os cartões, excluindo cabeçalhos de parcelamento e respeitando janelas de fatura.
- Metas financeiras devem suportar: poupar, reduzir despesa, aumentar renda e pagar dívida, com alvo em valor/percentual, data alvo, status e progresso calculado.
- Simulador "E se...?" deve permitir cenários de 1 a 12 meses com alterações de receita, despesa fixa/variável e investimento, por categoria ou nova transação, em percentual ou valor absoluto, mensal ou única. Deve calcular receita projetada, despesa projetada, saldo projetado, taxa de poupança, saldo acumulado e impacto nas metas.
- Importação de fatura PDF deve preservar o fluxo: upload, senha opcional, extração/IA, sugestão de categoria, revisão humana linha a linha, criação de parcelas futuras, deduplicação e aprendizado de categoria por estabelecimento.
- Aprendizado de categoria deve normalizar nome do estabelecimento e guardar mapeamento por usuário com contagem e última utilização.
- Investimentos devem separar total aplicado, valor bruto informado, data-base, rendimento e rendimento percentual.
- Créditos disponíveis podem ser módulo opcional: limites atuais/pré-aprovados de cartões, cheque especial, consórcios, financiamentos e linhas de crédito.
- Administração deve preservar conceitos de RBAC, auditoria, exportação de dados e operações sensíveis rastreadas.

Regras técnicas para a nova implementação:

- Centralizar cálculos financeiros em serviços de domínio, não espalhar lógica entre UI e banco.
- Usar tipos/enums canônicos no domínio e labels traduzidas apenas na UI.
- Tratar datas financeiras como date-only, sem deslocamento por fuso horário.
- Evitar JSON livre para cenários sem schema versionado.
- Cobrir com testes os cálculos de saldo, fatura, P&L, parcelamento, recorrência, metas e simulação.
- Evitar triggers invisíveis como única fonte de regra crítica; preferir serviços explícitos e auditáveis.
- Garantir auditoria de operações sensíveis: importação, exportação, alteração admin, deleção, mudança de senha e pagamento/ajuste de fatura.
- Nunca migrar chaves, URLs, IDs de projeto ou configurações do AFR antigo.

---

## 14. Checklist de Construção para o Planner Vida

### MVP recomendado

1. Autenticação, usuário e isolamento de dados.
2. Contas.
3. Cartões.
4. Categorias/subcategorias.
5. Transações manuais.
6. Parcelamento e recorrência.
7. Extrato.
8. Cálculo de saldo.
9. Faturas.
10. Dashboard.
11. P&L mensal.
12. Metas.
13. Simulador.

### Pós-MVP

1. Importação de fatura PDF com IA.
2. Aprendizado de categorias.
3. P&L comparativo avançado.
4. Créditos disponíveis.
5. Investimentos avançados.
6. Previsões/tendências.
7. Admin completo.
8. Exportações e relatórios executivos.

## 15. Conclusão

O AFR possui um domínio financeiro rico e relevante para o Planner Vida. O valor está nos fluxos e regras: categorização, transações, cartões, faturas, P&L, metas, simulação, importação de faturas e visão de planejamento. A implementação atual, porém, apresenta regras espalhadas, dependência forte de Supabase/Lovable e inconsistências de tipagem/modelagem.

A recomendação é usar este documento como contexto funcional oficial e reimplementar o Planner Vida com uma arquitetura nova, limpa e testável, preservando o comportamento financeiro comprovadamente útil e descartando a pilha antiga.
