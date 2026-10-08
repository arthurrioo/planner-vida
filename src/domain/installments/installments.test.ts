import { describe, expect, it } from "vitest";

import { asAccountId } from "@/domain/accounts";
import { asCategoryId } from "@/domain/categories";
import {
  buildInstallmentSchedule,
  INSTALLMENT_DOMAIN_MAX,
  INSTALLMENT_ORDINARY_PURCHASE_UI_MAX,
  moneyToMinorUnits,
  parseInstallmentPlanMutation,
} from "./installments";
import { DomainError, parseMoney, type LocalDate } from "@/domain/shared";

const uuid = {
  account: "11111111-1111-4111-8111-111111111111",
  card: "22222222-2222-4222-8222-222222222222",
  category: "33333333-3333-4333-8333-333333333333",
};

describe("Milestone 12 installment domain", () => {
  it("generates 2x and reconciles exactly to the plan total", () => {
    const installments = buildInstallmentSchedule({
      firstDueDate: "2026-10-05" as LocalDate,
      totalAmount: parseMoney("100.00"),
      totalInstallments: 2,
    });

    expect(
      installments.map((installment) => installment.amount.amount),
    ).toEqual(["50.0000", "50.0000"]);
    expect(installments.map((installment) => installment.dueDate)).toEqual([
      "2026-10-05",
      "2026-11-05",
    ]);
    expect(
      installments.reduce(
        (total, installment) => total + moneyToMinorUnits(installment.amount),
        BigInt(0),
      ),
    ).toBe(BigInt(10000));
  });

  it("uses deterministic cent residual distribution for 3x", () => {
    const installments = buildInstallmentSchedule({
      firstDueDate: "2026-01-31" as LocalDate,
      totalAmount: parseMoney("100.00"),
      totalInstallments: 3,
    });

    expect(
      installments.map((installment) => installment.amount.amount),
    ).toEqual(["33.3400", "33.3300", "33.3300"]);
    expect(installments.map((installment) => installment.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("accepts 24x in ordinary UI mode and rejects 25x there", () => {
    expect(
      parseInstallmentPlanMutation(
        command({ totalInstallments: INSTALLMENT_ORDINARY_PURCHASE_UI_MAX }),
        { enforceUiLimit: true },
      ).totalInstallments,
    ).toBe(24);

    expect(() =>
      parseInstallmentPlanMutation(command({ totalInstallments: 25 }), {
        enforceUiLimit: true,
      }),
    ).toThrow(DomainError);
  });

  it("accepts the 60x domain/database maximum outside ordinary UI mode", () => {
    const mutation = parseInstallmentPlanMutation(
      command({ totalInstallments: INSTALLMENT_DOMAIN_MAX }),
    );
    const installments = buildInstallmentSchedule(mutation);

    expect(mutation.totalInstallments).toBe(60);
    expect(installments).toHaveLength(60);
    expect(installments.at(0)?.installmentNumber).toBe(1);
    expect(installments.at(-1)?.installmentNumber).toBe(60);
  });

  it("rejects 61x at the domain boundary", () => {
    expect(() =>
      parseInstallmentPlanMutation(command({ totalInstallments: 61 })),
    ).toThrow(DomainError);
  });

  it("rejects BRL totals with fractions smaller than one cent", () => {
    expect(() =>
      parseInstallmentPlanMutation({
        ...command(),
        totalAmount: "100.001",
      }),
    ).toThrow(DomainError);
  });

  it("keeps plans descriptive without fake parent transaction fields", () => {
    const mutation = parseInstallmentPlanMutation(command());

    expect(mutation).not.toHaveProperty("transactionId");
    expect(mutation).not.toHaveProperty("installments");
    expect(mutation.accountId).toBe(asAccountId(uuid.account));
    expect(mutation.categoryId).toBe(asCategoryId(uuid.category));
  });

  it("requires credit-card installments to use a card instead of an account", () => {
    const mutation = parseInstallmentPlanMutation(
      command({
        accountId: "",
        creditCardId: uuid.card,
        paymentMethod: "credit_card",
      }),
    );

    expect(mutation.accountId).toBeNull();
    expect(mutation.creditCardId).toBe(uuid.card);
  });
});

function command(
  overrides: Partial<{
    accountId: string;
    creditCardId: string;
    paymentMethod: string;
    totalInstallments: number;
  }> = {},
) {
  return {
    accountId: overrides.accountId ?? uuid.account,
    categoryId: uuid.category,
    creditCardId: overrides.creditCardId ?? "",
    description: "Compra parcelada",
    firstDueDate: "2026-10-05",
    merchantName: "Loja Exemplo",
    paymentMethod: overrides.paymentMethod ?? "pix",
    purchaseDate: "2026-09-26",
    totalAmount: "100.00",
    totalInstallments: String(overrides.totalInstallments ?? 3),
  };
}
