import {
  ANALYTICS_TIMEZONE,
  formatDateInZone,
  parseDateInZone,
  startOfDayInZone,
} from "../api/tenants/analytics/timezone";

/**
 * The period arithmetic of `GET /tenants/analytics/summary`, lifted out of the
 * route so it is measurable without a database (t-2026-10-20-45): which
 * instants a period covers, the previous period of the same length, the
 * aggregates, and the day-by-day series for both of them.
 */

/** One order as the summary sees it. */
export type PeriodOrder = {
  id: string;
  created_at: Date;
  total: number;
  currency_code: string | null;
  /** Canceled orders are money the shop did not earn: out of revenue, reported apart. */
  canceled: boolean;
};

export type DailyPoint = { date: string; revenue: number; order_count: number };

export type PeriodRange = {
  start: Date;
  /** Exclusive. */
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  key: string;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * `{ start, end }` (end exclusive) for the requested period, plus the
 * immediately preceding period of the same length, so "change against the
 * previous period" always compares like-for-like durations.
 *
 * Every boundary is midnight in `ANALYTICS_TIMEZONE`, not UTC (round 1,
 * finding 3): an order placed at 01:00 Moscow time is 22:00 UTC the day
 * before, and a UTC-midnight cut put it in the wrong day and closed the
 * "today" card three hours early for this shop's own morning.
 */
export const resolveRange = (
  query: { period?: unknown; from?: unknown; to?: unknown },
  now: Date,
): PeriodRange => {
  const period = typeof query.period === "string" ? query.period : "7d";
  const today = startOfDayInZone(now, ANALYTICS_TIMEZONE);
  const end = new Date(today.getTime() + DAY_MS);

  if (period === "custom") {
    const fromRaw = typeof query.from === "string" ? query.from : null;
    const toRaw = typeof query.to === "string" ? query.to : null;
    const from = fromRaw ? parseDateInZone(fromRaw, ANALYTICS_TIMEZONE) : null;
    const to = toRaw ? parseDateInZone(toRaw, ANALYTICS_TIMEZONE) : null;

    if (from && to && to.getTime() >= from.getTime()) {
      const start = from;
      const rangeEnd = new Date(to.getTime() + DAY_MS);
      const length = rangeEnd.getTime() - start.getTime();

      return {
        start,
        end: rangeEnd,
        prevStart: new Date(start.getTime() - length),
        prevEnd: start,
        key: "custom",
      };
    }
    // Fall through to the 7-day default on a malformed custom range: the
    // range is what the caller asked for, not a fact that can 400 the whole
    // panel screen.
  }

  const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
  const start = new Date(end.getTime() - days * DAY_MS);

  return {
    start,
    end,
    prevStart: new Date(start.getTime() - days * DAY_MS),
    prevEnd: start,
    key: period === "today" || period === "30d" ? period : "7d",
  };
};

export const aggregate = (orders: PeriodOrder[]) => {
  const revenue = round2(orders.reduce((sum, order) => sum + order.total, 0));
  const order_count = orders.length;
  const aov = order_count > 0 ? round2(revenue / order_count) : 0;
  return { revenue, order_count, aov };
};

/** The orders that are revenue, and the ones the shop cancelled. */
export const sold = (orders: PeriodOrder[]): PeriodOrder[] => orders.filter((order) => !order.canceled);
export const canceledOnly = (orders: PeriodOrder[]): PeriodOrder[] =>
  orders.filter((order) => order.canceled);

/** Percent change, or null when the previous period has nothing to compare against. */
export const changeOf = (current: number, previous: number): number | null => {
  if (previous === 0) {
    return null;
  }
  return round2(((current - previous) / previous) * 100);
};

/** The orders created in `[from, to)`. */
export const ordersBetween = (orders: PeriodOrder[], from: Date, to: Date): PeriodOrder[] =>
  orders.filter((order) => {
    const at = order.created_at.getTime();
    return at >= from.getTime() && at < to.getTime();
  });

/**
 * One point per calendar day of `[start, end)`, zero days included: a zero is a
 * measured zero (rule 20a). Cancelled orders are not revenue and not counted.
 * Called for the chosen period and for the previous one, so the two series
 * have the same length and line up day by day.
 */
export const dailySeries = (orders: PeriodOrder[], start: Date, end: Date): DailyPoint[] => {
  const points: DailyPoint[] = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS) {
    const dayOrders = sold(ordersBetween(orders, new Date(cursor), new Date(cursor + DAY_MS)));
    points.push({
      date: formatDateInZone(new Date(cursor), ANALYTICS_TIMEZONE),
      revenue: aggregate(dayOrders).revenue,
      order_count: dayOrders.length,
    });
  }
  return points;
};
