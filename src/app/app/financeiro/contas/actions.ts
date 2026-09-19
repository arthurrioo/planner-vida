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

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function accountInputFromForm(formData: FormData) {
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

export async function createAccountAction(formData: FormData) {
  const path = "/app/financeiro/contas";
  const context = await getAccountActionContext(path);
  const service = await createAccountService();
  let redirectPath = path;
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Conta criada.";

  try {
    const account = await service.createAccount(
      context,
      accountInputFromForm(formData),
    );
    redirectPath = `/app/financeiro/contas/${account.id}`;
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(redirectPath, redirectType, redirectMessage);
}

export async function updateAccountAction(
  accountId: string,
  formData: FormData,
) {
  const path = `/app/financeiro/contas/${accountId}`;
  const context = await getAccountActionContext(path);
  const service = await createAccountService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Conta atualizada.";

  try {
    await service.updateAccount(
      context,
      asAccountId(accountId),
      accountInputFromForm(formData),
    );
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
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
