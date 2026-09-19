"use server";

import { redirect } from "next/navigation";

import { asAccountId } from "@/domain/accounts";
import {
  asUserId,
  toPublicError,
  type RepositoryContext,
} from "@/domain/shared";
import { createAccountService } from "@/application/accounts/account-service";
import { getAuthenticatedSession } from "@/lib/auth/session";

export type AccountFormValues = Readonly<{
  description: string;
  institution: string;
  name: string;
  openingBalance: string;
  openingBalanceDate: string;
  overdraftLimit: string;
  type: string;
}>;

export type AccountFormState = Readonly<{
  errors: Partial<Record<keyof AccountFormValues, string>>;
  message: string | null;
  status: "idle" | "error";
  values: AccountFormValues;
}>;

const accountFormFields = [
  "description",
  "institution",
  "name",
  "openingBalance",
  "openingBalanceDate",
  "overdraftLimit",
  "type",
] as const;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function accountInputFromForm(formData: FormData): AccountFormValues {
  return {
    description: getFormString(formData, "description"),
    institution: getFormString(formData, "institution"),
    name: getFormString(formData, "name"),
    openingBalance: getFormString(formData, "openingBalance"),
    openingBalanceDate: getFormString(formData, "openingBalanceDate"),
    overdraftLimit: getFormString(formData, "overdraftLimit") || "0",
    type: getFormString(formData, "type"),
  };
}

function fieldErrorsFromDetails(
  details: unknown,
): Partial<Record<keyof AccountFormValues, string>> {
  if (!details || typeof details !== "object") {
    return {};
  }

  const source = details as Record<string, unknown>;

  return accountFormFields.reduce<
    Partial<Record<keyof AccountFormValues, string>>
  >((errors, field) => {
    const message = source[field];

    if (typeof message === "string" && message.trim()) {
      errors[field] = message.trim();
    }

    return errors;
  }, {});
}

function accountFormErrorState(
  formData: FormData,
  error: unknown,
): AccountFormState {
  const publicError = toPublicError(error);

  return {
    errors: fieldErrorsFromDetails(publicError.details),
    message: publicError.message,
    status: "error",
    values: accountInputFromForm(formData),
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

async function getAccountActionContext(
  nextPath = "/app/financeiro/contas",
): Promise<RepositoryContext> {
  const { user } = await getAuthenticatedSession(nextPath);

  return { userId: asUserId(user.id) };
}

export async function createAccountAction(
  _state: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const path = "/app/financeiro/contas";
  const context = await getAccountActionContext(path);
  const service = await createAccountService();
  let redirectPath = path;

  try {
    const account = await service.createAccount(
      context,
      accountInputFromForm(formData),
    );
    redirectPath = `/app/financeiro/contas/${account.id}`;
  } catch (error) {
    return accountFormErrorState(formData, error);
  }

  redirectWithMessage(redirectPath, "message", "Conta criada.");
}

export async function updateAccountAction(
  accountId: string,
  _state: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const path = `/app/financeiro/contas/${accountId}`;
  const context = await getAccountActionContext(path);
  const service = await createAccountService();

  try {
    await service.updateAccount(
      context,
      asAccountId(accountId),
      accountInputFromForm(formData),
    );
  } catch (error) {
    return accountFormErrorState(formData, error);
  }

  redirectWithMessage(path, "message", "Conta atualizada.");
}

export async function archiveAccountAction(accountId: string) {
  const path = `/app/financeiro/contas/${accountId}`;
  const context = await getAccountActionContext(path);
  const service = await createAccountService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Conta arquivada.";

  try {
    await service.archiveAccount(context, asAccountId(accountId));
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}

export async function reactivateAccountAction(accountId: string) {
  const path = `/app/financeiro/contas/${accountId}`;
  const context = await getAccountActionContext(path);
  const service = await createAccountService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Conta reativada.";

  try {
    await service.reactivateAccount(context, asAccountId(accountId));
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}

export async function closeAccountAction(accountId: string) {
  const path = `/app/financeiro/contas/${accountId}`;
  const context = await getAccountActionContext(path);
  const service = await createAccountService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Conta encerrada.";

  try {
    await service.closeAccount(context, asAccountId(accountId));
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}

export async function deleteAccountAction(accountId: string) {
  const detailPath = `/app/financeiro/contas/${accountId}`;
  const context = await getAccountActionContext(detailPath);
  const service = await createAccountService();
  let redirectPath = detailPath;
  let redirectType: "error" | "message" = "error";
  let redirectMessage =
    "Conta possui registros vinculados e nao pode ser excluida permanentemente.";

  try {
    const result = await service.deleteAccountIfSafe(
      context,
      asAccountId(accountId),
    );

    if (result.mode === "deleted") {
      redirectPath = "/app/financeiro/contas";
      redirectType = "message";
      redirectMessage = "Conta excluida permanentemente.";
    }
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(redirectPath, redirectType, redirectMessage);
}
