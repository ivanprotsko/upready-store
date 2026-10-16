import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace";
import type MarketplaceModuleService from "../../../../../modules/marketplace/service";
import type { MarketplaceAdapter } from "../../../../../modules/marketplace/contract";
import {
  abcOf,
  cardKey,
  cardRowsOf,
  dayReader,
  resolveAnalyticsPeriod,
  resolveCardsQuery,
  saleRowsOf,
  salesByCard,
  salesByDay,
  selectCards,
  stockLooksDeclared,
  totalsOf,
  xyzOf,
  type AnalyticsPeriod,
  type AnalyticsTotals,
  type CardInfo,
  type CardRow,
  type CardsQuery,
  type DayPoint,
  type RawLine,
} from "../../../../../modules/marketplace/analytics";
import {
  byCategory,
  byRegion,
  byWarehouse,
  cardExtrasOf,
  checksByWeek,
  checksOf,
  comparisonOf,
  previousPeriodOf,
  previousTotalsOf,
  warehouseTypeOf,
  type CategoryShare,
  type CheckWeek,
  type Checks,
  type Comparison,
  type PreviousTotals,
  type Regions,
  type WarehouseShare,
} from "../../../../../modules/marketplace/analytics/infographic";
import {
  RATING_ENDPOINTS,
  sellerRating,
  type LastCall,
  type SellerRating,
} from "../../../../../modules/marketplace/analytics-sources";
import { connectionNotice } from "../../../../../modules/marketplace/order-feed";
import { photoUrls } from "../../../../../modules/marketplace/products-list";
import { ANALYTICS_TIMEZONE } from "../../../analytics/timezone";
import { getTenantScope } from "../../../tenant-scope";
import { marketplaceOf, readSellerCurrency, type FeedConnection } from "../orders/load-orders";

/**
 * Loads «Wildberries → Аналитика» for one shop (mp-section-design task-06):
 * the totals, the sales by day and the cards that sold, of ONE marketplace
 * over one period.
 *
 * IT READS OUR OWN TABLES AND NOTHING ELSE. `mp_order`, `mp_order_line`,
 * `mp_offer`, `mp_product` and the journals `mp_sync_run` / `mp_api_call`, all
 * filled by imports. No adapter network member, no endpoint call: the rating
 * is looked up in the journal, never asked for (Ivan, 2026-09-16 02:46 WITA).
 * `readCredentials` reads the shop's own database to say whether a key is
 * stored; it is the one adapter member used.
 *
 * WHAT IS READ IN SQL AND WHAT IS FOLDED HERE. The period's order lines are
 * one statement over the `(tenant_id, marketplace, ordered_at)` index; the
 * stock is summed per card in SQL; titles and first-order days are read only
 * for the cards that sold. The fold over the lines is the pure module's, so
 * the unit suite pins every definition the screen prints.
 */

/**
 * The kinds of run that produce ORDER rows, the same list «Заказы» reads its
 * banner from: the analytics of a marketplace is empty for the same reasons
 * its order list is.
 */
const ORDER_RUN_KINDS: Record<string, string[]> = {
  wb: ["fbs_orders", "orders"],
  ozon: ["postings"],
};

/** At most this many ids in one `IN (…)`, well under Postgres' 65 535 bind parameters. */
const ID_BATCH = 5_000;

export type LoadedMpAnalytics = {
  period: AnalyticsPeriod;
  /** The currency every sum is in: the shop's price list on this marketplace. */
  currency: string | null;
  totals: AnalyticsTotals;
  by_day: DayPoint[];
  cards: CardRow[];
  cards_count: number;
  /** The revenue of every card the list's search and filters matched. */
  cards_revenue: number;
  query: CardsQuery;
  /** v3 (t-2026-10-16-36): the previous period of the same length and whether the mirror reaches it. */
  comparison: Comparison;
  /** `null` when `comparison.available` is false. */
  totals_previous: PreviousTotals | null;
  by_day_previous: DayPoint[] | null;
  checks: Checks;
  by_week: CheckWeek[];
  by_category: CategoryShare[];
  by_warehouse: WarehouseShare[];
  by_region: Regions;
  rating: SellerRating;
  connection: FeedConnection;
};

const iso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

const batches = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_BATCH) {
    out.push(items.slice(i, i + ID_BATCH));
  }
  return out;
};

