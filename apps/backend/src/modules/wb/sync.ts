import type { Logger } from "@medusajs/framework/types";
import type WbModuleService from "./service";
import { WB_SYNC_KINDS, type WbSyncKind } from "./models/wb-sync-run";
import { wbRead, type WbApiCallRecord } from "./transport";

/**
 * The imports (w01-wb-readonly-client). Every request in this file goes
 * through `wbRead`, which can only send a registered read; there is no other
 * way out of the process towards Wildberries.
 *
 * Each kind writes one `wb_sync_run` row: `running` at the start, then
 * `succeeded` or `failed` with the message. A failed run stays on file rather
 * than disappearing, so an empty mirror is never mistaken for "WB had nothing"
 * (rule 20a).
 *
 * Every mirror upsert is keyed on WB's own identity of the thing (nmID, or
 * warehouse plus sku, or srid, or the feedback id), which is what makes a
 * re-run update rows instead of doubling them.
 */

export type WbSyncDeps = {
  wb: WbModuleService;
  tenantId: string;
  token: string;
  logger: Pick<Logger, "info" | "warn" | "error">;
};

export type WbSyncOutcome = {
  kind: WbSyncKind;
  runId: string;
  rows: number;
  requests: number;
  status: "succeeded" | "failed";
  error: string | null;
};

/** Cards come 100 at a time; WB's own pagination example uses this limit. */
const CARDS_PAGE = 100;

/** `GET /api/v2/list/goods/filter`: "set limit=1000, and use the offset field". */
const PRICES_PAGE = 1000;

/** `POST /api/v3/stocks/{warehouseId}`: "Array of integers <= 1000 items". */
const STOCKS_CHUNK = 1000;

/** `GET /api/v1/feedbacks`: `take` is capped at 5000 by the docs. */
const FEEDBACKS_PAGE = 1000;

/**
 * WB keeps statistics orders for "no more than 90 days", and the statistics
 * category allows one request per minute, so the default window is the whole
 * retention and the page count is bounded rather than open.
 */
const ORDERS_WINDOW_DAYS = 90;
const ORDERS_MAX_PAGES = 5;

/** Guard against a cursor that stops moving: never loop forever on WB's answer. */
const MAX_PAGES = 200;

const asText = (value: unknown): string | null =>
  value === undefined || value === null || value === "" ? null : String(value);

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * What one run has done so far.
 *
 * Rows are counted HERE and not in a local variable inside each import,
 * because an import can fail halfway: WB's rate limits are per category and a
 * 429 arrives mid-pagination. A run that wrote 123 feedbacks and then hit a
 * 429 must report 123, not 0 (measured on the first live run, 2026-09-16
 * 04:13 WITA: `wb_feedback` held 123 rows while its run row said
 * `failed, 0 rows` — rule 20a, a zero that is not empty).
 */
export type WbRunCounter = { requests: number; rows: number };

/**
 * One `wbRead` bound to this run: the tenant, the key, the run id and the
 * journal writer are the same for every request the run makes, and the caller
 * only ever names an endpoint.
 */
const readerFor = (deps: WbSyncDeps, runId: string, counter: WbRunCounter) => {
  const journal = async (entry: WbApiCallRecord) => {
    await deps.wb.createWbApiCalls(entry);
  };

  return async <T>(
    endpointId: string,
    options: {
      params?: Record<string, string | number>;
      query?: Record<string, unknown>;
      body?: unknown;
    } = {},
  ): Promise<T> => {
    counter.requests += 1;
    const result = await wbRead<T>(endpointId, {
      token: deps.token,
      tenantId: deps.tenantId,
      syncRunId: runId,
      params: options.params,
      query: options.query as
        | Record<string, string | number | boolean | undefined | null>
        | undefined,
      body: options.body,
      journal,
      logger: deps.logger,
    });
    return result.data;
  };
};

type WbReader = ReturnType<typeof readerFor>;

type Upsert = { keys: Record<string, unknown>; values: Record<string, unknown> };

