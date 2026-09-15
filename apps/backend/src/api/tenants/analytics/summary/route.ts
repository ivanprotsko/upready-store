import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { listTenantOrderIds } from "../../tenant-scope";
import { ANALYTICS_TIMEZONE, formatDateInZone, parseDateInZone, startOfDayInZone } from "../timezone";

/**
 * `GET /tenants/analytics/summary` (t17-analytics, step 5) — revenue, order
 * count and average order value for a period the owner picks, the change
 * against the immediately preceding period of the same length, a daily
 * breakdown and the five best-selling products. Computed here, over the
 * tenant's own orders (`listTenantOrderIds`), never fetched whole into the
 * panel.
 *
 * `order.total` is not a stored column — it lives in `order_summary.totals`,
 * a JSON blob keyed `current_order_total`, the same fact
 * `customers/helpers.ts` (`getTenantCustomerAggregates`) already measured
 * against the live schema, so this route joins it the same way rather than
 * calling `getOrdersListWorkflow` once per order.
 *
 * `has_orders` is `false` only when the tenant has never had a single order —
 * the honest empty state (step 6: "заказов пока нет", never zeroes that look
 * like a loss). A tenant WITH orders whose chosen period happens to be empty
 * still gets `has_orders: true` and a real, computed zero: that zero is data,
 * not a stand-in for "not loaded yet" (rule 20a) — the panel's own loading
 * state is a separate, third value the frontend tracks itself (rule 19h).
 */

type OrderRow = {
  id: string;
  created_at: Date;
  total: number;
  currency_code: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

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
const resolveRange = (
  req: AuthenticatedMedusaRequest,
  now: Date,
): { start: Date; end: Date; prevStart: Date; prevEnd: Date; key: string } => {
  const period = typeof req.query.period === "string" ? req.query.period : "7d";
  const today = startOfDayInZone(now, ANALYTICS_TIMEZONE);
  const end = new Date(today.getTime() + DAY_MS);

  if (period === "custom") {
    const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
    const toRaw = typeof req.query.to === "string" ? req.query.to : null;
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

const round2 = (value: number): number => Math.round(value * 100) / 100;

const aggregate = (orders: OrderRow[]) => {
  const revenue = round2(orders.reduce((sum, order) => sum + order.total, 0));
  const order_count = orders.length;
  const aov = order_count > 0 ? round2(revenue / order_count) : 0;
  return { revenue, order_count, aov };
};

/** Percent change, or null when the previous period has nothing to compare against. */
const changeOf = (current: number, previous: number): number | null => {
  if (previous === 0) {
    return null;
  }
  return round2(((current - previous) / previous) * 100);
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedIds = await listTenantOrderIds(req);

  if (ownedIds.length === 0) {
    res.json({ has_orders: false });
    return;
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const now = new Date();
  const { start, end, prevStart, prevEnd, key } = resolveRange(req, now);

  const rawOrders: {
    id: string;
    created_at: Date;
    total: string | null;
    currency_code: string | null;
  }[] = await pg({ o: "order" })
    .leftJoin({ os: "order_summary" }, function joinSummary() {
      this.on("os.order_id", "o.id").andOnNull("os.deleted_at");
    })
    .whereIn("o.id", ownedIds)
    .whereNull("o.deleted_at")
    .where("o.is_draft_order", false)
    .select("o.id", "o.created_at", "o.currency_code")
    .select(
      pg.raw("coalesce((os.totals->>'current_order_total')::numeric, 0) as total"),
    );

  const orders: OrderRow[] = rawOrders.map((row) => ({
    id: row.id,
    created_at: new Date(row.created_at),
    total: Number(row.total ?? 0),
    currency_code: row.currency_code,
  }));

  const currency_code = orders[0]?.currency_code ?? null;

  const inRange = (from: Date, to: Date) =>
    orders.filter((order) => {
      const at = order.created_at.getTime();
      return at >= from.getTime() && at < to.getTime();
    });

  const currentOrders = inRange(start, end);
  const previousOrders = inRange(prevStart, prevEnd);

  const current = aggregate(currentOrders);
  const previous = aggregate(previousOrders);

  const daily: { date: string; revenue: number; order_count: number }[] = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor + DAY_MS);
    const dayOrders = inRange(dayStart, dayEnd);
    daily.push({
      date: formatDateInZone(dayStart, ANALYTICS_TIMEZONE),
      revenue: aggregate(dayOrders).revenue,
      order_count: dayOrders.length,
    });
  }

  let top_products: { product_id: string; title: string; quantity: number; revenue: number }[] = [];

  if (currentOrders.length > 0) {
    const rows: {
      product_id: string;
      title: string;
      quantity: string;
      revenue: string;
    }[] = await pg({ oi: "order_item" })
      .join({ oli: "order_line_item" }, function joinLineItem() {
        this.on("oli.id", "oi.item_id").andOnNull("oli.deleted_at");
      })
      .whereIn(
        "oi.order_id",
        currentOrders.map((order) => order.id),
      )
      .whereNull("oi.deleted_at")
      .whereNotNull("oli.product_id")
      .groupBy("oli.product_id", "oli.title")
      .select({ product_id: "oli.product_id", title: "oli.title" })
      .sum({ quantity: "oi.quantity" })
      .sum({ revenue: pg.raw("oi.quantity * oli.unit_price") });

    top_products = rows
      .map((row) => ({
        product_id: row.product_id,
        title: row.title,
        quantity: Number(row.quantity ?? 0),
        revenue: round2(Number(row.revenue ?? 0)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }

  res.json({
    has_orders: true,
    currency_code,
    period: {
      key,
      from: start.toISOString(),
      to: new Date(end.getTime() - 1).toISOString(),
    },
    current,
    previous,
    change: {
      revenue_pct: changeOf(current.revenue, previous.revenue),
      order_count_pct: changeOf(current.order_count, previous.order_count),
      aov_pct: changeOf(current.aov, previous.aov),
    },
    daily,
    top_products,
  });
};