/** Every order of the period with its lines; an order without a line is one row with `has_line` false. */
const readLines = async (
  pg: Knex,
  tenantId: string,
  marketplace: string,
  period: AnalyticsPeriod,
): Promise<RawLine[]> => {
  const statement = pg("mp_order as o")
    .leftJoin("mp_order_line as l", function () {
      this.on("l.order_id", "=", "o.id").andOn("l.tenant_id", "=", "o.tenant_id").andOnNull("l.deleted_at");
    });
  /**
   * WB's buyer purchase (`gNumber`) and warehouse type (`warehouseType`) have
   * no column of their own: the statistics mirror keeps WB's whole row in
   * `wb_order.raw`, and `mp_order.source_row_id` is that row's id.
   *
   * AN FBS ORDER points at `wb_fbs_order` instead, and the projection drops
   * the statistics row of the same order (`dedupeOrders`, joined on WB's
   * `rid` = `srid`). The statistics row is still in the mirror, so it is
   * reached the same way back: on the stand that lifts the orders with a
   * purchase number and a region from a quarter to nine in ten (3 154 of
   * 3 560 over 30 days, 16.10.2026).
   */
  if (marketplace === "wb") {
    statement
      .leftJoin("wb_order as w", function () {
        this.on("w.id", "=", "o.source_row_id").andOn("w.tenant_id", "=", "o.tenant_id");
      })
      .leftJoin("wb_fbs_order as f", function () {
        this.on("f.id", "=", "o.source_row_id").andOn("f.tenant_id", "=", "o.tenant_id");
      })
      .leftJoin("wb_order as ws", function () {
        this.on("ws.srid", "=", "f.rid").andOn("ws.tenant_id", "=", "o.tenant_id").andOnNull("ws.deleted_at");
      });
  }
  const rows = (await statement
    .where({ "o.tenant_id": tenantId, "o.marketplace": marketplace })
    .whereNull("o.deleted_at")
    .where("o.ordered_at", ">=", period.from)
    .where("o.ordered_at", "<", period.until)
    .select(
      "o.id as order_id",
      "o.ordered_at",
      "o.is_cancelled",
      "l.id as line_id",
      "l.external_id as card_id",
      "l.vendor_code",
      "l.qty",
      "l.price",
      "l.discount",
      "o.scheme",
      ...(marketplace === "wb"
        ? [
            pg.raw("coalesce(w.raw->>'gNumber', ws.raw->>'gNumber') as check_id"),
            pg.raw("coalesce(w.raw->>'warehouseType', ws.raw->>'warehouseType') as warehouse_type"),
            pg.raw("coalesce(o.buyer_region, ws.region_name) as buyer_region"),
          ]
        : ["o.buyer_region"]),
    )) as Record<string, unknown>[];

  return rows.map((row) => ({
    order_id: String(row.order_id),
    ordered_at: (row.ordered_at ?? null) as Date | null,
    is_cancelled: Boolean(row.is_cancelled),
    has_line: row.line_id !== null && row.line_id !== undefined,
    card_id: (row.card_id ?? null) as string | null,
    vendor_code: (row.vendor_code ?? null) as string | null,
    qty: (row.qty ?? null) as number | string | null,
    price: (row.price ?? null) as number | string | null,
    discount: (row.discount ?? null) as number | string | null,
    region: (row.buyer_region ?? null) as string | null,
    warehouse: warehouseTypeOf(
      (row.warehouse_type ?? null) as string | null,
      (row.scheme ?? null) as string | null,
    ),
    check_id: (row.check_id ?? null) as string | null,
  }));
};

/** The shop-calendar day of the first order the mirror holds on this marketplace; `null` — none. */
const readFirstStoredDay = async (
  pg: Knex,
  tenantId: string,
  marketplace: string,
  timeZone: string,
): Promise<string | null> => {
  const [row] = (await pg("mp_order")
    .where({ tenant_id: tenantId, marketplace })
    .whereNull("deleted_at")
    .whereNotNull("ordered_at")
    .min({ first: "ordered_at" })) as { first: Date | string | null }[];
  return row?.first ? dayReader(timeZone)(new Date(row.first)) : null;
};

/**
 * Σ `mp_offer.stock` per card over its sizes and warehouses, `null` for a card
 * none of whose lines carries a number (rule 20a), and the shape of the
 * numbers, to tell a declared stock from a counted one.
 */
const readStock = async (pg: Knex, tenantId: string, marketplace: string) => {
  const scoped = { tenant_id: tenantId, marketplace };
  const [perCardRows, topRows] = await Promise.all([
    pg("mp_offer")
      .where(scoped)
      .whereNull("deleted_at")
      .groupBy("external_id")
      .select("external_id")
      .sum({ stock: "stock" })
      .count({ lines: "stock" }),
    pg("mp_offer")
      .where(scoped)
      .whereNull("deleted_at")
      .whereNotNull("stock")
      .groupBy("stock")
      .select("stock")
      .count({ n: "*" })
      .orderBy("n", "desc")
      .limit(1),
  ]);
  const perCard = perCardRows as unknown as { external_id: string; stock: string | null; lines: string | number }[];
  const [top] = topRows as unknown as { stock: number | string; n: string | number }[];

  const byCard = new Map<string, number | null>();
  let total: number | null = null;
  let lines = 0;
  for (const row of perCard) {
    const counted = Number(row.lines);
    const stock = counted > 0 && row.stock !== null ? Number(row.stock) : null;
    byCard.set(cardKey(row.external_id), stock);
    if (stock !== null) {
      total = (total ?? 0) + stock;
    }
    lines += counted;
  }

  return {
    byCard,
    total,
    declared: stockLooksDeclared({
      lines,
      dominant_value: top ? Number(top.stock) : null,
      dominant_lines: top ? Number(top.n) : 0,
    }),
  };
};

