import { type AnalyticsPeriod, daysOf, midnightIn, shiftDay } from "./calendar";

/**
 * The infographic of «Wildberries → Аналитика» v3 (t-2026-10-16-36, after the
 * prototype Ivan accepted on 15.10.2026): the previous period, the share of
 * each category, the average check week by week, where the orders shipped
 * from and where the buyers are.
 *
 * Pure, like `../analytics.ts`: rows in, numbers out, no database and no
 * clock. Every fold reads the same `InfoRow` list the totals are folded from,
 * so the revenue of a category, of a warehouse and of a region add up to the
 * revenue in the totals (rule 17a).
 *
 * WHAT IS NOT HERE. Buyout, «к перечислению», the funnel, the profit and the
 * WB promotions need data the import does not store; the page leaves those
 * blocks out instead of drawing a number nobody measured (rule 20a).
 */

/** One sold line with the order facts the infographic splits by. */
export type InfoRow = {
  order_id: string;
  day: string;
  card_id: string | null;
  qty: number;
  revenue: number | null;
  is_cancelled: boolean;
  has_line: boolean;
  /** `mp_order.buyer_region`; `null` where the marketplace did not say. */
  region: string | null;
  /** Which warehouse the order shipped from; `null` where the marketplace did not say. */
  warehouse: WarehouseType | null;
  /**
   * The buyer's whole purchase: WB's `gNumber`, the same on every line the
   * buyer ordered together. `null` where the mirror holds none; such an order
   * is a check of its own.
   */
  check_id: string | null;
  /** The seller's discount on the line, percent; `null` where none was sent. */
  discount: number | null;
};

export type WarehouseType = "wb" | "seller";

const money = (value: number): number => Math.round(value * 100) / 100;
const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

/** Counts only what sold: a cancelled line is in the cancellations, never in a share. */
const sold = (row: InfoRow): boolean => !row.is_cancelled && row.has_line;

/**
 * WB's `warehouseType` of a statistics order, read word for word: «Склад WB»
 * and «Склад продавца» are the two values the method documents. An FBS
 * assembly order is the seller's warehouse by definition of the scheme. Any
 * other value is `null`, never a guess (rule 17a).
 */
export const warehouseTypeOf = (raw: string | null, scheme: string | null): WarehouseType | null => {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "склад wb") {
    return "wb";
  }
  if (value === "склад продавца") {
    return "seller";
  }
  return scheme === "FBS" || scheme === "DBS" ? "seller" : null;
};

/* ---------------------------------------------------------- прошлый период */

/** The period of the same length that ends the day before `period` starts. */
export const previousPeriodOf = (period: AnalyticsPeriod): AnalyticsPeriod => {
  const fromDay = shiftDay(period.from_day, -period.days);
  return {
    from: midnightIn(fromDay, period.time_zone),
    until: period.from,
    from_day: fromDay,
    to_day: shiftDay(period.from_day, -1),
    days: period.days,
    is_default: false,
    time_zone: period.time_zone,
  };
};

export type Comparison = {
  from_day: string;
  to_day: string;
  /**
   * False when the stored orders begin after the previous period starts: a
   * comparison against days the import never reached would read an absence
   * as a fall in sales.
   */
  available: boolean;
  /** The first day the mirror holds an order of this marketplace; `null` — none at all. */
  data_from_day: string | null;
};

export const comparisonOf = (previous: AnalyticsPeriod, firstStoredDay: string | null): Comparison => ({
  from_day: previous.from_day,
  to_day: previous.to_day,
  available: firstStoredDay !== null && firstStoredDay <= previous.from_day,
  data_from_day: firstStoredDay,
});

/* -------------------------------------------------------------- средний чек */

export type Checks = {
  /** The buyer's purchases: lines with one `gNumber` are one check. */
  checks: number;
  revenue: number;
  /** `revenue / checks`, `null` with no check. */
  avg_check: number | null;
};

const checkKey = (row: InfoRow): string => (row.check_id ? `g:${row.check_id}` : `o:${row.order_id}`);

