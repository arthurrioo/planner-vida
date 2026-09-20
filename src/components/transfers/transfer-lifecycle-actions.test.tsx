import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransferLifecycleActions } from "./transfer-lifecycle-actions";
import type { TransferRecord } from "@/domain/transfers";

describe("TransferLifecycleActions", () => {
  it("requires a labeled reason and confirmation for reversal", () => {
    render(
      <TransferLifecycleActions reverseAction={vi.fn()} transfer={transfer} />,
    );

    expect(screen.getByLabelText("Motivo do estorno")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Estornar transferencia" }),
    ).toBeEnabled();
  });

  it("opens confirmation, cancels without submit, and confirms by submitting the form", () => {
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => undefined);

    render(
      <TransferLifecycleActions reverseAction={vi.fn()} transfer={transfer} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Estornar transferencia" }),
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Estornar transferencia",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(requestSubmit).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Estornar transferencia" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));

    expect(requestSubmit).toHaveBeenCalledTimes(1);
    requestSubmit.mockRestore();
  });

  it("disables reversal for already reversed transfers", () => {
    render(
      <TransferLifecycleActions
        reverseAction={vi.fn()}
        transfer={{ ...transfer, status: "reversed" }}
      />,
    );

    expect(screen.getByLabelText("Motivo do estorno")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Estornar transferencia" }),
    ).toBeDisabled();
  });
});

const transfer: TransferRecord = {
  amount: { amount: "10.0000" as never, currency: "BRL" },
  currency: "BRL",
  description: "Reserva",
  destinationAccountId: "00000000-0000-4000-8000-000000000002" as never,
  id: "00000000-0000-4000-8000-000000000003" as never,
  inflowTransactionId: "00000000-0000-4000-8000-000000000004" as never,
  originType: "manual",
  outflowTransactionId: "00000000-0000-4000-8000-000000000005" as never,
  sourceAccountId: "00000000-0000-4000-8000-000000000001" as never,
  status: "posted",
  transferDate: "2026-09-20" as never,
  userId: "00000000-0000-4000-8000-000000000006" as never,
};
