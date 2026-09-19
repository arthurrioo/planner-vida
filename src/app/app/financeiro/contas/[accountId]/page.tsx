import Link from "next/link";
import { notFound } from "next/navigation";

import {
  archiveAccountAction,
  closeAccountAction,
  updateAccountAction,
} from "../actions";
import { AccountForm } from "@/components/accounts/account-form";
import { AccountStatusMessage } from "@/components/accounts/account-status-message";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { asAccountId } from "@/domain/accounts";
import { asUserId, DomainError, getEnumLabel } from "@/domain/shared";
import { createAccountService } from "@/application/accounts/account-service";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  params: Promise<{ accountId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { accountId } = await params;
  const query = (await searchParams) ?? {};
  const nextPath = `/app/financeiro/contas/${accountId}`;
  const { user } = await getAuthenticatedSession(nextPath);
  const service = await createAccountService();
  const context = { userId: asUserId(user.id) };
  let account;

  try {
    account = await service.getAccount(context, asAccountId(accountId));
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  if (!account) {
    notFound();
  }

  const updateAction = updateAccountAction.bind(null, account.id);
  const archiveAction = archiveAccountAction.bind(null, account.id);
  const closeAction = closeAccountAction.bind(null, account.id);

  return (
    <ProtectedAppShell nextPath={nextPath}>
      <ModulePage
        description="Edicao de cadastro e lifecycle da conta. O saldo exibido e calculado pelo servico, nao editado manualmente."
        eyebrow="Financeiro"
        title={account.name}
      >
        <AccountStatusMessage searchParams={query} />

        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground font-semibold">
                    Saldo calculado
                  </dt>
                  <dd className="text-foreground text-2xl font-semibold">
                    {formatBRL(account.balance.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">
                    Saldo inicial
                  </dt>
                  <dd>
                    {formatBRL(account.openingBalance.amount)} em{" "}
                    {formatDateBR(account.openingBalanceDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">Tipo</dt>
                  <dd>{getEnumLabel("account_type", account.type)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">
                    Status
                  </dt>
                  <dd>{getEnumLabel("account_status", account.status)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-semibold">
                    Registros dependentes
                  </dt>
                  <dd>{account.dependencyCount}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <form action={archiveAction}>
                  <Button
                    disabled={account.status === "archived"}
                    type="submit"
                    variant="secondary"
                  >
                    Arquivar
                  </Button>
                </form>
                <form action={closeAction}>
                  <Button
                    disabled={account.status === "closed"}
                    type="submit"
                    variant="secondary"
                  >
                    Encerrar
                  </Button>
                </form>
                <Link
                  className="hover:bg-muted inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                  href="/app/financeiro/contas"
                >
                  Voltar
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cadastro</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountForm
                account={account}
                action={updateAction}
                submitLabel="Salvar alteracoes"
              />
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}
