"use client";

import { useActionState } from "react";

import type { CategoryRecord } from "@/domain/categories";
import { getEnumLabel, getEnumOptions } from "@/domain/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type {
  CategoryFormState,
  CategoryFormValues,
} from "@/app/app/financeiro/categorias/actions";

type CategoryFormProps = {
  action: (
    state: CategoryFormState,
    formData: FormData,
  ) => CategoryFormState | Promise<CategoryFormState>;
  category?: CategoryRecord;
  initialState?: CategoryFormState;
  rootCategories: readonly CategoryRecord[];
  submitLabel: string;
};

export function CategoryForm({
  action,
  category,
  initialState,
  rootCategories,
  submitLabel,
}: CategoryFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState ?? getInitialState(category),
  );
  const values = state.values;

  return (
    <form action={formAction} className="grid gap-4">
      {state.status === "error" && state.message ? (
        <div
          className="border-danger/35 bg-danger-muted text-danger rounded-md border p-3 text-sm font-medium"
          role="alert"
        >
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.name}
          hint="Unico no mesmo nivel entre categorias ativas."
          htmlFor="category-name"
          label="Nome"
        >
          <Input
            autoComplete="off"
            defaultValue={values.name}
            disabled={Boolean(category?.archivedAt)}
            hasError={Boolean(state.errors.name)}
            id="category-name"
            name="name"
            required
          />
        </Field>
        <Field error={state.errors.type} htmlFor="category-type" label="Tipo">
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            defaultValue={values.type}
            disabled={Boolean(category?.archivedAt)}
            id="category-type"
            name="type"
          >
            {getEnumOptions("category_type").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.parentId}
          hint="Em branco cria uma categoria raiz; selecione uma raiz para criar subcategoria."
          htmlFor="category-parent"
          label="Categoria pai"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            defaultValue={values.parentId}
            disabled={Boolean(category?.archivedAt)}
            id="category-parent"
            name="parentId"
          >
            <option value="">Categoria raiz</option>
            {rootCategories
              .filter((root) => root.id !== category?.id)
              .map((root) => (
                <option key={root.id} value={root.id}>
                  {root.name} - {getEnumLabel("category_type", root.type)}
                </option>
              ))}
          </select>
        </Field>
        <Field
          error={state.errors.sortOrder}
          htmlFor="category-sort-order"
          label="Ordem"
        >
          <Input
            defaultValue={values.sortOrder}
            disabled={Boolean(category?.archivedAt)}
            hasError={Boolean(state.errors.sortOrder)}
            id="category-sort-order"
            inputMode="numeric"
            min="0"
            name="sortOrder"
            type="number"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.colorToken}
          htmlFor="category-color-token"
          label="Cor"
        >
          <Input
            autoComplete="off"
            defaultValue={values.colorToken}
            disabled={Boolean(category?.archivedAt)}
            hasError={Boolean(state.errors.colorToken)}
            id="category-color-token"
            name="colorToken"
            placeholder="green"
          />
        </Field>
        <Field
          error={state.errors.iconKey}
          htmlFor="category-icon-key"
          label="Icone"
        >
          <Input
            autoComplete="off"
            defaultValue={values.iconKey}
            disabled={Boolean(category?.archivedAt)}
            hasError={Boolean(state.errors.iconKey)}
            id="category-icon-key"
            name="iconKey"
            placeholder="wallet"
          />
        </Field>
      </div>

      <div>
        <Button
          disabled={pending || Boolean(category?.archivedAt)}
          type="submit"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function getInitialState(category?: CategoryRecord): CategoryFormState {
  return {
    errors: {},
    message: null,
    status: "idle",
    values: getInitialValues(category),
  };
}

function getInitialValues(category?: CategoryRecord): CategoryFormValues {
  return {
    colorToken: category?.colorToken ?? "",
    iconKey: category?.iconKey ?? "",
    name: category?.name ?? "",
    parentId: category?.parentId ?? "",
    sortOrder: category?.sortOrder?.toString() ?? "",
    type: category?.type ?? "variable_expense",
  };
}
