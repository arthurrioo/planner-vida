import Link from "next/link";

import { createStatementService } from "@/application/statements/statement-service";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/form";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  asUserId,
  getEnumLabel,
  getEnumOptions,
  parseLocalDate,
} from "@/domain/shared";
import {
  isPaymentMethod,
  isTransactionStatus,
  isTransactionType,
} from "@/domain/transactions";
import type { StatementQueryInput } from "@/domain/statements";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function StatementPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const path = "/app/financeiro/extrato";
  const { user } = await getAuthenticatedSession(path);
  const service = await createStatementService();
  const statement = await service.getStatement(
    { userId: asUserId(user.id) },
    statementQueryFromParams(params),
  );
  const rows = statement.entries.map((entry) => ({
    account: entry.accountName ?? entry.creditCardName ?? "Sem conta/cartao",
    amount: formatBRL(entry.transaction.amount.amount),
    category: entry.categoryLabel ?? "Sem categoria",
    date: formatDateBR(entry.transaction.transactionDate),
    description: (
      <Link
        className="text-primary font-semibold hover:underline"
        href={entry.detailPath}
      >
        {entry.transaction.description}
      </Link>
    ),
    id: entry.transaction.id,
    method: getEnumLabel("payment_method", entry.transaction.paymentMethod),
    status: getEnumLabel("transaction_status", entry.transaction.status),
    type: getEnumLabel("transaction_type", entry.transaction.transactionType),
  }));
  const nextParams = pageParams(params, statement.page + 1);
  const previousParams = pageParams(params, statement.page - 1);

  return (
    <ProtectedAppShell nextPath={path}>
      <ModulePage
        description="Extrato financeiro realizado com filtros AFR-style, contexto de conta/cartao/categoria e saldo calculado por conta."
        eyebrow="Financeiro"
        title="Extrato"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {statement.accountBalances.length > 0 ? (
            statement.accountBalances.map((account) => (
              <Card key={account.id}>
                <CardHeader>
                  <CardTitle>{account.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground text-2xl font-semibold">
                    {formatBRL(account.balance.amount)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {getEnumLabel("account_status", account.status)} ·{" "}
                    {getEnumLabel("account_type", account.type)}
                  </p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Saldos</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  description="Cadastre uma conta para acompanhar saldo calculado no extrato."
                  title="Nenhuma conta encontrada"
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <Field htmlFor="statement-search" label="Buscar descricao">
                <Input
                  defaultValue={readParam(params.query)}
                  id="statement-search"
                  name="query"
                />
              </Field>
              <Field htmlFor="statement-date-from" label="Data inicial">
                <Input
                  defaultValue={readParam(params.dateFrom)}
                  id="statement-date-from"
                  name="dateFrom"
                  type="date"
                />
              </Field>
              <Field htmlFor="statement-date-to" label="Data final">
                <Input
                  defaultValue={readParam(params.dateTo)}
                  id="statement-date-to"
                  name="dateTo"
                  type="date"
                />
              </Field>
              <Field htmlFor="statement-type" label="Tipo">
                <select
                  className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
                  defaultValue={readParam(params.transactionType) ?? ""}
                  id="statement-type"
                  name="transactionType"
                >
                  <option value="">Todos</option>
                  {getEnumOptions("transaction_type").map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field htmlFor="statement-method" label="Metodo">
                <select
                  className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
                  defaultValue={readParam(params.paymentMethod) ?? ""}
                  id="statement-method"
                  name="paymentMethod"
                >
                  <option value="">Todos</option>
                  {getEnumOptions("payment_method").map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field htmlFor="statement-account" label="Conta">
                <select
                  className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
                  defaultValue={readParam(params.accountId) ?? ""}
                  id="statement-account"
                  name="accountId"
                >
                  <option value="">Todas</option>
                  {statement.options.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field htmlFor="statement-card" label="Cartao">
                <select
                  className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
                  defaultValue={readParam(params.creditCardId) ?? ""}
                  id="statement-card"
                  name="creditCardId"
                >
                  <option value="">Todos</option>
                  {statement.options.creditCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field htmlFor="statement-category" label="Categoria">
                <select
                  className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
                  defaultValue={readParam(params.categoryId) ?? ""}
                  id="statement-category"
                  name="categoryId"
                >
                  <option value="">Todas</option>
                  {categoryOptions(statement.options.categories).map(
                    (option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field htmlFor="statement-status" label="Status">
                <select
                  className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
                  defaultValue={readParam(params.status) ?? ""}
                  id="statement-status"
                  name="status"
                >
                  <option value="">Todos</option>
                  {getEnumOptions("transaction_status").map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field htmlFor="statement-page-size" label="Itens por pagina">
                <select
                  className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
                  defaultValue={String(statement.pageSize)}
                  id="statement-page-size"
                  name="pageSize"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">Filtrar</Button>
                <Link
                  className="hover:bg-muted inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                  href={path}
                >
                  Limpar
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historico realizado</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length > 0 ? (
              <div className="grid gap-4">
                <ResponsiveTable
                  columns={[
                    { header: "Descricao", key: "description" },
                    { header: "Tipo", key: "type" },
                    { header: "Data", key: "date" },
                    { header: "Conta/Cartao", key: "account" },
                    { header: "Categoria", key: "category" },
                    { header: "Metodo", key: "method" },
                    { header: "Status", key: "status" },
                    { header: "Valor", key: "amount" },
                  ]}
                  getRowKey={(row) => String(row.id)}
                  rows={rows}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">
                    Pagina {statement.page}
                  </p>
                  <div className="flex gap-2">
                    {statement.hasPreviousPage ? (
                      <Link
                        className="hover:bg-muted inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                        href={`${path}?${previousParams.toString()}`}
                      >
                        Anterior
                      </Link>
                    ) : null}
                    {statement.hasNextPage ? (
                      <Link
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                        href={`${path}?${nextParams.toString()}`}
                      >
                        Proxima
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                description="Ajuste os filtros ou registre transacoes e transferencias para popular o extrato."
                title="Nenhum lancamento encontrado"
              />
            )}
          </CardContent>
        </Card>
      </ModulePage>
    </ProtectedAppShell>
  );
}

function statementQueryFromParams(
  params: Record<string, string | string[] | undefined>,
): StatementQueryInput {
  return {
    accountId: uuidParam(params.accountId),
    categoryId: uuidParam(params.categoryId),
    creditCardId: uuidParam(params.creditCardId),
    dateFrom: localDateParam(params.dateFrom),
    dateTo: localDateParam(params.dateTo),
    page: readParam(params.page),
    pageSize: readParam(params.pageSize),
    paymentMethod: enumParam(params.paymentMethod, isPaymentMethod),
    query: readParam(params.query),
    status: enumParam(params.status, isTransactionStatus),
    transactionType: enumParam(params.transactionType, isTransactionType),
  };
}

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function uuidParam(value: string | string[] | undefined) {
  const param = readParam(value);

  return param && uuidPattern.test(param) ? param : undefined;
}

function localDateParam(value: string | string[] | undefined) {
  const param = readParam(value);

  if (!param) {
    return undefined;
  }

  try {
    return parseLocalDate(param);
  } catch {
    return undefined;
  }
}

function enumParam<TValue extends string>(
  value: string | string[] | undefined,
  predicate: (value: string) => value is TValue,
) {
  const param = readParam(value);

  return param && predicate(param) ? param : undefined;
}

function pageParams(
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const current = readParam(value);

    if (current && key !== "page") {
      next.set(key, current);
    }
  }

  next.set("page", String(page));
  return next;
}

function categoryOptions(
  categories: readonly {
    id: string;
    name: string;
    parentId: string | null;
    type: string;
  }[],
) {
  const roots = categories.filter((category) => category.parentId === null);
  const children = categories.filter((category) => category.parentId !== null);

  return roots.flatMap((root) => [
    {
      id: root.id,
      label: `${root.name} - ${getEnumLabel("category_type", root.type as never)}`,
    },
    ...children
      .filter((category) => category.parentId === root.id)
      .map((category) => ({
        id: category.id,
        label: `${root.name} / ${category.name}`,
      })),
  ]);
}
