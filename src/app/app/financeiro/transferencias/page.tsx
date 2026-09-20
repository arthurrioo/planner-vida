import Link from "next/link";

import { createTransferAction } from "./actions";
import { createTransferService } from "@/application/transfers/transfer-service";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferStatusMessage } from "@/components/transfers/transfer-status-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { asUserId, getEnumLabel } from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransfersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await getAuthenticatedSession(
    "/app/financeiro/transferencias",
  );
  const context = { userId: asUserId(user.id) };
  const service = await createTransferService();
  const [transfers, options] = await Promise.all([
    service.listTransfers(context),
    service.listFormOptions(context),
  ]);
  const accountNames = new Map(
    options.accounts.map((account) => [account.id, account.name]),
  );
  const rows = transfers.map((transfer) => ({
    amount: formatBRL(transfer.amount.amount),
    date: formatDateBR(transfer.transferDate),
    description: (
      <Link
        className="text-primary font-semibold hover:underline"
        href={`/app/financeiro/transferencias/${transfer.id}`}
      >
        {transfer.description}
      </Link>
    ),
    destination:
      accountNames.get(transfer.destinationAccountId) ??
      transfer.destinationAccountId,
    id: transfer.id,
    source:
      accountNames.get(transfer.sourceAccountId) ?? transfer.sourceAccountId,
    status: getEnumLabel("transaction_status", transfer.status),
  }));

  return (
    <ProtectedAppShell nextPath="/app/financeiro/transferencias">
      <ModulePage
        description="Movimentacoes atomicas entre contas proprias, fora de P&L."
        eyebrow="Financeiro"
        title="Transferencias"
      >
        <TransferStatusMessage searchParams={params} />

        <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Transferencias registradas</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length > 0 ? (
                <ResponsiveTable
                  columns={[
                    { header: "Descricao", key: "description" },
                    { header: "Origem", key: "source" },
                    { header: "Destino", key: "destination" },
                    { header: "Data", key: "date" },
                    { header: "Status", key: "status" },
                    { header: "Valor", key: "amount" },
                  ]}
                  getRowKey={(row) => String(row.id)}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  description="Crie a primeira transferencia para movimentar saldo entre contas sem afetar P&L."
                  title="Nenhuma transferencia encontrada"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nova transferencia</CardTitle>
            </CardHeader>
            <CardContent>
              <TransferForm
                accounts={options.accounts}
                action={createTransferAction}
                submitLabel="Criar transferencia"
              />
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}
