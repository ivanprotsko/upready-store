import { type AnalyticsPeriod, dayReader, daysOf, shiftDay } from "./analytics/calendar";
import {
  DISCOUNT_BUCKETS,
  discountBucketOf,
  type CardExtras,
  type DiscountBucket,
  type WarehouseType,
} from "./analytics/infographic";

/**
 * The arithmetic of «Wildberries → Аналитика» (mp-section-design task-06,
 * first built as the seller dashboard of w19-mp-analytics).
 *
 * EVERY NUMBER ON THAT SCREEN IS COMPUTED HERE, and this file touches no
 * database, no container and no clock: it takes rows, a period and a time
 * zone and returns numbers. That is what lets the unit suite pin the period,
 * the ABC boundary, the XYZ coefficient and «дней до нуля» without a stand,
 * and what lets the PR prove the screen against direct SQL: the same fold,
 * over the same rows.
 *
 * READ-ONLY. The rows come from `mp_order`, `mp_order_line` and `mp_offer`,
 * which an import filled. Nothing here can reach a marketplace (Ivan,
 * 2026-09-16 02:46 WITA); `__tests__/analytics-read-only.unit.spec.ts` fails if
 * an adapter call or a mutation appears in this file or in the route.
 *
 * ONE MARKETPLACE. The screen lives under one marketplace's section, so the
 * loader reads that marketplace's rows only and nothing below splits by it.
 *
 * ONE DEFINITION OF REVENUE. Every block folds the SAME list of `SaleRow`
 * (one row per order line, with its order's day and cancelled flag on it), so
 * «выручка» in the totals, on the chart and in the card table cannot drift
 * apart (rule 17a).
 *
 * The calendar the period is read on lives in `analytics/calendar.ts`, and
 * this file re-exports it (t-2026-10-14-55); the read-only proof scans both.
 */

export {
  DEFAULT_PERIOD_DAYS,
  MAX_PERIOD_DAYS,
  dayIn,
  dayReader,
  midnightIn,
  shiftDay,
  resolveAnalyticsPeriod,
  daysOf,
} from "./analytics/calendar";
export type { AnalyticsPeriod } from "./analytics/calendar";

/* ------------------------------------------------------------------ строки */

/** What the loader hands in: one row per order line joined to its order. */
export type RawLine = {
  order_id: string;
  ordered_at: Date | string | null;
  is_cancelled: boolean;
  /**
   * False for an order the import stored without a single line: it is still
   * an order of the period, and it carries no units and no revenue.
   */
  has_line: boolean;
  /** WB `nmID`, Ozon `sku`: the card this line sold. */
  card_id: string | null;
  vendor_code: string | null;
  qty: number | string | null;
  /** Price of ONE item, in the seller's currency. */
  price: number | string | null;
  /** v3 infographic (t-2026-10-16-36): `mp_order.buyer_region`. */
  region?: string | null;
  /** Which warehouse the order shipped from, already read by `warehouseTypeOf`. */
  warehouse?: WarehouseType | null;
  /** WB's `gNumber`: the buyer's whole purchase. */
  check_id?: string | null;
  /** The seller's discount on the line, percent (`mp_order_line.discount` on WB). */
  discount?: number | string | null;
};

