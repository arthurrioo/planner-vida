const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo" as const;

export type LocalDate = string & { readonly __brand: "LocalDate" };

export class LocalDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalDateError";
  }
}

export function parseLocalDate(value: string): LocalDate {
  if (!localDatePattern.test(value)) {
    throw new LocalDateError("LocalDate must use YYYY-MM-DD format.");
  }

  const [year, month, day] = splitLocalDate(value);

  if (month < 1 || month > 12) {
    throw new LocalDateError("LocalDate month is out of range.");
  }

  if (day < 1 || day > getDaysInMonth(year, month)) {
    throw new LocalDateError("LocalDate day is out of range.");
  }

  return value as LocalDate;
}

export function createLocalDate(year: number, month: number, day: number) {
  return parseLocalDate(
    `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
  );
}

export function getMonthBounds(year: number, month: number) {
  return {
    start: createLocalDate(year, month, 1),
    end: createLocalDate(year, month, getDaysInMonth(year, month)),
  };
}

export function addMonthsClamped(value: LocalDate, monthsToAdd: number) {
  if (!Number.isInteger(monthsToAdd)) {
    throw new LocalDateError("Month offset must be an integer.");
  }

  const [year, month, day] = splitLocalDate(value);
  const monthIndex = year * 12 + (month - 1) + monthsToAdd;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = (monthIndex % 12) + 1;
  const nextDay = Math.min(day, getDaysInMonth(nextYear, nextMonth));

  return createLocalDate(nextYear, nextMonth, nextDay);
}

export function compareLocalDate(left: LocalDate, right: LocalDate) {
  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

export function isLocalDate(value: string): value is LocalDate {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

export function parseTimestampWithTimeZone(
  value: string,
  timeZone: string = DEFAULT_TIME_ZONE,
) {
  if (!isSupportedTimeZone(timeZone)) {
    throw new LocalDateError("Unsupported IANA timezone.");
  }

  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    throw new LocalDateError(
      "Timed events must include an explicit timezone offset.",
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new LocalDateError("Timed event timestamp is invalid.");
  }

  return {
    instant: date.toISOString(),
    timeZone,
  } as const;
}

export function splitLocalDate(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);

  return [year, month, day];
}

export function getDaysInMonth(year: number, month: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new LocalDateError("Year and month must be integers.");
  }

  if (month < 1 || month > 12) {
    throw new LocalDateError("Month must be between 1 and 12.");
  }

  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isSupportedTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
