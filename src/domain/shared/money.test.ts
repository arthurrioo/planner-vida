import { describe, expect, it } from "vitest";

import {
  BRL_MINOR_UNIT_SCALE,
  DEFAULT_MONEY_SCALE,
  MONEY_STORAGE_SCALE,
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
      amount: "123.4000",
      currency: "BRL",
    });
    expect(moneyFromMinorUnits(BigInt(12345))).toEqual({
      amount: "123.4500",
      currency: "BRL",
    });
  });

  it("separates NUMERIC(19,4) storage scale from BRL minor units", () => {
    expect(DEFAULT_MONEY_SCALE).toBe(4);
    expect(MONEY_STORAGE_SCALE).toBe(4);
    expect(BRL_MINOR_UNIT_SCALE).toBe(2);
    expect(moneyFromMinorUnits(BigInt(123)).amount).toBe("1.2300");
  });

  it("accepts 0, 2, 3, and 4 decimal places as scale-4 canonical money", () => {
    expect(parseMoney("10").amount).toBe("10.0000");
    expect(parseMoney("10.25").amount).toBe("10.2500");
    expect(parseMoney("10.255").amount).toBe("10.2550");
    expect(parseMoney("10.2555").amount).toBe("10.2555");
  });

  it("accepts large values inside NUMERIC(19,4) precision", () => {
    expect(parseMoney("999999999999999.9999").amount).toBe(
      "999999999999999.9999",
    );
  });

  it("preserves decimal precision without floating point arithmetic", () => {
    expect(addMoney(parseMoney("0.10"), parseMoney("0.20")).amount).toBe(
      "0.3000",
    );
    expect(subtractMoney(parseMoney("10.00"), parseMoney("0.01")).amount).toBe(
      "9.9900",
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
    expect(() => parseMoney("12.34567")).toThrow("decimal places");
    expect(() => parseMoney("1000000000000000.0000")).toThrow("precision");
    expect(() => parseMoney("-1.00")).toThrow("negative");
    expect(() => parseMoney("0", { allowZero: false })).toThrow("zero");
  });

  it("allows signed calculated values only when explicitly requested", () => {
    expect(subtractMoney(parseMoney("1.00"), parseMoney("2.00")).amount).toBe(
      "-1.0000",
    );
    expect(
      moneyFromMinorUnits(BigInt(-99), { allowNegative: true }).amount,
    ).toBe("-0.9900");
  });
});
