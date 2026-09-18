const sensitiveSingleKeyTokens = new Set([
  "authorization",
  "cellphone",
  "cnpj",
  "cpf",
  "credential",
  "credentials",
  "document",
  "documento",
  "email",
  "iban",
  "mobile",
  "pan",
  "password",
  "phone",
  "secret",
  "secrets",
  "senha",
  "telefone",
  "token",
  "tokens",
]);

const sensitiveKeyTokenSequences = [
  ["account", "no"],
  ["account", "number"],
  ["api", "key"],
  ["bank", "account"],
  ["card", "number"],
  ["card", "pan"],
  ["credit", "card"],
  ["document", "id"],
  ["document", "number"],
  ["e", "mail"],
  ["mobile", "phone"],
  ["pdf", "password"],
  ["phone", "number"],
  ["service", "role"],
  ["tax", "id"],
];

const sensitiveCompactKeyAliases = new Set(
  sensitiveKeyTokenSequences.map((sequence) => sequence.join("")),
);

const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const cpfPattern = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const phonePattern = /\+?\d{1,3}?\s?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}\b/g;
const ibanPattern = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const cardNumberCandidatePattern = /\b(?:\d[ -]?){13,19}\b/g;

export const REDACTED_VALUE = "[REDACTED]" as const;
export const MAX_LOG_ARRAY_LENGTH = 10;
export const MAX_LOG_OBJECT_KEYS = 25;
export const MAX_LOG_STRING_LENGTH = 500;

export function redactSensitivePayload(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (depth > 4) {
    return "[TRUNCATED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    const redacted = redactSensitiveString(value);

    return redacted.length > MAX_LOG_STRING_LENGTH
      ? `${redacted.slice(0, MAX_LOG_STRING_LENGTH)}...[TRUNCATED]`
      : redacted;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: REDACTED_VALUE,
      stack: value.stack ? REDACTED_VALUE : undefined,
    };
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOG_ARRAY_LENGTH)
      .map((item) => redactSensitivePayload(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_LOG_OBJECT_KEYS)
      .map(([key, nestedValue]) => [
        key,
        isSensitiveKeyName(key)
          ? REDACTED_VALUE
          : redactSensitivePayload(nestedValue, depth + 1, seen),
      ]),
  );
}

function isSensitiveKeyName(key: string) {
  const tokens = tokenizeKeyName(key);

  return (
    tokens.some((token) => sensitiveSingleKeyTokens.has(token)) ||
    sensitiveKeyTokenSequences.some((sequence) =>
      hasTokenSequence(tokens, sequence),
    ) ||
    sensitiveCompactKeyAliases.has(
      key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
    )
  );
}

function tokenizeKeyName(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+|\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function hasTokenSequence(tokens: string[], sequence: string[]) {
  return tokens.some((_, startIndex) =>
    sequence.every(
      (sequenceToken, sequenceIndex) =>
        tokens[startIndex + sequenceIndex] === sequenceToken,
    ),
  );
}

function redactSensitiveString(value: string) {
  return value
    .replace(emailPattern, REDACTED_VALUE)
    .replace(cpfPattern, REDACTED_VALUE)
    .replace(phonePattern, REDACTED_VALUE)
    .replace(ibanPattern, REDACTED_VALUE)
    .replace(cardNumberCandidatePattern, (candidate) =>
      isLuhnCandidate(candidate) ? REDACTED_VALUE : candidate,
    );
}

function isLuhnCandidate(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let checksum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;

    if (shouldDouble) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    checksum += digit;
    shouldDouble = !shouldDouble;
  }

  return checksum % 10 === 0;
}
