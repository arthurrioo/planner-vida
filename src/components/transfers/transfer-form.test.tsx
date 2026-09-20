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

  it("labels historical archived and closed account options explicitly", () => {
    renderForm({
      accounts: [
        account({ name: "Conta ativa" }),
        account({
          id: accountId(2) as never,
          name: "Conta arquivada",
          status: "archived",
        }),
        account({
          id: accountId(3) as never,
          name: "Conta encerrada",
          status: "closed",
        }),
      ],
    });

    expect(
      screen.getAllByRole("option", {
        name: /Conta arquivada .*Conta corrente/i,
      }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("option", {
        name: /Conta encerrada .*Conta corrente/i,
      }),
    ).toHaveLength(2);
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
    accounts: Parameters<typeof TransferForm>[0]["accounts"];
    accountCount: number;
    initialState: TransferFormState;
  }> = {},
) {
  const accountCount = overrides.accountCount ?? 2;
  const accounts =
    overrides.accounts ??
    Array.from({ length: accountCount }, (_, index) =>
      account({
        id: accountId(index + 1) as never,
        name: index === 0 ? "Conta origem" : "Conta destino",
      }),
    );

  return render(
    <TransferForm
      accounts={accounts}
      action={vi.fn(async () => overrides.initialState ?? initialState)}
      initialState={overrides.initialState ?? initialState}
      submitLabel="Criar"
    />,
  );
}

function accountId(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function account(
  overrides: Partial<Parameters<typeof TransferForm>[0]["accounts"][number]>,
): Parameters<typeof TransferForm>[0]["accounts"][number] {
  return {
    id: accountId(1) as never,
    name: "Conta",
    status: "active",
    type: "checking",
    userId: "00000000-0000-4000-8000-000000000010" as never,
    ...overrides,
  };
}
