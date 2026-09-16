import { DEFAULT_PERIOD_DAYS, resolvePeriod, type ResolvedPeriod } from "./order-feed";

/**
 * The seller dashboard's arithmetic (w19-mp-analytics, parity matrix rows
 * 14/15/16/17/19/20).
 *
 * EVERY NUMBER ON THAT SCREEN IS COMPUTED HERE, and this file touches no
 * database, no container and no clock: it takes rows and a period and returns
 * numbers. That is what lets the unit suite pin the ABC boundary, the XYZ
 * coefficient and «дней до нуля» without a stand, and it is what lets the PR
 * prove the screen against direct SQL — the same fold, over the same rows.
 *
 * READ-ONLY, like the order feed next door: the rows come from `mp_order`,
 * `mp_order_line` and `mp_offer`, which an import script filled from the
 * mirrors. Nothing here can reach a marketplace (Ivan, 2026-09-16 02:46 WITA);
 * `__tests__/analytics-read-only.unit.spec.ts` fails if an adapter, an
 * endpoint id or a mutation appears in this file or in the routes that use it.
 *
 * ONE DEFINITION OF REVENUE. Every block folds the SAME list of `SaleRow`
 * (one row per order line, with its order's day and cancelled flag already on
 * it), so «выручка» on the chart, in the card table and inside the ABC class
 * cannot drift apart. Two of our own versions of one metric would be evidence
 * of an unread schema, not a choice for the reader (rule 17a).
 */

/** The period the dashboard opens on — the same 30 days as the order feed. */
export { DEFAULT_PERIOD_DAYS, resolvePeriod };
export type { ResolvedPeriod };

/** `wb` | `ozon`; text, because the registry decides what exists. */
export type AnalyticsMarketplace = string;

/**
 * One order line, joined to its order. The loader builds these; every
 * function below is a fold over them.
 *
 * `revenue` is NOT stored: it is `qty × price`, computed by `saleRowsOf` so
 * that the definition lives in one place.
 */
export type SaleRow = {
  marketplace: AnalyticsMarketplace;
  /** The calendar day of the order, `YYYY-MM-DD`, in the period's own UTC days. */
  day: string;
  /** WB `nmID`, Ozon `sku` — the card this line sold. */
  card_id: string | null;
  vendor_code: string | null;
  title: string | null;
  qty: number;
  /** Price of ONE item, as the marketplace reported it. */
  price: number | null;
  /** `qty × price`, or `null` when the marketplace priced nothing. */
  revenue: number | null;
  currency: string | null;
  is_cancelled: boolean;
};

/** What the loader hands in: one row per `mp_order_line` plus its order. */
export type RawLineWithOrder = {
  marketplace: AnalyticsMarketplace;
  ordered_at: Date | string | null;
  is_cancelled: boolean;
  currency: string | null;
  card_id: string | null;
  vendor_code: string | null;
  title: string | null;
  qty: number | null;
  price: number | null;
};

/** `YYYY-MM-DD` of an instant, in UTC — the days the period bounds are built on. */
export const dayOf = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * Every calendar day of the period, in order.
 *
 * The chart draws THIS list and not the days that happen to carry an order:
 * a day with no sales is a real zero measured over a real day, and dropping it
 * would draw a line that skips a dead week without saying so.
 */
