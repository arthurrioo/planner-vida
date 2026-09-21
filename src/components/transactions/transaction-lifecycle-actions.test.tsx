import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransactionLifecycleActions } from "./transaction-lifecycle-actions";
import { parseMoney } from "@/domain/shared";
import type { TransactionRecord } from "@/domain/transactions";

describe("TransactionLifecycleActions", () => {
  it("requires labeled reasons and confirmation for void and reversal", () => {
    render(
      <TransactionLifecycleActions
        reverseAction={vi.fn()}
        transaction={transaction}
        voidAction={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Motivo da anulacao")).toBeRequired();
    expect(screen.getByLabelText("Motivo do estorno")).toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "sem criar uma nova transacao",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "cria uma linha de lineage",
    );
  });
});

const transaction: TransactionRecord = {
  accountId: "00000000-0000-4000-8000-000000000001" as never,
  amount: parseMoney("10"),
  categoryId: "00000000-0000-4000-8000-000000000002" as never,
  competenceDate: "2026-09-20" as never,
  competenceMonth: "2026-09-01" as never,
  creditCardId: null,
  currency: "BRL",
  description: "Despesa",
  externalFingerprint: null,
  id: "00000000-0000-4000-8000-000000000003" as never,
  notes: null,
  originType: "manual",
  paymentMethod: "pix",
  postedAt: "2026-09-20T12:00:00.000Z",
  reversalOfTransactionId: null,
  reversalReason: null,
  reversedAt: null,
  reversedByTransactionId: null,
  sourceId: null,
  sourceType: "manual",
  status: "posted",
  subcategoryId: null,
  transferId: null,
  transactionDate: "2026-09-20" as never,
  transactionType: "expense",
  userId: "00000000-0000-4000-8000-000000000004" as never,
  voidedAt: null,
};
