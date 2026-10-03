/**
 * The cart's total, converted into another currency, for rule 5zd's "≈
 * <сумма>": never an invented rate, only the one the USD price script
 * already stamped on the variant (t-cherk-34, `scripts/set-currency-prices.ts`:
 * `variant.metadata.script_prices.<currency>.rate`, RUB per one unit of that
 * currency).
 */

export type ChargeEstimateLine = { quantity: number; unit_price: number; variant_id: string | null };
export type ChargeEstimateVariant = { id: string; metadata: Record<string, unknown> | null };

const RATE_EPSILON = 0.01;

const rateFor = (metadata: Record<string, unknown> | null, currencyCode: string): number | null => {
  const scriptPrices = metadata?.script_prices as Record<string, unknown> | undefined;
  const entry = scriptPrices?.[currencyCode.toLowerCase()] as { rate?: unknown } | undefined;
  const rate = entry?.rate;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
};

/**
 * `null` when the cart is not priced in RUB (the script's one source
 * currency so far), no line carries a usable stamp, or the lines disagree on
 * the rate (a catalogue priced over more than one script run) — rule 5zd
 * then falls back to naming the rate source with no sum rather than show a
 * guess.
 */
export const estimateChargeAmount = (
  items: ChargeEstimateLine[],
  variants: ChargeEstimateVariant[],
  cartCurrencyCode: string,
  targetCurrencyCode: string,
): number | null => {
  if (cartCurrencyCode.trim().toLowerCase() !== "rub") {
    return null;
  }

  const rateByVariant = new Map(
    variants.map((variant) => [variant.id, rateFor(variant.metadata, targetCurrencyCode)]),
  );
  const rates = items
    .map((item) => (item.variant_id ? rateByVariant.get(item.variant_id) ?? null : null))
    .filter((rate): rate is number => rate !== null);

  if (rates.length === 0) {
    return null;
  }

  const [first, ...rest] = rates;
  if (rest.some((rate) => Math.abs(rate - first) > RATE_EPSILON)) {
    return null;
  }

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  return Math.round((subtotal / first) * 100) / 100;
};
