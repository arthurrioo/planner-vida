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
      createFingerprint([
        { field: "merchant", type: "merchant", value: "Mercado São José" },
        { field: "transaction_date", type: "local-date", value: "2026-09-15" },
        { field: "amount", type: "money", value: "123.45" },
      ]),
    ).toBe(
      `${NORMALIZATION_VERSION}:${JSON.stringify([
        {
          index: 0,
          field: "merchant",
          type: "merchant",
          value: "sao jose",
        },
        {
          index: 1,
          field: "transaction date",
          type: "local-date",
          value: "2026-09-15",
        },
        {
          index: 2,
          field: "amount",
          type: "money",
          value: { amount: "123.4500" },
        },
      ])}`,
    );
  });

  it("preserves date and money semantics instead of text-search tokens", () => {
    const fingerprint = createFingerprint([
      { field: "date", type: "local-date", value: "2026-09-15" },
      { field: "amount", type: "money", value: "123.45" },
    ]);

    expect(fingerprint).toContain('"value":"2026-09-15"');
    expect(fingerprint).toContain('"amount":"123.4500"');
    expect(fingerprint).not.toContain("2026 09 15");
    expect(fingerprint).not.toContain("123 45");
  });

  it("keeps field order and null semantics deterministic", () => {
    const ordered = createFingerprint([
      { field: "a", type: "text", value: "Alpha" },
      { field: "b", type: "text", value: "Beta" },
      null,
    ]);
    const reordered = createFingerprint([
      { field: "b", type: "text", value: "Beta" },
      { field: "a", type: "text", value: "Alpha" },
      null,
    ]);

    expect(ordered).toBe(
      createFingerprint([
        { field: "a", type: "text", value: "  ÁLpha " },
        { field: "b", type: "text", value: "Beta" },
        null,
      ]),
    );
    expect(ordered).not.toBe(reordered);
    expect(ordered).toContain('"type":"null"');
  });
});