export const daysOf = (period: ResolvedPeriod): string[] => {
  const days: string[] = [];
  const cursor = new Date(period.from.getTime());
  while (cursor.getTime() <= period.to.getTime() && days.length <= 400) {
    days.push(dayOf(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The rows every block is folded over.
 *
 * `qty` absent is read as ONE item, because a line the marketplace sent
 * without a quantity is still one sold thing and both WB's statistics
 * ("1 line means 1 item") and Ozon's posting say so. `price` absent stays
 * `null` and makes `revenue` null — a missing price is not a free item
 * (rule 20a).
 */
export const saleRowsOf = (lines: RawLineWithOrder[], period: ResolvedPeriod): SaleRow[] => {
  const rows: SaleRow[] = [];
  for (const line of lines) {
    if (!line.ordered_at) {
      continue;
    }
    const at = line.ordered_at instanceof Date ? line.ordered_at : new Date(line.ordered_at);
    if (Number.isNaN(at.getTime()) || at < period.from || at > period.to) {
      continue;
    }
    const qty = asNumber(line.qty) ?? 1;
    const price = asNumber(line.price);
    rows.push({
      marketplace: line.marketplace,
      day: dayOf(at),
      card_id: line.card_id,
      vendor_code: line.vendor_code,
      title: line.title,
      qty,
      price,
      revenue: price === null ? null : qty * price,
      currency: line.currency,
      is_cancelled: Boolean(line.is_cancelled),
    });
  }
  return rows;
};

/* -------------------------------------------------------------------- валюта */

export type BuyerMarket = {
  /** The buyer-side currency code as the marketplace sent it; `null` when it sent none. */
  currency: string | null;
  /** What the screen shows instead of a raw code (rule 18e). */
  label: string;
  /** In the SELLER's currency, like every other sum on this screen. */
  revenue: number;
  units: number;
  orders: number;
};

/**
 * THE `currency` COLUMN OF AN ORDER IS THE BUYER'S, AND THE SUM BESIDE IT IS
 * THE SELLER'S. Both halves are measured, and the difference is the whole
 * reason this block exists.
 *
 * Wildberries sells the same card in six countries and reports the order in
 * the buyer's currency, so the client's last 30 days carry RUB, BYN, KZT, AMD,
 * KGS, UZS and 1820 orders with no code at all. But `mp_order.total` is NOT in
 * that currency: for an assembly order the mirror stores `convertedPrice`,
 * which WB documents as the amount in the SELLER's currency (w23), and for a
 * statistics order it stores `finished_price`, which is already roubles.
 *
 * Measured on the stand, one card (nmID 242956159, list price 919 ₽ by WB's
 * own stocks report): average line price 733 under the label RUB, 685 under
 * BYN, 749 under KZT, 762 under AMD. A real Belarusian rouble amount would be
 * near 25, not near 685. So every sum here is in one currency, and the code on
 * the order says which COUNTRY the buyer was in.
 *
 * That is why this block breaks orders down by market instead of splitting the
 * money into currencies: splitting would have printed «выручка BYN 1 028 658»
 * over an amount in roubles (rule 17a — a label that says something the data
 * does not).
 */
export const buyerMarkets = (rows: SaleRow[]): BuyerMarket[] => {
  const markets = new Map<string | null, BuyerMarket>();

  for (const row of rows) {
    if (row.is_cancelled) {
      continue;
    }
    const key = row.currency ?? null;
    let slot = markets.get(key);
    if (!slot) {
      slot = { currency: key, label: buyerMarketLabel(key), revenue: 0, units: 0, orders: 0 };
      markets.set(key, slot);
    }
    slot.revenue += row.revenue ?? 0;
    slot.units += row.qty;
    slot.orders += 1;
  }

  return [...markets.values()].sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);
};

/**
 * A market label the owner can read. An absent code says so in words — on this
 * shop it is the whole statistics feed, 1820 orders, and calling it «RUB»
 * because the amounts look like roubles would be a value substituted for an
 * absence (rule 20a). A code we cannot name travels as the digits the
 * marketplace sent, with the word «код» in front of it.
 */
export const buyerMarketLabel = (currency: string | null): string => {
  if (!currency) {
    return "без кода страны (метод статистики WB его не присылает)";
  }
  return /^\d+$/.test(currency) ? `код ${currency}` : currency;
};

/**
 * The currency every sum on this screen is IN: the one the shop's own price
 * list is in (`mp_offer.currency`, from WB's price table / Ozon's product
 * price). `null` when the marketplace never told us — and then the screen
 * prints amounts without a currency sign rather than picking one.
 */
export const sellerCurrencyOf = (offers: { currency?: string | null }[]): string | null => {
  const counts = new Map<string, number>();
  for (const offer of offers) {
    const currency = offer.currency ?? null;
    if (currency) {
      counts.set(currency, (counts.get(currency) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/* ------------------------------------------------------------------ по дням */

export type DayPoint = {
  day: string;
  revenue: number;
  units: number;
  orders: number;
  /** Lines of orders the marketplace marked cancelled, counted and NOT in `revenue`. */
  cancelled_units: number;
  cancelled_revenue: number;
  /** The same three numbers per marketplace, so the chart can be split. */
  by_marketplace: Record<AnalyticsMarketplace, { revenue: number; units: number; orders: number }>;
};

/**
 * Revenue and units per calendar day of the period.
 *
 * CANCELLED ORDERS ARE NOT REVENUE, and they are not silently gone either:
 * they are counted in their own two fields so the screen can say «из них
 * отменено». WB's statistics feed carries cancellations as ordinary rows
 * (2294 of 26 812 on this shop), so folding them into revenue would inflate
 * every block on the screen by about a tenth.
 */
export const salesByDay = (rows: SaleRow[], period: ResolvedPeriod): DayPoint[] => {
  const byDay = new Map<string, DayPoint>();
  for (const day of daysOf(period)) {
    byDay.set(day, {
      day,
      revenue: 0,
      units: 0,
      orders: 0,
      cancelled_units: 0,
      cancelled_revenue: 0,
      by_marketplace: {},
    });
  }

  for (const row of rows) {
    const point = byDay.get(row.day);
    if (!point) {
      continue;
    }
    if (row.is_cancelled) {
      point.cancelled_units += row.qty;
      point.cancelled_revenue += row.revenue ?? 0;
      continue;
    }
    point.revenue += row.revenue ?? 0;
    point.units += row.qty;
    point.orders += 1;
    const slot = (point.by_marketplace[row.marketplace] ??= { revenue: 0, units: 0, orders: 0 });
    slot.revenue += row.revenue ?? 0;
    slot.units += row.qty;
    slot.orders += 1;
  }

  return [...byDay.values()];
};

/* -------------------------------------------------------------- по карточкам */

export type CardStat = {
  marketplace: AnalyticsMarketplace;
  /** `null` only when the marketplace sent a line with no card id at all. */
  card_id: string | null;
  vendor_code: string | null;
  title: string | null;
  revenue: number;
  units: number;
  orders: number;
  /** `revenue / units`, or `null` when nothing was priced. */
  avg_price: number | null;
  /** Percent of the period's whole revenue, 0..100. */
  revenue_share: number;
  /** Days of the period on which this card sold at least one item. */
  days_with_sales: number;
  currency: string | null;
  cancelled_units: number;
};

/** The key a card is folded on: one card exists per marketplace, not globally. */
const cardKey = (marketplace: string, cardId: string | null): string =>
  `${marketplace}|${cardId ?? "(без номера)"}`;

/**
 * Revenue, units and average price per card, biggest revenue first.
 *
 * The average price is revenue over UNITS and not over orders: two items in
 * one order are two items at their own price, and dividing by orders would
 * quietly report a basket instead of a price.
 */
export const salesByCard = (rows: SaleRow[]): CardStat[] => {
  const cards = new Map<string, CardStat & { days: Set<string> }>();

  for (const row of rows) {
    const key = cardKey(row.marketplace, row.card_id);
    const card = (cards.get(key) ??
      cards
        .set(key, {
          marketplace: row.marketplace,
          card_id: row.card_id,
          vendor_code: row.vendor_code,
          title: row.title,
          revenue: 0,
          units: 0,
          orders: 0,
          avg_price: null,
          revenue_share: 0,
          days_with_sales: 0,
          currency: row.currency,
          cancelled_units: 0,
          days: new Set<string>(),
        })
        .get(key))!;

    /* Первое непустое название и артикул: строки одной карточки их иногда не несут. */
    card.title ??= row.title;
    card.vendor_code ??= row.vendor_code;
    card.currency ??= row.currency;

    if (row.is_cancelled) {
      card.cancelled_units += row.qty;
      continue;
    }
    card.revenue += row.revenue ?? 0;
    card.units += row.qty;
    card.orders += 1;
    card.days.add(row.day);
  }

  const total = [...cards.values()].reduce((sum, card) => sum + card.revenue, 0);

  return [...cards.values()]
    .map(({ days, ...card }) => ({
      ...card,
      days_with_sales: days.size,
      avg_price: card.units > 0 && card.revenue > 0 ? card.revenue / card.units : null,
      /* Ноль выручки за период — это ноль процентов, а не деление на ноль. */
      revenue_share: total > 0 ? (card.revenue / total) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units);
};

/* ----------------------------------------------------------------------- ABC */

export type AbcClass = "A" | "B" | "C";

/** Where A ends and B ends, in percent of cumulative revenue. */
export const ABC_BOUNDS = { a: 80, b: 95 } as const;

/**
 * The line the screen prints above the table, so the class can be argued with
 * (rule 18e). It names the rule AND the two boundaries, because a reader who
 * disagrees with 80/95 has to see 80/95.
 */
export const ABC_FORMULA =
  "ABC: карточки отсортированы по выручке за период, считается накопленная доля. " +
  `A — пока накопленная доля ≤ ${ABC_BOUNDS.a} %, B — до ${ABC_BOUNDS.b} %, C — остальные.`;

export type AbcRow = { key: string; abc: AbcClass; cumulative_share: number };

/**
 * ABC by revenue, by cumulative share.
 *
 * The card that CROSSES a boundary belongs to the class it crosses into's
 * predecessor — that is, the first card whose cumulative share passes 80 % is
 * still A. Otherwise a shop with one card selling 95 % of everything would
 * have no A at all, which is the opposite of what the classification is for.
 */
export const abcClasses = (cards: CardStat[]): Map<string, AbcRow> => {
  const total = cards.reduce((sum, card) => sum + card.revenue, 0);
  const rows = new Map<string, AbcRow>();
  let cumulative = 0;

  for (const card of cards) {
    const key = cardKey(card.marketplace, card.card_id);
    const before = cumulative;
    cumulative += card.revenue;
    const share = total > 0 ? (cumulative / total) * 100 : 0;
    const shareBefore = total > 0 ? (before / total) * 100 : 0;

    const abc: AbcClass =
      shareBefore < ABC_BOUNDS.a ? "A" : shareBefore < ABC_BOUNDS.b ? "B" : "C";
    rows.set(key, { key, abc, cumulative_share: share });
  }

  return rows;
};

/* ----------------------------------------------------------------------- XYZ */

export type XyzClass = "X" | "Y" | "Z";
export type XyzBucket = "week" | "day";

/** Coefficient-of-variation boundaries, in percent. */
export const XYZ_BOUNDS = { x: 10, y: 25 } as const;

export type XyzRow = {
  key: string;
  /** `null` — «недостаточно данных»: fewer than two buckets to vary over. */
  xyz: XyzClass | null;
  /** σ / μ × 100, in percent of the mean; `null` together with `xyz`. */
  variation: number | null;
  buckets: number;
};

/**
 * A period of three weeks or more is measured in WEEKS, shorter ones in DAYS.
 *
 * XYZ asks how stable demand is, and on daily buckets almost every card of a
 * small shop is unstable for a reason that has nothing to do with demand: it
 * sells two or three items a week, so most days are honest zeros and the
 * coefficient of variation is dominated by them. A week is the shortest bucket
 * on which this shop's numbers mean anything, and the screen SAYS which bucket
 * was used.
 */
export const xyzBucketOf = (period: ResolvedPeriod): XyzBucket =>
  period.days >= 21 ? "week" : "day";

/**
 * The buckets XYZ is measured over: EQUAL-LENGTH blocks anchored at the END of
 * the period, with the leftover at the OLD end left out of the coefficient.
 *
 * A 30-day period is four whole weeks plus two days, and a two-day block
 * counted as a week of its own decides the class by itself. Measured on the
 * stand before this was fixed: the client's best-selling card — 518 items over
 * 29 days, about 17 a day, as steady as this shop gets — came out at CV 46 %
 * and class Z, and 227 of 230 cards were Z, which is a classification that
 * tells the owner nothing.
 *
 * Both plausible cures were tried. Dividing each bucket by its own length puts
 * the tail on the right scale for a busy card but blows it up for a slow one:
 * a card selling one item a week lands 1/2 items per day in the tail against
 * 1/7 in the full weeks, CV 60 %, Z again. Equal blocks have no such case, so
 * the remainder is dropped instead — and `dropped_days` says how many days
 * were dropped, because a period that is silently not the period on the screen
 * would be worse than either skew (rule 20a).
 */
export const bucketsOf = (
  period: ResolvedPeriod,
  bucket: XyzBucket,
): { of: (day: string) => string | null; keys: string[]; droppedDays: number } => {
  const days = daysOf(period);
  const size = bucket === "week" ? 7 : 1;
  const whole = Math.floor(days.length / size);
  const dropped = days.length - whole * size;
  const counted = days.slice(dropped);

  const slotOf = new Map<string, string>();
  counted.forEach((day, index) => {
    slotOf.set(day, `b${Math.floor(index / size)}`);
  });

  return {
    of: (day: string) => slotOf.get(day) ?? null,
    keys: [...new Set(counted.map((day) => slotOf.get(day)!))],
    droppedDays: dropped,
  };
};

/**
 * XYZ by the stability of UNITS per bucket.
 *
 * Units and not revenue: a price change is not a demand change, and XYZ is
 * about demand. Every bucket of the period counts, zeros included — a card
 * that sold everything in one week of five is exactly the unstable case.
 *
 * A card with one bucket gets `null`, never `Z`: «не с чем сравнить» and
 * «спрос рваный» are different facts, and a value substituted for an absence
 * would sort and label on equal footing with a measured one (rule 20a).
 */
export const xyzClasses = (
  rows: SaleRow[],
  cards: CardStat[],
  period: ResolvedPeriod,
): {
  bucket: XyzBucket;
  rows: Map<string, XyzRow>;
  formula: string;
  buckets: number;
  dropped_days: number;
} => {
  const bucket = xyzBucketOf(period);
  const { of: slotOf, keys, droppedDays } = bucketsOf(period, bucket);

  const perCard = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.is_cancelled) {
      continue;
    }
    const slot = slotOf(row.day);
    if (!slot) {
      /* A day in the dropped remainder: outside the coefficient by construction. */
      continue;
    }
    const key = cardKey(row.marketplace, row.card_id);
    const series = perCard.get(key) ?? new Map<string, number>();
    series.set(slot, (series.get(slot) ?? 0) + row.qty);
    perCard.set(key, series);
  }

  const out = new Map<string, XyzRow>();
  for (const card of cards) {
    const key = cardKey(card.marketplace, card.card_id);
    const series = perCard.get(key) ?? new Map<string, number>();
    const values = keys.map((slot) => series.get(slot) ?? 0);
    const sold = values.reduce((sum, value) => sum + value, 0);

    /*
     * Fewer than two intervals, or nothing sold inside the counted ones: there
     * is nothing to vary, so there is no class. NOT Z — «не с чем сравнить» и
     * «спрос рваный» это разные факты (правило 20a).
     */
    if (values.length < 2 || sold === 0) {
      out.set(key, { key, xyz: null, variation: null, buckets: values.length });
      continue;
    }

    const mean = sold / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const variation = (Math.sqrt(variance) / mean) * 100;
    const xyz: XyzClass =
      variation <= XYZ_BOUNDS.x ? "X" : variation <= XYZ_BOUNDS.y ? "Y" : "Z";

    out.set(key, { key, xyz, variation, buckets: values.length });
  }

  const unit = bucket === "week" ? "неделям" : "дням";
  return {
    bucket,
    rows: out,
    buckets: keys.length,
    dropped_days: droppedDays,
    formula:
      `XYZ: коэффициент вариации спроса CV = σ / среднее по ${unit} периода ` +
      `(${keys.length} ${bucket === "week" ? "полных нед." : "дн."}, в штуках, отмены не считаются` +
      (droppedDays > 0
        ? `; ${droppedDays} дн. в начале периода не вошли — интервал был бы неполным и сам решал бы класс`
        : "") +
      `). X — CV ≤ ${XYZ_BOUNDS.x} %, Y — до ${XYZ_BOUNDS.y} %, Z — выше. ` +
      "Меньше двух интервалов или ноль продаж внутри них — класса нет, а не Z.",
  };
};

/* ------------------------------------------------- оборачиваемость / до нуля */

export type OfferStock = {
  marketplace: AnalyticsMarketplace;
  card_id: string | null;
  stock: number | null;
  reserved: number | null;
  measured_at: Date | string | null;
};

export type TurnoverRow = {
  key: string;
  /** Sum of `mp_offer.stock` over every line of this card, `null` when the marketplace said nothing. */
  stock: number | null;
  reserved: number | null;
  /** How many `mp_offer` lines (size × warehouse) the stock was summed over. */
  offer_lines: number;
  /** Units per day over the WHOLE period, cancellations excluded. */
  rate_per_day: number;
  /** `stock / rate_per_day`, rounded to one decimal; `null` when either half is unknown. */
  days_to_zero: number | null;
  /** The calendar day `days_to_zero` lands on, counted from the period's end. */
  zero_on: string | null;
  /** When the marketplace measured this stock, the newest of the card's lines. */
  stock_measured_at: string | null;
};

/**
 * «Оборачиваемость» and «дней до нуля» are ONE number here, and the screen
 * says so.
 *
 * Inventory days is average stock over the period divided by the daily rate,
 * and we do not have average stock: `mp_offer` holds the stock the marketplace
 * reported at the LAST import, with no history behind it. So the honest
 * quantity is `остаток ÷ темп продаж` — how long today's stock lasts at the
 * period's pace — and printing it twice under two names would be two metrics
 * out of one number (rule 17a). Wildberries' own `avgStockTurnover` comes from
 * its stocks report and is shown next to ours as a second opinion, never
 * merged into it.
 *
 * `rate_per_day` divides by the period's FULL length, not by the days that
 * carried a sale: «хватит на N дней» has to answer for the quiet days too.
 */
export const turnoverRows = (
  cards: CardStat[],
  offers: OfferStock[],
  period: ResolvedPeriod,
): Map<string, TurnoverRow> => {
  const stocks = new Map<string, { stock: number | null; reserved: number | null; lines: number; at: number | null }>();

  for (const offer of offers) {
    const key = cardKey(offer.marketplace, offer.card_id);
    const slot = stocks.get(key) ?? { stock: null, reserved: null, lines: 0, at: null };
    const stock = asNumber(offer.stock);
    const reserved = asNumber(offer.reserved);
    if (stock !== null) {
      slot.stock = (slot.stock ?? 0) + stock;
    }
    if (reserved !== null) {
      slot.reserved = (slot.reserved ?? 0) + reserved;
    }
    slot.lines += 1;
    const at = offer.measured_at
      ? new Date(offer.measured_at instanceof Date ? offer.measured_at : offer.measured_at).getTime()
      : null;
    if (at !== null && !Number.isNaN(at)) {
      slot.at = slot.at === null ? at : Math.max(slot.at, at);
    }
    stocks.set(key, slot);
  }

  const out = new Map<string, TurnoverRow>();
  for (const card of cards) {
    const key = cardKey(card.marketplace, card.card_id);
    const slot = stocks.get(key) ?? { stock: null, reserved: null, lines: 0, at: null };
    const rate = card.units / period.days;

    const daysToZero =
      slot.stock === null || rate <= 0 ? null : Math.round((slot.stock / rate) * 10) / 10;

    out.set(key, {
      key,
      stock: slot.stock,
      reserved: slot.reserved,
      offer_lines: slot.lines,
      rate_per_day: Math.round(rate * 1000) / 1000,
      days_to_zero: daysToZero,
      zero_on:
        daysToZero === null
          ? null
          : dayOf(new Date(period.to.getTime() + Math.floor(daysToZero) * 86_400_000)),
      stock_measured_at: slot.at === null ? null : new Date(slot.at).toISOString(),
    });
  }

  /** Cards with stock but no sales in the period are still stock the owner paid for. */
  for (const [key, slot] of stocks) {
    if (out.has(key)) {
      continue;
    }
    out.set(key, {
      key,
      stock: slot.stock,
      reserved: slot.reserved,
      offer_lines: slot.lines,
      rate_per_day: 0,
      days_to_zero: null,
      zero_on: null,
      stock_measured_at: slot.at === null ? null : new Date(slot.at).toISOString(),
    });
  }

  return out;
};

/* --------------------------------------------------------------------- итоги */

export type AnalyticsTotals = {
  revenue: number;
  units: number;
  orders: number;
  cancelled_orders: number;
  cancelled_revenue: number;
  /** `revenue / orders` — the average order, not the average price. */
  avg_order: number | null;
  cards_with_sales: number;
  /** Σ stock over every offer line the shop has, and the pace it leaves at. */
  stock_units: number | null;
  stock_days_left: number | null;
};

export const totalsOf = (
  rows: SaleRow[],
  cards: CardStat[],
  turnover: Map<string, TurnoverRow>,
  period: ResolvedPeriod,
): AnalyticsTotals => {
  let revenue = 0;
  let units = 0;
  let orders = 0;
  let cancelledOrders = 0;
  let cancelledRevenue = 0;

  for (const row of rows) {
    if (row.is_cancelled) {
      cancelledOrders += 1;
      cancelledRevenue += row.revenue ?? 0;
      continue;
    }
    revenue += row.revenue ?? 0;
    units += row.qty;
    orders += 1;
  }

  let stockUnits: number | null = null;
  for (const row of turnover.values()) {
    if (row.stock !== null) {
      stockUnits = (stockUnits ?? 0) + row.stock;
    }
  }

  const ratePerDay = units / period.days;

  return {
    revenue,
    units,
    orders,
    cancelled_orders: cancelledOrders,
    cancelled_revenue: cancelledRevenue,
    avg_order: orders > 0 ? revenue / orders : null,
    cards_with_sales: cards.filter((card) => card.units > 0).length,
    stock_units: stockUnits,
    stock_days_left:
      stockUnits === null || ratePerDay <= 0
        ? null
        : Math.round((stockUnits / ratePerDay) * 10) / 10,
  };
};

/** The one line that explains where the money on this screen comes from. */
export const REVENUE_FORMULA =
  "Выручка = сумма (цена строки × количество) по строкам заказов площадки за период. " +
  "Отменённые заказы в выручку не входят и показаны отдельно. " +
  "Источник — таблицы mp_order / mp_order_line, заполненные импортом; " +
  "это заказы площадки, а не выкупы и не деньги, полученные от площадки.";

/** And the one line that explains the stock half. */
export const STOCK_FORMULA =
  "Остаток — сумма mp_offer.stock по всем строкам карточки (размер × склад) на момент последнего импорта. " +
  "Темп продаж = штуки за период ÷ дней в периоде. " +
  "Оборачиваемость = «дней до нуля» = остаток ÷ темп: истории остатков мы не ведём, " +
  "поэтому среднего остатка за период у нас нет и двух разных чисел тут быть не может.";

export type CardRow = CardStat & {
  abc: AbcClass;
  cumulative_share: number;
  xyz: XyzClass | null;
  variation: number | null;
  turnover: TurnoverRow;
};

/**
 * Cards that have STOCK but sold nothing in the period, as zero-revenue rows.
 *
 * They are the reason half of this screen exists — stock standing still is
 * money the owner has already spent — and leaving them out would make «дней до
 * нуля» answer only about what already sells. Such a row is honestly all
 * zeros, and `units === 0` is what the screen reads as «продаж за период нет».
 */
export const stockOnlyCards = (
  cards: CardStat[],
  turnover: Map<string, TurnoverRow>,
  describe: (marketplace: string, cardId: string) => {
    title: string | null;
    vendor_code: string | null;
  },
): CardStat[] => {
  const known = new Set(cards.map((card) => cardKey(card.marketplace, card.card_id)));
  const extra: CardStat[] = [];

  for (const [key, row] of turnover) {
    if (known.has(key) || row.stock === null || row.stock <= 0) {
      continue;
    }
    const [marketplace, cardId] = key.split("|");
    const named = describe(marketplace, cardId);
    extra.push({
      marketplace,
      card_id: cardId,
      vendor_code: named.vendor_code,
      title: named.title,
      revenue: 0,
      units: 0,
      orders: 0,
      avg_price: null,
      revenue_share: 0,
      days_with_sales: 0,
      currency: null,
      cancelled_units: 0,
    });
  }

  /** Biggest stock first: the question here is «что лежит», not «что продаётся». */
  return extra.sort(
    (a, b) =>
      (turnover.get(cardKey(b.marketplace, b.card_id))?.stock ?? 0) -
      (turnover.get(cardKey(a.marketplace, a.card_id))?.stock ?? 0),
  );
};

/** The card table the screen renders: one row, every block's number on it. */
export const cardRowsOf = (
  cards: CardStat[],
  abc: Map<string, AbcRow>,
  xyz: Map<string, XyzRow>,
  turnover: Map<string, TurnoverRow>,
): CardRow[] =>
  cards.map((card) => {
    const key = cardKey(card.marketplace, card.card_id);
    const abcRow = abc.get(key);
    const xyzRow = xyz.get(key);
    return {
      ...card,
      abc: abcRow?.abc ?? "C",
      cumulative_share: abcRow?.cumulative_share ?? 0,
      xyz: xyzRow?.xyz ?? null,
      variation: xyzRow?.variation ?? null,
      turnover:
        turnover.get(key) ?? {
          key,
          stock: null,
          reserved: null,
          offer_lines: 0,
          rate_per_day: 0,
          days_to_zero: null,
          zero_on: null,
          stock_measured_at: null,
        },
    };
  });

/** The `cardKey` of a row, exported so the loader and the tests agree on it. */
export { cardKey };
