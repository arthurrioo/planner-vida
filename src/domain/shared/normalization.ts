export const NORMALIZATION_VERSION = "m06-v1" as const;

const whitespacePattern = /\s+/g;
const nonFingerprintCharacterPattern = /[^a-z0-9]+/g;

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

export function createFingerprint(parts: readonly string[]) {
  const normalizedParts = parts.map((part) => normalizeSearchKey(part));

  return `${NORMALIZATION_VERSION}:${normalizedParts.join("|")}`;
}

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
