import { describe, expect, it } from "vitest";

import { formatBRL, formatDateBR, formatDateTimeBR } from "./formatters";

describe("UI formatters", () => {
  it("formats DATE strings without timezone conversion", () => {
    expect(formatDateBR("2026-09-15")).toBe("15/09/2026");
  });

  it("formats BRL from decimal strings without accepting floats", () => {
    expect(formatBRL("1234567.8")).toBe("R$ 1.234.567,80");
    expect(formatBRL("-42")).toBe("-R$ 42,00");
  });

  it("rejects invalid money and date values", () => {
    expect(() => formatBRL("12,34")).toThrow("decimal money string");
    expect(() => formatDateBR("15/09/2026")).toThrow("YYYY-MM-DD");
  });

  it("formats timed events with the explicit application timezone", () => {
    expect(
      formatDateTimeBR("2026-09-15T15:30:00.000Z", "America/Sao_Paulo"),
    ).toMatch(/15\/09\/2026, 12:30/);
  });
});
