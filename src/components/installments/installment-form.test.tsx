import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InstallmentForm } from "./installment-form";
import type { InstallmentFormState } from "@/app/app/financeiro/parcelamentos/actions";

const userId = "00000000-0000-4000-8000-000000001201" as never;
const initialState: InstallmentFormState = {
  errors: {},
  message: null,
  status: "idle",
  values: {
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
  },
};

describe("InstallmentForm", () => {
  it("caps ordinary purchase input at 24 installments", () => {
    renderForm();

    expect(screen.getByLabelText("Parcelas")).toHaveAttribute("max", "24");
    expect(screen.getByLabelText("Conta")).toBeRequired();
    expect(screen.queryByLabelText("Cartao")).not.toBeInTheDocument();
  });

  it("switches from account to card without carrying account impact", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Metodo"), {
      target: { value: "credit_card" },
    });

    expect(screen.getByLabelText("Cartao")).toBeRequired();
    expect(screen.queryByLabelText("Conta")).not.toBeInTheDocument();
    expect(screen.getByText(/nao reduzem saldo de conta/i)).toBeInTheDocument();
  });

  it("surfaces server validation with an accessible alert and field error", () => {
    renderForm({
      errors: {
        totalInstallments: "Installment count must be between 1 and 24.",
      },
      message: "Installment input is invalid.",
      status: "error",
      values: { ...initialState.values, totalInstallments: "25" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Installment input is invalid.",
    );
    expect(screen.getByLabelText("Parcelas")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

function renderForm(state: InstallmentFormState = initialState) {
  return render(
    <InstallmentForm
      accounts={[
        {
          id: "00000000-0000-4000-8000-000000001202" as never,
          name: "Conta principal",
          status: "active",
          type: "checking",
          userId,
        },
      ]}
      action={vi.fn(async () => state)}
      categories={[
        {
          archivedAt: null,
          id: "00000000-0000-4000-8000-000000001203" as never,
          name: "Compras",
          parentId: null,
          type: "variable_expense",
          userId,
        },
      ]}
      creditCards={[
        {
          id: "00000000-0000-4000-8000-000000001204" as never,
          name: "Cartao principal",
          status: "active",
          userId,
        },
      ]}
      initialState={state}
    />,
  );
}
