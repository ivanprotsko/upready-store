import { MP_KINDS, type MpKind, type SyncDeps } from "../../marketplace/contract";
import {
  callsOverBound,
  fullRow,
  recordingService,
  type Row,
} from "../../marketplace/__tests__/recording-service";
import { ozonAdapter } from "../adapter";
import { OZON_MODULE } from "../index";
import OzonPosting from "../models/ozon-posting";
import OzonPrice from "../models/ozon-price";
import OzonProduct from "../models/ozon-product";
import OzonQuestion from "../models/ozon-question";
import OzonReview from "../models/ozon-review";
import OzonStock from "../models/ozon-stock";
import * as normalize from "../normalize";

/**
 * The Ozon twin of `modules/wb/__tests__/mirror-columns.unit.spec.ts`
 * (t-2026-10-06-21): the loader selects every column `normalize` reads, and
 * the fake honours `select`, so a list that falls behind the code shows up as
 * a different draft and not as a silent `null`.
 *
 * `BOUND` is written here and not imported.
 */
const BOUND = 500;
const TENANT = "ten_columns";
const FETCHED = new Date("2026-10-06T01:00:00.000Z");

const padded = (index: number) => String(index).padStart(7, "0");
const many = <T>(count: number, build: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, index) => build(index));

const base = { tenant_id: TENANT, fetched_at: FETCHED, source: "ozon" };

const seed = (postings: number) => ({
  OzonProducts: many(3, (i) =>
    fullRow(OzonProduct, `ozprod_${padded(i)}`, {
      ...base,
      product_id: `${500 + i}`,
      offer_id: `ART-${i}`,
      sku: `${9000 + i}`,
      barcodes: [`46000${i}`],
      images: [`https://example.test/${i}.webp`],
      statuses: { status: "price_sent" },
      attributes: { id: 500 + i, attributes: [] },
      archived: i === 2,
      ozon_updated_at: FETCHED,
      raw: { id: 500 + i, everything: "Ozon answered" },
    }),
  ),
  OzonPrices: many(3, (i) =>
    fullRow(OzonPrice, `ozprice_${padded(i)}`, {
      ...base,
      product_id: `${500 + i}`,
      offer_id: `ART-${i}`,
      price: 900 + i,
      old_price: i === 1 ? null : 1000 + i,
      min_price: 800,
      currency_code: "RUB",
      commissions: { fbo: 1 },
      price_indexes: {},
      marketing_actions: {},
      raw: { product_id: 500 + i },
    }),
  ),
  /** The third card has a price and no stock line, which is its own branch of `offers`. */
  OzonStocks: many(2, (i) =>
    fullRow(OzonStock, `ozstock_${padded(i)}`, {
      ...base,
      product_id: `${500 + i}`,
      offer_id: i === 0 ? null : `ART-${i}`,
      sku: `${9000 + i}`,
      stock_type: "fbs",
      shipment_type: i === 0 ? "" : "general",
      present: 4 + i,
      reserved: i,
      raw: { sku: 9000 + i },
    }),
  ),
  OzonPostings: many(postings, (i) =>
    fullRow(OzonPosting, `ozpost_${padded(i)}`, {
      ...base,
      posting_number: `P-${padded(i)}`,
      scheme: i % 2 ? "fbs" : "fbo",
      status: i % 5 === 0 ? "cancelled" : "delivering",
      products: [
        { sku: 9000 + i, offer_id: `ART-${i}`, quantity: 2, price: { amount: "1290.00", currency: "RUB" } },
      ],
      analytics_data: { region: "Москва", warehouse_name: "Хоругвино" },
      financial_data: i % 3 === 0 ? { currency_code: "RUB" } : {},
      posting_created_at: FETCHED,
      in_process_at: FETCHED,
      cancel_reason_id: i % 5 === 0 ? "352" : null,
      raw: { posting_number: `P-${padded(i)}`, everything: "Ozon answered" },
    }),
  ),
  OzonReviews: many(3, (i) =>
    fullRow(OzonReview, `ozrev_${padded(i)}`, {
      ...base,
      review_id: `rev-${i}`,
      /** The third review names a sku the mirror does not hold. */
      sku: i === 2 ? "1" : `${9000 + i}`,
      rating: 5 - i,
      comments_amount: i,
      photos_amount: 0,
      videos_amount: 0,
      is_rating_participant: true,
      published_at: FETCHED,
      raw: { id: `rev-${i}` },
    }),
  ),
  OzonQuestions: many(3, (i) =>
    fullRow(OzonQuestion, `ozq_${padded(i)}`, {
      ...base,
      question_id: `q-${i}`,
      sku: `${9000 + i}`,
      answers_count: i,
      published_at: FETCHED,
      raw: { id: `q-${i}` },
    }),
  ),
  OzonSyncRuns: [] as Row[],
  OzonApiCalls: [] as Row[],
});

