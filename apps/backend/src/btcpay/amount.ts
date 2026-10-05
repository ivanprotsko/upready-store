/**
 * Amounts between Medusa and BTCPay (ask-20261005-070255-438f).
 *
 * Medusa hands a payment provider the MAJOR amount (`input.amount`, e.g. 25.5
 * dollars), the same value `toTributeMinorUnits` converts. Greenfield takes and
 * returns a decimal STRING in the invoice currency (`"25.50"`). Every step goes
 * through integer minor units, so a float like 0.1 + 0.2 never reaches the
 * invoice and two amounts compare exactly.
 */

/** Digits after the decimal point for an ISO 4217 code: 2 for USD and EUR, 0 for JPY, 3 for KWD. */
export const currencyDigits = (currency: string): number => {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
};

/**
 * A Medusa amount as a number. Medusa passes a number, a numeric string or its
 * own BigNumber, whose `valueOf` is the number. `NaN` for anything else, which
 * the callers refuse.
 */
export const amountToNumber = (amount: unknown): number => {
  if (typeof amount === "number") {
    return amount;
  }
  if (typeof amount === "string") {
    return amount.trim() === "" ? Number.NaN : Number(amount);
  }
  if (amount && typeof amount === "object") {
    const numeric = (amount as { numeric?: unknown }).numeric;
    if (typeof numeric === "number") {
      return numeric;
    }
    return Number((amount as { valueOf: () => unknown }).valueOf());
  }
  return Number.NaN;
};

/**
 * Integer minor units of `amount` in `currency`, rounded half away from zero.
 * The product is cut to 15 significant digits first, so `1.005 * 100`, which
 * a double holds as 100.49999999999999, rounds to 101 as written.
 */
export const toMinorUnits = (amount: unknown, currency: string): number => {
  const value = amountToNumber(amount);
  const factor = 10 ** currencyDigits(currency);
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  return Math.sign(value) * Math.round(scaled);
};

/** Greenfield's decimal string for `amount` in `currency`: `25.5` USD is `"25.50"`, `1000` JPY is `"1000"`. */
export const toBtcpayAmount = (amount: unknown, currency: string): string => {
  const digits = currencyDigits(currency);
  const minor = toMinorUnits(amount, currency);
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor).toString().padStart(digits + 1, "0");
  if (digits === 0) {
    return `${sign}${absolute}`;
  }
  return `${sign}${absolute.slice(0, -digits)}.${absolute.slice(-digits)}`;
};

/**
 * Whether two amounts are the same money in `currency`, compared in minor
 * units: Greenfield may answer `"25.5"` or `"25.50000000"` for `25.5`.
 */
export const sameAmount = (left: unknown, right: unknown, currency: string): boolean => {
  const a = toMinorUnits(left, currency);
  const b = toMinorUnits(right, currency);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
};