export type SaleRow = {
  order_id: string;
  /** The day of the order on the shop's calendar. */
  day: string;
  card_id: string | null;
  vendor_code: string | null;
  qty: number;
  /** `qty × price`, or `null` when the marketplace priced nothing. */
  revenue: number | null;
  is_cancelled: boolean;
  has_line: boolean;
  region: string | null;
  warehouse: WarehouseType | null;
  check_id: string | null;
  discount: number | null;
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Kopecks stay kopecks: a sum of a thousand prices must not print 0.000000001. */
const money = (value: number): number => Math.round(value * 100) / 100;

/**
 * The rows every block is folded over: inside the period, with the shop's day
 * on each.
 *
 * `qty` absent is read as ONE item, because a line the marketplace sent
 * without a quantity is still one sold thing (WB's statistics: one row, one
 * item). `price` absent stays `null`: a missing price is not a free item
 * (rule 20a), and it adds nothing to a sum rather than a made-up amount.
 */
export const saleRowsOf = (lines: RawLine[], period: AnalyticsPeriod): SaleRow[] => {
  const dayOfRow = dayReader(period.time_zone);
  const rows: SaleRow[] = [];
  for (const line of lines) {
    if (!line.ordered_at) {
      continue;
    }
    const at = line.ordered_at instanceof Date ? line.ordered_at : new Date(line.ordered_at);
    if (Number.isNaN(at.getTime()) || at < period.from || at >= period.until) {
      continue;
    }
    const qty = line.has_line ? (asNumber(line.qty) ?? 1) : 0;
    const price = line.has_line ? asNumber(line.price) : null;
    rows.push({
      order_id: line.order_id,
      day: dayOfRow(at),
      card_id: line.card_id,
      vendor_code: line.vendor_code,
      qty,
      revenue: price === null ? null : qty * price,
      is_cancelled: Boolean(line.is_cancelled),
      has_line: line.has_line,
      region: line.region ?? null,
      warehouse: line.warehouse ?? null,
      check_id: line.check_id ?? null,
      discount: line.has_line ? asNumber(line.discount) : null,
    });
  }
  return rows;
};

/* ------------------------------------------------------------------ по дням */

export type DayPoint = {
  day: string;
  revenue: number;
  /** Orders, not lines: two lines of one order are one order. */
  orders: number;
  units: number;
  /** Cancelled orders are counted here and NOT in `revenue`. */
  cancelled_units: number;
  cancelled_revenue: number;
};

/**
 * Revenue, orders and units per day of the period, every day present.
 *
 * CANCELLED ORDERS ARE NOT REVENUE, and they are not silently gone either:
 * the chart draws them as a pale cap over the day's bar.
 */
export const salesByDay = (rows: SaleRow[], period: AnalyticsPeriod): DayPoint[] => {
  const points = new Map<string, DayPoint & { ids: Set<string> }>();
  for (const day of daysOf(period)) {
    points.set(day, {
      day,
      revenue: 0,
      orders: 0,
      units: 0,
      cancelled_units: 0,
      cancelled_revenue: 0,
      ids: new Set(),
    });
  }
  for (const row of rows) {
    const point = points.get(row.day);
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
    point.ids.add(row.order_id);
  }
  return [...points.values()].map(({ ids, ...point }) => ({
    ...point,
    revenue: money(point.revenue),
    cancelled_revenue: money(point.cancelled_revenue),
    orders: ids.size,
  }));
};

/* ------------------------------------------------------------ по карточкам */

/** The key a card is folded on; a line with no card number has its own row. */
export const cardKey = (cardId: string | null): string => cardId ?? "";

export type CardSales = {
  card_id: string | null;
  vendor_code: string | null;
  revenue: number;
  units: number;
  orders: number;
  /** `revenue / units`, or `null` when nothing was priced. */
  avg_price: number | null;
  /** Percent of the period's whole revenue, 0..100. */
  revenue_share: number;
};

/**
 * The cards that SOLD in the period, biggest revenue first: «Товары с
 * продажами». A card whose every order was cancelled sold nothing and is not
 * a row; its cancellations are in the totals.
 *
 * The average price is revenue over UNITS and not over orders: two items in
 * one order are two items at their own price.
 */
export const salesByCard = (rows: SaleRow[]): CardSales[] => {
  const cards = new Map<string, CardSales & { ids: Set<string> }>();
  for (const row of rows) {
    if (row.is_cancelled || !row.has_line) {
      continue;
    }
    const key = cardKey(row.card_id);
    let card = cards.get(key);
    if (!card) {
      card = {
        card_id: row.card_id,
        vendor_code: row.vendor_code,
        revenue: 0,
        units: 0,
        orders: 0,
        avg_price: null,
        revenue_share: 0,
        ids: new Set(),
      };
      cards.set(key, card);
    }
    card.vendor_code ??= row.vendor_code;
    card.revenue += row.revenue ?? 0;
    card.units += row.qty;
    card.ids.add(row.order_id);
  }

  const total = [...cards.values()].reduce((sum, card) => sum + card.revenue, 0);

  return [...cards.values()]
    .filter((card) => card.units > 0)
    .map(({ ids, ...card }) => ({
      ...card,
      revenue: money(card.revenue),
      orders: ids.size,
      avg_price: card.units > 0 && card.revenue > 0 ? money(card.revenue / card.units) : null,
      /* Ноль выручки за период — это ноль процентов, а не деление на ноль. */
      revenue_share: total > 0 ? Math.round((card.revenue / total) * 10_000) / 100 : 0,
    }))
    .sort(byRevenue);
};

/** Revenue, then units, then the card number: the same order on every request. */
const byRevenue = (a: CardSales, b: CardSales): number =>
  b.revenue - a.revenue || b.units - a.units || cardKey(a.card_id).localeCompare(cardKey(b.card_id));

/* --------------------------------------------------------------------- ABC */

export type AbcClass = "A" | "B" | "C";

/** Where A ends and where B ends, in percent of the period's revenue. */
export const ABC_BOUNDS = { a: 80, b: 95 } as const;

/** Float noise must not move a card that lands exactly on 80 % out of A. */
const EPSILON = 1e-9;

/**
 * ABC by revenue, by cumulative share, the card's own share included: A while
 * the running total is within 80 % of the period's revenue, B within 95 %, C
 * after. So the cards of A together hold at most 80 %, and A and B at most
 * 95 %, which is how the screen's reader checks the column by adding it up.
 *
 * ONE EXCEPTION, the first card. A shop whose best card alone sells more than
 * 80 % would otherwise have no A at all, and «ваш главный товар — класс C»
 * is the opposite of what the classification is for. Only then can A hold
 * more than 80 %, and only by that one card.
 *
 * A card that earned nothing is C: it holds no share of anything.
 */
export const abcOf = (cards: CardSales[]): Map<string, AbcClass> => {
  const sorted = [...cards].sort(byRevenue);
  const total = sorted.reduce((sum, card) => sum + card.revenue, 0);
  const classes = new Map<string, AbcClass>();
  let cumulative = 0;

  sorted.forEach((card, index) => {
    cumulative += card.revenue;
    const share = total > 0 ? (cumulative / total) * 100 : 0;
    const abc: AbcClass =
      card.revenue <= 0
        ? "C"
        : index === 0 || share <= ABC_BOUNDS.a + EPSILON
          ? "A"
          : share <= ABC_BOUNDS.b + EPSILON
            ? "B"
            : "C";
    classes.set(cardKey(card.card_id), abc);
  });

  return classes;
};

/* --------------------------------------------------------------------- XYZ */

export type XyzClass = "X" | "Y" | "Z";

/** Coefficient-of-variation boundaries, in percent of the weekly mean. */
export const XYZ_BOUNDS = { x: 10, y: 25 } as const;

/** Fewer whole weeks than this, and a coefficient means nothing: no class. */
export const XYZ_MIN_WEEKS = 3;

export type Week = { start: string; end: string };

/**
 * The whole weeks of the period, anchored at its END, oldest first. A 30-day
 * period is four weeks plus two days, and the two days at the old end are
 * left out: a two-day «week» would decide the class by itself.
 */
export const weeksOf = (period: Pick<AnalyticsPeriod, "from_day" | "to_day" | "days">): Week[] => {
  const weeks: Week[] = [];
  const whole = Math.floor(period.days / 7);
  for (let index = whole - 1; index >= 0; index -= 1) {
    const end = shiftDay(period.to_day, -index * 7);
    weeks.push({ start: shiftDay(end, -6), end });
  }
  return weeks;
};

export type XyzRow = {
  xyz: XyzClass | null;
  /** σ / mean × 100 over the weeks counted; `null` together with `xyz`. */
  variation: number | null;
  /** How many whole weeks the coefficient was measured over. */
  weeks: number;
};

/**
 * XYZ by the stability of UNITS sold per week.
 *
 * Units and not revenue: a price change is not a change of demand. Every
 * counted week is in the coefficient, zeros included: a card that sold
 * everything in one week of four is exactly the unstable case.
 *
 * WEEKS OF DATA, PER CARD. A week counts for a card only from the card's first
 * order on: before it the card was not on sale (or the import had not reached
 * back that far), and those weeks are an absence, not a zero. A card with
 * fewer than three such weeks gets `null`, never Z: «не с чем сравнить» and
 * «спрос рваный» are different facts, and a value substituted for an absence
 * would sort and label on equal footing with a measured one (rule 20a). A
 * period shorter than three weeks therefore classes nothing.
 *
 * `firstDay` holds the shop-calendar day of each card's FIRST order ever on
 * this marketplace; a card missing from it is counted over every week.
 */
export const xyzOf = (
  rows: SaleRow[],
  cards: CardSales[],
  period: AnalyticsPeriod,
  firstDay: Map<string, string>,
): Map<string, XyzRow> => {
  const weeks = weeksOf(period);
  const weekOf = new Map<string, number>();
  weeks.forEach((week, index) => {
    for (let offset = 0; offset < 7; offset += 1) {
      weekOf.set(shiftDay(week.start, offset), index);
    }
  });

  const series = new Map<string, number[]>();
  for (const row of rows) {
    if (row.is_cancelled || !row.has_line) {
      continue;
    }
    const index = weekOf.get(row.day);
    if (index === undefined) {
      continue;
    }
    const key = cardKey(row.card_id);
    const values = series.get(key) ?? weeks.map(() => 0);
    values[index] += row.qty;
    series.set(key, values);
  }

  const out = new Map<string, XyzRow>();
  for (const card of cards) {
    const key = cardKey(card.card_id);
    const first = firstDay.get(key);
    const all = series.get(key) ?? weeks.map(() => 0);
    const values = all.filter((_, index) => !first || weeks[index].start >= first);
    const sold = values.reduce((sum, value) => sum + value, 0);

    if (values.length < XYZ_MIN_WEEKS || sold === 0) {
      out.set(key, { xyz: null, variation: null, weeks: values.length });
      continue;
    }

    const mean = sold / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const variation = (Math.sqrt(variance) / mean) * 100;
    const xyz: XyzClass =
      variation <= XYZ_BOUNDS.x + EPSILON ? "X" : variation <= XYZ_BOUNDS.y + EPSILON ? "Y" : "Z";
    out.set(key, { xyz, variation: Math.round(variation * 10) / 10, weeks: values.length });
  }
  return out;
};

/* ---------------------------------------------------------- дней до нуля */

/**
 * How many WHOLE days today's stock lasts at the period's pace:
 * `остаток ÷ (штуки за период ÷ дней в периоде)`, rounded down, so «3 дн.»
 * means three full days are covered.
 *
 * `null` without a stock number (the marketplace said nothing) and without a
 * sale (no pace to divide by): neither is «0 дней». A stock of 0 with sales is
 * 0: the card is already out.
 *
 * The pace divides by the period's FULL length, not by the days that carried
 * a sale: «хватит на N дней» has to answer for the quiet days too.
 */
export const daysToZero = (stock: number | null, units: number, days: number): number | null => {
  if (stock === null || units <= 0 || days <= 0) {
    return null;
  }
  return Math.floor(Math.max(0, stock) / (units / days));
};

/** The red line of the column: this many days or fewer is a stock-out soon. */
export const DAYS_TO_ZERO_ALERT = 14;

/**
 * Whether the stock numbers look DECLARED rather than counted.
 *
 * `mp_offer.stock` holds what the marketplace reported per size and
 * warehouse. On the client's cabinet most lines hold exactly 100 (7 786 of
 * 11 824 on the stand, 2026-10-05): a quantity the seller declared on many
 * warehouses, not a physical count. Summed, it reads as a million items and
 * «хватит на 4 000 дней». The screen still prints the sum and the days, and
 * says what they rest on (rule 18e). The test: one non-zero number fills at
 * least half of more than one line.
 */
export const stockLooksDeclared = (shape: {
  lines: number;
  dominant_value: number | null;
  dominant_lines: number;
}): boolean =>
  shape.lines > 1 &&
  shape.dominant_value !== null &&
  shape.dominant_value > 0 &&
  shape.dominant_lines / shape.lines >= 0.5;

/* ------------------------------------------------------------------ итоги */

export type AnalyticsTotals = {
  revenue: number;
  orders: number;
  units: number;
  /** `revenue / orders`, `null` when there was no order to average. */
  avg_order: number | null;
  cancelled_orders: number;
  cancelled_revenue: number;
  cards_with_sales: number;
  /** Every card of this marketplace the shop holds (`mp_product`). */
  cards_total: number;
  /** Σ stock over every offer line of the marketplace; `null` when no line has a number. */
  stock_units: number | null;
  /** `stock_units` at the period's pace, whole days; `null` without stock or sales. */
  stock_days_left: number | null;
  /** True when the stock numbers look declared: the days are an upper bound. */
  stock_looks_declared: boolean;
};

export const totalsOf = (input: {
  rows: SaleRow[];
  cards: CardSales[];
  cardsTotal: number;
  stockUnits: number | null;
  stockLooksDeclared: boolean;
  period: AnalyticsPeriod;
}): AnalyticsTotals => {
  let revenue = 0;
  let units = 0;
  let cancelledRevenue = 0;
  const orders = new Set<string>();
  const cancelled = new Set<string>();

  for (const row of input.rows) {
    if (row.is_cancelled) {
      cancelled.add(row.order_id);
      cancelledRevenue += row.revenue ?? 0;
      continue;
    }
    orders.add(row.order_id);
    revenue += row.revenue ?? 0;
    units += row.qty;
  }

  return {
    revenue: money(revenue),
    orders: orders.size,
    units,
    avg_order: orders.size > 0 ? money(revenue / orders.size) : null,
    cancelled_orders: cancelled.size,
    cancelled_revenue: money(cancelledRevenue),
    cards_with_sales: input.cards.length,
    cards_total: input.cardsTotal,
    stock_units: input.stockUnits,
    stock_days_left: daysToZero(input.stockUnits, units, input.period.days),
    stock_looks_declared: input.stockLooksDeclared,
  };
};

/* ------------------------------------------------------- таблица карточек */

export type CardRow = {
  /** `mp_product.id` when the shop holds the card, `<marketplace>:<number>` otherwise. */
  id: string;
  external_id: string | null;
  vendor_code: string | null;
  title: string | null;
  thumbnail: string | null;
  revenue: number;
  units: number;
  orders: number;
  avg_price: number | null;
  revenue_share: number;
  abc: AbcClass;
  xyz: XyzClass | null;
  stock: number | null;
  days_to_zero: number | null;
  /** v3: `mp_product.category_name`; `null` — the card is not in the catalogue or has none. */
  category: string | null;
  /** The card's revenue over the previous period; `null` when there is no comparison. */
  revenue_previous: number | null;
  /** Qty-weighted seller's discount, whole percent; `null` — none sent. */
  discount: number | null;
  /** The warehouses the card shipped from in the period. */
  warehouses: WarehouseType[];
};

export type CardInfo = { id: string; title: string | null; vendor_code: string | null; thumbnail: string | null };

/** One row of the table, every block's number on it. */
export const cardRowsOf = (input: {
  marketplace: string;
  cards: CardSales[];
  abc: Map<string, AbcClass>;
  xyz: Map<string, XyzRow>;
  stock: Map<string, number | null>;
  info: Map<string, CardInfo>;
  period: AnalyticsPeriod;
  categories?: Map<string, string | null>;
  extras?: Map<string, CardExtras>;
  /** Revenue per card over the previous period; absent — no comparison. */
  previous?: Map<string, number> | null;
}): CardRow[] =>
  input.cards.map((card) => {
    const key = cardKey(card.card_id);
    const info = input.info.get(key);
    const stock = input.stock.get(key) ?? null;
    return {
      id: info?.id ?? `${input.marketplace}:${card.card_id ?? "none"}`,
      external_id: card.card_id,
      vendor_code: info?.vendor_code ?? card.vendor_code,
      title: info?.title ?? null,
      thumbnail: info?.thumbnail ?? null,
      revenue: card.revenue,
      units: card.units,
      orders: card.orders,
      avg_price: card.avg_price,
      revenue_share: card.revenue_share,
      abc: input.abc.get(key) ?? "C",
      xyz: input.xyz.get(key)?.xyz ?? null,
      stock,
      days_to_zero: daysToZero(stock, card.units, input.period.days),
      category: input.categories?.get(key) ?? null,
      revenue_previous: input.previous ? (input.previous.get(key) ?? 0) : null,
      discount: input.extras?.get(key)?.discount ?? null,
      warehouses: input.extras?.get(key)?.warehouses ?? [],
    };
  });

export const CARD_SORT_FIELDS = ["revenue", "units", "days_to_zero"] as const;
export type CardSortField = (typeof CARD_SORT_FIELDS)[number];
export type CardSort = { field: CardSortField; desc: boolean };
export const DEFAULT_CARD_SORT: CardSort = { field: "revenue", desc: true };

/**
 * The list's filters (v3): they narrow the list only, never the totals, the
 * charts or the ABC classes, which stay over the whole shop.
 */
export type CardFilters = {
  category: string[] | null;
  discount: DiscountBucket[] | null;
  warehouse: WarehouseType[] | null;
  abc: AbcClass[] | null;
  /** «Кончатся за 14 дней»: `days_to_zero` at or under `DAYS_TO_ZERO_ALERT`. */
  runs_out: boolean;
};

export type CardsQuery = { q: string | null; sort: CardSort; limit: number; offset: number } & CardFilters;

/** A comma list of the address, cut to the values the filter knows; empty is no filter. */
const listOf = <T extends string>(value: unknown, known?: readonly T[]): T[] | null => {
  if (typeof value !== "string" && !Array.isArray(value)) {
    return null;
  }
  const items = (Array.isArray(value) ? value.join(",") : value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !known || (known as readonly string[]).includes(item)) as T[];
  return items.length ? items : null;
};

/**
 * The table's own query: `q` over the title and the vendor code, `order` as
 * `поле` or `-поле` over `revenue | units | days_to_zero` (`-revenue` by
 * default), `limit` (20 by default, 200 at most) and `offset`. An unknown
 * sort field falls back to the default rather than emptying the table: a link
 * with a stale value in it still shows the cards.
 */
export const resolveCardsQuery = (query: Record<string, unknown>): CardsQuery => {
  const raw = typeof query.order === "string" ? query.order.trim() : "";
  const desc = raw.startsWith("-");
  const field = desc ? raw.slice(1) : raw;
  const sort = (CARD_SORT_FIELDS as readonly string[]).includes(field)
    ? { field: field as CardSortField, desc }
    : DEFAULT_CARD_SORT;

  const limitRaw = Number(query.limit ?? 20);
  const offsetRaw = Number(query.offset ?? 0);
  return {
    q: typeof query.q === "string" && query.q.trim() ? query.q.trim().toLowerCase() : null,
    sort,
    limit: Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 200) : 20,
    offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0,
    category: listOf<string>(query.category),
    discount: listOf(query.discount, DISCOUNT_BUCKETS),
    warehouse: listOf(query.warehouse, ["wb", "seller"] as const),
    abc: listOf(query.abc, ["A", "B", "C"] as const),
    runs_out: query.runs_out === "1" || query.runs_out === "true",
  };
};

