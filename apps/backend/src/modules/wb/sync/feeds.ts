import {
  type WbSyncDeps,
  asText,
  asNumber,
  asDate,
  type WbRunCounter,
  type WbReader,
  upsertRows,
} from "./core";

/**
 * The statistics feeds: orders and sales.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/**
 * WB keeps statistics orders for "no more than 90 days", and the statistics
 * category allows one request per minute, so the default window is the whole
 * retention and the page count is bounded rather than open.
 */
const ORDERS_WINDOW_DAYS = 90;
const ORDERS_MAX_PAGES = 5;

/**
 * The sales feed keeps the same 90 days, and its own rate limit is stricter
 * than the orders one: the docs table gives a base token 1 request per
 * 2 hours here against 1 per 3 hours there. The page cap is the same guard
 * against a cursor that stops moving.
 */
const SALES_WINDOW_DAYS = 90;
const SALES_MAX_PAGES = 5;

/** `GET /api/v1/supplier/orders`, the statistics feed, `lastChangeDate`-paginated. */
export const syncOrders = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Order = Record<string, unknown> & { srid?: string; lastChangeDate?: string };

  let dateFrom = new Date(Date.now() - ORDERS_WINDOW_DAYS * 86_400_000).toISOString();
  for (let page = 0; page < ORDERS_MAX_PAGES; page += 1) {
    const orders = await read<Order[]>("statistics.orders", { query: { dateFrom, flag: 0 } });
    if (!orders?.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.wb,
      "WbOrder",
      deps.tenantId,
      orders
        .filter((order) => Boolean(order.srid))
        .map((order) => ({
          keys: { srid: String(order.srid) },
          values: {
            nm_id: asText(order.nmId),
            supplier_article: asText(order.supplierArticle),
            barcode: asText(order.barcode),
            total_price: asNumber(order.totalPrice),
            discount_percent: asNumber(order.discountPercent),
            finished_price: asNumber(order.finishedPrice),
            is_cancel: order.isCancel === true,
            warehouse_name: asText(order.warehouseName),
            region_name: asText(order.regionName),
            order_date: asDate(order.date),
            last_change_date: asDate(order.lastChangeDate),
            source: "wb",
            fetched_at: fetchedAt,
            raw: order,
          },
        })),
    );

    deps.logger.info(`[wb] orders page ${page + 1}: ${orders.length} lines from ${dateFrom}`);

    const next = orders[orders.length - 1]?.lastChangeDate;
    if (!next || next === dateFrom) {
      break;
    }
    dateFrom = String(next);

    if (page + 1 === ORDERS_MAX_PAGES) {
      deps.logger.warn(
        `[wb] orders stopped at the ${ORDERS_MAX_PAGES}-page cap with data left from ${dateFrom}. ` +
          "The statistics category allows one request per minute, so the rest waits for the next run.",
      );
    }
  }

};

/**
 * `GET /api/v1/supplier/sales`, the sibling of the orders feed.
 *
 * Incremental: `dateFrom` starts at the newest `last_change_date` already in
 * the mirror, so a second run asks WB only for what changed since the first
 * one. With an empty mirror it starts at WB's own retention edge (90 days),
 * because asking for more would return nothing anyway.
 *
 * WB's paging rule for this feed, quoted: "In the second and subsequent
 * requests, use the full value of the lastChangeDate field of the last row
 * from the response of the previous request in the dateFrom parameter."
 */
export const syncSales = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Sale = Record<string, unknown> & { srid?: string; lastChangeDate?: string };

  const known = (await deps.wb.listWbSales(
    { tenant_id: deps.tenantId },
    { order: { last_change_date: "DESC" }, take: 1 },
  )) as Array<{ last_change_date: Date | string | null }>;

  const newest = known[0]?.last_change_date ?? null;
  let dateFrom = newest
    ? new Date(newest).toISOString()
    : new Date(Date.now() - SALES_WINDOW_DAYS * 86_400_000).toISOString();

  deps.logger.info(
    `[wb] sales start from ${dateFrom} ` +
      `(${newest ? "the newest lastChangeDate in the mirror" : `WB keeps ${SALES_WINDOW_DAYS} days`})`,
  );

  for (let page = 0; page < SALES_MAX_PAGES; page += 1) {
    const sales = await read<Sale[]>("statistics.sales", { query: { dateFrom, flag: 0 } });
    if (!sales?.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.wb,
      "WbSale",
      deps.tenantId,
      sales
        .filter((sale) => Boolean(sale.srid))
        .map((sale) => ({
          // The line's identity is the pair: one `srid` (the order) arrives
          // twice when the feed carries both the sale and its return.
          keys: { srid: String(sale.srid), sale_id: asText(sale.saleID) },
          values: {
            nm_id: asText(sale.nmId),
            supplier_article: asText(sale.supplierArticle),
            barcode: asText(sale.barcode),
            tech_size: asText(sale.techSize),
            category: asText(sale.category),
            subject: asText(sale.subject),
            brand: asText(sale.brand),
            total_price: asNumber(sale.totalPrice),
            discount_percent: asNumber(sale.discountPercent),
            spp: asNumber(sale.spp),
            price_with_disc: asNumber(sale.priceWithDisc),
            finished_price: asNumber(sale.finishedPrice),
            for_pay: asNumber(sale.forPay),
            payment_sale_amount: asNumber(sale.paymentSaleAmount),
            is_supply: typeof sale.isSupply === "boolean" ? sale.isSupply : null,
            is_realization: typeof sale.isRealization === "boolean" ? sale.isRealization : null,
            warehouse_name: asText(sale.warehouseName),
            warehouse_type: asText(sale.warehouseType),
            country_name: asText(sale.countryName),
            oblast_okrug_name: asText(sale.oblastOkrugName),
            region_name: asText(sale.regionName),
            sale_date: asDate(sale.date),
            last_change_date: asDate(sale.lastChangeDate),
            source: "wb",
            fetched_at: fetchedAt,
            raw: sale,
          },
        })),
    );

    deps.logger.info(`[wb] sales page ${page + 1}: ${sales.length} lines from ${dateFrom}`);

    const next = sales[sales.length - 1]?.lastChangeDate;
    if (!next || next === dateFrom) {
      break;
    }
    dateFrom = String(next);

    if (page + 1 === SALES_MAX_PAGES) {
      deps.logger.warn(
        `[wb] sales stopped at the ${SALES_MAX_PAGES}-page cap with data left from ${dateFrom}. ` +
          "A base token gets one statistics request per 2 hours, so the rest waits for a later run.",
      );
    }
  }
};
