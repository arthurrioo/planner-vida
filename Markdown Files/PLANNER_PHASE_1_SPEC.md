# Planner Vida - Phase 1 Specification

Documento de especificação funcional e técnica de alto nível para a Fase 1 do Planner Vida.

Referência funcional principal: [`AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`](./AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md).

## 1. Definição da Fase 1

A Fase 1 do Planner Vida deve resultar em uma aplicação funcional, segura, mobile-first e deployável que combine:

1. feature parity integral com o AFR Controle Financeiro existente;
2. núcleo essencial do Planner Vida;
3. primeiro deploy funcional em ambiente de produção.

A regra central da Fase 1 é:

> Planner Vida Fase 1 = AFR Controle Financeiro completo, com feature parity obrigatória, + módulos essenciais de planejamento de vida financeira + primeiro deploy utilizável.

## 2. Baseline funcional obrigatório

O arquivo [`AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`](./AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md) é o baseline funcional oficial do bloco financeiro da Fase 1.

Todas as funcionalidades, regras de negócio, fluxos financeiros, cálculos, estados, conceitos de segurança, fluxos de importação, relatórios e padrões de experiência classificados nesse documento como "preservar como requisito" devem ser considerados parte obrigatória da Fase 1, salvo decisão explícita em contrário.

Funcionalidades classificadas como "adaptar/reimplementar" também devem ser consideradas relevantes para a Fase 1 quando fizerem parte do fluxo financeiro central ou forem necessárias para preservar comportamento do AFR.

Funcionalidades classificadas como "opcional/melhorar" devem ser avaliadas dentro deste documento e só entram na Fase 1 quando forem expressamente listadas como in-scope.

## 3. Feature parity vs code parity

A Fase 1 exige feature parity com o AFR, mas não exige code parity.

Feature parity obrigatória significa que o usuário deve conseguir realizar no Planner Vida os fluxos financeiros relevantes já existentes no AFR, com comportamento equivalente ou melhor, incluindo:

- contas;
- cartões;
- categorias e subcategorias;
- transações;
- transferências;
- investimentos básicos;
- parcelamentos;
- recorrências;
- extrato;
- dashboard;
- faturas;
- relatórios de cartão;
- P&L;
- metas;
- previsões/simulador quando aplicáveis;
- importação de fatura PDF com revisão humana;
- aprendizado de categoria por estabelecimento;
- autenticação, isolamento de dados, permissões e auditoria.

Code parity não obrigatória significa que o Planner Vida não deve copiar obrigatoriamente:

- estrutura de pastas do AFR;
- componentes React antigos;
- hooks antigos;
- triggers SQL antigas;
- Edge Functions antigas;
- dependências Lovable;
- dependências Supabase específicas;
- convenções antigas de enums;
- URLs, chaves, IDs ou configurações do projeto anterior.

O AFR deve ser usado como referência funcional e de domínio, não como arquitetura obrigatória.

## 4. Objetivos da Fase 1

### 4.1 Objetivo principal

Entregar uma primeira versão real do Planner Vida que funcione como controle financeiro completo e planner operacional pessoal, permitindo ao usuário registrar, importar, revisar, planejar, projetar e acompanhar sua vida financeira em uma única aplicação.

### 4.2 Objetivos funcionais

- Preservar integralmente o valor funcional do AFR.
- Transformar o controle financeiro em um planner integrado.
- Unificar presente, futuro e histórico financeiro.
- Diferenciar transação realizada de compromisso futuro.
- Permitir visão diária, mensal e projetada.
- Permitir uso confortável no celular e no desktop.
- Permitir primeiro uso real em produção.

### 4.3 Objetivos técnicos de alto nível

- Preparar a aplicação para uma arquitetura limpa, testável e evolutiva.
- Evitar carregar dívida técnica conhecida do AFR.
- Centralizar regras financeiras em camada de domínio ou serviços equivalentes.
- Definir requisitos suficientes para a próxima etapa de arquitetura e database.
- Não definir ainda schema SQL detalhado, migrations, APIs internas finais ou infraestrutura definitiva.

## 5. Escopo in-scope

A Fase 1 inclui:

- Bloco financeiro completo com feature parity em relação ao AFR.
- Home / Hoje.
- Calendário central.
- Tasks / Planner.
- Compromissos financeiros futuros.
- Recorrências básicas.
- Shopping Lists.
- Wishlist básica.
- Forecast integrado básico.
- Assinaturas.
- Patrimônio básico.
- Obrigações anuais básicas.
- IPVA básico.
- IPTU básico.
- Seguros, anuidades e despesas anuais recorrentes.
- Provisionamento anual/mensal.
- Macro básico: Selic, CDI/DI e IPCA.
- Importação de arquivos, incluindo PDF de fatura com senha opcional.
- Revisão humana antes de salvar importações.
- Segurança, autenticação, isolamento de dados e auditoria.
- Mobile-first, responsividade e PWA quando viável.
- Deploy funcional.

