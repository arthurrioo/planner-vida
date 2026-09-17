import { describe, expect, it } from "vitest";

import {
  categoryTypes,
  enumField,
  localDateField,
  moneyField,
  stringField,
} from "./index";

describe("validation schema conventions", () => {
  it("validates typed fields and returns normalized values", () => {
    expect(stringField({ minLength: 2 })("  ok  ", "name")).toEqual({
      ok: true,
      value: "ok",
    });
    expect(enumField(categoryTypes)("income", "type")).toEqual({
      ok: true,
      value: "income",
    });
    expect(localDateField()("2026-09-15", "date")).toEqual({
      ok: true,
      value: "2026-09-15",
    });
    expect(moneyField()("42", "amount")).toEqual({
      ok: true,
      value: { amount: "42.0000", currency: "BRL" },
    });
  });

  it("returns issue arrays for invalid input instead of throwing from UI boundary validators", () => {
    expect(enumField(categoryTypes)("despesa", "type")).toEqual({
      ok: false,
      issues: [
        {
          path: "type",
          code: "invalid_enum",
          message:
            "Expected one of: income, fixed_expense, variable_expense, investment, transfer.",
        },
      ],
    });
    expect(moneyField()("1.99999", "amount")).toMatchObject({
      ok: false,
      issues: [{ path: "amount", code: "invalid_money" }],
    });
  });
});