/** The card is not in the catalogue or has no category: the filter's own value for it. */
export const NO_CATEGORY = "__none__";

const passesFilters = (row: CardRow, query: CardFilters): boolean =>
  (!query.category || query.category.includes(row.category ?? NO_CATEGORY)) &&
  (!query.discount || query.discount.includes(discountBucketOf(row.discount) as DiscountBucket)) &&
  (!query.warehouse || row.warehouses.some((warehouse) => query.warehouse!.includes(warehouse))) &&
  (!query.abc || query.abc.includes(row.abc)) &&
  (!query.runs_out || (row.days_to_zero !== null && row.days_to_zero <= DAYS_TO_ZERO_ALERT));

/**
 * The page of the table and how many rows matched.
 *
 * A card without «дней до нуля» goes LAST in both directions: «не знаем» is
 * neither the most urgent card nor the calmest one. Ties keep the revenue
 * order, so a page boundary never reshuffles between two requests.
 */
export const selectCards = (
  rows: CardRow[],
  query: CardsQuery,
): { rows: CardRow[]; count: number; revenue: number } => {
  const matched = rows.filter(
    (row) =>
      (!query.q ||
        (row.title ?? "").toLowerCase().includes(query.q) ||
        (row.vendor_code ?? "").toLowerCase().includes(query.q)) &&
      passesFilters(row, query),
  );

  const { field, desc } = query.sort;
  const sorted = matched
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = a.row[field];
      const right = b.row[field];
      if (left === null || right === null) {
        if (left === right) {
          return a.index - b.index;
        }
        return left === null ? 1 : -1;
      }
      return (desc ? right - left : left - right) || a.index - b.index;
    })
    .map(({ row }) => row);

  return {
    rows: sorted.slice(query.offset, query.offset + query.limit),
    count: matched.length,
    /** The revenue of every matched card, not just this page: «48 товаров на 2,1 млн ₽». */
    revenue: money(matched.reduce((sum, row) => sum + row.revenue, 0)),
  };
};
