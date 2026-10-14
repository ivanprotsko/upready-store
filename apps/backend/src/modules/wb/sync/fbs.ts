import { pagesOf } from "../../marketplace/batch";
import {
  type WbSyncDeps,
  asText,
  asNumber,
  asDate,
  type WbRunCounter,
  type WbReader,
  type Upsert,
  pagedList,
  upsertRows,
} from "./core";

/**
 * The FBS desk imports: supplies and the seller's own FBS orders.
 *
 * `../sync.ts` runs the imports and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/**
 * `GET /api/v3/supplies`: "Pagination parameter. Sets the limit for the amount
 * of data returned", `integer [ 1 .. 1000 ]`. Same bounds for `GET /api/v3/orders`.
 */
const FBS_PAGE = 1000;

/**
 * `POST /api/v3/orders/status`: `orders` is "Array of integers [ 1 .. 1000 ]
 * items".
 */
const FBS_STATUS_CHUNK = 1000;

/**
 * The FBS category allows 300 requests a minute, so pagination is bounded well
 * above one cabinet's worth of orders and well below the limit.
 */
const FBS_MAX_PAGES = 20;

/**
 * What an assembly order carries that this platform has no use for: the
 * buyer's delivery address, the note they left and their WB user id. Dropped
 * before the row is written — the desk needs a status and an article, and a
 * shop's database is not the place for a stranger's address (measured
 * 2026-09-16: `address` and `userId` are objects, `comment` a string).
 */
const FBS_ORDER_PII_FIELDS = ["address", "comment", "userId"] as const;

const stripOrderPii = (order: Record<string, unknown>): Record<string, unknown> => {
  const copy = { ...order };
  for (const field of FBS_ORDER_PII_FIELDS) {
    delete copy[field];
  }
  return copy;
};

