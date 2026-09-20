"use server";

import { redirect } from "next/navigation";

import { createTransferService } from "@/application/transfers/transfer-service";
import {
  asUserId,
  toPublicError,
  type RepositoryContext,
} from "@/domain/shared";
import { asTransferId } from "@/domain/transfers";
import { getAuthenticatedSession } from "@/lib/auth/session";

export type TransferFormValues = Readonly<{
  amount: string;
  description: string;
  destinationAccountId: string;
  sourceAccountId: string;
  transferDate: string;
}>;

export type TransferFormState = Readonly<{
  errors: Partial<Record<keyof TransferFormValues | "reason", string>>;
  message: string | null;
  status: "idle" | "error";
  values: TransferFormValues;
}>;

const transferFormFields = [
  "amount",
  "description",
  "destinationAccountId",
  "sourceAccountId",
  "transferDate",
] as const;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function transferInputFromForm(formData: FormData): TransferFormValues {
  return {
    amount: getFormString(formData, "amount"),
    description: getFormString(formData, "description"),
    destinationAccountId: getFormString(formData, "destinationAccountId"),
    sourceAccountId: getFormString(formData, "sourceAccountId"),
    transferDate: getFormString(formData, "transferDate"),
  };
}

function fieldErrorsFromDetails(
  details: unknown,
): Partial<Record<keyof TransferFormValues | "reason", string>> {
  if (!details || typeof details !== "object") {
    return {};
  }

  const source = details as Record<string, unknown>;
  const fields: readonly (keyof TransferFormValues | "reason")[] = [
    ...transferFormFields,
    "reason",
  ];

  return fields.reduce<
    Partial<Record<keyof TransferFormValues | "reason", string>>
  >((errors, field) => {
    const message = source[field];

    if (typeof message === "string" && message.trim()) {
      errors[field] = message.trim();
    }

    return errors;
  }, {});
}

function transferFormErrorState(
  formData: FormData,
  error: unknown,
): TransferFormState {
  const publicError = toPublicError(error);

  return {
    errors: fieldErrorsFromDetails(publicError.details),
    message: publicError.message,
    status: "error",
    values: transferInputFromForm(formData),
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

async function getTransferActionContext(
  nextPath = "/app/financeiro/transferencias",
): Promise<RepositoryContext> {
  const { user } = await getAuthenticatedSession(nextPath);

  return { userId: asUserId(user.id) };
}

export async function createTransferAction(
  _state: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const path = "/app/financeiro/transferencias";
  const context = await getTransferActionContext(path);
  const service = await createTransferService();
  let redirectPath = path;

  try {
    const result = await service.createTransfer(
      context,
      transferInputFromForm(formData),
    );
    redirectPath = `/app/financeiro/transferencias/${result.transfer.id}`;
  } catch (error) {
    return transferFormErrorState(formData, error);
  }

  redirectWithMessage(redirectPath, "message", "Transferencia criada.");
}

export async function updateTransferAction(
  transferId: string,
  _state: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const path = `/app/financeiro/transferencias/${transferId}`;
  const context = await getTransferActionContext(path);
  const service = await createTransferService();
  let redirectPath = path;

  try {
    const result = await service.updateTransfer(
      context,
      asTransferId(transferId),
      transferInputFromForm(formData),
    );
    redirectPath = `/app/financeiro/transferencias/${result.transfer.id}`;
  } catch (error) {
    return transferFormErrorState(formData, error);
  }

  redirectWithMessage(
    redirectPath,
    "message",
    "Transferencia corrigida com estorno da versao anterior.",
  );
}

export async function reverseTransferAction(
  transferId: string,
  formData: FormData,
) {
  const path = `/app/financeiro/transferencias/${transferId}`;
  const context = await getTransferActionContext(path);
  const service = await createTransferService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Transferencia estornada.";

  try {
    await service.reverseTransfer(context, asTransferId(transferId), {
      reason: getFormString(formData, "reason"),
    });
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}
