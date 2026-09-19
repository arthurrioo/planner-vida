"use client";

import { useActionState } from "react";

import type { AccountRecord } from "@/domain/accounts";
import { getEnumOptions } from "@/domain/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type {
  AccountFormState,
  AccountFormValues,
} from "@/app/app/financeiro/contas/actions";

type AccountFormProps = {
  account?: AccountRecord;
  action: (
    state: AccountFormState,
    formData: FormData,
  ) => AccountFormState | Promise<AccountFormState>;
  initialState?: AccountFormState;
  submitLabel: string;
};

export function AccountForm({
  account,
  action,
  initialState,
  submitLabel,
}: AccountFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState ?? getInitialState(account),
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
          hint="Nome unico entre contas ativas."
          htmlFor="account-name"
          label="Nome"
        >
          <Input
            autoComplete="off"
            defaultValue={values.name}
            hasError={Boolean(state.errors.name)}
            id="account-name"
            name="name"
            required
          />
        </Field>
        <Field error={state.errors.type} htmlFor="account-type" label="Tipo">
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.type}
            id="account-type"
            name="type"
          >
            {getEnumOptions("account_type").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          error={state.errors.openingBalance}
          htmlFor="opening-balance"
          label="Saldo inicial"
        >
          <Input
            defaultValue={values.openingBalance}
            hasError={Boolean(state.errors.openingBalance)}
            id="opening-balance"
            inputMode="decimal"
            name="openingBalance"
            required
          />
        </Field>
        <Field
          error={state.errors.openingBalanceDate}
          htmlFor="opening-balance-date"
          label="Data-base"
        >
          <Input
            defaultValue={values.openingBalanceDate}
            hasError={Boolean(state.errors.openingBalanceDate)}
            id="opening-balance-date"
            name="openingBalanceDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={state.errors.overdraftLimit}
          hint="Use 0 para contas sem limite."
          htmlFor="overdraft-limit"
          label="Limite/cheque especial"
        >
          <Input
            defaultValue={values.overdraftLimit}
            hasError={Boolean(state.errors.overdraftLimit)}
            id="overdraft-limit"
            inputMode="decimal"
            name="overdraftLimit"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.institution}
          htmlFor="institution"
          label="Instituicao"
        >
          <Input
            defaultValue={values.institution}
            hasError={Boolean(state.errors.institution)}
            id="institution"
            name="institution"
          />
        </Field>
        <Field
          error={state.errors.description}
          htmlFor="description"
          label="Descricao"
        >
          <Input
            defaultValue={values.description}
            hasError={Boolean(state.errors.description)}
            id="description"
            name="description"
          />
        </Field>
      </div>

      <div>
        <Button disabled={pending} type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function getInitialState(account?: AccountRecord): AccountFormState {
  return {
    errors: {},
    message: null,
    status: "idle",
    values: getInitialValues(account),
  };
}

function getInitialValues(account?: AccountRecord): AccountFormValues {
  return {
    description: account?.description ?? "",
    institution: account?.institution ?? "",
    name: account?.name ?? "",
    openingBalance: account?.openingBalance.amount ?? "0.00",
    openingBalanceDate: account?.openingBalanceDate ?? "",
    overdraftLimit: account?.overdraftLimit.amount ?? "0.00",
    type: account?.type ?? "checking",
  };
}
