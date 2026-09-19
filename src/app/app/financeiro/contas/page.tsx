import Link from "next/link";

import { createAccountAction } from "./actions";
import { AccountForm } from "@/components/accounts/account-form";
import { AccountStatusMessage } from "@/components/accounts/account-status-message";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { asUserId, getEnumLabel } from "@/domain/shared";
import { createAccountService } from "@/application/accounts/account-service";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await getAuthenticatedSession("/app/financeiro/contas");
  const service = await createAccountService();
  const accounts = await service.listAccounts({ userId: asUserId(user.id) });

  const rows = accounts.map((account) => ({
    balance: formatBRL(account.balance.amount),
    id: account.id,
    name: (
      <Link
        className="text-primary font-semibold hover:underline"
        href={`/app/financeiro/contas/${account.id}`}
      >
        {account.name}
      </Link>
    ),
    opening: `${formatBRL(account.openingBalance.amount)} em ${formatDateBR(
      account.openingBalanceDate,
    )}`,
    status: getEnumLabel("account_status", account.status),
    type: getEnumLabel("account_type", account.type),
  }));

  return (
    <ProtectedAppShell nextPath="/app/financeiro/contas">
      <ModulePage
        description="Cadastro operacional de contas com saldo inicial preservado e saldo atual sempre calculado."
        eyebrow="Financeiro"
        title="Contas"
      >
        <AccountStatusMessage searchParams={params} />

        <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Contas cadastradas</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length > 0 ? (
                <ResponsiveTable
                  columns={[
                    { header: "Nome", key: "name" },
                    { header: "Tipo", key: "type" },
                    { header: "Status", key: "status" },
                    { header: "Saldo inicial", key: "opening" },
                    { header: "Saldo calculado", key: "balance" },
                  ]}
                  getRowKey={(row) => String(row.id)}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  description="Crie a primeira conta para iniciar a base financeira da M07."
                  title="Nenhuma conta cadastrada"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nova conta</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountForm
                action={createAccountAction}
                submitLabel="Criar conta"
              />
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}
