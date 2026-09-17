import type { Money } from "./money";
import { normalizeDecimalString } from "./money";

export const NORMALIZATION_VERSION = "m06-v1" as const;

const whitespacePattern = /\s+/g;
const nonFingerprintCharacterPattern = /[^a-z0-9]+/g;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export type FingerprintPart =
  | string
  | null
  | Readonly<{
      field: string;
      type: "text" | "merchant" | "local-date" | "money";
      value: string | Money | null | undefined;
    }>;

export function normalizeDisplayText(value: string) {
  return value.trim().replace(whitespacePattern, " ");
}

export function normalizeSearchKey(value: string) {
  return removeDiacritics(normalizeDisplayText(value))
    .toLowerCase()
    .replace(nonFingerprintCharacterPattern, " ")
    .trim()
    .replace(whitespacePattern, " ");
}

export function normalizeName(value: string) {
  return normalizeSearchKey(value);
}

export function normalizeCategoryName(value: string) {
  return normalizeSearchKey(value);
}

export function normalizeMerchantName(value: string) {
  return normalizeSearchKey(
    value
      .replace(/\b(loja|mercado|supermercado|pgto|pagamento)\b/gi, " ")
      .replace(/\d{2,}/g, " "),
  );
}

export function createFingerprint(parts: readonly FingerprintPart[]) {
  const normalizedParts = parts.map((part, index) =>
    canonicalizeFingerprintPart(part, index),
  );

  return `${NORMALIZATION_VERSION}:${JSON.stringify(normalizedParts)}`;
}

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function canonicalizeFingerprintPart(part: FingerprintPart, index: number) {
  if (part === null) {
    return { index, field: null, type: "null", value: null } as const;
  }

  if (typeof part === "string") {
    return {
      index,
      field: null,
      type: "text",
      value: normalizeSearchKey(part),
    } as const;
  }

  const field = normalizeSearchKey(part.field);

  switch (part.type) {
    case "text":
      return {
        index,
        field,
        type: part.type,
        value:
          part.value === null || part.value === undefined
            ? null
            : normalizeSearchKey(String(part.value)),
      } as const;
    case "merchant":
      return {
        index,
        field,
        type: part.type,
        value:
          part.value === null || part.value === undefined
            ? null
            : normalizeMerchantName(String(part.value)),
      } as const;
    case "local-date":
      return {
        index,
        field,
        type: part.type,
        value: canonicalizeLocalDate(part.value),
      } as const;
    case "money":
      return {
        index,
        field,
        type: part.type,
        value: canonicalizeMoney(part.value),
      } as const;
  }
}

function canonicalizeLocalDate(value: string | Money | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const date = String(value).trim();

  if (!localDatePattern.test(date)) {
    throw new Error("Fingerprint local-date parts must use YYYY-MM-DD.");
  }

  return date;
}

function canonicalizeMoney(value: string | Money | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    return {
      amount: normalizeDecimalString(value.amount, { allowNegative: true }),
      currency: value.currency,
    } as const;
  }

  return {
    amount: normalizeDecimalString(value, { allowNegative: true }),
  } as const;
}
