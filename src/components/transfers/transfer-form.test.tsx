import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransferForm } from "./transfer-form";
import type { TransferFormState } from "@/app/app/financeiro/transferencias/actions";

const initialState: TransferFormState = {
  errors: {},
  message: null,
  status: "idle",
  values: {
    amount: "",
    description: "",
    destinationAccountId: "",
    sourceAccountId: "",
    transferDate: "",
  },
};

describe("TransferForm", () => {
  it("renders source and destination account controls with active accounts", () => {
    renderForm();

    expect(screen.getByLabelText("Conta origem")).toBeInTheDocument();
    expect(screen.getByLabelText("Conta destino")).toBeInTheDocument();
    expect(
      screen.getAllByRole("option", { name: /Conta origem - Conta corrente/i }),
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Criar" })).toBeEnabled();
  });

  it("disables submission when fewer than two active accounts are available", () => {
    renderForm({ accountCount: 1 });

    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
  });

  it("surfaces validation details with accessible field associations", () => {
    renderForm({
      initialState: {
        errors: {
          amount: "Money amount cannot be zero.",
          destinationAccountId: "Source and destination accounts must differ.",
        },
        message: "Transfer input is invalid.",
        status: "error",
        values: {
          amount: "0",
          description: "Mesma conta",
          destinationAccountId: accountId(1),
          sourceAccountId: accountId(1),
          transferDate: "2026-09-20",
        },
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Transfer input is invalid.",
    );
    expect(screen.getByRole("textbox", { name: "Valor" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Conta destino")).toHaveAccessibleDescription(
      "Source and destination accounts must differ.",
    );
  });
});

function renderForm(
  overrides: Partial<{
    accountCount: number;
    initialState: TransferFormState;
  }> = {},
) {
  const accountCount = overrides.accountCount ?? 2;

  return render(
    <TransferForm
      accounts={Array.from({ length: accountCount }, (_, index) => ({
        id: accountId(index + 1) as never,
        name: index === 0 ? "Conta origem" : "Conta destino",
        status: "active",
        type: "checking",
        userId: "00000000-0000-4000-8000-000000000010" as never,
      }))}
      action={vi.fn(async () => overrides.initialState ?? initialState)}
      initialState={overrides.initialState ?? initialState}
      submitLabel="Criar"
    />,
  );
}

function accountId(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