## 6. Escopo out-of-scope para Fase 1

Os itens abaixo ficam para Fase 2 ou posterior, mesmo que sejam conceitos aprovados para o futuro do Planner Vida:

- Safe-to-Spend avançado.
- What-if avançado.
- Opportunity Cost completo.
- Purchase Decision completo.
- Goals Backsolver completo.
- Liquidity Ladder.
- Emergency Runway.
- Stress Test financeiro avançado.
- Forecast Accuracy.
- Personal CFO / insights automáticos avançados.
- Rules Engine configurável.
- Reconciliation / Data Quality Center avançado.
- Inbox Universal.
- Morning / Weekly / Monthly Briefing automático.
- Life Goals Dashboard completo.
- Financial Calendar Heatmap avançado.
- Decision Journal.
- Recurring Expense Audit avançado.
- Purchase History / Cost of Ownership completo.
- Garantias avançadas.
- Manutenção preventiva.
- Módulo completo de viagens.
- Módulo completo de veículos.
- Módulo completo de casa.
- Price Tracker.
- Integrações com atalhos/voz.
- Tax Engine nacional completo.
- Cobertura automática completa de IPVA para todos os estados.
- Cobertura automática completa de IPTU para todos os municípios.
- Cenários macroeconômicos avançados.
- Previsão de inflação, juros ou câmbio.
- Arquitetura definitiva de infraestrutura.
- Schema SQL detalhado.
- Migrations finais.
- APIs internas finais.
- Estrutura final de componentes frontend.

## 7. Princípios de produto

### 7.1 O Planner não deve ser um conjunto de módulos isolados

Os módulos da Fase 1 devem conversar entre si. Um dado registrado em um lugar deve alimentar outras visões quando fizer sentido.

Exemplos:

- uma assinatura gera recorrência, compromisso futuro, item no calendário e impacto no forecast;
- uma consulta médica pode ser evento, compromisso financeiro previsto e depois transação realizada;
- um IPVA pode ser obrigação anual, vencimento no calendário, compromisso futuro e base de provisionamento;
- uma fatura importada deve gerar transações, faturas, categorias e aprendizado de estabelecimento.

### 7.2 O app deve separar passado, presente e futuro

A modelagem funcional deve distinguir:

- realizado: o que já aconteceu;
- previsto: o que provavelmente acontecerá;
- planejado: o que o usuário quer que aconteça;
- comprometido: obrigação assumida, mas ainda não realizada.

A interface da Fase 1 pode simplificar essa distinção, mas a especificação funcional não deve impedir essa evolução.

### 7.3 Decisão financeira deve ser auditável

Sempre que o app fizer cálculo ou sugestão relevante, deve ser possível entender:

- fonte do dado;
- premissas usadas;
- data-base;
- valores de entrada;
- resultado calculado.

Na Fase 1, isso é especialmente importante para:

- forecast;
- faturas;
- importação de PDFs;
- provisionamento;
- macro básico;
- patrimônio;
- metas e simulações herdadas do AFR.

## 8. Módulos da Fase 1

## 8.1 Bloco financeiro AFR

O bloco financeiro é o coração da Fase 1 e deve preservar o comportamento do AFR documentado no baseline.

### Incluir obrigatoriamente

- Autenticação e usuário proprietário dos dados.
- Contas financeiras.
- Cartões de crédito.
- Categorias e subcategorias.
- Transações de receita, despesa, transferência e investimento.
- Métodos de pagamento.
- Parcelamento.
- Recorrências financeiras.
- Extrato com filtros, edição e exclusão controlada.
- Dashboard mensal.
- Cálculo de saldo.
- Faturas de cartão.
- Pagamento de faturas.
- Juros em fatura.
- Ajuste manual controlado de fechamento de fatura.
- Ocultação de faturas em relatórios quando aplicável.
- Relatórios de cartão.
- P&L mensal.
- P&L comparativo.
- Metas financeiras.
- Simulador de cenários, quando necessário para preservar o diferencial funcional do AFR.
- Investimentos básicos.
- Importação de fatura PDF.
- Aprendizado de categoria por estabelecimento.
- Auditoria administrativa para ações sensíveis.

### Requisitos específicos

- Transações de cartão não devem reduzir saldo da conta no momento da compra.
- Compras parceladas devem gerar parcelas futuras e preservar vínculo com a compra original.
- Relatórios não podem duplicar totais por causa de registros pai/filho ou séries.
- Transferências devem representar origem e destino.
- Categorias e subcategorias devem alimentar dashboard, P&L, relatórios e filtros.
- Datas financeiras devem ser tratadas como datas locais de negócio, sem deslocamento por fuso horário.
- Cálculos financeiros críticos devem ser determinísticos e testáveis.

## 8.2 Home / Hoje

A Home deve ser a tela operacional inicial do Planner Vida.

Ela deve responder rapidamente:

