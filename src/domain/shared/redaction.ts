const sensitiveKeyPattern =
  /(password|senha|token|secret|service[_-]?role|authorization|api[_-]?key|pdf[_-]?password)/i;

export const REDACTED_VALUE = "[REDACTED]" as const;
export const MAX_LOG_ARRAY_LENGTH = 10;
export const MAX_LOG_OBJECT_KEYS = 25;
export const MAX_LOG_STRING_LENGTH = 500;

export function redactSensitivePayload(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[TRUNCATED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > MAX_LOG_STRING_LENGTH
      ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}...[TRUNCATED]`
      : value;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOG_ARRAY_LENGTH)
      .map((item) => redactSensitivePayload(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_LOG_OBJECT_KEYS)
      .map(([key, nestedValue]) => [
        key,
        sensitiveKeyPattern.test(key)
          ? REDACTED_VALUE
          : redactSensitivePayload(nestedValue, depth + 1),
      ]),
  );
}
