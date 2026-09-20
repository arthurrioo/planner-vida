"use client";

import { useActionState } from "react";

import type {
  TransferAccountReference,
  TransferRecord,
} from "@/domain/transfers";
import { getEnumLabel } from "@/domain/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type {
  TransferFormState,
  TransferFormValues,
} from "@/app/app/financeiro/transferencias/actions";

type TransferFormProps = {
  accounts: readonly TransferAccountReference[];
  action: (
    state: TransferFormState,
    formData: FormData,
  ) => TransferFormState | Promise<TransferFormState>;
  initialState?: TransferFormState;
  submitLabel: string;
  transfer?: TransferRecord;
};

export function TransferForm({
  accounts,
  action,
  initialState,
  submitLabel,
  transfer,
}: TransferFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState ?? getInitialState(transfer),
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
          error={state.errors.description}
          htmlFor="transfer-description"
          label="Descricao"
        >
          <Input
            autoComplete="off"
            defaultValue={values.description}
            hasError={Boolean(state.errors.description)}
            id="transfer-description"
            name="description"
            required
          />
        </Field>
        <Field
          error={state.errors.amount}
          htmlFor="transfer-amount"
          label="Valor"
        >
          <Input
            defaultValue={values.amount}
            hasError={Boolean(state.errors.amount)}
            id="transfer-amount"
            inputMode="decimal"
            name="amount"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.sourceAccountId}
          htmlFor="transfer-source-account"
          label="Conta origem"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.sourceAccountId}
            id="transfer-source-account"
            name="sourceAccountId"
            required
          >
            <option value="">Selecione</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountOptionLabel(account)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={state.errors.destinationAccountId}
          htmlFor="transfer-destination-account"
          label="Conta destino"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.destinationAccountId}
            id="transfer-destination-account"
            name="destinationAccountId"
            required
          >
            <option value="">Selecione</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountOptionLabel(account)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        error={state.errors.transferDate}
        htmlFor="transfer-date"
        label="Data financeira"
      >
        <Input
          defaultValue={values.transferDate}
          hasError={Boolean(state.errors.transferDate)}
          id="transfer-date"
          name="transferDate"
          required
          type="date"
        />
      </Field>

      <div>
        <Button disabled={pending || accounts.length < 2} type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function getInitialState(transfer?: TransferRecord): TransferFormState {
  return {
    errors: {},
    message: null,
    status: "idle",
    values: getInitialValues(transfer),
  };
}

function accountOptionLabel(account: TransferAccountReference) {
  const typeLabel = getEnumLabel("account_type", account.type);

  if (account.status === "active") {
    return `${account.name} - ${typeLabel}`;
  }

  return `${account.name} (${getEnumLabel("account_status", account.status)}) - ${typeLabel}`;
}

function getInitialValues(transfer?: TransferRecord): TransferFormValues {
  return {
    amount: transfer?.amount.amount ?? "",
    description: transfer?.description ?? "",
    destinationAccountId: transfer?.destinationAccountId ?? "",
    sourceAccountId: transfer?.sourceAccountId ?? "",
    transferDate: transfer?.transferDate ?? "",
  };
}