export const checksOf = (rows: InfoRow[]): Checks => {
  const keys = new Set<string>();
  let revenue = 0;
  for (const row of rows) {
    if (!sold(row)) {
      continue;
    }
    keys.add(checkKey(row));
    revenue += row.revenue ?? 0;
  }
  return {
    checks: keys.size,
    revenue: money(revenue),
    avg_check: keys.size > 0 ? money(revenue / keys.size) : null,
  };
};

export type CheckWeek = Checks & { start: string; end: string; days: number };

/** Monday of the calendar week of a `YYYY-MM-DD` day. */
const mondayOf = (day: string): string => {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
};

/**
 * The average check by calendar week, Monday to Sunday, the first and the
 * last week cut by the period and saying how many days they hold: a five-day
 * week is printed as one, not stretched into seven.
 */
export const checksByWeek = (rows: InfoRow[], period: Pick<AnalyticsPeriod, "from_day" | "days">): CheckWeek[] => {
  const weeks = new Map<string, { start: string; end: string; days: number; rows: InfoRow[] }>();
  for (const day of daysOf(period)) {
    const key = mondayOf(day);
    const week = weeks.get(key) ?? { start: day, end: day, days: 0, rows: [] };
    week.end = day;
    week.days += 1;
    weeks.set(key, week);
  }
  for (const row of rows) {
    weeks.get(mondayOf(row.day))?.rows.push(row);
  }
  return [...weeks.values()].map(({ rows: weekRows, ...week }) => ({ ...week, ...checksOf(weekRows) }));
};

/* -------------------------------------------------------------- категории */

export type CategoryShare = {
  /** `mp_product.category_name` (WB's subject); `null` — the card is not in the catalogue or has none. */
  category: string | null;
  revenue: number;
  /** Percent of the period's revenue, one decimal. */
  share: number;
  /** The same category over the previous period; `null` when there is no comparison. */
  revenue_previous: number | null;
};

const foldBy = <K>(rows: InfoRow[], keyOf: (row: InfoRow) => K) => {
  const out = new Map<K, { revenue: number; orders: Set<string> }>();
  for (const row of rows) {
    if (!sold(row)) {
      continue;
    }
    const key = keyOf(row);
    const entry = out.get(key) ?? { revenue: 0, orders: new Set<string>() };
    entry.revenue += row.revenue ?? 0;
    entry.orders.add(row.order_id);
    out.set(key, entry);
  }
  return out;
};

const totalRevenue = (rows: InfoRow[]): number =>
  rows.reduce((sum, row) => (sold(row) ? sum + (row.revenue ?? 0) : sum), 0);

