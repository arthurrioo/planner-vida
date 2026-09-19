import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountForm } from "./account-form";
import type { AccountFormState } from "@/app/app/financeiro/contas/actions";

const errorState: AccountFormState = {
  errors: {
    name: "Expected at least 1 characters.",
    openingBalance: "Money cannot have more than 4 decimal places.",
    openingBalanceDate: "Invalid LocalDate.",
    type: "Expected one of: checking, savings, wallet.",
  },
  message: "Account input is invalid.",
  status: "error",
  values: {
    description: "",
    institution: "",
    name: "",
    openingBalance: "1.00001",
    openingBalanceDate: "2026-02-31",
    overdraftLimit: "0",
    type: "bank",
  },
};

describe("AccountForm", () => {
  it("surfaces validation details with accessible field associations", () => {
    const action = vi.fn((state: AccountFormState) => state);

    render(
      <AccountForm
        action={action}
        initialState={errorState}
        submitLabel="Salvar"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Account input is invalid.",
    );
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("account-name-error"),
    );
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("textbox", { name: "Saldo inicial" }),
    ).toHaveAccessibleDescription(
      "Money cannot have more than 4 decimal places.",
    );
    expect(screen.getByLabelText("Data-base")).toHaveAccessibleDescription(
      "Invalid LocalDate.",
    );
    expect(screen.getByLabelText("Tipo")).toHaveAccessibleDescription(
      "Expected one of: checking, savings, wallet.",
    );
  });
});
