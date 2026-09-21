import Link from "next/link";
import { notFound } from "next/navigation";

import {
  reverseTransactionAction,
  updateTransactionAction,
  voidTransactionAction,
} from "../actions";
import { createTransactionService } from "@/application/transactions/transaction-service";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionLifecycleActions } from "@/components/transactions/transaction-lifecycle-actions";
import { TransactionStatusMessage } from "@/components/transactions/transaction-status-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { asUserId, DomainError, getEnumLabel } from "@/domain/shared";
import { asTransactionId } from "@/domain/transactions";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  params: Promise<{ transactionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { transactionId } = await params;
  const query = (await searchParams) ?? {};
  const path = `/app/financeiro/transacoes/${transactionId}`;
  const { user } = await getAuthenticatedSession(path);
  const context = { userId: asUserId(user.id) };
  const service = await createTransactionService();
  let transaction;

  try {
    transaction = await service.getTransaction(
      context,
      asTransactionId(transactionId),
    );
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === "NOT_FOUND" || error.code === "VALIDATION_FAILED")
    ) {
      notFound();
    }

    throw error;
  }

  const options = await service.listFormOptions(context);
  const canCorrect =
    transaction.status === "posted" &&
    transaction.originType === "manual" &&
    transaction.transactionType !== "transfer";

  return (
    <ProtectedAppShell nextPath={path}>
      <ModulePage
        description="Detalhe de fato realizado. Correcoes financeiras criam reversao e nova transacao, preservando rastro."
        eyebrow="Financeiro"
        title={transaction.description ?? "Transacao"}
      >
        <TransactionStatusMessage searchParams={query} />

        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground font-semibold">Valor</dt>
                  <dd className="text-foreground text-2xl font-semibold">
                    {formatBRL(transaction.amount.amount)}
                  </dd>
                </div>
                <SummaryItem
                  label="Tipo"
                  value={getEnumLabel(
                    "transaction_type",
                    transaction.transactionType,
                  )}
                />
                <SummaryItem
                  label="Status"
                  value={getEnumLabel("transaction_status", transaction.status)}
                />
                <SummaryItem
                  label="Metodo"
                  value={getEnumLabel(
                    "payment_method",
                    transaction.paymentMethod,
                  )}
                />
                <SummaryItem
                  label="Data financeira"
                  value={formatDateBR(transaction.transactionDate)}
                />
                <SummaryItem
                  label="Competencia"
                  value={formatDateBR(transaction.competenceDate)}
                />
                {transaction.reversalReason ? (
                  <SummaryItem
                    label="Motivo"
                    value={transaction.reversalReason}
                  />
                ) : null}
                {transaction.transferId ? (
                  <SummaryItem
                    label="Transferencia"
                    value={transaction.transferId}
                  />
                ) : null}
              </dl>

              {transaction.transactionType === "transfer" ? (
                <div className="border-border mt-5 border-t pt-4">
                  {transaction.transferId ? (
                    <Link
                      className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                      href={`/app/financeiro/transferencias/${transaction.transferId}`}
                    >
                      Abrir transferencia
                    </Link>
                  ) : (
                    <p className="text-muted-foreground text-sm leading-6">
                      Linha de transferencia sem vinculo disponivel.
                    </p>
                  )}
                </div>
              ) : (
                <TransactionLifecycleActions
                  reverseAction={reverseTransactionAction.bind(
                    null,
                    transaction.id,
                  )}
                  transaction={transaction}
                  voidAction={voidTransactionAction.bind(null, transaction.id)}
                />
              )}

              <Link
                className="hover:bg-muted mt-5 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                href="/app/financeiro/transacoes"
              >
                Voltar
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Correcao controlada</CardTitle>
            </CardHeader>
            <CardContent>
              {canCorrect ? (
                <TransactionForm
                  accounts={options.accounts}
                  action={updateTransactionAction.bind(null, transaction.id)}
                  categories={options.categories}
                  creditCards={options.creditCards}
                  submitLabel="Corrigir com reversao"
                  transaction={transaction}
                />
              ) : (
                <p className="text-muted-foreground text-sm leading-6">
                  Apenas transacoes manuais postadas podem ser corrigidas pela
                  M09. Transferencias usam o fluxo atomico proprio da M10.
                  Registros anulados, revertidos ou de origem automatica ficam
                  preservados para auditoria.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground font-semibold">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
