import { render, screen } from "@testing-library/react";
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
