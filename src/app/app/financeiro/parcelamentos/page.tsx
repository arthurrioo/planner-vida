import Link from "next/link";

import { createInstallmentPlanAction } from "./actions";
import { createInstallmentService } from "@/application/installments/installment-service";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { InstallmentForm } from "@/components/installments/installment-form";
import { InstallmentStatusMessage } from "@/components/installments/installment-status-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { asUserId, getEnumLabel } from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstallmentsPage({ searchParams }: PageProps) {
  const path = "/app/financeiro/parcelamentos";
  const params = (await searchParams) ?? {};
  const { user } = await getAuthenticatedSession(path);
  const context = { userId: asUserId(user.id) };
  const service = await createInstallmentService();
  const [plans, options] = await Promise.all([
    service.listInstallmentPlans(context),
    service.listFormOptions(context),
  ]);
  const rows = plans.map(({ plan, postedAmount }) => ({
    dueDate: formatDateBR(plan.firstDueDate),
    id: plan.id,
    installments: `${plan.totalInstallments}x`,
    name: (
      <Link
        className="text-primary font-semibold hover:underline"
        href={`${path}/${plan.id}`}
      >
        {plan.description}
      </Link>
    ),
    posted: formatBRL(postedAmount.amount),
    status: getEnumLabel("installment_plan_status", plan.status),
    total: formatBRL(plan.totalAmount.amount),
  }));

  return (
    <ProtectedAppShell nextPath={path}>
      <ModulePage
        description="Compras parceladas com compromissos futuros e realizacao sem dupla contagem."
        eyebrow="Financeiro"
        title="Parcelamentos"
      >
        <InstallmentStatusMessage searchParams={params} />

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Planos registrados</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length > 0 ? (
                <ResponsiveTable
                  columns={[
                    { header: "Descricao", key: "name" },
                    { header: "Parcelas", key: "installments" },
                    { header: "Primeiro vencimento", key: "dueDate" },
                    { header: "Status", key: "status" },
                    { header: "Realizado", key: "posted" },
                    { header: "Total", key: "total" },
                  ]}
                  getRowKey={(row) => String(row.id)}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  description="Registre uma compra parcelada para acompanhar compromissos e realizacoes."
                  title="Nenhum parcelamento encontrado"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nova compra parcelada</CardTitle>
            </CardHeader>
            <CardContent>
              <InstallmentForm
                accounts={options.accounts}
                action={createInstallmentPlanAction}
                categories={options.categories}
                creditCards={options.creditCards}
              />
            </CardContent>
          </Card>
        </div>
      </ModulePage>
    </ProtectedAppShell>
  );
}
