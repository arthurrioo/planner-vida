import { describe, expect, it } from "vitest";

import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  moneyFromMinorUnits,
  parseMoney,
  subtractMoney,
} from "./money";

describe("money primitives", () => {
  it("normalizes official money as decimal strings with BRL currency", () => {
    expect(parseMoney("00123.4")).toEqual({
      amount: "123.40",
      currency: "BRL",
    });
    expect(moneyFromMinorUnits(BigInt(12345))).toEqual({
      amount: "123.45",
      currency: "BRL",
    });
  });

  it("preserves decimal precision without floating point arithmetic", () => {
    expect(addMoney(parseMoney("0.10"), parseMoney("0.20")).amount).toBe(
      "0.30",
    );
    expect(subtractMoney(parseMoney("10.00"), parseMoney("0.01")).amount).toBe(
      "9.99",
    );
  });

  it("compares money values and detects positive amounts", () => {
    expect(compareMoney(parseMoney("10.00"), parseMoney("9.99"))).toBe(1);
    expect(compareMoney(parseMoney("10.00"), parseMoney("10"))).toBe(0);
    expect(isPositiveMoney(parseMoney("0"))).toBe(false);
    expect(isPositiveMoney(parseMoney("0.01"))).toBe(true);
  });

  it("rejects floats, commas, excess scale, negative official amounts, and zero when blocked", () => {
    expect(() => parseMoney("0.30000000000000004")).toThrow("decimal places");
    expect(() => parseMoney("12,34")).toThrow("decimal string");
    expect(() => parseMoney("-1.00")).toThrow("negative");
    expect(() => parseMoney("0", { allowZero: false })).toThrow("zero");
  });

  it("allows signed calculated values only when explicitly requested", () => {
    expect(subtractMoney(parseMoney("1.00"), parseMoney("2.00")).amount).toBe(
      "-1.00",
    );
    expect(
      moneyFromMinorUnits(BigInt(-99), { allowNegative: true }).amount,
    ).toBe("-0.99");
  });
});
