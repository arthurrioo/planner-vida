import Link from "next/link";

import { createTransactionAction } from "./actions";
import { createTransactionService } from "@/application/transactions/transaction-service";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionStatusMessage } from "@/components/transactions/transaction-status-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/form";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { asUserId, getEnumLabel, parseLocalDate } from "@/domain/shared";
import {
  isPaymentMethod,
  isTransactionStatus,
  isTransactionType,
  type TransactionSearch,
} from "@/domain/transactions";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await getAuthenticatedSession("/app/financeiro/transacoes");
  const context = { userId: asUserId(user.id) };
  const service = await createTransactionService();
  const [transactions, options] = await Promise.all([
    service.listTransactions(context, searchFromParams(params)),
    service.listFormOptions(context),
  ]);
  const rows = transactions.map((transaction) => ({
    amount: formatBRL(transaction.amount.amount),
    date: formatDateBR(transaction.transactionDate),
    description: (
      <Link
        className="text-primary font-semibold hover:underline"
        href={
          transaction.transactionType === "transfer" && transaction.transferId
            ? `/app/financeiro/transferencias/${transaction.transferId}`
            : `/app/financeiro/transacoes/${transaction.id}`
        }
      >
        {transaction.description}
      </Link>
    ),
    id: transaction.id,
    method: getEnumLabel("payment_method", transaction.paymentMethod),
    status: getEnumLabel("transaction_status", transaction.status),
    type: getEnumLabel("transaction_type", transaction.transactionType),
  }));

  return (
    <ProtectedAppShell nextPath="/app/financeiro/transacoes">
      <ModulePage
        description="Fatos financeiros realizados com datas locais, categoria, conta/cartao e rastro de origem."
        eyebrow="Financeiro"
        title="Transacoes"
      >
        <TransactionStatusMessage searchParams={params} />

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-4">
              <Field htmlFor="transaction-search" label="Buscar descricao">
                <Input
                  defaultValue={readParam(params.query)}
                  id="transaction-search"
                  name="query"
                />
              </Field>
              <Field htmlFor="transaction-date-from" label="Data inicial">
                <Input
                  defaultValue={readParam(params.dateFrom)}
                  id="transaction-date-from"
                  name="dateFrom"
                  type="date"
                />
              </Field>
              <Field htmlFor="transaction-date-to" label="Data final">
                <Input
                  defaultValue={readParam(params.dateTo)}
                  id="transaction-date-to"
                  name="dateTo"
                  type="date"
                />
              </Field>
              <Button className="self-end" type="submit">
                Filtrar
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Transacoes registradas</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length > 0 ? (
                <ResponsiveTable
                  columns={[
                    { header: "Descricao", key: "description" },
                    { header: "Tipo", key: "type" },
                    { header: "Data", key: "date" },
                    { header: "Metodo", key: "method" },
                    { header: "Status", key: "status" },
                    { header: "Valor", key: "amount" },
                  ]}
                  getRowKey={(row) => String(row.id)}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  description="Crie a primeira transacao realizada para iniciar o extrato da M09."
                  title="Nenhuma transacao encontrada"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nova transacao</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionForm
                accounts={options.accounts}
                action={createTransactionAction}
                categories={options.categories}
                creditCards={options.creditCards}
                submitLabel="Criar transacao"
              />
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}

function searchFromParams(
  params: Record<string, string | string[] | undefined>,
): TransactionSearch {
  const search: {
    dateFrom?: TransactionSearch["dateFrom"];
    dateTo?: TransactionSearch["dateTo"];
    paymentMethod?: TransactionSearch["paymentMethod"];
    query?: TransactionSearch["query"];
    status?: TransactionSearch["status"];
    transactionType?: TransactionSearch["transactionType"];
  } = {};
  const query = readParam(params.query);
  const dateFrom = readParam(params.dateFrom);
  const dateTo = readParam(params.dateTo);
  const status = readParam(params.status);
  const transactionType = readParam(params.transactionType);
  const paymentMethod = readParam(params.paymentMethod);

  if (query) {
    search.query = query;
  }

  if (dateFrom) {
    try {
      search.dateFrom = parseLocalDate(dateFrom);
    } catch {
      // Invalid filter input is ignored so the page remains safe/renderable.
    }
  }

  if (dateTo) {
    try {
      search.dateTo = parseLocalDate(dateTo);
    } catch {
      // Invalid filter input is ignored so the page remains safe/renderable.
    }
  }

  if (status && isTransactionStatus(status)) {
    search.status = status;
  }

  if (transactionType && isTransactionType(transactionType)) {
    search.transactionType = transactionType;
  }

  if (paymentMethod && isPaymentMethod(paymentMethod)) {
    search.paymentMethod = paymentMethod;
  }

  return search;
}

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