/** Drops the keys a source did not carry, so one import never blanks another's column. */
const omitUndefined = (values: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

type FbsOrder = Record<string, unknown> & { id?: number };

/**
 * One mirror row from one assembly order.
 *
 * `GET /api/v3/orders/new` and `GET /api/v3/orders` answer with almost the
 * same object, and the difference matters: only the second carries `supplyId`,
 * only the first carries `requiredMeta`/`optionalMeta`. So a field the source
 * did not send stays `undefined` and is dropped, rather than being written as
 * `null` over what the other import already knew (rule 20a).
 */
const fbsOrderRow = (order: FbsOrder, fetchedAt: Date): Upsert => ({
  keys: { order_id: String(order.id) },
  values: omitUndefined({
    rid: asText(order.rid),
    order_uid: asText(order.orderUid),
    supply_id: "supplyId" in order ? asText(order.supplyId) : undefined,
    nm_id: asText(order.nmId),
    chrt_id: asText(order.chrtId),
    article: asText(order.article),
    skus: order.skus ?? null,
    price: asNumber(order.price),
    converted_price: asNumber(order.convertedPrice),
    currency_code: asText(order.currencyCode),
    delivery_type: asText(order.deliveryType),
    cargo_type: asNumber(order.cargoType),
    warehouse_id: asText(order.warehouseId),
    office_id: asText(order.officeId),
    wb_created_at: asDate(order.createdAt),
    source: "wb",
    fetched_at: fetchedAt,
    raw: stripOrderPii(order),
  }),
});

/** `GET /api/v3/supplies`, WB's "Returns the supplies list", `next`-paginated. */
export const syncSupplies = async (
  deps: WbSyncDeps,
  read: WbReader,
  counter: WbRunCounter,
): Promise<void> => {
  type Supply = Record<string, unknown> & { id?: string };
  type Answer = { next?: number; supplies?: Supply[] };

  let next = 0;

  for (let page = 0; page < FBS_MAX_PAGES; page += 1) {
    const answer = await read<Answer>("marketplace.fbs.supplies", {
      query: { limit: FBS_PAGE, next },
    });

    const supplies = answer.supplies ?? [];
    if (!supplies.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.wb,
      "WbSupply",
      deps.tenantId,
      supplies
        .filter((supply) => Boolean(supply.id))
        .map((supply) => ({
          keys: { supply_id: String(supply.id) },
          values: {
            name: asText(supply.name),
            done: supply.done === true,
            cargo_type: asNumber(supply.cargoType),
            destination_office_id: asText(supply.destinationOfficeId),
            wb_created_at: asDate(supply.createdAt),
            closed_at: asDate(supply.closedAt),
            scan_dt: asDate(supply.scanDt),
            source: "wb",
            fetched_at: fetchedAt,
            raw: supply,
          },
        })),
    );

    deps.logger.info(`[wb] supplies page ${page + 1}: ${supplies.length} supplies from next=${next}`);

    if (supplies.length < FBS_PAGE || answer.next === undefined || answer.next === next) {
      break;
    }
    next = answer.next;
  }
};

/**
 * The FBS desk's own import: new assembly orders, the recent ones with their
 * supply, and then the statuses of everything mirrored.
 *
 * The statuses are a SECOND request on purpose. Neither order method returns
 * `supplierStatus` (measured 2026-09-16: the field is not in either answer),
 * and the desk's whole job is deciding which action an order is eligible for,
 * so a mirror without statuses would be a list nobody can act on.
 */
export const syncFbsOrders = async (
  deps: WbSyncDeps,
  read: WbReader,
  counter: WbRunCounter,
): Promise<void> => {
  type NewAnswer = { orders?: FbsOrder[] };
  type ListAnswer = { next?: number; orders?: FbsOrder[] };
  type StatusLine = {
    id?: number;
    supplierStatus?: string;
    wbStatus?: string;
    isCancellable?: boolean;
    isTransferable?: boolean;
  };

  const newOrders = (await read<NewAnswer>("marketplace.fbs.orders.new")).orders ?? [];
  if (newOrders.length) {
    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.wb,
      "WbFbsOrder",
      deps.tenantId,
      newOrders.filter((order) => order.id !== undefined).map((order) => fbsOrderRow(order, fetchedAt)),
    );
  }
  deps.logger.info(`[wb] fbs new orders: ${newOrders.length}`);

  let next = 0;
  for (let page = 0; page < FBS_MAX_PAGES; page += 1) {
    const answer = await read<ListAnswer>("marketplace.fbs.orders", {
      query: { limit: FBS_PAGE, next },
    });

    const orders = answer.orders ?? [];
    if (!orders.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.wb,
      "WbFbsOrder",
      deps.tenantId,
      orders.filter((order) => order.id !== undefined).map((order) => fbsOrderRow(order, fetchedAt)),
    );

    deps.logger.info(`[wb] fbs orders page ${page + 1}: ${orders.length} orders from next=${next}`);

    if (orders.length < FBS_PAGE || answer.next === undefined || answer.next === next) {
      break;
    }
    next = answer.next;
  }

  // Statuses for everything in the mirror, WB's own 1000-per-request chunks.
  // The mirror is read for its order numbers only, a page at a time: this used
  // to load all 11 170 rows with their `raw` answer on every run.
  const ids: number[] = [];
  for await (const page of pagesOf(
    pagedList<{ id: string; order_id: string }>(deps.wb, "WbFbsOrder"),
    { tenant_id: deps.tenantId },
    ["id", "order_id"],
  )) {
    for (const row of page) {
      const id = Number(row.order_id);
      if (Number.isSafeInteger(id)) {
        ids.push(id);
      }
    }
  }

  if (!ids.length) {
    deps.logger.warn(
      `[wb] no FBS orders in the mirror for tenant ${deps.tenantId}, so no statuses were asked for`,
    );
    return;
  }

  for (let offset = 0; offset < ids.length; offset += FBS_STATUS_CHUNK) {
    const chunk = ids.slice(offset, offset + FBS_STATUS_CHUNK);
    const answer = await read<{ orders?: StatusLine[] }>("marketplace.fbs.orders.status", {
      body: { orders: chunk },
    });

    const lines = answer.orders ?? [];
    const fetchedAt = new Date();

    counter.rows += await upsertRows(
      deps.wb,
      "WbFbsOrder",
      deps.tenantId,
      lines
        .filter((line) => line.id !== undefined)
        .map((line) => ({
          keys: { order_id: String(line.id) },
          values: {
            supplier_status: asText(line.supplierStatus),
            wb_status: asText(line.wbStatus),
            is_cancellable:
              typeof line.isCancellable === "boolean" ? line.isCancellable : null,
            is_transferable:
              typeof line.isTransferable === "boolean" ? line.isTransferable : null,
            status_fetched_at: fetchedAt,
            source: "wb",
            fetched_at: fetchedAt,
          },
        })),
    );

    deps.logger.info(
      `[wb] fbs statuses: ${lines.length} answers for ${chunk.length} assembly orders`,
    );
  }
};