- o que tenho hoje;
- o que preciso pagar;
- o que vou receber;
- o que preciso fazer;
- como está meu mês;
- o que acontece nos próximos dias.

### Deve exibir

- eventos de hoje;
- tarefas de hoje;
- contas vencendo hoje;
- contas próximas;
- recebimentos próximos;
- pagamentos próximos;
- faturas próximas do fechamento ou vencimento;
- resumo financeiro do mês;
- saldo ou posição financeira resumida;
- projeção simples até o fim do mês;
- próximos 7 dias.

### Regras

- A Home deve consumir dados do calendário, tasks, compromissos futuros, faturas e financeiro.
- A Home não deve duplicar cadastros; deve ser uma visão consolidada.
- A Home deve priorizar clareza e rapidez de leitura no celular.

## 8.3 Calendário central

O Calendário Central deve reunir eventos pessoais e financeiros.

### Tipos mínimos

- evento;
- compromisso;
- tarefa;
- conta;
- pagamento;
- recebimento;
- fatura;
- obrigação anual.

### Campos funcionais mínimos

- título;
- descrição;
- data inicial;
- data final;
- horário;
- dia inteiro;
- tipo;
- valor opcional;
- impacto financeiro;
- categoria opcional;
- conta opcional;
- cartão opcional;
- status;
- recorrência opcional;
- origem do item: manual, assinatura, obrigação, fatura, recorrência ou importação.

### Requisitos

- Criar, editar, excluir e visualizar eventos.
- Permitir itens sem impacto financeiro.
- Permitir itens com impacto financeiro previsto.
- Integrar com compromissos futuros e forecast.
- Exibir obrigações anuais e assinaturas quando aplicável.
- Permitir visão mensal e lista dos próximos itens.

## 8.4 Tasks / Planner

O módulo de tasks deve ser simples, operacional e integrado ao calendário.

### Campos mínimos

- título;
- descrição;
- data;
- prioridade;
- categoria;
- status;
- concluído em;
- vínculo opcional com evento, compromisso ou item financeiro.

### Estados mínimos

- pendente;
- concluída;
- cancelada ou arquivada, se necessário.

### Requisitos

- Criar, editar, concluir e excluir tasks.
- Mostrar tasks na Home.
- Mostrar tasks no calendário quando tiverem data.
- Não transformar task automaticamente em transação financeira.
- Permitir vínculo manual com item financeiro quando fizer sentido.

## 8.5 Compromissos financeiros futuros

Compromissos financeiros futuros representam eventos financeiros ainda não realizados.

Eles são diferentes de transações realizadas.

### Exemplos

- conta futura;
- salário futuro;
- recebimento esperado;
- consulta médica a pagar;
- débito automático;
- parcela futura;
- assinatura;
- imposto anual;
- seguro;
- anuidade.

### Requisitos

- Registrar compromisso com valor, data, tipo e status.
- Indicar se o compromisso afeta forecast.
- Permitir converter compromisso em transação realizada.
- Permitir vínculo com calendário.
- Permitir origem automática por recorrência, assinatura, fatura ou obrigação anual.
- Evitar duplicidade entre compromisso futuro e transação realizada.

### Estados conceituais

- previsto;
- confirmado;
- vencido;
- realizado;
- cancelado.

## 8.6 Recorrências básicas

A Fase 1 deve suportar recorrências básicas suficientes para uso real.

### Frequências mínimas

- semanal;
- mensal;
- anual.

### Aplicável a

- receitas;
- despesas;
- eventos;
- tasks;
- assinaturas;
- obrigações anuais;
- compromissos financeiros.

### Requisitos

- Definir data inicial.
- Definir frequência.
- Definir dia de ocorrência quando aplicável.
- Definir fim por data, quantidade de ocorrências ou indefinido.
- Gerar ou projetar ocorrências futuras de forma controlada.
- Evitar duplicidade quando uma ocorrência for realizada manualmente.
- Permitir pausar, encerrar ou editar recorrência.

### Fora da Fase 1

- regras complexas como "último dia útil do mês";
- exceções recorrentes avançadas;
- calendários nacionais completos de feriados;
- engine avançada de regras temporais.

## 8.7 Shopping Lists

Shopping Lists devem permitir listas simples e úteis para mercado, casa e outros contextos.

### Requisitos

- Criar múltiplas listas.
- Editar nome da lista.
- Arquivar ou excluir lista.
- Adicionar itens.
- Marcar item como comprado/concluído.
- Informar quantidade opcional.
- Informar preço estimado opcional.
- Exibir total estimado da lista.

### Regras financeiras

- Item de shopping list não deve gerar transação automaticamente.
- Quando a compra for confirmada, o usuário pode registrar uma transação associada.
- Preços estimados podem alimentar planejamento ou forecast apenas se o usuário indicar que devem ser considerados.

## 8.8 Wishlist

Wishlist deve registrar desejos de compra sem forçar impacto financeiro imediato.

### Campos mínimos