/**
 * The service method family a mirror is written through, in its PLURAL form.
 *
 * Plural and not singular because Medusa pluralises a model name with
 * `pluralize`, so `WbSupply` becomes `listWbSupplies` and not `listWbSupplys`:
 * a `list${entity}s` template would have built a method name that does not
 * exist, and the failure would have arrived at the first import rather than at
 * compile time.
 */
type MirrorEntity =
  | "WbProducts"
  | "WbPrices"
  | "WbStocks"
  | "WbOrders"
  | "WbFeedbacks"
  | "WbFbsOrders"
  | "WbSupplies";

/**
 * Writes one batch of mirror rows through the module service. Existing rows
 * are matched on the model's own unique key inside this tenant, so a second
 * run of the same import updates and never duplicates.
 */
const upsertRows = async (
  wb: WbModuleService,
  entity: MirrorEntity,
  tenantId: string,
  rows: Upsert[],
): Promise<number> => {
  if (!rows.length) {
    return 0;
  }

  const service = wb as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const list = service[`list${entity}`].bind(wb) as (
    filter: unknown,
  ) => Promise<Array<Record<string, unknown> & { id: string }>>;
  const create = service[`create${entity}`].bind(wb);
  const update = service[`update${entity}`].bind(wb);

  const keyNames = Object.keys(rows[0].keys);
  const existing = await list({
    tenant_id: tenantId,
    ...Object.fromEntries(
      keyNames.map((name) => [name, [...new Set(rows.map((row) => row.keys[name]))]]),
    ),
  });

  const keyOf = (source: Record<string, unknown>) =>
    keyNames.map((name) => String(source[name])).join(" ");
  const byKey = new Map(existing.map((row) => [keyOf(row), row.id]));

  const toCreate: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];

  for (const row of rows) {
    const id = byKey.get(keyOf(row.keys));
    if (id) {
      toUpdate.push({ id, ...row.values });
    } else {
      toCreate.push({ tenant_id: tenantId, ...row.keys, ...row.values });
    }
  }

  if (toCreate.length) {
    await create(toCreate);
  }
  if (toUpdate.length) {
    await update(toUpdate);
  }

  return rows.length;
};

/** `POST /content/v2/get/cards/list`, WB's "Returns the listings", cursor-paginated. */
const syncCards = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Card = Record<string, unknown> & { nmID?: number; updatedAt?: string };
  type Answer = { cards?: Card[]; cursor?: { updatedAt?: string; nmID?: number; total?: number } };

  let cursor: { updatedAt?: string; nmID?: number } = {};

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("content.cards.list", {
      query: { locale: "ru" },
      body: {
        settings: {
          sort: { ascending: true },
          cursor: { limit: CARDS_PAGE, ...cursor },
          filter: { withPhoto: -1 },
        },
      },
    });

    const cards = answer.cards ?? [];
    const fetchedAt = new Date();

    counter.rows += await upsertRows(
      deps.wb,
      "WbProducts",
      deps.tenantId,
      cards.map((card) => ({
        keys: { nm_id: String(card.nmID) },
        values: {
          imt_id: asText(card.imtID),
          vendor_code: asText(card.vendorCode),
          title: asText(card.title),
          brand: asText(card.brand),
          subject_id: asText(card.subjectID),
          subject_name: asText(card.subjectName),
          photos: card.photos ?? null,
          dimensions: card.dimensions ?? null,
          sizes: card.sizes ?? null,
          source: "wb",
          fetched_at: fetchedAt,
          wb_updated_at: asDate(card.updatedAt),
          raw: card,
        },
      })),
    );

    const total = answer.cursor?.total ?? cards.length;
    deps.logger.info(
      `[wb] cards page ${page + 1}: ${cards.length} listings (cursor total ${total})`,
    );

    if (total < CARDS_PAGE || !answer.cursor?.nmID) {
      break;
    }
    cursor = { updatedAt: answer.cursor.updatedAt, nmID: answer.cursor.nmID };
  }

};