export const byCategory = (
  rows: InfoRow[],
  categoryOf: (cardId: string | null) => string | null,
  previous: InfoRow[] | null,
): CategoryShare[] => {
  const total = totalRevenue(rows);
  const now = foldBy(rows, (row) => categoryOf(row.card_id));
  const before = previous ? foldBy(previous, (row) => categoryOf(row.card_id)) : null;
  return [...now.entries()]
    .map(([category, entry]) => ({
      category,
      revenue: money(entry.revenue),
      share: percent(entry.revenue, total),
      revenue_previous: before ? money(before.get(category)?.revenue ?? 0) : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || String(a.category).localeCompare(String(b.category)));
};

/* ---------------------------------------------------------------- склады */

export type WarehouseShare = {
  warehouse: WarehouseType | null;
  revenue: number;
  orders: number;
  share: number;
};

export const byWarehouse = (rows: InfoRow[]): WarehouseShare[] => {
  const total = totalRevenue(rows);
  const order: Array<WarehouseType | null> = ["wb", "seller", null];
  const folded = foldBy(rows, (row) => row.warehouse);
  return order
    .filter((key) => folded.has(key))
    .map((warehouse) => {
      const entry = folded.get(warehouse)!;
      return {
        warehouse,
        revenue: money(entry.revenue),
        orders: entry.orders.size,
        share: percent(entry.revenue, total),
      };
    });
};

/* ---------------------------------------------------------------- регионы */

export const TOP_REGIONS = 5;

export type Regions = {
  /** The biggest regions by revenue, at most `TOP_REGIONS`. */
  top: Array<{ region: string; revenue: number; share: number }>;
  /** Every other KNOWN region together; `null` when there is none. */
  other: { regions: number; revenue: number; share: number } | null;
  /** Orders whose region the marketplace named, of all sold orders. */
  known_orders: number;
  orders: number;
};

export const byRegion = (rows: InfoRow[]): Regions => {
  const known = rows.filter((row) => sold(row) && row.region);
  const total = totalRevenue(known);
  const folded = [...foldBy(known, (row) => row.region as string).entries()]
    .map(([region, entry]) => ({ region, revenue: entry.revenue }))
    .sort((a, b) => b.revenue - a.revenue || a.region.localeCompare(b.region));
  const rest = folded.slice(TOP_REGIONS);
  const restRevenue = rest.reduce((sum, entry) => sum + entry.revenue, 0);
  return {
    top: folded.slice(0, TOP_REGIONS).map((entry) => ({
      region: entry.region,
      revenue: money(entry.revenue),
      share: percent(entry.revenue, total),
    })),
    other: rest.length
      ? { regions: rest.length, revenue: money(restRevenue), share: percent(restRevenue, total) }
      : null,
    known_orders: new Set(known.map((row) => row.order_id)).size,
    orders: new Set(rows.filter(sold).map((row) => row.order_id)).size,
  };
};

/* ------------------------------------------------- поля строки карточки */

export type CardExtras = {
  /** Qty-weighted seller's discount over the card's sold lines, whole percent; `null` — none sent. */
  discount: number | null;
  /** The warehouses the card shipped from in the period. */
  warehouses: WarehouseType[];
};

export const cardExtrasOf = (rows: InfoRow[]): Map<string, CardExtras> => {
  const acc = new Map<string, { weighted: number; qty: number; warehouses: Set<WarehouseType> }>();
  for (const row of rows) {
    if (!sold(row)) {
      continue;
    }
    const key = row.card_id ?? "";
    const entry = acc.get(key) ?? { weighted: 0, qty: 0, warehouses: new Set<WarehouseType>() };
    if (row.discount !== null) {
      entry.weighted += row.discount * row.qty;
      entry.qty += row.qty;
    }
    if (row.warehouse) {
      entry.warehouses.add(row.warehouse);
    }
    acc.set(key, entry);
  }
  const out = new Map<string, CardExtras>();
  for (const [key, entry] of acc) {
    out.set(key, {
      discount: entry.qty > 0 ? Math.round(entry.weighted / entry.qty) : null,
      warehouses: [...entry.warehouses].sort(),
    });
  }
  return out;
};

/** The seller's discount buckets of the list filter: none, up to 20 %, 20–40 %, over 40 %. */
export const DISCOUNT_BUCKETS = ["none", "lt20", "20to40", "gt40"] as const;
export type DiscountBucket = (typeof DISCOUNT_BUCKETS)[number];

export const discountBucketOf = (discount: number | null): DiscountBucket | null => {
  if (discount === null) {
    return null;
  }
  if (discount <= 0) {
    return "none";
  }
  return discount < 20 ? "lt20" : discount <= 40 ? "20to40" : "gt40";
};

/** The previous-period totals the four tiles compare against. */
export type PreviousTotals = {
  revenue: number;
  orders: number;
  avg_check: number | null;
  cancelled_orders: number;
};

export const previousTotalsOf = (rows: InfoRow[]): PreviousTotals => {
  const orders = new Set<string>();
  const cancelled = new Set<string>();
  for (const row of rows) {
    (row.is_cancelled ? cancelled : orders).add(row.order_id);
  }
  const checks = checksOf(rows);
  return {
    revenue: checks.revenue,
    orders: orders.size,
    avg_check: checks.avg_check,
    cancelled_orders: cancelled.size,
  };
};