- item;
- descrição;
- preço estimado;
- prioridade;
- link;
- status;
- categoria opcional;
- data desejada opcional.

### Status mínimos

- desejado;
- avaliando;
- comprado;
- descartado.

### Requisitos

- Exibir lista priorizada.
- Permitir edição de preço estimado.
- Permitir link externo.
- Permitir marcar como comprado sem gerar transação automaticamente.
- Permitir criar transação quando a compra for efetivada.

### Fora da Fase 1

- price tracker;
- oportunidade de compra automática;
- opportunity cost completo;
- comparação avançada de cenários.

## 8.9 Forecast básico integrado

O forecast da Fase 1 deve conectar saldo atual, receitas futuras e compromissos futuros.

### Fórmula conceitual mínima

```text
saldo projetado =
  saldo atual
  + receitas futuras conhecidas
  - compromissos futuros conhecidos
```

### Deve considerar

- saldo atual das contas;
- receitas futuras;
- despesas futuras;
- parcelas futuras;
- faturas futuras ou a vencer;
- assinaturas;
- obrigações anuais;
- compromissos manuais;
- provisionamentos quando selecionados para visão econômica.

### Deve exibir

- projeção até o fim do mês;
- próximos compromissos relevantes;
- saldo projetado após compromissos;
- separação entre realizado e previsto;
- alertas simples para saldo projetado negativo ou concentração de pagamentos.

### Regras

- Forecast não deve transformar previsão em realizado.
- Forecast deve indicar premissas e itens considerados.
- Forecast deve permitir rastrear de onde vem cada impacto.
- Forecast deve preservar e, quando fizer sentido, adaptar previsões/tendências do AFR.

## 8.10 Assinaturas

Assinaturas são compromissos recorrentes de serviços.

### Campos mínimos

- serviço;
- descrição;
- valor;
- frequência;
- próxima cobrança;
- conta ou cartão;
- categoria;
- status;
- data de início;
- data de término opcional.

### Requisitos

- Criar, editar, pausar, cancelar e excluir assinatura.
- Gerar compromisso futuro.
- Aparecer no calendário.
- Alimentar forecast.
- Gerar recorrência básica.
- Permitir vincular pagamento realizado à assinatura.
- Exibir custo mensal e custo anual.

### Exemplos

- streaming;
- software;
- academia;
- armazenamento em nuvem;
- serviços financeiros;
- ferramentas de IA.

## 8.11 Patrimônio básico

Patrimônio básico deve responder quanto o usuário possui em termos consolidados.

### Componentes mínimos

- contas;
- investimentos;
- outros ativos;
- dívidas;
- cartões/faturas a pagar quando aplicável;
- passivos informados manualmente.

### Cálculo conceitual

```text
patrimônio líquido = ativos - passivos
```

### Requisitos

- Exibir total de ativos.
- Exibir total de passivos.
- Exibir patrimônio líquido.
- Permitir cadastro manual de ativos simples.
- Permitir cadastro manual de dívidas simples.
- Integrar contas e investimentos existentes.
- Separar patrimônio de saldo disponível.

### Fora da Fase 1

- liquidez por prazo;
- stress test;
- runway;
- performance patrimonial avançada;
- alocação sofisticada de investimentos.

## 8.12 Obrigações anuais básicas

Obrigações anuais devem representar despesas relevantes que acontecem uma ou poucas vezes por ano, mas devem ser planejadas mensalmente.

### Tipos mínimos

- IPVA;
- IPTU;
- seguros;
- anuidades;
- taxas profissionais;
- outras obrigações anuais manuais.

### Campos mínimos

- tipo;
- descrição;
- exercício;
- valor;
- vencimento;
- parcelamento;
- conta/cartão previsto;
- categoria;
- status;
- provisionamento mensal;
- observações.

### Requisitos

- Criar obrigação anual.
- Definir pagamento à vista ou parcelado.
- Mostrar vencimentos no calendário.
- Alimentar forecast.
- Permitir provisionamento.
- Permitir conversão em transação realizada no pagamento.
- Permitir override manual de valor calculado.

## 8.13 IPVA básico

IPVA deve entrar na Fase 1 como obrigação anual prática, não como Tax Engine nacional completo.

### Campos mínimos

- veículo;
- estado;
- tipo do veículo;
- exercício;
- valor venal informado;
- alíquota;
- valor calculado;
- valor manual sobrescrito, se aplicável;
- vencimento ou parcelas;
- status.

### Requisitos

- Permitir cálculo por valor venal e alíquota.
- Permitir preenchimento manual quando não houver regra automática confiável.
- Permitir override do valor calculado.
- Exibir diferença entre valor estimado e valor manual quando houver.
- Alimentar calendário, forecast e provisionamento.

### Observação

Quando houver regra simples e confiável para uma jurisdição, o app pode sugerir alíquota. Ainda assim, a Fase 1 deve manter fallback manual e não deve prometer cobertura automática nacional completa.

