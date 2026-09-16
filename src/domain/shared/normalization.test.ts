import { describe, expect, it } from "vitest";

import {
  NORMALIZATION_VERSION,
  createFingerprint,
  normalizeCategoryName,
  normalizeDisplayText,
  normalizeMerchantName,
  normalizeName,
} from "./normalization";

describe("normalization primitives", () => {
  it("preserves display text while normalizing whitespace", () => {
    expect(normalizeDisplayText("  Banco   do   Brasil  ")).toBe(
      "Banco do Brasil",
    );
  });

  it("normalizes names, categories, and merchants deterministically", () => {
    expect(normalizeName("  Cartao São João  ")).toBe("cartao sao joao");
    expect(normalizeCategoryName("Despesa   Variável")).toBe(
      "despesa variavel",
    );
    expect(normalizeMerchantName("PGTO Mercado São José 12345")).toBe(
      "sao jose",
    );
  });

  it("creates versioned fingerprints from canonicalized parts", () => {
    expect(
      createFingerprint(["Mercado São José", "2026-09-15", "123.45"]),
    ).toBe(`${NORMALIZATION_VERSION}:mercado sao jose|2026 09 15|123 45`);
  });
});