/** What `loadMirror` handed `normalize` before the bound: whole rows, tagged and joined. */
const wholeRows = (tables: ReturnType<typeof seed>, kind: MpKind): unknown[] => {
  const bySku = new Map(
    tables.OzonProducts.filter((row) => row.sku).map((row) => [
      String(row.sku),
      row.offer_id ? String(row.offer_id) : null,
    ]),
  );
  if (kind === "products") {
    return tables.OzonProducts;
  }
  if (kind === "offers") {
    return [
      ...tables.OzonPrices.map((row) => ({ source: "price", row })),
      ...tables.OzonStocks.map((row) => ({ source: "stock", row })),
    ];
  }
  if (kind === "orders") {
    return tables.OzonPostings;
  }
  const joined = kind === "reviews" ? tables.OzonReviews : tables.OzonQuestions;
  return joined.map((row) => ({ ...row, vendor_code: bySku.get(String(row.sku)) ?? null }));
};

const depsOver = (fake: ReturnType<typeof recordingService>): SyncDeps =>
  ({
    container: {
      resolve: (key: unknown) => {
        if (key !== OZON_MODULE) {
          throw new Error(`the loader resolved ${String(key)}, which it has no business resolving`);
        }
        return fake.service;
      },
    },
    tenantId: TENANT,
    credentials: null,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }) as unknown as SyncDeps;

describe("the Ozon mirror loader", () => {
  it.each(MP_KINDS)("hands normalize.%s rows that give the drafts whole rows give", async (kind) => {
    const tables = seed(4);
    const expected = ozonAdapter.normalize[kind](wholeRows(tables, kind));
    const fake = recordingService(tables);

    const drafts = ozonAdapter.normalize[kind](await ozonAdapter.loadMirror(depsOver(fake), kind));

    expect(expected.length).toBeGreaterThan(0);
    expect(drafts).toEqual(expected);
  });

  it("reads a mirror of 1 200 postings a page at a time and leaves the raw answer behind", async () => {
    const tables = seed(1_200);
    const expected = ozonAdapter.normalize.orders(wholeRows(tables, "orders"));
    const fake = recordingService(tables);

    const rows = (await ozonAdapter.loadMirror(depsOver(fake), "orders")) as Row[];

    expect(ozonAdapter.normalize.orders(rows)).toEqual(expected);
    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
    expect(rows.filter((row) => "raw" in row)).toEqual([]);
  });

  it("selects only columns its models have", () => {
    const models: [readonly string[], { schema: Record<string, unknown> }][] = [
      [normalize.MIRROR_COLUMNS.products, OzonProduct],
      [normalize.MIRROR_COLUMNS.joinedProducts, OzonProduct],
      [normalize.MIRROR_COLUMNS.prices, OzonPrice],
      [normalize.MIRROR_COLUMNS.stocks, OzonStock],
      [normalize.MIRROR_COLUMNS.postings, OzonPosting],
      [normalize.MIRROR_COLUMNS.reviews, OzonReview],
      [normalize.MIRROR_COLUMNS.questions, OzonQuestion],
    ];
    for (const [columns, model] of models) {
      expect(columns.filter((column) => !(column in model.schema))).toEqual([]);
    }
  });
});

describe("the Ozon journal loader", () => {
  it("answers with one page of the calls of one run", async () => {
    const fake = recordingService({
      ...seed(1),
      OzonSyncRuns: many(3, (i) => ({ id: `ozrun_${padded(i)}`, tenant_id: TENANT })),
      OzonApiCalls: many(1_200, (i) => ({
        id: `ozcall_${padded(i)}`,
        tenant_id: TENANT,
        sync_run_id: i < 1_000 && i % 10 < 7 ? "ozrun_0000000" : "ozrun_0000001",
      })),
    });
    const deps = depsOver(fake);
    const page = { of: "calls" as const, take: BOUND, syncRunId: "ozrun_0000000" };

    const first = await ozonAdapter.loadJournal(deps, { ...page, after: null });
    expect(first.runs).toEqual([]);
    expect(first.calls).toHaveLength(BOUND);
    expect(first.calls.every((call) => call.sync_run_id === "ozrun_0000000")).toBe(true);

    const second = await ozonAdapter.loadJournal(deps, {
      ...page,
      after: String(first.calls[BOUND - 1].id),
    });
    expect(second.calls).toHaveLength(200);

    const runs = await ozonAdapter.loadJournal(deps, { of: "runs", after: null, take: BOUND });
    expect(runs.runs).toHaveLength(3);
    expect(runs.calls).toEqual([]);

    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
  });
});