## 8.14 IPTU básico

IPTU deve entrar na Fase 1 como obrigação anual prática e configurável.

### Campos mínimos

- imóvel;
- município;
- estado;
- exercício;
- valor venal;
- regra/alíquota informada;
- valor calculado;
- valor manual sobrescrito, se aplicável;
- vencimentos;
- status.

### Requisitos

- Permitir cálculo manual ou semiautomático.
- Permitir override.
- Permitir parcelamento.
- Alimentar calendário, forecast e provisionamento.
- Não depender de cobertura automática de todos os municípios.

## 8.15 Provisionamento

Provisionamento deve separar data de pagamento de custo econômico mensal.

### Exemplo

```text
Seguro anual: R$ 6.000
Pagamento: março
Provisionamento: R$ 500 por mês
```

### Requisitos

- Permitir ativar provisionamento para obrigações anuais.
- Calcular valor mensal provisionado.
- Exibir visão de caixa e visão econômica quando aplicável.
- Permitir provisionamento de IPVA, IPTU, seguros e anuidades.
- Integrar com forecast sem confundir provisionamento com pagamento realizado.
- Permitir desativar ou ajustar provisionamento.

### Regras

- Provisionamento não é transação realizada.
- Pagamento real deve continuar separado.
- O app deve deixar claro se uma visão está mostrando caixa ou competência econômica.

## 8.16 Macro básico

Macro básico deve fornecer referências econômicas simples, úteis e auditáveis.

### Indicadores mínimos

- Selic;
- CDI/DI;
- IPCA.

### Fontes preferenciais

- fontes públicas;
- fontes oficiais;
- Banco Central quando aplicável;
- IBGE quando aplicável;
- B3 ou fonte confiável para CDI/DI quando aplicável.

### Usos iniciais na Fase 1

- exibir taxa atual ou última taxa disponível;
- guardar histórico básico;
- calcular IPCA acumulado em períodos simples;
- apoiar ganho real simples de renda ou patrimônio quando houver dados suficientes;
- apoiar rentabilidade básica de investimentos indexados;
- apoiar custo de oportunidade simples apenas como referência, sem módulo avançado de decisão.

### Requisitos de auditabilidade

Todo cálculo macro usado pelo Planner deve registrar ou exibir:

- índice utilizado;
- período;
- taxa usada;
- data da consulta ou data-base;
- fonte;
- se o valor é realizado, estimado ou premissa.

### Fora da Fase 1

- previsão macroeconômica;
- cenários complexos;
- curva futura de juros;
- recomendação de investimento;
- decisão automática de compra.

## 8.17 Importação de arquivos

A Fase 1 deve preservar o fluxo de importação relevante do AFR, especialmente faturas de cartão em PDF.

### Tipos mínimos

- PDF de fatura de cartão.

### Desejável, se couber sem comprometer o escopo

- CSV financeiro;
- OFX;
- planilhas simples.

Esses formatos adicionais não são obrigatórios para encerrar a Fase 1, a menos que sejam necessários para preservar um fluxo existente relevante.

## 8.18 Importação de PDF de fatura

O fluxo de PDF de fatura é obrigatório por feature parity com o AFR.

### Fluxo obrigatório

1. Usuário seleciona cartão.
2. Usuário seleciona mês ou período de referência.
3. Usuário envia PDF.
4. Usuário informa senha opcional quando o PDF for protegido.
5. Sistema valida arquivo.
6. Sistema extrai texto.
7. Sistema identifica lançamentos.
8. Sistema sugere categoria e subcategoria quando possível.
9. Sistema aplica aprendizado anterior por estabelecimento.
10. Usuário revisa linha a linha.
11. Usuário inclui, exclui ou corrige itens.
12. Usuário confirma importação.
13. Sistema salva transações, parcelas futuras e vínculos necessários.
14. Sistema registra lote de importação e auditoria.
15. Sistema atualiza fatura, relatórios, extrato e aprendizado de categoria.

### Revisão humana obrigatória

Nenhuma importação de fatura PDF deve ser gravada definitivamente sem revisão humana.

A tela de revisão deve permitir:

- incluir ou excluir linha;
- corrigir data;
- corrigir descrição;
- corrigir valor;
- corrigir parcela atual e total de parcelas;
- corrigir categoria;
- corrigir subcategoria;
- visualizar alertas de possível duplicidade;
- confirmar lote.

### PDFs com senha

O sistema deve suportar PDF com senha quando tecnicamente possível.

Requisitos:

- senha deve ser usada apenas para abrir/processar o arquivo;
- senha não deve ser armazenada em texto claro;
- falha de senha deve gerar mensagem clara;
- usuário deve poder tentar novamente;
- logs não devem expor senha.

### Deduplicação

A importação deve evitar duplicidades:

- contra transações já existentes;
- dentro do mesmo lote;
- em parcelas futuras;
- em descrições equivalentes com ruídos de banco/adquirente.

