import { amountToNumber } from "../btcpay/amount";

/**
 * Amounts between Medusa and x402 (t-2026-10-03-33).
 *
 * Medusa hands a payment provider the MAJOR amount of the cart (`25.5`
 * dollars). x402 carries the token's ATOMIC units as a decimal string: USDC has
 * 6 decimals, so 25.50 USD is `"25500000"`. USDC is a dollar stablecoin, which
 * is why only a cart priced in USD can be paid this way: the shop's price is
 * the amount, with no exchange rate in between.
 *
 * The facilitator compares the signed value with the required amount for
 * exact equality, so every conversion goes through integers and the same cart
 * total always gives the same string.
 */

export { amountToNumber };

/** `25.5` → `"25500000"` for 6 decimals. `null` for a zero, negative, non-finite or unsafe amount. */
export const toAtomicUnits = (amount: unknown, decimals: number): string | null => {
  const value = amountToNumber(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const scaled = Math.round(value * 10 ** decimals);
  if (!Number.isSafeInteger(scaled) || scaled <= 0) {
    return null;
  }
  return String(scaled);
};

/** `"25500000"` → `"25.50"` for 6 decimals: at least two digits after the point, trailing zeros beyond them dropped. */
export const fromAtomicUnits = (atomic: string, decimals: number): string => {
  if (!/^\d+$/.test(atomic)) {
    return atomic;
  }
  const padded = atomic.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction}`;
};
