import { parseLocalDate } from "./local-date";
import { parseMoney } from "./money";

export type ValidationIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type ValidationResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; issues: ValidationIssue[] }>;

export type Validator<TValue> = (
  value: unknown,
  path: string,
) => ValidationResult<TValue>;

export function valid<TValue>(value: TValue): ValidationResult<TValue> {
  return { ok: true, value };
}

export function invalid(issue: ValidationIssue): ValidationResult<never> {
  return { ok: false, issues: [issue] };
}

export function stringField(
  options: Readonly<{ trim?: boolean; minLength?: number }> = {},
) {
  return (value: unknown, path: string): ValidationResult<string> => {
    if (typeof value !== "string") {
      return invalid({
        path,
        code: "invalid_type",
        message: "Expected a string.",
      });
    }

    const normalized = options.trim === false ? value : value.trim();

    if (options.minLength && normalized.length < options.minLength) {
      return invalid({
        path,
        code: "too_small",
        message: `Expected at least ${options.minLength} characters.`,
      });
    }

    return valid(normalized);
  };
}

export function enumField<const TValues extends readonly string[]>(
  values: TValues,
) {
  return (value: unknown, path: string): ValidationResult<TValues[number]> => {
    if (typeof value !== "string" || !values.includes(value)) {
      return invalid({
        path,
        code: "invalid_enum",
        message: `Expected one of: ${values.join(", ")}.`,
      });
    }

    return valid(value);
  };
}

export function localDateField() {
  return (value: unknown, path: string) => {
    if (typeof value !== "string") {
      return invalid({
        path,
        code: "invalid_type",
        message: "Expected a LocalDate string.",
      });
    }

    try {
      return valid(parseLocalDate(value));
    } catch (error) {
      return invalid({
        path,
        code: "invalid_local_date",
        message: error instanceof Error ? error.message : "Invalid LocalDate.",
      });
    }
  };
}

export function moneyField(options: Parameters<typeof parseMoney>[1] = {}) {
  return (value: unknown, path: string) => {
    if (typeof value !== "string") {
      return invalid({
        path,
        code: "invalid_type",
        message: "Expected a decimal money string.",
      });
    }

    try {
      return valid(parseMoney(value, options));
    } catch (error) {
      return invalid({
        path,
        code: "invalid_money",
        message: error instanceof Error ? error.message : "Invalid money.",
      });
    }
  };
}

export function combineIssues<TValue>(
  value: TValue,
  issues: ValidationIssue[],
): ValidationResult<TValue> {
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return valid(value);
}
