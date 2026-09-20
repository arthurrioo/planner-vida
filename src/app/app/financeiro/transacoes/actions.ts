"use server";

import { redirect } from "next/navigation";

import { createTransactionService } from "@/application/transactions/transaction-service";
import { asTransactionId } from "@/domain/transactions";
import {
  asUserId,
  toPublicError,
  type RepositoryContext,
} from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";

export type TransactionFormValues = Readonly<{
  accountId: string;
  amount: string;
  categoryId: string;
  competenceDate: string;
  creditCardId: string;
  description: string;
  externalFingerprint: string;
  notes: string;
  paymentMethod: string;
  sourceId: string;
  sourceType: string;
  transactionDate: string;
  transactionType: string;
}>;

export type TransactionFormState = Readonly<{
  errors: Partial<Record<keyof TransactionFormValues | "reason", string>>;
  message: string | null;
  status: "idle" | "error";
  values: TransactionFormValues;
}>;

const transactionFormFields = [
  "accountId",
  "amount",
  "categoryId",
  "competenceDate",
  "creditCardId",
  "description",
  "externalFingerprint",
  "notes",
  "paymentMethod",
  "sourceId",
  "sourceType",
  "transactionDate",
  "transactionType",
] as const;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function transactionInputFromForm(formData: FormData): TransactionFormValues {
  return {
    accountId: getFormString(formData, "accountId"),
    amount: getFormString(formData, "amount"),
    categoryId: getFormString(formData, "categoryId"),
    competenceDate: getFormString(formData, "competenceDate"),
    creditCardId: getFormString(formData, "creditCardId"),
    description: getFormString(formData, "description"),
    externalFingerprint: getFormString(formData, "externalFingerprint"),
    notes: getFormString(formData, "notes"),
    paymentMethod: getFormString(formData, "paymentMethod"),
    sourceId: getFormString(formData, "sourceId"),
    sourceType: getFormString(formData, "sourceType"),
    transactionDate: getFormString(formData, "transactionDate"),
    transactionType: getFormString(formData, "transactionType"),
  };
}

function fieldErrorsFromDetails(
  details: unknown,
): Partial<Record<keyof TransactionFormValues | "reason", string>> {
  if (!details || typeof details !== "object") {
    return {};
  }

  const source = details as Record<string, unknown>;

  const fields: readonly (keyof TransactionFormValues | "reason")[] = [
    ...transactionFormFields,
    "reason",
  ];

  return fields.reduce<
    Partial<Record<keyof TransactionFormValues | "reason", string>>
  >((errors, field) => {
    const message = source[field];

    if (typeof message === "string" && message.trim()) {
      errors[field] = message.trim();
    }

    return errors;
  }, {});
}

function transactionFormErrorState(
  formData: FormData,
  error: unknown,
): TransactionFormState {
  const publicError = toPublicError(error);

  return {
    errors: fieldErrorsFromDetails(publicError.details),
    message: publicError.message,
    status: "error",
    values: transactionInputFromForm(formData),
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

async function getTransactionActionContext(
  nextPath = "/app/financeiro/transacoes",
): Promise<RepositoryContext> {
  const { user } = await getAuthenticatedSession(nextPath);

  return { userId: asUserId(user.id) };
}

export async function createTransactionAction(
  _state: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const path = "/app/financeiro/transacoes";
  const context = await getTransactionActionContext(path);
  const service = await createTransactionService();
  let redirectPath = path;

  try {
    const transaction = await service.createTransaction(
      context,
      transactionInputFromForm(formData),
    );
    redirectPath = `/app/financeiro/transacoes/${transaction.id}`;
  } catch (error) {
    return transactionFormErrorState(formData, error);
  }

  redirectWithMessage(redirectPath, "message", "Transacao criada.");
}

export async function updateTransactionAction(
  transactionId: string,
  _state: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const path = `/app/financeiro/transacoes/${transactionId}`;
  const context = await getTransactionActionContext(path);
  const service = await createTransactionService();
  let redirectPath = path;

  try {
    const replacement = await service.updateTransaction(
      context,
      asTransactionId(transactionId),
      transactionInputFromForm(formData),
    );
    redirectPath = `/app/financeiro/transacoes/${replacement.id}`;
  } catch (error) {
    return transactionFormErrorState(formData, error);
  }

  redirectWithMessage(
    redirectPath,
    "message",
    "Transacao corrigida com reversao da versao anterior.",
  );
}

export async function voidTransactionAction(
  transactionId: string,
  formData: FormData,
) {
  const path = `/app/financeiro/transacoes/${transactionId}`;
  const context = await getTransactionActionContext(path);
  const service = await createTransactionService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Transacao anulada.";

  try {
    await service.voidTransaction(context, asTransactionId(transactionId), {
      reason: getFormString(formData, "reason"),
    });
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}

export async function reverseTransactionAction(
  transactionId: string,
  formData: FormData,
) {
  const path = `/app/financeiro/transacoes/${transactionId}`;
  const context = await getTransactionActionContext(path);
  const service = await createTransactionService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Transacao revertida.";

  try {
    await service.reverseTransaction(context, asTransactionId(transactionId), {
      reason: getFormString(formData, "reason"),
    });
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}