### Aprendizado de categoria

O sistema deve preservar a capacidade de aprender categorias por estabelecimento:

- normalizar merchant;
- sugerir categoria usada anteriormente;
- manter contagem de uso;
- registrar última utilização;
- permitir correção humana.

### Segurança do upload

- limitar tamanho de arquivo;
- validar extensão e tipo;
- proteger armazenamento temporário;
- impedir acesso entre usuários;
- auditar processamento;
- limpar arquivos temporários quando aplicável.

## 9. Regras de integração entre módulos

## 9.1 Assinatura

Fluxo esperado:

```text
assinatura
-> recorrência
-> compromisso financeiro futuro
-> calendário
-> forecast
-> transação realizada ou fatura quando paga/cobrada
```

## 9.2 Consulta ou compromisso com custo

Fluxo esperado:

```text
evento no calendário
-> valor previsto
-> compromisso financeiro futuro
-> forecast
-> transação realizada quando pago
```

## 9.3 IPVA

Fluxo esperado:

```text
veículo / obrigação anual
-> cálculo ou valor manual
-> vencimentos
-> calendário
-> provisionamento
-> forecast
-> transação realizada quando pago
```

## 9.4 IPTU

Fluxo esperado:

```text
imóvel / obrigação anual
-> cálculo ou valor manual
-> parcelas ou pagamento único
-> calendário
-> provisionamento
-> forecast
-> transação realizada quando pago
```

## 9.5 Shopping List

Fluxo esperado:

```text
lista de compras
-> itens com preço estimado opcional
-> total estimado
-> sem transação automática
-> transação apenas quando compra for confirmada
```

## 9.6 Wishlist

Fluxo esperado:

```text
item desejado
-> preço estimado
-> prioridade
-> decisão manual
-> transação apenas se comprado
```

## 9.7 Fatura importada

Fluxo esperado:

```text
PDF
-> extração
-> IA/parsing
-> revisão humana
-> deduplicação
-> transações
-> parcelas futuras
-> fatura
-> dashboard / relatórios / P&L
```

## 9.8 Macro

Fluxo esperado:

```text
fonte pública/oficial
-> série macro
-> taxa ou índice
-> cálculo simples
-> exibição com fonte e data-base
```

## 10. Requisitos funcionais gerais

### RF-001 Autenticação

O usuário deve conseguir criar conta, acessar a aplicação e recuperar acesso conforme política definida na arquitetura.

### RF-002 Isolamento de dados

Cada usuário deve visualizar e manipular apenas seus próprios dados, salvo perfis administrativos autorizados.

### RF-003 Contas

O usuário deve conseguir criar, editar, visualizar e excluir ou arquivar contas, preservando segurança quando existirem transações dependentes.

### RF-004 Cartões

O usuário deve conseguir cadastrar cartões com limite, bandeira, conta vinculada, dia de fechamento e dia de vencimento.

### RF-005 Transações

O usuário deve conseguir registrar receitas, despesas, transferências e investimentos.

### RF-006 Parcelamentos

O usuário deve conseguir registrar compra parcelada e visualizar parcelas futuras sem duplicar relatórios.

### RF-007 Recorrências

O usuário deve conseguir registrar recorrências semanais, mensais e anuais.

### RF-008 Extrato

O usuário deve conseguir pesquisar, filtrar, editar e excluir transações com controle seguro.

### RF-009 Dashboard

O usuário deve conseguir visualizar KPIs financeiros mensais e gráficos básicos.

### RF-010 Faturas

O usuário deve conseguir visualizar faturas por cartão, status, vencimento, fechamento, total e pagamento.

### RF-011 Relatórios

O usuário deve conseguir visualizar relatórios financeiros e de cartão preservando regras do AFR.

### RF-012 P&L

O usuário deve conseguir visualizar P&L mensal e comparativo.

### RF-013 Metas

O usuário deve conseguir criar e acompanhar metas financeiras básicas conforme baseline do AFR.

### RF-014 Simulador

O usuário deve conseguir criar simulações básicas quando o fluxo for necessário para preservar o diferencial existente no AFR.

### RF-015 Home / Hoje

O usuário deve conseguir visualizar a agenda financeira e operacional do dia.

### RF-016 Calendário

O usuário deve conseguir visualizar eventos, tarefas e compromissos financeiros em calendário.

### RF-017 Tasks

O usuário deve conseguir gerenciar tarefas simples.

### RF-018 Compromissos futuros

O usuário deve conseguir registrar e acompanhar compromissos financeiros futuros sem tratá-los como realizados.

### RF-019 Forecast básico

O usuário deve conseguir visualizar posição projetada com base em saldo atual, receitas futuras e compromissos futuros.

### RF-020 Shopping Lists

O usuário deve conseguir criar listas de compras e marcar itens como comprados.

### RF-021 Wishlist

O usuário deve conseguir registrar itens desejados com preço, prioridade e link.

### RF-022 Assinaturas

