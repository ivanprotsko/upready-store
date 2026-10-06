import { MP_KINDS, type MpKind, type SyncDeps } from "../../marketplace/contract";
import {
  callsOverBound,
  fullRow,
  recordingService,
  type Row,
} from "../../marketplace/__tests__/recording-service";
import { wbAdapter } from "../adapter";
import { WB_MODULE } from "../index";
import WbFbsOrder from "../models/wb-fbs-order";
import WbFeedback from "../models/wb-feedback";
import WbOrder from "../models/wb-order";
import WbPrice from "../models/wb-price";
import WbProduct from "../models/wb-product";
import WbQuestion from "../models/wb-question";
import WbStock from "../models/wb-stock";
import * as normalize from "../normalize";

/**
 * The loader reads a page at a time and only the columns `normalize` reads
 * (t-2026-10-06-21). That is safe only while the two agree: a column the
 * normalizer reads and the loader does not select becomes a `null` in the
 * normalized layer, on every row, with nothing failing.
 *
 * So the drafts are computed twice here, from the loader's rows and from whole
 * rows shaped the way the loader handed them before, with every column of
 * every model filled. The fake honours `select`, so the two differ the moment
 * the lists in `normalize.MIRROR_COLUMNS` fall behind the code next to them.
 *
 * `BOUND` is written here and not imported.
 */
const BOUND = 500;
const TENANT = "ten_columns";
const FETCHED = new Date("2026-10-06T01:00:00.000Z");

const padded = (index: number) => String(index).padStart(7, "0");
const many = <T>(count: number, build: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, index) => build(index));

const base = { tenant_id: TENANT, fetched_at: FETCHED, source: "wb" };

const seed = (orders: number) => ({
  WbProducts: many(3, (i) =>
    fullRow(WbProduct, `wbprod_${padded(i)}`, {
      ...base,
      nm_id: `${100 + i}`,
      vendor_code: `ART-${i}`,
      photos: [{ big: `https://example.test/${i}.webp` }],
      dimensions: { width: 10 + i },
      sizes: [{ chrtID: 500 + i, skus: [`2000${i}`] }],
      wb_updated_at: FETCHED,
      raw: { nmID: 100 + i, everything: "WB answered" },
    }),
  ),
  WbPrices: many(3, (i) =>
    fullRow(WbPrice, `wbprice_${padded(i)}`, {
      ...base,
      nm_id: `${100 + i}`,
      vendor_code: `ART-${i}`,
      currency_iso: "RUB",
      sizes: [{ sizeID: 500 + i, price: 1000 + i, discountedPrice: 900 + i }],
      raw: { nmID: 100 + i },
    }),
  ),
  /** The third card is priced and stocked nowhere, which is its own branch of `offers`. */
  WbStocks: many(2, (i) =>
    fullRow(WbStock, `wbstock_${padded(i)}`, {
      ...base,
      nm_id: `${100 + i}`,
      chrt_id: `${500 + i}`,
      warehouse_id: "7",
      amount: 4 + i,
      raw: { sku: `2000${i}`, amount: 4 + i },
    }),
  ),
  WbOrders: many(orders, (i) =>
    fullRow(WbOrder, `wbord_${padded(i)}`, {
      ...base,
      srid: `srid-${padded(i)}`,
      nm_id: `${100 + (i % 3)}`,
      finished_price: 900 + i,
      discount_percent: 10,
      is_cancel: i % 7 === 0,
      order_date: FETCHED,
      last_change_date: FETCHED,
      raw: { srid: `srid-${padded(i)}`, currencyCode: i % 2 ? "RUB" : "BYN", barcode: "2000000000001" },
    }),
  ),
  /** The first assembly order is the first statistics order, so one of the two is dropped. */
  WbFbsOrders: many(orders, (i) =>
    fullRow(WbFbsOrder, `wbfbs_${padded(i)}`, {
      ...base,
      order_id: `${7_000_000_000 + i}`,
      rid: i === 0 ? "srid-0000000" : `rid-${padded(i)}`,
      price: 81_600,
      converted_price: 81_600 + i,
      currency_code: "643",
      delivery_type: "fbs",
      supplier_status: i % 2 ? "confirm" : "cancel",
      wb_status: "waiting",
      wb_created_at: FETCHED,
      skus: ["2000000000001"],
      raw: { id: 7_000_000_000 + i },
    }),
  ),
  WbFeedbacks: many(3, (i) =>
    fullRow(WbFeedback, `wbfb_${padded(i)}`, {
      ...base,
      feedback_id: `fb-${i}`,
      /** The third feedback names a card the mirror does not hold. */
      nm_id: i === 2 ? "999" : `${100 + i}`,
      product_valuation: 5 - i,
      is_answered: i === 1,
      created_date: FETCHED,
      raw: { id: `fb-${i}` },
    }),
  ),
  WbQuestions: many(3, (i) =>
    fullRow(WbQuestion, `wbq_${padded(i)}`, {
      ...base,
      question_id: `q-${i}`,
      is_answered: i === 1,
      created_date: FETCHED,
      raw: { id: `q-${i}` },
    }),
  ),
  WbSyncRuns: [] as Row[],
  WbApiCalls: [] as Row[],
});

