import { describe, expect, it } from "vitest";

import {
  assertCanonicalEnumValue,
  canonicalEnums,
  getEnumLabel,
  getEnumOptions,
  isCanonicalEnumValue,
} from "./index";

describe("canonical enum exports and UI label boundary", () => {
  it("exports canonical database enum values without translated storage values", () => {
    expect(canonicalEnums.transaction_type).toEqual([
      "income",
      "expense",
      "transfer",
      "investment",
    ]);
    expect(canonicalEnums.payment_method).toContain("credit_card");
    expect(canonicalEnums.account_type).toContain("benefit");
    expect(canonicalEnums.origin_type).toContain("migration");
  });

  it("validates canonical enum values", () => {
    expect(isCanonicalEnumValue("category_type", "fixed_expense")).toBe(true);
    expect(isCanonicalEnumValue("category_type", "despesa_fixa")).toBe(false);
    expect(() => assertCanonicalEnumValue("payment_method", "credit")).toThrow(
      "Invalid payment_method",
    );
  });

  it("keeps Portuguese labels outside canonical enum values", () => {
    expect(getEnumLabel("category_type", "fixed_expense")).toBe("Despesa fixa");
    expect(getEnumOptions("account_status")).toEqual([
      { value: "active", label: "Ativa" },
      { value: "archived", label: "Arquivada" },
      { value: "closed", label: "Encerrada" },
    ]);
  });
});
