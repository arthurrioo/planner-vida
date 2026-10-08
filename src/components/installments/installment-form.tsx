"use client";

import { useActionState, useState } from "react";

import type {
  InstallmentAccountReference,
  InstallmentCategoryReference,
  InstallmentCreditCardReference,
} from "@/domain/installments";
import { getEnumLabel, getEnumOptions } from "@/domain/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type {
  InstallmentFormState,
  InstallmentFormValues,
} from "@/app/app/financeiro/parcelamentos/actions";

type InstallmentFormProps = {
  accounts: readonly InstallmentAccountReference[];
  action: (
    state: InstallmentFormState,
    formData: FormData,
  ) => InstallmentFormState | Promise<InstallmentFormState>;
  categories: readonly InstallmentCategoryReference[];
  creditCards: readonly InstallmentCreditCardReference[];
  initialState?: InstallmentFormState;
};

export function InstallmentForm({
  accounts,
  action,
  categories,
  creditCards,
  initialState,
}: InstallmentFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState ?? getInitialState(),
  );
  const values = state.values;
  const [paymentMethod, setPaymentMethod] = useState(values.paymentMethod);
  const usesCreditCard = paymentMethod === "credit_card";

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
          htmlFor="installment-description"
          label="Descricao"
        >
          <Input
            autoComplete="off"
            defaultValue={values.description}
            hasError={Boolean(state.errors.description)}
            id="installment-description"
            name="description"
            required
          />
        </Field>
        <Field
          error={state.errors.merchantName}
          htmlFor="installment-merchant"
          label="Estabelecimento"
        >
          <Input
            autoComplete="off"
            defaultValue={values.merchantName}
            hasError={Boolean(state.errors.merchantName)}
            id="installment-merchant"
            name="merchantName"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          error={state.errors.totalAmount}
          htmlFor="installment-total-amount"
          label="Valor total"
        >
          <Input
            defaultValue={values.totalAmount}
            hasError={Boolean(state.errors.totalAmount)}
            id="installment-total-amount"
            inputMode="decimal"
            name="totalAmount"
            required
          />
        </Field>
        <Field
          error={state.errors.totalInstallments}
          hint="Compras comuns aceitam ate 24x na UI."
          htmlFor="installment-count"
          label="Parcelas"
        >
          <Input
            defaultValue={values.totalInstallments}
            hasError={Boolean(state.errors.totalInstallments)}
            id="installment-count"
            max={24}
            min={1}
            name="totalInstallments"
            required
            type="number"
          />
        </Field>
        <Field
          error={state.errors.categoryId}
          htmlFor="installment-category"
          label="Categoria"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.categoryId}
            id="installment-category"
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          error={state.errors.purchaseDate}
          htmlFor="installment-purchase-date"
          label="Data da compra"
        >
          <Input
            defaultValue={values.purchaseDate}
            hasError={Boolean(state.errors.purchaseDate)}
            id="installment-purchase-date"
            name="purchaseDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={state.errors.firstDueDate}
          htmlFor="installment-first-due"
          label="Primeiro vencimento"
        >
          <Input
            defaultValue={values.firstDueDate}
            hasError={Boolean(state.errors.firstDueDate)}
            id="installment-first-due"
            name="firstDueDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={state.errors.paymentMethod}
          htmlFor="installment-payment-method"
          label="Metodo"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.paymentMethod}
            id="installment-payment-method"
            name="paymentMethod"
            onChange={(event) => setPaymentMethod(event.currentTarget.value)}
          >
            {getEnumOptions("payment_method").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {usesCreditCard ? (
        <Field
          error={state.errors.creditCardId}
          hint="Parcelas de cartao nao reduzem saldo de conta agora."
          htmlFor="installment-credit-card"
          label="Cartao"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            defaultValue={values.creditCardId}
            disabled={creditCards.length === 0}
            id="installment-credit-card"
            name="creditCardId"
            required
          >
            <option value="">Selecione</option>
            {creditCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field
          error={state.errors.accountId}
          htmlFor="installment-account"
          label="Conta"
        >
          <select
            className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2"
            defaultValue={values.accountId}
            id="installment-account"
            name="accountId"
            required
          >
            <option value="">Selecione</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} - {getEnumLabel("account_type", account.type)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div>
        <Button disabled={pending} type="submit">
          Criar parcelamento
        </Button>
      </div>
    </form>
  );
}

function categoryOptions(categories: readonly InstallmentCategoryReference[]) {
  const expenseCategories = categories.filter((category) =>
    ["fixed_expense", "variable_expense"].includes(category.type),
  );
  const roots = expenseCategories.filter(
    (category) => category.parentId === null,
  );
  const children = expenseCategories.filter(
    (category) => category.parentId !== null,
  );

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

function getInitialState(): InstallmentFormState {
  return {
    errors: {},
    message: null,
    status: "idle",
    values: getInitialValues(),
  };
}

function getInitialValues(): InstallmentFormValues {
  return {
    accountId: "",
    categoryId: "",
    creditCardId: "",
    description: "",
    firstDueDate: "",
    merchantName: "",
    paymentMethod: "pix",
    purchaseDate: "",
    totalAmount: "",
    totalInstallments: "2",
  };
}