O usuário deve conseguir gerenciar assinaturas recorrentes e seus impactos futuros.

### RF-023 Patrimônio básico

O usuário deve conseguir visualizar ativos, passivos e patrimônio líquido básico.

### RF-024 Obrigações anuais

O usuário deve conseguir registrar IPVA, IPTU, seguros, anuidades e outras obrigações anuais.

### RF-025 Provisionamento

O usuário deve conseguir transformar despesas anuais em custo mensal provisionado.

### RF-026 Macro básico

O usuário deve conseguir consultar Selic, CDI/DI e IPCA e usar esses índices em cálculos simples.

### RF-027 Importação de PDF

O usuário deve conseguir importar PDF de fatura, inclusive com senha quando aplicável, revisar e salvar os lançamentos.

### RF-028 Auditoria

O sistema deve registrar operações sensíveis.

### RF-029 Deploy

A Fase 1 deve terminar com aplicação deployada e utilizável.

## 11. Requisitos não funcionais

### RNF-001 Performance

As telas principais devem carregar rapidamente com volume realista de dados pessoais.

### RNF-002 Confiabilidade

Cálculos financeiros críticos devem ser consistentes entre telas.

### RNF-003 Testabilidade

Regras de saldo, fatura, parcelamento, recorrência, forecast, provisionamento e importação devem ser testáveis.

### RNF-004 Auditabilidade

Operações sensíveis e cálculos importantes devem ter rastreabilidade suficiente para investigação.

### RNF-005 Manutenibilidade

Regras financeiras não devem ficar duplicadas e divergentes entre UI, banco e backend.

### RNF-006 Internacionalização mínima

A Fase 1 deve usar português brasileiro, BRL e datas pt-BR.

### RNF-007 Acessibilidade

A interface deve ser utilizável por teclado, ter contraste adequado e labels claros.

### RNF-008 Responsividade

Todas as telas essenciais devem funcionar em celular e desktop.

### RNF-009 Observabilidade

Falhas de importação, autenticação, jobs, cálculos e deploy devem ser identificáveis por logs ou mecanismos equivalentes.

### RNF-010 Segurança por padrão

Dados financeiros, uploads e permissões devem ser tratados como sensíveis.

## 12. Segurança e governança

### 12.1 Obrigatório na Fase 1

- Autenticação.
- Isolamento de dados por usuário.
- RLS ou mecanismo equivalente de segurança no acesso a dados.
- RBAC básico para administração.
- Proteção de uploads.
- Validação de inputs.
- Rate limit para fluxos sensíveis quando aplicável.
- Auditoria de operações sensíveis.
- Nenhum secret no frontend.
- Nenhuma chave antiga do AFR migrada.
- Tratamento seguro de PDF protegido por senha.
- Mensagens de erro sem vazamento de dados sensíveis.

### 12.2 Operações sensíveis

Devem ser auditadas:

- login suspeito ou bloqueio;
- alteração de senha;
- exportação de dados;
- importação de fatura;
- confirmação de lote importado;
- alteração de papel administrativo;
- exclusão ou arquivamento de dados críticos;
- pagamento ou ajuste de fatura;
- alterações relevantes em obrigações anuais;
- alterações manuais de valores calculados.

### 12.3 Dados financeiros

O sistema deve tratar como sensíveis:

- transações;
- contas;
- cartões;
- faturas;
- PDFs de faturas;
- patrimônio;
- obrigações;
- anexos;
- dados de usuário;
- logs com identificadores.

## 13. Mobile, responsividade e PWA

### 13.1 Mobile-first

A aplicação deve ser confortável para uso diário em celular.

Fluxos prioritários no mobile:

- ver Home / Hoje;
- registrar transação;
- consultar calendário;
- concluir task;
- ver contas a pagar;
- ver forecast;
- registrar gasto rápido;
- consultar fatura;
- revisar itens simples.

### 13.2 Desktop

Desktop deve ser usado para fluxos mais analíticos:

- importação e revisão de fatura;
- P&L;
- relatórios;
- dashboard;
- forecast;
- patrimônio;
- configurações;
- análise de categorias.

### 13.3 PWA

Quando tecnicamente viável na Fase 1, o Planner deve suportar:

- instalação como app;
- ícone;
- tela inicial;
- responsividade;
- funcionamento estável em navegador móvel.

Offline completo não é requisito obrigatório da Fase 1.

## 14. Requisitos de dados em alto nível

Este documento não define schema SQL detalhado.

A próxima etapa deverá traduzir estes conceitos para arquitetura e database.

Entidades conceituais que precisam ser consideradas:

- usuário;
- perfil;
- papel/permissão;
- conta;
- cartão;
- categoria;
- subcategoria;
- transação;
- transferência;
- parcela;
- recorrência;
- fatura;
- pagamento de fatura;
- lote de importação;
- item importado;
- mapeamento de estabelecimento/categoria;
- meta;
- cenário/simulação;
- evento de calendário;
- task;
- compromisso financeiro futuro;
- shopping list;
- item de shopping list;
- wishlist item;
- assinatura;
- ativo;
- passivo;
- obrigação anual;
- provisionamento;
- série macro;
- valor macro;
- log de auditoria.

