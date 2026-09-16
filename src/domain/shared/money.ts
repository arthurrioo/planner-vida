const decimalPattern = /^-?\d+(\.\d+)?$/;
const ZERO = BigInt(0);
const ONE_HUNDRED = BigInt(100);

export const DEFAULT_CURRENCY_CODE = "BRL" as const;
export const DEFAULT_MONEY_SCALE = 2;

export type CurrencyCode = typeof DEFAULT_CURRENCY_CODE;

export type DecimalString = string & { readonly __brand: "DecimalString" };

export type Money = Readonly<{
  amount: DecimalString;
  currency: CurrencyCode;
}>;

export type MoneyParseOptions = Readonly<{
  allowNegative?: boolean;
  allowZero?: boolean;
  currency?: CurrencyCode;
  scale?: number;
}>;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function parseMoney(
  value: string,
  options: MoneyParseOptions = {},
): Money {
  return {
    amount: normalizeDecimalString(value, {
      allowNegative: options.allowNegative ?? false,
      allowZero: options.allowZero ?? true,
      scale: options.scale ?? DEFAULT_MONEY_SCALE,
    }),
    currency: options.currency ?? DEFAULT_CURRENCY_CODE,
  };
}

export function moneyFromMinorUnits(
  cents: bigint,
  options: Omit<MoneyParseOptions, "scale"> = {},
): Money {
  const isNegative = cents < ZERO;

  if (isNegative && options.allowNegative !== true) {
    throw new MoneyError("Money amount cannot be negative.");
  }

  if (cents === ZERO && options.allowZero === false) {
    throw new MoneyError("Money amount cannot be zero.");
  }

  const absolute = isNegative ? -cents : cents;
  const integer = absolute / ONE_HUNDRED;
  const fraction = (absolute % ONE_HUNDRED).toString().padStart(2, "0");

  return parseMoney(`${isNegative ? "-" : ""}${integer}.${fraction}`, options);
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);

  const sum = toScaledInteger(left.amount) + toScaledInteger(right.amount);

  return parseMoney(fromScaledInteger(sum), {
    allowNegative: sum < ZERO,
    currency: left.currency,
  });
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);

  const difference =
    toScaledInteger(left.amount) - toScaledInteger(right.amount);

  return parseMoney(fromScaledInteger(difference), {
    allowNegative: difference < ZERO,
    currency: left.currency,
  });
}

export function compareMoney(left: Money, right: Money) {
  assertSameCurrency(left, right);

  const leftValue = toScaledInteger(left.amount);
  const rightValue = toScaledInteger(right.amount);

  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue > rightValue ? 1 : -1;
}

export function isPositiveMoney(value: Money) {
  return compareMoney(value, parseMoney("0", { currency: value.currency })) > 0;
}

export function normalizeDecimalString(
  value: string,
  options: Readonly<{
    allowNegative?: boolean;
    allowZero?: boolean;
    scale?: number;
  }> = {},
): DecimalString {
  const normalized = value.trim();
  const scale = options.scale ?? DEFAULT_MONEY_SCALE;

  if (!decimalPattern.test(normalized)) {
    throw new MoneyError("Money must be provided as a decimal string.");
  }

  if (!Number.isInteger(scale) || scale < 0) {
    throw new MoneyError("Money scale must be a non-negative integer.");
  }

  const isNegative = normalized.startsWith("-");

  if (isNegative && options.allowNegative !== true) {
    throw new MoneyError("Money amount cannot be negative.");
  }

  const unsigned = isNegative ? normalized.slice(1) : normalized;
  const [integerPart, rawFraction = ""] = unsigned.split(".");

  if (rawFraction.length > scale) {
    throw new MoneyError(
      `Money cannot have more than ${scale} decimal places.`,
    );
  }

  const canonicalInteger = integerPart.replace(/^0+(?=\d)/, "");
  const canonicalFraction = rawFraction.padEnd(scale, "0");
  const canonical =
    scale === 0 ? canonicalInteger : `${canonicalInteger}.${canonicalFraction}`;

  if (toScaledInteger(canonical as DecimalString) === ZERO) {
    if (options.allowZero === false) {
      throw new MoneyError("Money amount cannot be zero.");
    }

    return (scale === 0 ? "0" : `0.${"0".repeat(scale)}`) as DecimalString;
  }

  return `${isNegative ? "-" : ""}${canonical}` as DecimalString;
}

function assertSameCurrency(left: Money, right: Money) {
  if (left.currency !== right.currency) {
    throw new MoneyError("Money values must use the same currency.");
  }
}

function toScaledInteger(value: DecimalString) {
  const isNegative = value.startsWith("-");
  const unsigned = isNegative ? value.slice(1) : value;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const units = BigInt(`${integerPart}${fractionPart}`);

  return isNegative ? -units : units;
}

function fromScaledInteger(value: bigint, scale = DEFAULT_MONEY_SCALE) {
  const isNegative = value < ZERO;
  const absolute = isNegative ? -value : value;
  const raw = absolute.toString().padStart(scale + 1, "0");

  if (scale === 0) {
    return `${isNegative ? "-" : ""}${raw}`;
  }

  const integerPart = raw.slice(0, -scale);
  const fractionPart = raw.slice(-scale);

  return `${isNegative ? "-" : ""}${integerPart}.${fractionPart}`;
}