/** Title, vendor code and the first photo of the cards that sold, by card number. */
const readCardInfo = async (
  pg: Knex,
  tenantId: string,
  marketplace: string,
  cardIds: string[],
): Promise<{ info: Map<string, CardInfo>; categories: Map<string, string | null> }> => {
  const info = new Map<string, CardInfo>();
  const categories = new Map<string, string | null>();
  for (const ids of batches(cardIds)) {
    const rows = (await pg("mp_product")
      .where({ tenant_id: tenantId, marketplace })
      .whereNull("deleted_at")
      .whereIn("external_id", ids)
      .select("id", "external_id", "title", "vendor_code", "photos", "category_name")) as Record<string, unknown>[];
    for (const row of rows) {
      const key = cardKey(String(row.external_id));
      if (info.has(key)) {
        continue;
      }
      info.set(key, {
        id: String(row.id),
        title: (row.title ?? null) as string | null,
        vendor_code: (row.vendor_code ?? null) as string | null,
        thumbnail: photoUrls(row.photos, "thumb")[0] ?? null,
      });
      categories.set(key, (row.category_name ?? null) as string | null);
    }
  }
  return { info, categories };
};

/**
 * The shop-calendar day of each card's FIRST order ever on this marketplace,
 * cancelled ones included: XYZ counts a card's weeks only from the day it was
 * on sale.
 */
const readFirstDays = async (
  pg: Knex,
  tenantId: string,
  marketplace: string,
  cardIds: string[],
  timeZone: string,
): Promise<Map<string, string>> => {
  const dayOf = dayReader(timeZone);
  const first = new Map<string, string>();
  for (const ids of batches(cardIds)) {
    const rows = (await pg("mp_order_line as l")
      .join("mp_order as o", function () {
        this.on("o.id", "=", "l.order_id").andOn("o.tenant_id", "=", "l.tenant_id");
      })
      .where({ "o.tenant_id": tenantId, "o.marketplace": marketplace })
      .whereNull("o.deleted_at")
      .whereNull("l.deleted_at")
      .whereNotNull("o.ordered_at")
      .whereIn("l.external_id", ids)
      .groupBy("l.external_id")
      .select("l.external_id")
      .min({ first: "o.ordered_at" })) as { external_id: string; first: Date | string }[];
    for (const row of rows) {
      first.set(cardKey(row.external_id), dayOf(new Date(row.first)));
    }
  }
  return first;
};

/** Whether the shop has a key, and how the last ORDER import of this marketplace ended. */
const readConnection = async (
  req: AuthenticatedMedusaRequest,
  adapter: MarketplaceAdapter,
  tenantId: string,
  hasKey: boolean,
  orders: number,
): Promise<FeedConnection> => {
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const kinds = ORDER_RUN_KINDS[adapter.id] ?? [];

  const [last] = kinds.length
    ? ((await mp.listMpSyncRuns(
        { tenant_id: tenantId, marketplace: adapter.id, kind: kinds },
        { order: { started_at: "DESC" }, take: 1 },
      )) as Record<string, unknown>[])
    : [];

  const lastRun = last
    ? {
        kind: String(last.kind),
        status: String(last.status),
        started_at: iso(last.started_at),
        finished_at: iso(last.finished_at),
        rows: last.rows === null || last.rows === undefined ? null : Number(last.rows),
        error: (last.error ?? null) as string | null,
        is_fixture: Boolean(last.is_fixture),
      }
    : null;

  return {
    marketplace: adapter.id,
    label: adapter.label,
    connected: hasKey,
    last_run: lastRun,
    /** Orders of the PERIOD here: the number the totals print as «Заказов». */
    rows_in_period: orders,
    notice: connectionNotice({ connected: hasKey, last_run: lastRun }),
  };
};

