/**
 * The factor to multiply the cart's own total by, for rule 5zd's "≈
 * <сумма>": never an invented rate, only the one the USD price script
 * already stamped on the variant (t-cherk-34, `scripts/set-currency-prices.ts`:
 * `variant.metadata.script_prices.<currency>.rate`, RUB per one unit of that
 * currency).
 *
 * The caller multiplies its OWN `cart.total` (shipping, discounts and tax
 * already folded in — the real number the buyer is about to be charged, the
 * same one `CheckoutTotals` renders) by this factor. Computing an amount
 * HERE from the cart's line items alone was the first version's bug
 * (lead review, t-2026-10-03-32): a sum of `unit_price * quantity` skips
 * shipping, a promotion and tax, so the «≈» read lower than the real charge.
 */

export type ChargeEstimateLine = { variant_id: string | null };
export type ChargeEstimateVariant = { id: string; metadata: Record<string, unknown> | null };

const RATE_EPSILON = 0.01;

/**
 * A stamp's rate, only when it is quoted in RUB. The script's `from=` prices a
 * currency from another source (t-2026-10-06-09: USD from yen), and 158 yen
 * per dollar read as 158 roubles per dollar would put a wrong sum next to
 * «≈». A stamp without `from` was written before it existed, from RUB.
 */
const rateFor = (metadata: Record<string, unknown> | null, currencyCode: string): number | null => {
  const scriptPrices = metadata?.script_prices as Record<string, unknown> | undefined;
  const entry = scriptPrices?.[currencyCode.toLowerCase()] as { rate?: unknown; from?: unknown } | undefined;
  if (entry?.from !== undefined && entry.from !== "rub") {
    return null;
  }
  const rate = entry?.rate;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
};

/**
 * `null` when neither the cart's currency nor the target one is RUB (the
 * script relates only one foreign currency to RUB at a time, in either
 * direction — RUB cart paying in a foreign currency, or a foreign-currency
 * cart like cherkashino.com's USD paying through a RUB gateway like
 * Robokassa), no line carries a usable stamp, or the lines disagree on the
 * rate (a catalogue priced over more than one script run) — rule 5zd then
 * falls back to naming the rate source with no sum rather than show a guess.
 */
export const chargeConversionFactor = (
  items: ChargeEstimateLine[],
  variants: ChargeEstimateVariant[],
  cartCurrencyCode: string,
  targetCurrencyCode: string,
): number | null => {
  const cart = cartCurrencyCode.trim().toLowerCase();
  const target = targetCurrencyCode.trim().toLowerCase();

  // The script's stamp is always keyed by the FOREIGN currency (RUB per one
  // unit of it), whichever side of this conversion that is.
  let stampCurrency: string;
  let invert: boolean;
  if (cart === "rub" && target !== "rub") {
    stampCurrency = target;
    invert = true; // amount = total(rub) / rate
  } else if (target === "rub" && cart !== "rub") {
    stampCurrency = cart;
    invert = false; // amount = total(foreign) * rate
  } else {
    return null;
  }

  const rateByVariant = new Map(
    variants.map((variant) => [variant.id, rateFor(variant.metadata, stampCurrency)]),
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

  return invert ? 1 / first : first;
};