/** `GET /api/v2/list/goods/filter`, WB's "Returns item data", offset-paginated. */
const syncPrices = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Good = Record<string, unknown> & { nmID?: number };
  type Answer = { data?: { listGoods?: Good[] } };

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await read<Answer>("prices.goods.filter", {
      query: { limit: PRICES_PAGE, offset: page * PRICES_PAGE },
    });

    const goods = answer.data?.listGoods ?? [];
    if (!goods.length) {
      break;
    }

    const fetchedAt = new Date();
    counter.rows += await upsertRows(
      deps.wb,
      "WbPrices",
      deps.tenantId,
      goods.map((good) => ({
        keys: { nm_id: String(good.nmID) },
        values: {
          vendor_code: asText(good.vendorCode),
          currency_iso: asText(good.currencyIsoCode4217),
          discount: asNumber(good.discount),
          club_discount: asNumber(good.clubDiscount),
          editable_size_price:
            typeof good.editableSizePrice === "boolean" ? good.editableSizePrice : null,
          sizes: good.sizes ?? null,
          source: "wb",
          fetched_at: fetchedAt,
          raw: good,
        },
      })),
    );

    deps.logger.info(`[wb] prices page ${page + 1}: ${goods.length} items`);

    if (goods.length < PRICES_PAGE) {
      break;
    }
  }

};

/**
 * `GET /api/v3/warehouses`, then `POST /api/v3/stocks/{warehouseId}`, which is
 * WB's "Get Inventory" and answers for the `chrtIds` it is given. The size ids
 * come from the cards already mirrored, so `cards` has to run first; with an
 * empty `wb_product` this import writes nothing and says so.
 */
const syncStocks = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Warehouse = { id?: number; name?: string };
  type StockLine = { sku?: string; amount?: number };

  const warehouses = await read<Warehouse[]>("marketplace.warehouses");
  if (!warehouses?.length) {
    deps.logger.warn("[wb] the cabinet has no seller warehouses, so there is no inventory to read");
    return;
  }

  const products = (await deps.wb.listWbProducts({ tenant_id: deps.tenantId })) as Array<{
    nm_id: string;
    sizes: unknown;
  }>;

  const chrtIds: number[] = [];
  const bySku = new Map<string, { chrt_id: string | null; nm_id: string }>();

  for (const product of products) {
    for (const size of (product.sizes as Array<Record<string, unknown>> | null) ?? []) {
      const chrtId = asNumber(size.chrtID);
      if (chrtId !== null) {
        chrtIds.push(chrtId);
      }
      for (const sku of (size.skus as string[] | undefined) ?? []) {
        bySku.set(String(sku), { chrt_id: asText(size.chrtID), nm_id: product.nm_id });
      }
    }
  }

  if (!chrtIds.length) {
    deps.logger.warn(
      `[wb] no size ids in wb_product for tenant ${deps.tenantId}: run the cards import first`,
    );
    return;
  }

  for (const warehouse of warehouses) {
    if (warehouse.id === undefined || warehouse.id === null) {
      continue;
    }
    for (let offset = 0; offset < chrtIds.length; offset += STOCKS_CHUNK) {
      const chunk = chrtIds.slice(offset, offset + STOCKS_CHUNK);
      const answer = await read<{ stocks?: StockLine[] }>("marketplace.stocks", {
        params: { warehouseId: warehouse.id },
        body: { chrtIds: chunk },
      });

      const lines = answer.stocks ?? [];
      const fetchedAt = new Date();

      counter.rows += await upsertRows(
        deps.wb,
        "WbStocks",
        deps.tenantId,
        lines
          .filter((line) => Boolean(line.sku))
          .map((line) => {
            const known = bySku.get(String(line.sku));
            return {
              keys: { warehouse_id: String(warehouse.id), sku: String(line.sku) },
              values: {
                warehouse_name: asText(warehouse.name),
                chrt_id: known?.chrt_id ?? null,
                nm_id: known?.nm_id ?? null,
                amount: asNumber(line.amount) ?? 0,
                source: "wb",
                fetched_at: fetchedAt,
                raw: line,
              },
            };
          }),
      );

      deps.logger.info(
        `[wb] stocks warehouse ${warehouse.id} (${warehouse.name ?? "?"}): ` +
          `${lines.length} lines for ${chunk.length} size ids`,
      );
    }
  }

};

