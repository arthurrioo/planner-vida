"use server";

import { redirect } from "next/navigation";

import { createCategoryService } from "@/application/categories/category-service";
import { asCategoryId } from "@/domain/categories";
import {
  asUserId,
  toPublicError,
  type RepositoryContext,
} from "@/domain/shared";
import { getAuthenticatedSession } from "@/lib/auth/session";

export type CategoryFormValues = Readonly<{
  colorToken: string;
  iconKey: string;
  name: string;
  parentId: string;
  sortOrder: string;
  type: string;
}>;

export type CategoryFormState = Readonly<{
  errors: Partial<Record<keyof CategoryFormValues, string>>;
  message: string | null;
  status: "idle" | "error";
  values: CategoryFormValues;
}>;

const categoryFormFields = [
  "colorToken",
  "iconKey",
  "name",
  "parentId",
  "sortOrder",
  "type",
] as const;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function categoryInputFromForm(formData: FormData): CategoryFormValues {
  return {
    colorToken: getFormString(formData, "colorToken"),
    iconKey: getFormString(formData, "iconKey"),
    name: getFormString(formData, "name"),
    parentId: getFormString(formData, "parentId"),
    sortOrder: getFormString(formData, "sortOrder"),
    type: getFormString(formData, "type"),
  };
}

function fieldErrorsFromDetails(
  details: unknown,
): Partial<Record<keyof CategoryFormValues, string>> {
  if (!details || typeof details !== "object") {
    return {};
  }

  const source = details as Record<string, unknown>;

  return categoryFormFields.reduce<
    Partial<Record<keyof CategoryFormValues, string>>
  >((errors, field) => {
    const message = source[field];

    if (typeof message === "string" && message.trim()) {
      errors[field] = message.trim();
    }

    return errors;
  }, {});
}

function categoryFormErrorState(
  formData: FormData,
  error: unknown,
): CategoryFormState {
  const publicError = toPublicError(error);

  return {
    errors: fieldErrorsFromDetails(publicError.details),
    message: publicError.message,
    status: "error",
    values: categoryInputFromForm(formData),
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

async function getCategoryActionContext(
  nextPath = "/app/financeiro/categorias",
): Promise<RepositoryContext> {
  const { user } = await getAuthenticatedSession(nextPath);

  return { userId: asUserId(user.id) };
}

export async function createCategoryAction(
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const path = "/app/financeiro/categorias";
  const context = await getCategoryActionContext(path);
  const service = await createCategoryService();
  let redirectPath = path;

  try {
    const category = await service.createCategory(
      context,
      categoryInputFromForm(formData),
    );
    redirectPath = `/app/financeiro/categorias/${category.id}`;
  } catch (error) {
    return categoryFormErrorState(formData, error);
  }

  redirectWithMessage(redirectPath, "message", "Categoria criada.");
}

export async function updateCategoryAction(
  categoryId: string,
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const path = `/app/financeiro/categorias/${categoryId}`;
  const context = await getCategoryActionContext(path);
  const service = await createCategoryService();

  try {
    await service.updateCategory(
      context,
      asCategoryId(categoryId),
      categoryInputFromForm(formData),
    );
  } catch (error) {
    return categoryFormErrorState(formData, error);
  }

  redirectWithMessage(path, "message", "Categoria atualizada.");
}

export async function archiveCategoryAction(categoryId: string) {
  const path = `/app/financeiro/categorias/${categoryId}`;
  const context = await getCategoryActionContext(path);
  const service = await createCategoryService();
  let redirectType: "error" | "message" = "message";
  let redirectMessage = "Categoria arquivada.";

  try {
    await service.archiveCategory(context, asCategoryId(categoryId));
  } catch (error) {
    const publicError = toPublicError(error);
    redirectType = "error";
    redirectMessage = publicError.message;
  }

  redirectWithMessage(path, redirectType, redirectMessage);
}

export async function deleteOrArchiveCategoryAction(categoryId: string) {
  const detailPath = `/app/financeiro/categorias/${categoryId}`;
  const context = await getCategoryActionContext(detailPath);
  const service = await createCategoryService();

  try {
    const result = await service.deleteOrArchiveCategory(
      context,
      asCategoryId(categoryId),
    );

    if (result.mode === "deleted") {
      redirectWithMessage(
        "/app/financeiro/categorias",
        "message",
        "Categoria excluida permanentemente.",
      );
    }

    redirectWithMessage(
      detailPath,
      "message",
      "Categoria possui vinculos e foi arquivada.",
    );
  } catch (error) {
    const publicError = toPublicError(error);
    redirectWithMessage(detailPath, "error", publicError.message);
  }
}
