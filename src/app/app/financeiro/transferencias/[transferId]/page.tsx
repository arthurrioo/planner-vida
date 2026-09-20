import Link from "next/link";
import { notFound } from "next/navigation";

import { reverseTransferAction, updateTransferAction } from "../actions";
import { createTransferService } from "@/application/transfers/transfer-service";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferLifecycleActions } from "@/components/transfers/transfer-lifecycle-actions";
import { TransferStatusMessage } from "@/components/transfers/transfer-status-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { asUserId, getEnumLabel, toPublicError } from "@/domain/shared";
import { asTransferId } from "@/domain/transfers";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  params: Promise<{ transferId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransferDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { transferId } = await params;
  const path = `/app/financeiro/transferencias/${transferId}`;
  const query = (await searchParams) ?? {};
  const { user } = await getAuthenticatedSession(path);
  const context = { userId: asUserId(user.id) };
  const service = await createTransferService();
  let transfer;

  try {
    transfer = await service.getTransfer(context, asTransferId(transferId));
  } catch (error) {
    const publicError = toPublicError(error);

    if (publicError.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  const options = await service.listFormOptions(context);
  const accountNames = new Map(
    options.accounts.map((account) => [account.id, account.name]),
  );
  const canCorrect =
    transfer.status === "posted" && transfer.originType === "manual";

  return (
    <ProtectedAppShell nextPath={path}>
      <ModulePage
        description="Revisao, correcao e estorno atomico da transferencia."
        eyebrow="Transferencia"
        title={transfer.description}
      >
        <TransferStatusMessage searchParams={query} />

        <div className="grid gap-4 lg:grid-cols-[0.85fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <DetailRow
                  label="Valor"
                  value={formatBRL(transfer.amount.amount)}
                />
                <DetailRow
                  label="Origem"
                  value={
                    accountNames.get(transfer.sourceAccountId) ??
                    transfer.sourceAccountId
                  }
                />
                <DetailRow
                  label="Destino"
                  value={
                    accountNames.get(transfer.destinationAccountId) ??
                    transfer.destinationAccountId
                  }
                />
                <DetailRow
                  label="Data"
                  value={formatDateBR(transfer.transferDate)}
                />
                <DetailRow
                  label="Status"
                  value={getEnumLabel("transaction_status", transfer.status)}
                />
                <DetailRow
                  label="Saida vinculada"
                  value={transfer.outflowTransactionId ?? "Nao vinculada"}
                />
                <DetailRow
                  label="Entrada vinculada"
                  value={transfer.inflowTransactionId ?? "Nao vinculada"}
                />
              </dl>
              <TransferLifecycleActions
                reverseAction={reverseTransferAction.bind(null, transfer.id)}
                transfer={transfer}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Corrigir transferencia</CardTitle>
            </CardHeader>
            <CardContent>
              {canCorrect ? (
                <TransferForm
                  accounts={options.accounts}
                  action={updateTransferAction.bind(null, transfer.id)}
                  submitLabel="Corrigir transferencia"
                  transfer={transfer}
                />
              ) : (
                <p className="text-muted-foreground text-sm leading-6">
                  Transferencias estornadas preservam o historico e nao aceitam
                  nova correcao.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Link
          className="text-primary inline-flex text-sm font-semibold hover:underline"
          href="/app/financeiro/transferencias"
        >
          Voltar para transferencias
        </Link>
      </ModulePage>
    </ProtectedAppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-foreground break-words">{value}</dd>
    </div>
  );
}
