import Link from "next/link";
import { notFound } from "next/navigation";

import {
  cancelInstallmentPlanAction,
  realizeInstallmentAction,
} from "../actions";
import { createInstallmentService } from "@/application/installments/installment-service";
import { ModulePage } from "@/components/app/module-page";
import { ProtectedAppShell } from "@/components/app/protected-app-shell";
import { InstallmentLifecycleActions } from "@/components/installments/installment-lifecycle-actions";
import { InstallmentStatusMessage } from "@/components/installments/installment-status-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { asInstallmentPlanId } from "@/domain/installments";
import { asUserId, getEnumLabel, toPublicError } from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { formatBRL, formatDateBR } from "@/lib/ui/formatters";

type PageProps = {
  params: Promise<{ planId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstallmentDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { planId } = await params;
  const path = `/app/financeiro/parcelamentos/${planId}`;
  const query = (await searchParams) ?? {};
  const { user } = await getAuthenticatedSession(path);
  const context = { userId: asUserId(user.id) };
  const service = await createInstallmentService();
  let summary;

  try {
    summary = await service.getInstallmentPlan(
      context,
      asInstallmentPlanId(planId),
    );
  } catch (error) {
    const publicError = toPublicError(error);

    if (
      publicError.code === "NOT_FOUND" ||
      publicError.code === "VALIDATION_FAILED"
    ) {
      notFound();
    }

    throw error;
  }

  const { plan } = summary;
  const rows = summary.installments.map((installment) => ({
    amount: formatBRL(installment.amount.amount),
    dueDate: formatDateBR(installment.dueDate),
    id: installment.id,
    number: `${installment.installmentNumber}/${plan.totalInstallments}`,
    status: getEnumLabel("installment_status", installment.status),
    transaction: installment.transactionId ?? "Nao realizada",
    action:
      installment.status === "scheduled" && plan.status === "active" ? (
        <form
          action={realizeInstallmentAction.bind(null, installment.id, plan.id)}
          className="flex min-w-44 gap-2"
        >
          <Input
            aria-label={`Data da parcela ${installment.installmentNumber}`}
            defaultValue={installment.dueDate}
            name="transactionDate"
            required
            type="date"
          />
          <Button size="sm" type="submit">
            Realizar
          </Button>
        </form>
      ) : (
        "-"
      ),
  }));

  return (
    <ProtectedAppShell nextPath={path}>
      <ModulePage
        description="Cronograma, realizacao e lifecycle auditavel do parcelamento."
        eyebrow="Parcelamento"
        title={plan.description}
      >
        <InstallmentStatusMessage searchParams={query} />

        <div className="grid gap-4 lg:grid-cols-[0.65fr_1.35fr]">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <DetailRow
                  label="Total"
                  value={formatBRL(plan.totalAmount.amount)}
                />
                <DetailRow
                  label="Parcelas"
                  value={`${plan.totalInstallments}x`}
                />
                <DetailRow
                  label="Compra"
                  value={formatDateBR(plan.purchaseDate)}
                />
                <DetailRow
                  label="Status"
                  value={getEnumLabel("installment_plan_status", plan.status)}
                />
                <DetailRow
                  label="Metodo"
                  value={getEnumLabel("payment_method", plan.paymentMethod)}
                />
                <DetailRow
                  label="Conta ou cartao"
                  value={summary.accountName ?? summary.creditCardName ?? "-"}
                />
                <DetailRow
                  label="Categoria"
                  value={summary.categoryName ?? "-"}
                />
                <DetailRow
                  label="Realizado"
                  value={formatBRL(summary.postedAmount.amount)}
                />
                <DetailRow
                  label="Agendado"
                  value={formatBRL(summary.scheduledAmount.amount)}
                />
              </dl>
              <InstallmentLifecycleActions
                action={cancelInstallmentPlanAction.bind(null, plan.id)}
                plan={plan}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cronograma</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveTable
                columns={[
                  { header: "Parcela", key: "number" },
                  { header: "Vencimento", key: "dueDate" },
                  { header: "Status", key: "status" },
                  { header: "Valor", key: "amount" },
                  { header: "Transacao", key: "transaction" },
                  { header: "Acao", key: "action" },
                ]}
                getRowKey={(row) => String(row.id)}
                rows={rows}
              />
            </CardContent>
          </Card>
        </div>

        <Link
          className="text-primary inline-flex text-sm font-semibold hover:underline"
          href="/app/financeiro/parcelamentos"
        >
          Voltar para parcelamentos
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