/** The last recorded answer of the rating method, from our own journal. */
const readRatingCall = async (
  pg: Knex,
  tenantId: string,
  marketplace: string,
  endpoint: string | null,
): Promise<LastCall | null> => {
  if (!endpoint) {
    return null;
  }
  const row = (await pg("mp_api_call")
    .where({ tenant_id: tenantId, marketplace, endpoint_id: endpoint })
    .whereNull("deleted_at")
    .orderBy("fetched_at", "desc")
    .first("endpoint_id", "status", "error", "fetched_at")) as Record<string, unknown> | undefined;
  return row
    ? {
        endpoint_id: String(row.endpoint_id),
        status: row.status === null || row.status === undefined ? null : Number(row.status),
        error: (row.error ?? null) as string | null,
        fetched_at: iso(row.fetched_at),
      }
    : null;
};

export const loadMpAnalytics = async (
  req: AuthenticatedMedusaRequest,
  now: Date = new Date(),
): Promise<LoadedMpAnalytics> => {
  const adapter = marketplaceOf(req);
  const query = req.query as Record<string, unknown>;
  /** Read before the tenant, so a malformed period answers 400 without a database round trip. */
  const period = resolveAnalyticsPeriod(query, now, ANALYTICS_TIMEZONE);
  const cardsQuery = resolveCardsQuery(query);
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const marketplace = adapter.id;

  const ratingEndpoint = RATING_ENDPOINTS[marketplace] ?? null;
  const previous = previousPeriodOf(period);
  const [lines, previousLines, firstStoredDay, currency, stock, [{ n: cardsTotal }], slot, ratingCall] = await Promise.all([
    readLines(pg, tenant.id, marketplace, period),
    readLines(pg, tenant.id, marketplace, previous),
    readFirstStoredDay(pg, tenant.id, marketplace, period.time_zone),
    readSellerCurrency(pg, tenant.id, marketplace),
    readStock(pg, tenant.id, marketplace),
    pg("mp_product")
      .where({ tenant_id: tenant.id, marketplace })
      .whereNull("deleted_at")
      .count({ n: "*" }) as Promise<{ n: string | number }[]>,
    adapter.readCredentials(pg, tenant.id),
    readRatingCall(pg, tenant.id, marketplace, ratingEndpoint),
  ]);

  const rows = saleRowsOf(lines, period);
  const sold = salesByCard(rows);
  const soldIds = sold.map((card) => card.card_id).filter((id): id is string => id !== null);

  const comparison = comparisonOf(previous, firstStoredDay);
  const previousRows = comparison.available ? saleRowsOf(previousLines, previous) : null;
  const previousSold = previousRows ? salesByCard(previousRows) : null;
  const soldSet = new Set(soldIds);
  const previousIds = (previousSold ?? [])
    .map((card) => card.card_id)
    .filter((id): id is string => id !== null && !soldSet.has(id));

  const [{ info, categories }, firstDays] = await Promise.all([
    readCardInfo(pg, tenant.id, marketplace, [...soldIds, ...previousIds]),
    readFirstDays(pg, tenant.id, marketplace, soldIds, period.time_zone),
  ]);
  const categoryOf = (cardId: string | null) => categories.get(cardKey(cardId)) ?? null;

  const totals = totalsOf({
    rows,
    cards: sold,
    cardsTotal: Number(cardsTotal),
    stockUnits: stock.total,
    stockLooksDeclared: stock.declared,
    period,
  });

  const cardRows = cardRowsOf({
    marketplace,
    cards: sold,
    abc: abcOf(sold),
    xyz: xyzOf(rows, sold, period, firstDays),
    stock: stock.byCard,
    info,
    period,
    categories,
    extras: cardExtrasOf(rows),
    previous: previousSold ? new Map(previousSold.map((card) => [cardKey(card.card_id), card.revenue])) : null,
  });
  const page = selectCards(cardRows, cardsQuery);

  const hasKey = Boolean(slot?.credentials);

  return {
    period,
    currency,
    totals,
    by_day: salesByDay(rows, period),
    cards: page.rows,
    cards_count: page.count,
    cards_revenue: page.revenue,
    query: cardsQuery,
    comparison,
    totals_previous: previousRows ? previousTotalsOf(previousRows) : null,
    by_day_previous: previousRows ? salesByDay(previousRows, previous) : null,
    checks: checksOf(rows),
    by_week: checksByWeek(rows, period),
    by_category: byCategory(rows, categoryOf, previousRows),
    by_warehouse: byWarehouse(rows),
    by_region: byRegion(rows),
    rating: sellerRating({
      label: adapter.label,
      hasKey,
      endpoint: ratingEndpoint,
      lastCall: ratingCall,
      /**
       * No import mirrors the seller rating: no kind of run asks the method
       * and no table holds its answer (see `RATING_ENDPOINTS`). `null` is that
       * fact, not a placeholder for a number we could have made up.
       */
      stored: null,
    }),
    connection: await readConnection(req, adapter, tenant.id, hasKey, totals.orders),
  };
};