/** What `loadMirror` handed `normalize` before the bound: whole rows, tagged and joined. */
const wholeRows = (tables: ReturnType<typeof seed>, kind: MpKind): unknown[] => {
  if (kind === "products") {
    return tables.WbProducts;
  }
  if (kind === "offers") {
    return [
      ...tables.WbPrices.map((row) => ({ source: "price", row })),
      ...tables.WbStocks.map((row) => ({ source: "stock", row })),
    ];
  }
  if (kind === "orders") {
    return [
      ...tables.WbOrders.map((row) => ({ source: "statistics", row })),
      ...tables.WbFbsOrders.map((row) => ({ source: "fbs", row })),
    ];
  }
  if (kind === "reviews") {
    const byNmId = new Map(
      tables.WbProducts.map((row) => [String(row.nm_id), row.vendor_code ? String(row.vendor_code) : null]),
    );
    return tables.WbFeedbacks.map((row) => ({
      ...row,
      vendor_code: byNmId.get(String(row.nm_id)) ?? null,
    }));
  }
  return tables.WbQuestions;
};

const depsOver = (fake: ReturnType<typeof recordingService>): SyncDeps =>
  ({
    container: {
      resolve: (key: unknown) => {
        if (key !== WB_MODULE) {
          throw new Error(`the loader resolved ${String(key)}, which it has no business resolving`);
        }
        return fake.service;
      },
    },
    tenantId: TENANT,
    credentials: null,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }) as unknown as SyncDeps;

describe("the Wildberries mirror loader", () => {
  it.each(MP_KINDS)("hands normalize.%s rows that give the drafts whole rows give", async (kind) => {
    const tables = seed(4);
    const expected = wbAdapter.normalize[kind](wholeRows(tables, kind));
    const fake = recordingService(tables);

    const drafts = wbAdapter.normalize[kind](await wbAdapter.loadMirror(depsOver(fake), kind));

    expect(expected.length).toBeGreaterThan(0);
    expect(drafts).toEqual(expected);
  });

  it("reads two mirrors of 1 200 orders a page at a time and leaves the raw answer behind", async () => {
    const tables = seed(1_200);
    const expected = wbAdapter.normalize.orders(wholeRows(tables, "orders"));
    const fake = recordingService(tables);

    const rows = (await wbAdapter.loadMirror(depsOver(fake), "orders")) as {
      source: string;
      row: Row;
    }[];

    expect(wbAdapter.normalize.orders(rows)).toEqual(expected);
    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
    for (const { source, row } of rows) {
      expect(source === "statistics" ? Object.keys(row.raw as object) : row.raw).toEqual(
        source === "statistics" ? ["currencyCode"] : undefined,
      );
    }
  });

  it("selects only columns its models have", () => {
    const models: [readonly string[], { schema: Record<string, unknown> }][] = [
      [normalize.MIRROR_COLUMNS.products, WbProduct],
      [normalize.MIRROR_COLUMNS.feedbackProducts, WbProduct],
      [normalize.MIRROR_COLUMNS.prices, WbPrice],
      [normalize.MIRROR_COLUMNS.stocks, WbStock],
      [normalize.MIRROR_COLUMNS.statisticsOrders, WbOrder],
      [normalize.MIRROR_COLUMNS.fbsOrders, WbFbsOrder],
      [normalize.MIRROR_COLUMNS.feedbacks, WbFeedback],
      [normalize.MIRROR_COLUMNS.questions, WbQuestion],
    ];
    for (const [columns, model] of models) {
      expect(columns.filter((column) => !(column in model.schema))).toEqual([]);
    }
  });
});

describe("the Wildberries journal loader", () => {
  it("answers with one page of the calls of one run", async () => {
    const fake = recordingService({
      ...seed(1),
      WbSyncRuns: many(3, (i) => ({ id: `wbrun_${padded(i)}`, tenant_id: TENANT })),
      /** 700 calls of the first run and 500 of the second, interleaved by id. */
      WbApiCalls: many(1_200, (i) => ({
        id: `wbcall_${padded(i)}`,
        tenant_id: TENANT,
        sync_run_id: i < 1_000 && i % 10 < 7 ? "wbrun_0000000" : "wbrun_0000001",
      })),
    });
    const deps = depsOver(fake);
    const page = { of: "calls" as const, take: BOUND, syncRunId: "wbrun_0000000" };

    const first = await wbAdapter.loadJournal(deps, { ...page, after: null });
    expect(first.runs).toEqual([]);
    expect(first.calls).toHaveLength(BOUND);
    expect(first.calls.every((call) => call.sync_run_id === "wbrun_0000000")).toBe(true);

    const second = await wbAdapter.loadJournal(deps, {
      ...page,
      after: String(first.calls[BOUND - 1].id),
    });
    expect(second.calls).toHaveLength(200);
    expect(new Set([...first.calls, ...second.calls].map((call) => call.id)).size).toBe(700);

    const runs = await wbAdapter.loadJournal(deps, { of: "runs", after: null, take: BOUND });
    expect(runs.runs).toHaveLength(3);
    expect(runs.calls).toEqual([]);

    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
  });
});
