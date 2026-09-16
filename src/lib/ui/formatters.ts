const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const decimalPattern = /^-?\d+(\.\d+)?$/;

export function formatDateBR(value: string) {
  if (!dateOnlyPattern.test(value)) {
    throw new Error("Expected a DATE string in YYYY-MM-DD format.");
  }

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

export function formatDateTimeBR(
  value: string | Date,
  timeZone = "America/Sao_Paulo",
) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Expected a valid timestamptz-compatible value.");
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function formatBRL(value: string) {
  const normalized = value.trim();

  if (!decimalPattern.test(normalized)) {
    throw new Error("Expected a decimal money string.");
  }

  const isNegative = normalized.startsWith("-");
  const unsignedValue = isNegative ? normalized.slice(1) : normalized;
  const [integerPart, fractionPart = ""] = unsignedValue.split(".");
  const cents = fractionPart.padEnd(2, "0").slice(0, 2);
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${isNegative ? "-" : ""}R$ ${groupedInteger},${cents}`;
}
