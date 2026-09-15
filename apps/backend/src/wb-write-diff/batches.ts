import type { PriceDiffRow, StockDiffRow } from "./types";

/**
 * Turning diff rows into the request bodies the WB write registry accepts
 * (w21-wb-write-stocks-prices).
 *
 * Only rows whose action is `update` are ever batched. `equal` has nothing to
 * send and `skipped` is exactly the set we refused to guess about, so putting
 * either into a body would be the silent substitution rule 20a is about.
 *
 * ## Where these numbers come from, and where they do NOT
 *
 * The ARRAY and its bounds are quoted from WB's own documentation, in the
 * copies this repository keeps:
 *
 *   PUT /api/v3/stocks/{warehouseId} — "stocks, required, Array of objects
 *   [ 1 .. 1000 ] items, Array of size IDs and amounts"
 *   (artifacts/docs/w01-wb-readonly-client/docs/
 *    dev-wildberries-ru-ru-docs-openapi-item-management.txt, lines 4798-4805)
 *
 *   POST /api/v2/upload/task — "data, required, Array of objects, Items,
 *   prices and discounts. Maximum 1,000 items. Both price and discount can not
 *   be empty" (the same file, lines 3080-3086)
 *
 * The FIELDS INSIDE those objects are not in the saved copies: both pages
 * render their request sample collapsed (`{"stocks": [{}]}`, `{"data": [{}]}`)
 * and the extracted text carries the collapse verbatim. The pages could not be
 * re-read for this task either — Ivan's notice of 2026-09-16 07:07 WITA: WB's
 * anti-bot has banned this machine's public IP (HTTP 498), so dev.wildberries.ru
 * is not to be opened from here at all.
 *
 *   docs missing: https://dev.wildberries.ru/ru/docs/openapi/item-management#tag/sellerWarehousesInventory
 *   docs missing: https://dev.wildberries.ru/ru/docs/openapi/item-management#tag/pricesAndDiscounts
 *
 * So the field names below are NOT presented as documented. Each one is the
 * name WB itself uses for that quantity in the response this repository has
 * already read and mirrored, which is the strongest source available without
 * the page (rule 17a: a real source, never training memory):
 *
 *   `sku`     — `POST /api/v3/stocks/{warehouseId}` answers inventory lines
 *               keyed by `sku` (the barcode) with an `amount`; `modules/wb/
 *               sync.ts` reads `line.sku` and `line.amount`, and 11 605 rows of
 *               `wb_stock` were filled from it.
 *   `amount`  — the same response.
 *   `nmID`    — WB's item number in every content and price response
 *               (`wb_product.nm_id`, `wb_price.nm_id`).
 *   `price`,
 *   `discount`— the two fields `GET /api/v2/list/goods/filter` returns per
 *               item, mirrored into `wb_price`.
 *
 * This is why the registry's `bodySchema` still validates only what the docs
 * DO state (the array and its bounds, `write-endpoints.ts`): nothing in this
 * repository claims the item shape is verified. It costs nothing today,
 * because gate (e) of the write core is shut and these bodies only ever reach
 * an audit row.
 */

/** "Array of objects [ 1 .. 1000 ] items", `PUT /api/v3/stocks/{warehouseId}`. */
export const WB_STOCKS_BATCH_MAX = 1000;

/** "Maximum 1,000 items", `POST /api/v2/upload/task`. */
export const WB_PRICES_BATCH_MAX = 1000;

/** One call the push would make: the registry entry, its path params and its body. */
export type WbWriteBatch = {
  endpointId: string;
  params: Record<string, string | number>;
  body: Record<string, unknown>;
  /** How many diff rows this batch carries, for the log line and the audit reader. */
  rows: number;
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
};

/**
 * One batch per warehouse, then per 1000 items: the warehouse is in the PATH,
 * so lines for two warehouses can never share a request however small they are.
 */
export const stockBatches = (
  rows: StockDiffRow[],
  batchMax: number = WB_STOCKS_BATCH_MAX,
): WbWriteBatch[] => {
  const byWarehouse = new Map<string, StockDiffRow[]>();

  for (const row of rows) {
    if (row.action !== "update" || !row.warehouse_id || !row.barcode || row.store_value === null) {
      continue;
    }
    const bucket = byWarehouse.get(row.warehouse_id);
    if (bucket) {
      bucket.push(row);
    } else {
      byWarehouse.set(row.warehouse_id, [row]);
    }
  }

  const batches: WbWriteBatch[] = [];

  for (const [warehouseId, warehouseRows] of byWarehouse) {
    for (const part of chunk(warehouseRows, batchMax)) {
      batches.push({
        endpointId: "wb.stocks.update",
        params: { warehouseId },
        body: {
          stocks: part.map((row) => ({ sku: row.barcode, amount: row.store_value })),
        },
        rows: part.length,
      });
    }
  }

  return batches;
};

/**
 * Batches of at most 1000 items for `POST /api/v2/upload/task`.
 *
 * `discount` is carried through unchanged from the mirror: this task moves the
 * PRICE and never the discount, and WB's own page states that price and
 * discount cannot BOTH be empty, so the pair is what a request carries.
 */
export const priceBatches = (
  rows: PriceDiffRow[],
  batchMax: number = WB_PRICES_BATCH_MAX,
): WbWriteBatch[] => {
  const updates = rows.filter((row) => row.action === "update" && row.proposed_price !== null);

  return chunk(updates, batchMax).map((part) => ({
    endpointId: "wb.prices.upload-task",
    params: {},
    body: {
      data: part.map((row) => ({
        nmID: Number(row.nm_id),
        price: row.proposed_price,
        discount: row.wb_discount ?? 0,
      })),
    },
    rows: part.length,
  }));
};