Esses conceitos devem orientar a próxima etapa, mas nomes finais de tabelas, colunas, índices, constraints e migrations não pertencem a este documento.

## 15. Critérios de aceite

A Fase 1 será aceita quando todos os critérios abaixo forem atendidos.

### 15.1 Feature parity AFR

- Todas as funcionalidades relevantes do AFR listadas no baseline estão disponíveis.
- Nenhuma funcionalidade financeira central foi removida sem decisão explícita.
- Contas, cartões, transações, categorias, faturas, extrato, dashboard, P&L, metas, importação e auditoria funcionam.
- Os cálculos principais são consistentes com o comportamento esperado do AFR ou melhoram inconsistências documentadas.

### 15.2 Núcleo Planner Vida

- Home / Hoje funciona.
- Calendário central funciona.
- Tasks funcionam.
- Compromissos financeiros futuros funcionam.
- Recorrências básicas funcionam.
- Shopping Lists funcionam.
- Wishlist funciona.
- Assinaturas funcionam.
- Forecast básico funciona.
- Patrimônio básico funciona.
- Obrigações anuais funcionam.
- Provisionamento funciona.
- Macro básico funciona.

### 15.3 Importação

- PDF de fatura pode ser enviado.
- PDF com senha é suportado quando tecnicamente possível.
- Extração/parsing gera itens revisáveis.
- Revisão humana é obrigatória antes de salvar.
- Deduplicação funciona.
- Parcelas futuras são criadas corretamente.
- Aprendizado por estabelecimento funciona.
- Lote de importação é auditável.

### 15.4 Segurança

- Autenticação está ativa.
- Dados são isolados por usuário.
- Usuário não acessa dados de outro usuário.
- Uploads são protegidos.
- Secrets não estão no frontend.
- Operações sensíveis são auditadas.
- Fluxos sensíveis possuem validação.

### 15.5 UX e dispositivos

- Aplicação funciona em desktop.
- Aplicação funciona adequadamente em celular.
- Navegação principal está clara.
- Fluxos críticos exigem poucos passos.
- Datas, moeda e idioma estão em pt-BR/BRL.
- Fase 1 é utilizável sem depender de ferramentas técnicas.

### 15.6 Deploy

- Aplicação está deployada em ambiente acessível.
- Build de produção passa.
- Variáveis de ambiente estão configuradas de forma segura.
- Fluxos principais funcionam no ambiente deployado.

## 16. Definition of Done

A Fase 1 só pode ser considerada concluída quando:

1. O comportamento financeiro essencial do AFR foi preservado.
2. Feature parity foi validada contra [`AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md`](./AFR_EXISTING_SYSTEM_CONTEXT_PLANNER_VIDA.md).
3. Code parity não foi tratada como obrigação.
4. Home / Hoje está implementada.
5. Calendário central está implementado.
6. Tasks estão implementadas.
7. Compromissos financeiros futuros estão implementados.
8. Recorrências semanais, mensais e anuais estão implementadas.
9. Shopping Lists estão implementadas.
10. Wishlist está implementada.
11. Assinaturas estão implementadas.
12. Forecast básico está implementado.
13. Patrimônio básico está implementado.
14. Obrigações anuais básicas estão implementadas.
15. IPVA básico está implementado.
16. IPTU básico está implementado.
17. Provisionamento está implementado.
18. Macro básico com Selic, CDI/DI e IPCA está implementado.
19. Importação de PDF de fatura com revisão humana está implementada.
20. PDFs protegidos por senha têm fluxo tratado.
21. Autenticação e isolamento de dados estão funcionando.
22. Segurança de uploads está implementada.
23. Operações sensíveis são auditadas.
24. Interface funciona em mobile e desktop.
25. Aplicação está deployada.
26. Testes ou validações relevantes cobrem fluxos críticos.
27. Não há placeholders, telas vazias ou fluxos críticos incompletos.
28. Limitações conhecidas estão documentadas.

## 17. Próxima etapa após este documento

Depois da aprovação deste `PLANNER_PHASE_1_SPEC.md`, a próxima etapa deve produzir documentos técnicos mais detalhados, como:

- `PLANNER_PHASE_1_ARCHITECTURE.md`;
- `DATABASE_SCHEMA.md`;
- plano de migração/adaptação do AFR;
- backlog técnico da Fase 1;
- plano de testes;
- plano de deploy.

Esses documentos deverão decidir:

- arquitetura final;
- stack;
- schema SQL;
- migrations;
- APIs;
- serviços de domínio;
- jobs;
- componentes;
- organização de pastas;
- estratégia de deploy.

Este documento deve permanecer como contrato de escopo e comportamento da Fase 1.