/** `GET /api/v1/supplier/orders`, the statistics feed, `lastChangeDate`-paginated. */
const syncOrders = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
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
      "WbOrders",
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

/** `GET /api/v1/feedbacks`, both halves, since `isAnswered` is a required parameter. */
const syncFeedbacks = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
  type Feedback = Record<string, unknown> & { id?: string };
  type Answer = { data?: { feedbacks?: Feedback[] } };

  for (const isAnswered of [false, true]) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await read<Answer>("feedbacks.list", {
        query: { isAnswered, take: FEEDBACKS_PAGE, skip: page * FEEDBACKS_PAGE, order: "dateDesc" },
      });

      const feedbacks = answer.data?.feedbacks ?? [];
      if (!feedbacks.length) {
        break;
      }

      const fetchedAt = new Date();
      counter.rows += await upsertRows(
        deps.wb,
        "WbFeedbacks",
        deps.tenantId,
        feedbacks
          .filter((feedback) => Boolean(feedback.id))
          .map((feedback) => {
            const details = (feedback.productDetails ?? {}) as Record<string, unknown>;
            return {
              keys: { feedback_id: String(feedback.id) },
              values: {
                nm_id: asText(details.nmId),
                product_valuation: asNumber(feedback.productValuation),
                text: asText(feedback.text),
                pros: asText(feedback.pros),
                cons: asText(feedback.cons),
                user_name: asText(feedback.userName),
                is_answered: isAnswered,
                created_date: asDate(feedback.createdDate),
                source: "wb",
                fetched_at: fetchedAt,
                raw: feedback,
              },
            };
          }),
      );

      deps.logger.info(
        `[wb] feedbacks (isAnswered=${isAnswered}) page ${page + 1}: ${feedbacks.length} reviews`,
      );

      if (feedbacks.length < FEEDBACKS_PAGE) {
        break;
      }
    }
  }

};

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
const syncSupplies = async (
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
      "WbSupplies",
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
const syncFbsOrders = async (
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
      "WbFbsOrders",
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
      "WbFbsOrders",
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
  const mirrored = (await deps.wb.listWbFbsOrders({ tenant_id: deps.tenantId })) as Array<{
    order_id: string;
  }>;

  const ids = mirrored
    .map((row) => Number(row.order_id))
    .filter((id) => Number.isSafeInteger(id));

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
      "WbFbsOrders",
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

const IMPORTS: Record<
  WbSyncKind,
  (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter) => Promise<void>
> = {
  cards: syncCards,
  prices: syncPrices,
  stocks: syncStocks,
  orders: syncOrders,
  feedbacks: syncFeedbacks,
  supplies: syncSupplies,
  fbs_orders: syncFbsOrders,
};

/**
 * Runs one import and records it. The run row exists before the first request,
 * so a process killed mid-import leaves a `running` row rather than no trace.
 */
export const runSync = async (deps: WbSyncDeps, kind: WbSyncKind): Promise<WbSyncOutcome> => {
  const run = (await deps.wb.createWbSyncRuns({
    tenant_id: deps.tenantId,
    kind,
    status: "running",
    started_at: new Date(),
    rows: 0,
    requests: 0,
  })) as { id: string };

  const counter: WbRunCounter = { requests: 0, rows: 0 };
  const read = readerFor(deps, run.id, counter);

  try {
    await IMPORTS[kind](deps, read, counter);
    await deps.wb.updateWbSyncRuns({
      id: run.id,
      status: "succeeded",
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
    });
    deps.logger.info(`[wb] ${kind}: ${counter.rows} rows in ${counter.requests} WB requests`);
    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: "succeeded",
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.wb.updateWbSyncRuns({
      id: run.id,
      status: "failed",
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
      error: message,
    });
    deps.logger.error(
      `[wb] ${kind} failed after ${counter.requests} WB requests and ${counter.rows} rows ` +
        `written: ${message}`,
    );
    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: "failed",
      error: message,
    };
  }
};

/**
 * `--kind all` in the order the data depends on itself: stocks need the size
 * ids the cards import writes.
 */
export const ALL_SYNC_KINDS: readonly WbSyncKind[] = WB_SYNC_KINDS;
