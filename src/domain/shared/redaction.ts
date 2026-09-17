const sensitiveKeyPattern =
  /(password|senha|token|secret|credential|service[_-]?role|authorization|api[_-]?key|pdf[_-]?password|e-?mail|cpf|cnpj|documento|document[_-]?(id|number)?|tax[_-]?id|phone|telefone|mobile|cellphone|card[_-]?(number|pan)|credit[_-]?card|pan|account[_-]?(number|no)|bank[_-]?account|iban)/i;
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
        sensitiveKeyPattern.test(key)
          ? REDACTED_VALUE
          : redactSensitivePayload(nestedValue, depth + 1, seen),
      ]),
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
