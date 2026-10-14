import { pagesOf } from "../../marketplace/batch";
import {
  type WbSyncDeps,
  asText,
  asNumber,
  type WbRunCounter,
  type WbReader,
  type Upsert,
  pagedList,
  upsertRows,
} from "./core";

/**
 * The sales funnel analytics import.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/**
 * `POST /api/analytics/v3/sales-funnel/products/history`: `nmIds` is
 * "Array of integers <uint64> [ 1 .. 20 ] items" and the window is "a maximum
 * of the last week". Both are WB's, quoted from the docs page saved next to
 * this branch's report.
 */
const ANALYTICS_CHUNK = 20;
const ANALYTICS_WINDOW_DAYS = 7;

/**
 * How many listings one run covers by default. One chunk, which is one WB
 * request: a base token gets 2 analytics requests per hour, so a default that
 * swept 423 listings would spend the whole hour's budget and fail halfway.
 * Raise it with `WB_ANALYTICS_CARDS` when the token allows.
 */
const ANALYTICS_CARDS_DEFAULT = 20;

/**
 * The days of the week, WB's own dates, from the newest back. WB's funnel
 * answers for whole days, so the window is built from dates and not from an
 * instant: `new Date()` here is the clock of this process, and the day WB
 * means is the Moscow one (the whole statistics API is documented in UTC+3).
 */
const funnelWindow = (days: number): { start: string; end: string } => {
  const moscowDay = (shift: number): string => {
    const at = new Date(Date.now() + 3 * 3_600_000 - shift * 86_400_000);
    return at.toISOString().slice(0, 10);
  };
  return { start: moscowDay(days - 1), end: moscowDay(0) };
};

/**
 * `POST /api/analytics/v3/sales-funnel/products/history`: the per-day funnel
 * of a listing (opens, adds to cart, orders, buyouts).
 *
 * Two of WB's limits decide the shape of this import, and neither is hidden:
 *
 *   - `nmIds` holds 1 to 20 listings per request, so the shop's listings are
 *     covered 20 at a time and the run says how many were left out;
 *   - the window is "a maximum of the last week".
 *
 * Which listings come first is a decision, so it is written down rather than
 * left to the order rows happen to sit in: the ones with the most sales in
 * the mirror, then the rest by WB number. A shop with an empty `wb_sale`
 * (the statistics feed is one request per 2 hours on a base token) simply
 * gets the first listings by number, and the log says which rule applied.
 */
export const syncAnalytics = async (
  deps: WbSyncDeps,
  read: WbReader,
  counter: WbRunCounter,
): Promise<void> => {
  type HistoryRow = Record<string, unknown> & { date?: string };
  type Entry = {
    product?: Record<string, unknown>;
    history?: HistoryRow[];
    currency?: string;
  };

  /** The ranking reads one column of each mirror, so one column is what is asked for. */
  const products: string[] = [];
  for await (const page of pagesOf(
    pagedList<{ id: string; nm_id: string }>(deps.wb, "WbProduct"),
    { tenant_id: deps.tenantId },
    ["id", "nm_id"],
  )) {
    for (const product of page) {
      products.push(product.nm_id);
    }
  }

  if (!products.length) {
    deps.logger.warn(
      `[wb] no listings in wb_product for tenant ${deps.tenantId}: run the cards import first`,
    );
    return;
  }

  const salesByNm = new Map<string, number>();
  for await (const page of pagesOf(
    pagedList<{ id: string; nm_id: string | null }>(deps.wb, "WbSale"),
    { tenant_id: deps.tenantId },
    ["id", "nm_id"],
  )) {
    for (const sale of page) {
      if (sale.nm_id) {
        salesByNm.set(sale.nm_id, (salesByNm.get(sale.nm_id) ?? 0) + 1);
      }
    }
  }

  const ranked = [...products].sort((left, right) => {
    const bySales = (salesByNm.get(right) ?? 0) - (salesByNm.get(left) ?? 0);
    return bySales !== 0 ? bySales : left.localeCompare(right);
  });

  const wanted = deps.limits?.nmIds?.length
    ? deps.limits.nmIds
    : ranked.slice(0, deps.limits?.analyticsCards ?? ANALYTICS_CARDS_DEFAULT);

  const window = funnelWindow(ANALYTICS_WINDOW_DAYS);
  deps.logger.info(
    `[wb] analytics covers ${wanted.length} of ${products.length} listings for ` +
      `${window.start}..${window.end} (WB takes ${ANALYTICS_CHUNK} listing numbers per request, ` +
      `ranked by ${salesByNm.size ? "sales in wb_sale" : "WB number, because wb_sale is empty"}). ` +
      `Listings left out: ${Math.max(products.length - wanted.length, 0)}.`,
  );

  for (let offset = 0; offset < wanted.length; offset += ANALYTICS_CHUNK) {
    const chunk = wanted.slice(offset, offset + ANALYTICS_CHUNK);
    const entries = await read<Entry[]>("analytics.funnel.history", {
      body: {
        selectedPeriod: window,
        nmIds: chunk.map((nmId) => Number(nmId)).filter((nmId) => Number.isFinite(nmId)),
        aggregationLevel: "day",
      },
    });

    const fetchedAt = new Date();
    const rows: Upsert[] = [];

    for (const entry of entries ?? []) {
      const product = entry.product ?? {};
      const nmId = asText(product.nmId);
      if (!nmId) {
        continue;
      }
      for (const day of entry.history ?? []) {
        const date = asText(day.date);
        if (!date) {
          continue;
        }
        rows.push({
          keys: { nm_id: nmId, date },
          values: {
            title: asText(product.title),
            vendor_code: asText(product.vendorCode),
            brand_name: asText(product.brandName),
            subject_id: asText(product.subjectId),
            subject_name: asText(product.subjectName),
            open_card: asNumber(day.openCount),
            add_to_cart: asNumber(day.cartCount),
            orders: asNumber(day.orderCount),
            ordered_sum: asNumber(day.orderSum),
            buyouts: asNumber(day.buyoutCount),
            buyout_sum: asNumber(day.buyoutSum),
            buyout_percent: asNumber(day.buyoutPercent),
            add_to_cart_percent: asNumber(day.addToCartConversion),
            cart_to_order_percent: asNumber(day.cartToOrderConversion),
            add_to_wishlist: asNumber(day.addToWishlistCount),
            currency: asText(entry.currency),
            period_start: window.start,
            period_end: window.end,
            source: "wb",
            fetched_at: fetchedAt,
            raw: day,
          },
        });
      }
    }

    counter.rows += await upsertRows(deps.wb, "WbAnalyticsDaily", deps.tenantId, rows);
    deps.logger.info(
      `[wb] analytics request ${Math.floor(offset / ANALYTICS_CHUNK) + 1}: ` +
        `${chunk.length} listings, ${rows.length} day rows`,
    );
  }
};
