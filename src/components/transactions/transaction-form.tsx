"use client";

import { useActionState } from "react";

import type {
  AccountReference,
  CategoryReference,
  CreditCardReference,
  TransactionRecord,
} from "@/domain/transactions";
import { getEnumLabel, getEnumOptions } from "@/domain/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type {
  TransactionFormState,
  TransactionFormValues,
} from "@/app/app/financeiro/transacoes/actions";

type TransactionFormProps = {
  accounts: readonly AccountReference[];
  action: (
    state: TransactionFormState,
    formData: FormData,
  ) => TransactionFormState | Promise<TransactionFormState>;
  categories: readonly CategoryReference[];
  creditCards: readonly CreditCardReference[];
  initialState?: TransactionFormState;
  submitLabel: string;
  transaction?: TransactionRecord;
};

export function TransactionForm({
  accounts,
  action,
  categories,
  creditCards,
  initialState,
  submitLabel,
  transaction,
}: TransactionFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState ?? getInitialState(transaction),
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
          htmlFor="transaction-description"
          label="Descricao"
        >
          <Input
            autoComplete="off"
            defaultValue={values.description}
            hasError={Boolean(state.errors.description)}
            id="transaction-description"
            name="description"
            required
          />
        </Field>
        <Field
          error={state.errors.amount}
          htmlFor="transaction-amount"
          label="Valor"
        >
          <Input
            defaultValue={values.amount}
            hasError={Boolean(state.errors.amount)}
            id="transaction-amount"
            inputMode="decimal"
            name="amount"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          error={state.errors.transactionType}
          htmlFor="transaction-type"
          label="Tipo"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.transactionType}
            id="transaction-type"
            name="transactionType"
          >
            {getEnumOptions("transaction_type").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={state.errors.paymentMethod}
          htmlFor="payment-method"
          label="Metodo"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.paymentMethod}
            id="payment-method"
            name="paymentMethod"
          >
            {getEnumOptions("payment_method").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={state.errors.categoryId}
          htmlFor="transaction-category"
          label="Categoria"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.categoryId}
            id="transaction-category"
            name="categoryId"
            required
          >
            <option value="">Selecione</option>
            {categoryOptions(categories).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.transactionDate}
          htmlFor="transaction-date"
          label="Data financeira"
        >
          <Input
            defaultValue={values.transactionDate}
            hasError={Boolean(state.errors.transactionDate)}
            id="transaction-date"
            name="transactionDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={state.errors.competenceDate}
          hint="Em branco usa a data financeira."
          htmlFor="competence-date"
          label="Competencia"
        >
          <Input
            defaultValue={values.competenceDate}
            hasError={Boolean(state.errors.competenceDate)}
            id="competence-date"
            name="competenceDate"
            type="date"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.accountId}
          hint="Obrigatoria para metodos que impactam conta."
          htmlFor="transaction-account"
          label="Conta"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.accountId}
            id="transaction-account"
            name="accountId"
          >
            <option value="">Sem conta</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} - {getEnumLabel("account_type", account.type)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={state.errors.creditCardId}
          hint="Usado apenas com metodo cartao de credito."
          htmlFor="transaction-credit-card"
          label="Cartao"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.creditCardId}
            id="transaction-credit-card"
            name="creditCardId"
          >
            <option value="">Sem cartao</option>
            {creditCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={state.errors.externalFingerprint}
          htmlFor="external-fingerprint"
          label="Fingerprint externo"
        >
          <Input
            autoComplete="off"
            defaultValue={values.externalFingerprint}
            hasError={Boolean(state.errors.externalFingerprint)}
            id="external-fingerprint"
            name="externalFingerprint"
          />
        </Field>
        <Field
          error={state.errors.sourceType}
          htmlFor="source-type"
          label="Origem"
        >
          <Input
            autoComplete="off"
            defaultValue={values.sourceType}
            hasError={Boolean(state.errors.sourceType)}
            id="source-type"
            name="sourceType"
          />
        </Field>
      </div>

      <input name="sourceId" type="hidden" value={values.sourceId} />

      <Field
        error={state.errors.notes}
        htmlFor="transaction-notes"
        label="Notas"
      >
        <Input
          autoComplete="off"
          defaultValue={values.notes}
          hasError={Boolean(state.errors.notes)}
          id="transaction-notes"
          name="notes"
        />
      </Field>

      <div>
        <Button disabled={pending} type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function categoryOptions(categories: readonly CategoryReference[]) {
  const roots = categories.filter((category) => category.parentId === null);
  const children = categories.filter((category) => category.parentId !== null);

  return roots.flatMap((root) => [
    {
      id: root.id,
      label: `${root.name} - ${getEnumLabel("category_type", root.type)}`,
    },
    ...children
      .filter((category) => category.parentId === root.id)
      .map((category) => ({
        id: category.id,
        label: `${root.name} / ${category.name}`,
      })),
  ]);
}

function getInitialState(
  transaction?: TransactionRecord,
): TransactionFormState {
  return {
    errors: {},
    message: null,
    status: "idle",
    values: getInitialValues(transaction),
  };
}

function getInitialValues(
  transaction?: TransactionRecord,
): TransactionFormValues {
  return {
    accountId: transaction?.accountId ?? "",
    amount: transaction?.amount.amount ?? "",
    categoryId: transaction?.subcategoryId ?? transaction?.categoryId ?? "",
    competenceDate:
      transaction && transaction.competenceDate !== transaction.transactionDate
        ? transaction.competenceDate
        : "",
    creditCardId: transaction?.creditCardId ?? "",
    description: transaction?.description ?? "",
    externalFingerprint: transaction?.externalFingerprint ?? "",
    notes: transaction?.notes ?? "",
    paymentMethod: transaction?.paymentMethod ?? "pix",
    sourceId: transaction?.sourceId ?? "",
    sourceType: transaction?.sourceType ?? "",
    transactionDate: transaction?.transactionDate ?? "",
    transactionType: transaction?.transactionType ?? "expense",
  };
}
