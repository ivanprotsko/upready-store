import type { Logger } from "@medusajs/framework/types";
import { chunk, pagesOf, type PagedList } from "../marketplace/batch";
import type WbModuleService from "./service";
import { WB_SYNC_KINDS, type WbSyncKind } from "./models/wb-sync-run";
import { WbApiError, wbRead, type WbApiCallRecord } from "./transport";

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

/**
 * What an operator may narrow for one run (w03-wb-sales-questions-mirror).
 * Only the analytics import takes anything, because it is the one WB caps at
 * 20 listings per request: the operator can name the listings instead of
 * accepting the ranking below.
 */
export type WbSyncLimits = {
  /** How many listings the analytics import covers in one run. */
  analyticsCards?: number;
  /** Exactly these WB numbers, instead of the ranking. */
  nmIds?: string[];
  /**
   * Which half of the questions to import, when only one of them is worth a
   * request. `isAnswered` is a required WB parameter, so the import normally
   * makes both passes — and on a base token the whole Feedbacks and Questions
   * category shares 5 requests per hour (measured 2026-09-16 05:13 and 05:20
   * WITA: WB answered 429 asking for 720 s and then 266 s). With two passes
   * the first one always spends the budget, so an operator who needs the
   * other half has to be able to say so.
   */
  questionsAnswered?: boolean;
};

export type WbSyncDeps = {
  wb: WbModuleService;
  tenantId: string;
  token: string;
  logger: Pick<Logger, "info" | "warn" | "error">;
  limits?: WbSyncLimits;
};

