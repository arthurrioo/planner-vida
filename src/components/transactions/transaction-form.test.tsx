import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransactionForm } from "./transaction-form";
import type { TransactionFormState } from "@/app/app/financeiro/transacoes/actions";

const initialState: TransactionFormState = {
  errors: {},
  message: null,
  status: "idle",
  values: {
    accountId: "",
    amount: "",
    categoryId: "",
    competenceDate: "",
    creditCardId: "",
    description: "",
    notes: "",
    paymentMethod: "pix",
    transactionDate: "",
    transactionType: "expense",
  },
};

describe("TransactionForm", () => {
  it("keeps transfer and browser-controlled origin fields out of manual UI", () => {
    renderForm();

    expect(
      screen.queryByRole("option", { name: /^Transferencia$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/fingerprint/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^origem$/i)).not.toBeInTheDocument();
  });

  it("switches account and card fields according to payment method", () => {
    renderForm();

    expect(screen.getByLabelText("Conta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cartao")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Metodo"), {
      target: { value: "credit_card" },
    });

    expect(screen.queryByLabelText("Conta")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cartao")).toBeInTheDocument();
  });

  it("shows an unavailable state when credit card method has no active cards", () => {
    renderForm({ creditCards: [] });

    fireEvent.change(screen.getByLabelText("Metodo"), {
      target: { value: "credit_card" },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Nenhum cartao ativo disponivel",
    );
    expect(screen.getByLabelText("Cartao")).toBeDisabled();
  });
});

function renderForm(
  overrides: Partial<{
    creditCards: Parameters<typeof TransactionForm>[0]["creditCards"];
  }> = {},
) {
  return render(
    <TransactionForm
      accounts={[
        {
          id: "00000000-0000-4000-8000-000000000001" as never,
          name: "Conta",
          status: "active",
          type: "checking",
          userId: "00000000-0000-4000-8000-000000000002" as never,
        },
      ]}
      action={vi.fn(async () => initialState)}
      categories={[
        {
          archivedAt: null,
          id: "00000000-0000-4000-8000-000000000003" as never,
          name: "Despesas",
          parentId: null,
          type: "variable_expense",
          userId: "00000000-0000-4000-8000-000000000002" as never,
        },
      ]}
      creditCards={
        overrides.creditCards ?? [
          {
            id: "00000000-0000-4000-8000-000000000004" as never,
            name: "Cartao",
            status: "active",
            userId: "00000000-0000-4000-8000-000000000002" as never,
          },
        ]
      }
      initialState={initialState}
      submitLabel="Criar"
    />,
  );
}
