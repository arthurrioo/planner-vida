"use server";

import { redirect } from "next/navigation";

import { createInstallmentService } from "@/application/installments/installment-service";
import { asInstallmentId, asInstallmentPlanId } from "@/domain/installments";
import {
  asUserId,
  toPublicError,
  type RepositoryContext,
} from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";

export type InstallmentFormValues = Readonly<{
  accountId: string;
  categoryId: string;
  creditCardId: string;
  description: string;
  firstDueDate: string;
  merchantName: string;
  paymentMethod: string;
  purchaseDate: string;
  totalAmount: string;
  totalInstallments: string;
}>;

export type InstallmentFormState = Readonly<{
  errors: Partial<Record<keyof InstallmentFormValues | "reason", string>>;
  message: string | null;
  status: "idle" | "error";
  values: InstallmentFormValues;
}>;

const installmentFormFields = [
  "accountId",
  "categoryId",
  "creditCardId",
  "description",
  "firstDueDate",
  "merchantName",
  "paymentMethod",
  "purchaseDate",
  "totalAmount",
  "totalInstallments",
] as const;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function installmentInputFromForm(formData: FormData): InstallmentFormValues {
  return {
    accountId: getFormString(formData, "accountId"),
    categoryId: getFormString(formData, "categoryId"),
    creditCardId: getFormString(formData, "creditCardId"),
    description: getFormString(formData, "description"),
    firstDueDate: getFormString(formData, "firstDueDate"),
    merchantName: getFormString(formData, "merchantName"),
    paymentMethod: getFormString(formData, "paymentMethod"),
    purchaseDate: getFormString(formData, "purchaseDate"),
    totalAmount: getFormString(formData, "totalAmount"),
    totalInstallments: getFormString(formData, "totalInstallments"),
  };
}

function fieldErrorsFromDetails(
  details: unknown,
): Partial<Record<keyof InstallmentFormValues | "reason", string>> {
  if (!details || typeof details !== "object") {
    return {};
  }

  const source = details as Record<string, unknown>;
  const fields: readonly (keyof InstallmentFormValues | "reason")[] = [
    ...installmentFormFields,
    "reason",
  ];

  return fields.reduce<
    Partial<Record<keyof InstallmentFormValues | "reason", string>>
  >((errors, field) => {
    const message = source[field];

    if (typeof message === "string" && message.trim()) {
      errors[field] = message.trim();
    }

    return errors;
  }, {});
}

function installmentFormErrorState(
  formData: FormData,
  error: unknown,
): InstallmentFormState {
  const publicError = toPublicError(error);

  return {
    errors: fieldErrorsFromDetails(publicError.details),
    message: publicError.message,
    status: "error",
    values: installmentInputFromForm(formData),
  };
}

function redirectWithMessage(
  path: string,
  type: "error" | "message",
  message: string,
): never {
  const params = new URLSearchParams();
  params.set(type, message);
  redirect(`${path}?${params.toString()}`);
}

async function getInstallmentActionContext(
  nextPath = "/app/financeiro/parcelamentos",
): Promise<RepositoryContext> {
  const { user } = await getAuthenticatedSession(nextPath);

  return { userId: asUserId(user.id) };
}

export async function createInstallmentPlanAction(
  _state: InstallmentFormState,
  formData: FormData,
): Promise<InstallmentFormState> {
  const path = "/app/financeiro/parcelamentos";
  const context = await getInstallmentActionContext(path);
  const service = await createInstallmentService();
  let redirectPath = path;

  try {
    const result = await service.createInstallmentPurchase(
      context,
      installmentInputFromForm(formData),
      { enforceUiLimit: true },
    );
    redirectPath = `/app/financeiro/parcelamentos/${result.plan.id}`;
  } catch (error) {
    return installmentFormErrorState(formData, error);
  }

  redirectWithMessage(redirectPath, "message", "Parcelamento criado.");
}

export async function cancelInstallmentPlanAction(
  planId: string,
  formData: FormData,
) {
  const path = `/app/financeiro/parcelamentos/${planId}`;
  const context = await getInstallmentActionContext(path);
  const service = await createInstallmentService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Parcelamento cancelado.";

  try {
    await service.cancelInstallmentPlan(context, asInstallmentPlanId(planId), {
      reason: getFormString(formData, "reason"),
    });
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}

export async function realizeInstallmentAction(
  installmentId: string,
  planId: string,
  formData: FormData,
) {
  const path = `/app/financeiro/parcelamentos/${planId}`;
  const context = await getInstallmentActionContext(path);
  const service = await createInstallmentService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Parcela realizada.";

  try {
    await service.realizeInstallment(context, asInstallmentId(installmentId), {
      transactionDate: getFormString(formData, "transactionDate"),
    });
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}
