/**
 * Money of one shop, split by the currency it was actually taken in
 * (b12-analytics-accuracy, round-1 finding 4).
 *
 * `GET /tenants/analytics/summary` used to do `revenue = sum(order.total)`
 * over every order of the period and label the sum with
 * `orders[0].currency_code`. A shop that sells in two currencies therefore saw
 * ₽5 700 and $200 added into «5 900,00 ₽» — a number that is not revenue in
 * any currency, with an average order value to match.
 *
 * The decision taken here is the SPLIT, not a filter: a filter by "the shop's
 * currency" would quietly drop the orders taken in the other one, and a
 * subset that looks like a total is the same class of lie as the mixed sum
 * (rule 20a). So the cards, the chart and the top products are computed for
 * ONE currency at a time — the one the owner is looking at — and every other
 * currency of that period is reported next to them with its own revenue and
 * order count, never folded in.
 */

/** The minimum an order has to carry to be placed in a currency bucket. */
export type CurrencyOrder = {
  total: number;
  currency_code: string | null;
};

/** One currency's own money for a period. `aov` is revenue / orders, in that currency. */
export type CurrencyBucket = {
  currency_code: string;
  revenue: number;
  order_count: number;
  aov: number;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The currency code of an order, normalised. Medusa stores it lowercase
 * (`rub`, `usd`); an order without one keeps an empty code rather than
 * disappearing from the breakdown, because a missing label is still money the
 * shop took.
 */
export const currencyKeyOf = (order: CurrencyOrder): string =>
  (order.currency_code ?? "").toLowerCase();

/**
 * One bucket per currency present in `orders`, richest first (then by order
 * count, then alphabetically, so the order is stable for equal money).
 */
export const summariseByCurrency = (orders: CurrencyOrder[]): CurrencyBucket[] => {
  const totals = new Map<string, { revenue: number; order_count: number }>();

  for (const order of orders) {
    const key = currencyKeyOf(order);
    const bucket = totals.get(key) ?? { revenue: 0, order_count: 0 };
    bucket.revenue += order.total;
    bucket.order_count += 1;
    totals.set(key, bucket);
  }

  return [...totals.entries()]
    .map(([currency_code, bucket]) => ({
      currency_code,
      revenue: round2(bucket.revenue),
      order_count: bucket.order_count,
      aov: bucket.order_count > 0 ? round2(round2(bucket.revenue) / bucket.order_count) : 0,
    }))
    .sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.order_count - a.order_count ||
        a.currency_code.localeCompare(b.currency_code),
    );
};

/**
 * Which currency the screen shows.
 *
 * `requested` is the owner's own pick (`?currency=`) and wins whenever the
 * shop has ever had an order in it — including when the CHOSEN period has
 * none, so that switching to a currency and then to an empty period shows an
 * honest zero for that currency instead of silently jumping back to another
 * one.
 *
 * With no pick, the biggest currency of the period leads; with an empty
 * period, the biggest currency the shop has at all. `null` only when the shop
 * has no orders whatsoever, which the route answers before reaching here.
 */
export const pickCurrency = (
  requested: string | null | undefined,
  periodBuckets: CurrencyBucket[],
  allBuckets: CurrencyBucket[],
): string | null => {
  const wanted = (requested ?? "").toLowerCase();

  if (wanted && allBuckets.some((bucket) => bucket.currency_code === wanted)) {
    return wanted;
  }

  return periodBuckets[0]?.currency_code ?? allBuckets[0]?.currency_code ?? null;
};

/**
 * The period's breakdown with `selected` guaranteed present, as a real
 * computed zero when that currency had no orders in the period. Without this
 * the currency the owner is looking at would vanish from its own breakdown
 * the moment the period is empty.
 */
export const withSelectedCurrency = (
  buckets: CurrencyBucket[],
  selected: string | null,
): CurrencyBucket[] => {
  if (!selected || buckets.some((bucket) => bucket.currency_code === selected)) {
    return buckets;
  }

  return [...buckets, { currency_code: selected, revenue: 0, order_count: 0, aov: 0 }];
};