export type WbSyncOutcome = {
  kind: WbSyncKind;
  runId: string;
  rows: number;
  requests: number;
  status: "succeeded" | "rate_limited" | "failed";
  error: string | null;
  /** Set only for `rate_limited`: when WB said this kind may be read again. */
  retryAt: Date | null;
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

/**
 * The sales feed keeps the same 90 days, and its own rate limit is stricter
 * than the orders one: the docs table gives a base token 1 request per
 * 2 hours here against 1 per 3 hours there. The page cap is the same guard
 * against a cursor that stops moving.
 */
const SALES_WINDOW_DAYS = 90;
const SALES_MAX_PAGES = 5;

/**
 * `GET /api/v1/questions`: "the maximum possible value for the parameter is
 * 10,000, and the total amount of take and skip parameters must not exceed
 * 10,000".
 */
const QUESTIONS_PAGE = 1000;
const QUESTIONS_WINDOW = 10_000;

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

export type MirrorEntity =
  | "WbProduct"
  | "WbPrice"
  | "WbStock"
  | "WbOrder"
  | "WbSale"
  | "WbFeedback"
  | "WbQuestion"
  | "WbAnalyticsDaily"
  | "WbFbsOrder"
  | "WbSupply";

/**
 * The plural `MedusaService` builds each model's methods from, written out
 * instead of appended as an "s" (w03-wb-sales-questions-mirror).
 *
 * The framework pluralizes the model name, and English pluralization is not
 * concatenation: `WbAnalyticsDaily` becomes `listWbAnalyticsDailies`, so
 * `list${entity}s` would call a method that does not exist and fail at the
 * first row rather than at boot. `__tests__/service-methods.unit.spec.ts`
 * checks every name in this map against the real service.
 */
export const MIRROR_PLURAL: Record<MirrorEntity, string> = {
  WbProduct: "WbProducts",
  WbPrice: "WbPrices",
  WbStock: "WbStocks",
  WbOrder: "WbOrders",
  WbSale: "WbSales",
  WbFeedback: "WbFeedbacks",
  WbQuestion: "WbQuestions",
  WbAnalyticsDaily: "WbAnalyticsDailies",
  // w23: `WbSupply` pluralises to `WbSupplies`, which is exactly why this map
  // exists — `list${entity}s` would have called `listWbSupplys`.
  WbFbsOrder: "WbFbsOrders",
  WbSupply: "WbSupplies",
};

/** One generated `list…` method of the module service, shaped for a paged read. */
const pagedList = <Row>(wb: WbModuleService, entity: MirrorEntity): PagedList<Row> => {
  const service = wb as unknown as Record<string, (...input: unknown[]) => Promise<unknown>>;
  return service[`list${MIRROR_PLURAL[entity]}`].bind(wb) as unknown as PagedList<Row>;
};

/**
 * Writes the mirror rows of one answer through the module service. Existing
 * rows are matched on the model's own unique key inside this tenant, so a
 * second run of the same import updates and never duplicates.
 *
 * NO CALL CARRIES MORE THAN `MP_BATCH_SIZE` ROWS OR KEYS (t-2026-10-06-21).
 * The statistics feed answers with everything that changed in its window in
 * one array, 25 597 orders on 2026-10-06, and this function used to hand that
 * array to the service whole. The lookup then loaded every matched row with
 * its `raw` answer, and `update` loaded them all a second time by a chain of
 * one `id = ?` per row. Both are now asked a batch at a time, and the lookup
 * reads the id and the key columns only, which is all it compares.
 *
 * The ids are resolved for the whole answer BEFORE the first write, exactly as
 * the single lookup did, so which row is created and which is updated does not
 * depend on where a batch happens to end.
 */
export const upsertRows = async (
  wb: WbModuleService,
  entity: MirrorEntity,
  tenantId: string,
  rows: Upsert[],
): Promise<number> => {
  if (!rows.length) {
    return 0;
  }

  const service = wb as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const plural = MIRROR_PLURAL[entity];
  const list = pagedList<Record<string, unknown> & { id: string }>(wb, entity);
  const create = service[`create${plural}`].bind(wb);
  const update = service[`update${plural}`].bind(wb);

  const keyNames = Object.keys(rows[0].keys);
  const keyOf = (source: Record<string, unknown>) =>
    keyNames.map((name) => String(source[name])).join(" ");

  const byKey = new Map<string, string>();
  for (const batch of chunk(rows)) {
    const filter = {
      tenant_id: tenantId,
      ...Object.fromEntries(
        keyNames.map((name) => [name, [...new Set(batch.map((row) => row.keys[name]))]]),
      ),
    };
    for await (const page of pagesOf(list, filter, ["id", ...keyNames])) {
      for (const row of page) {
        byKey.set(keyOf(row), row.id);
      }
    }
  }

  const toCreate = new Map<string, Record<string, unknown>>();
  const toUpdate: Record<string, unknown>[] = [];

  /**
   * One ANSWER can carry the same key twice (w03: WB's sales feed repeats an
   * `srid` when it holds both the sale and its return). Matching against the
   * rows already in the database is not enough for that: neither copy exists
   * yet, both land in the insert, and the batch dies on the unique index with
   * "already exists" after writing nothing at all — which is what happened on
   * the first live sales run, 2026-09-16 05:12 WITA.
   *
   * So the batch is deduplicated against ITSELF too, keeping the later row:
   * WB sends its pages newest-first, and within one page the later copy is the
   * one it wants us to end on.
   */
  for (const row of rows) {
    const key = keyOf(row.keys);
    const id = byKey.get(key);
    if (id) {
      toUpdate.push({ id, ...row.values });
    } else {
      toCreate.set(key, { tenant_id: tenantId, ...row.keys, ...row.values });
    }
  }

  for (const batch of chunk([...toCreate.values()])) {
    await create(batch);
  }
  for (const batch of chunk(toUpdate)) {
    await update(batch);
  }

  return toCreate.size + toUpdate.length;
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
      "WbProduct",
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
      "WbPrice",
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

  const chrtIds: number[] = [];
  const bySku = new Map<string, { chrt_id: string | null; nm_id: string }>();

  /** Two columns of the card mirror, a page at a time: the size ids are all this import reads. */
  for await (const products of pagesOf(
    pagedList<{ id: string; nm_id: string; sizes: unknown }>(deps.wb, "WbProduct"),
    { tenant_id: deps.tenantId },
    ["id", "nm_id", "sizes"],
  )) {
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
        "WbStock",
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
const syncSales = async (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter): Promise<void> => {
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
        "WbFeedback",
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
 * `GET /api/v1/questions`, both halves, since `isAnswered` is required here
 * too. The answering method is a PATCH on the same path and is not, and
 * cannot be, in the registry.
 */
const syncQuestions = async (
  deps: WbSyncDeps,
  read: WbReader,
  counter: WbRunCounter,
): Promise<void> => {
  type Question = Record<string, unknown> & { id?: string };
  type Answer = {
    data?: { countUnanswered?: number; countArchive?: number; questions?: Question[] };
  };

  const passes =
    deps.limits?.questionsAnswered === undefined ? [false, true] : [deps.limits.questionsAnswered];

  if (passes.length === 1) {
    deps.logger.info(
      `[wb] questions: only the isAnswered=${passes[0]} half this run, by WB_QUESTIONS_ANSWERED`,
    );
  }

  for (const isAnswered of passes) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const skip = page * QUESTIONS_PAGE;
      if (skip + QUESTIONS_PAGE > QUESTIONS_WINDOW) {
        deps.logger.warn(
          `[wb] questions (isAnswered=${isAnswered}) stopped at skip ${skip}: WB caps ` +
            `take + skip at ${QUESTIONS_WINDOW}.`,
        );
        break;
      }

      const answer = await read<Answer>("feedbacks.questions", {
        query: { isAnswered, take: QUESTIONS_PAGE, skip, order: "dateDesc" },
      });

      const questions = answer.data?.questions ?? [];
      if (!questions.length) {
        break;
      }

      const fetchedAt = new Date();
      counter.rows += await upsertRows(
        deps.wb,
        "WbQuestion",
        deps.tenantId,
        questions
          .filter((question) => Boolean(question.id))
          .map((question) => {
            const details = (question.productDetails ?? {}) as Record<string, unknown>;
            const answerBody = (question.answer ?? null) as Record<string, unknown> | null;
            return {
              keys: { question_id: String(question.id) },
              values: {
                nm_id: asText(details.nmId),
                imt_id: asText(details.imtId),
                product_name: asText(details.productName),
                supplier_article: asText(details.supplierArticle),
                brand_name: asText(details.brandName),
                text: asText(question.text),
                answer_text: asText(answerBody?.text),
                state: asText(question.state),
                is_answered: isAnswered,
                was_viewed: typeof question.wasViewed === "boolean" ? question.wasViewed : null,
                is_warned: typeof question.isWarned === "boolean" ? question.isWarned : null,
                created_date: asDate(question.createdDate),
                source: "wb",
                fetched_at: fetchedAt,
                raw: question,
              },
            };
          }),
      );

      deps.logger.info(
        `[wb] questions (isAnswered=${isAnswered}) page ${page + 1}: ${questions.length} questions ` +
          `(WB counts ${answer.data?.countUnanswered ?? "?"} unanswered, ` +
          `${answer.data?.countArchive ?? "?"} archived)`,
      );

      if (questions.length < QUESTIONS_PAGE) {
        break;
      }
    }
  }
};

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
const syncAnalytics = async (
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

const IMPORTS: Record<
  WbSyncKind,
  (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter) => Promise<void>
> = {
  cards: syncCards,
  prices: syncPrices,
  stocks: syncStocks,
  orders: syncOrders,
  sales: syncSales,
  feedbacks: syncFeedbacks,
  questions: syncQuestions,
  analytics: syncAnalytics,
  supplies: syncSupplies,
  fbs_orders: syncFbsOrders,
};

/**
 * Runs one import and records it. The run row exists before the first request,
 * so a process killed mid-import leaves a `running` row rather than no trace.
 */
/**
 * What a thrown import means for the run row (w03-wb-sales-questions-mirror).
 *
 * A 429 is WB's SCHEDULE, not our defect: on a base token the limits are the
 * normal operating condition — questions and feedbacks share five requests an
 * hour, sales get one every two hours — so a run that hits one is waiting, and
 * a run that wrote rows before hitting it is a PARTIAL SUCCESS. Recording both
 * as `failed` put four red "с ошибкой" on the owner's screen for kinds that
 * were merely waiting, which reads as a broken integration.
 *
 * `retryAt` is taken from the 429's own header via `WbApiError.retryAfterMs` —
 * a value WB measured, never one we estimate. A 429 that named no window is
 * still `rate_limited`, just without a time to show.
 */
export const classifyRunFailure = (
  error: unknown,
): { status: "rate_limited" | "failed"; retryAt: Date | null; message: string } => {
  const message = error instanceof Error ? error.message : String(error);

  if (!(error instanceof WbApiError) || error.status !== 429) {
    return { status: "failed", retryAt: null, message };
  }

  return {
    status: "rate_limited",
    retryAt: error.retryAfterMs === null ? null : new Date(Date.now() + error.retryAfterMs),
    message,
  };
};

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
      retryAt: null,
    };
  } catch (error) {
    const { status: outcome, retryAt, message } = classifyRunFailure(error);
    const limited = outcome === "rate_limited";

    await deps.wb.updateWbSyncRuns({
      id: run.id,
      status: outcome,
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
      error: message,
      retry_at: retryAt,
    });

    if (limited) {
      const when = retryAt ? `, WB opens the window at ${retryAt.toISOString()}` : "";
      deps.logger.warn(
        `[wb] ${kind}: WB rate limit after ${counter.requests} requests and ${counter.rows} rows ` +
          `written${when}. This is not a failure — run this kind again later.`,
      );
    } else {
      deps.logger.error(
        `[wb] ${kind} failed after ${counter.requests} WB requests and ${counter.rows} rows ` +
          `written: ${message}`,
      );
    }

    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: outcome,
      error: message,
      retryAt,
    };
  }
};

/**
 * `--kind all` in the order the data depends on itself: stocks need the size
 * ids the cards import writes.
 */
export const ALL_SYNC_KINDS: readonly WbSyncKind[] = WB_SYNC_KINDS;
