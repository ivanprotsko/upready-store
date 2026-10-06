import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type {
  JournalPage,
  MarketplaceAdapter,
  MpOrderDraft,
  MpProductDraft,
} from "../contract";
import { MARKETPLACE_MODULE } from "../index";
import { callsOverBound, recordingService, type Row } from "./recording-service";

/** See `project.unit.spec.ts`: the projector resolves its adapter through the registry. */
let currentAdapter: MarketplaceAdapter;
jest.mock("../registry", () => ({
  requireAdapter: () => currentAdapter,
}));

import { projectFromMirrors } from "../project";

/**
 * One projection's memory is bounded (t-2026-10-06-21).
 *
 * The projector used to read every normalized table whole to learn which of
 * its drafts exist, read both journals whole to subtract one set of ids from
 * the other, and read the whole status history of every order. On the Russian
 * host on 2026-10-06 that was 31 061 orders, 154 506 transport rows and
 * 11 002 run rows, every ten minutes, next to an import doing the same.
 *
 * Each part is checked twice, as in `modules/wb/__tests__/sync-bounds`: the
 * STATE (rows and counters, which the old code produces too) and the CALLS
 * (which the old code fails). `BOUND` is written here and not imported.
 */
const BOUND = 500;
const ORDERS = 30_000;
const SEEDED_ORDERS = 15_000;
const CALLS = 30_000;
const CARRIED_CALLS = 10_000;
const RUNS = 1_200;
const CARDS = 1_200;
const TENANT = "ten_bounds";
const SCOPE = { tenant_id: TENANT, marketplace: "wb" };
const OBSERVED_BEFORE = new Date("2026-10-05T00:00:00.000Z");
const SYNCED = new Date("2026-10-06T00:00:00.000Z");

const padded = (index: number) => String(index).padStart(7, "0");

/** Even orders have moved on to `confirm`; odd ones still stand where they were seen. */
const orderDraft = (index: number): MpOrderDraft => ({
  tenant_id: TENANT,
  marketplace: "wb",
  source_row_id: `wbord_${padded(index)}`,
  synced_at: SYNCED,
  external_id: `ext-${padded(index)}`,
  scheme: null,
  status: index % 2 === 0 ? "confirm" : "new",
  status_detail: null,
  status_changed_at: null,
  ordered_at: null,
  buyer_region: null,
  warehouse_name: null,
  total: 100 + index,
  currency: "RUB",
  is_cancelled: false,
  lines: [
    {
      line_key: `ext-${padded(index)}|1`,
      vendor_code: null,
      external_id: "1",
      qty: 1,
      price: 100 + index,
      discount: null,
    },
  ],
});

const productDraft = (index: number): MpProductDraft => ({
  tenant_id: TENANT,
  marketplace: "wb",
  source_row_id: `wbprod_${padded(index)}`,
  synced_at: SYNCED,
  external_id: `card-${padded(index)}`,
  vendor_code: `SKU-${padded(index)}`,
  sku_external: null,
  title: `Card ${index}`,
  brand: null,
  category_name: null,
  photos: null,
  attributes: {},
  mp_updated_at: null,
});

/** The adapter's own journal. Every hundredth run is still `running` and must not be carried. */
const adapterRuns = Array.from({ length: RUNS }, (_, index) => ({
  id: `wbrun_${padded(index)}`,
  tenant_id: TENANT,
  kind: "stocks",
  status: index % 100 === 0 ? "running" : "succeeded",
  started_at: OBSERVED_BEFORE,
  finished_at: index % 100 === 0 ? null : OBSERVED_BEFORE,
  rows: index,
  requests: 1,
  error: null,
}));
const adapterCalls = Array.from({ length: CALLS }, (_, index) => ({
  id: `wbcall_${padded(index)}`,
  tenant_id: TENANT,
  sync_run_id: `wbrun_${padded(index % RUNS)}`,
  endpoint_id: "marketplace.stocks",
  host: "marketplace-api.wildberries.ru",
  method: "POST",
  path: "/api/v3/stocks/1",
  status: 200,
  ms: 120,
  error: null,
  fetched_at: OBSERVED_BEFORE,
}));

const seedTables = (): Record<string, Row[]> => ({
  MpProducts: [],
  MpOffers: [],
  MpOrders: Array.from({ length: SEEDED_ORDERS }, (_, index) => ({
    id: `mpord_seed_${padded(index)}`,
    ...SCOPE,
    external_id: `ext-${padded(index)}`,
    status: "new",
    total: 1,
  })),
  MpOrderLines: Array.from({ length: SEEDED_ORDERS }, (_, index) => ({
    id: `mpline_seed_${padded(index)}`,
    ...SCOPE,
    order_id: `mpord_seed_${padded(index)}`,
    line_key: `ext-${padded(index)}|1`,
    price: 1,
  })),
  MpOrderStatusEvents: Array.from({ length: SEEDED_ORDERS }, (_, index) => ({
    id: `mpevent_seed_${padded(index)}`,
    ...SCOPE,
    order_id: `mpord_seed_${padded(index)}`,
    event_key: `mpord_seed_${padded(index)}|${OBSERVED_BEFORE.toISOString()}`,
    status: "new",
    status_detail: null,
    observed_at: OBSERVED_BEFORE,
  })),
  MpReviews: [],
  MpQuestions: [],
  /** 600 links to refresh, and 700 to cards the marketplace no longer has. */
  MpLinks: [
    ...Array.from({ length: 600 }, (_, index) => ({
      id: `mplink_seed_${padded(index)}`,
      ...SCOPE,
      external_id: `card-${padded(index)}`,
      product_id: "prod_old",
      variant_id: "var_old",
      matched_by: "vendor_code",
    })),
    ...Array.from({ length: 700 }, (_, index) => ({
      id: `mplink_gone_${padded(index)}`,
      ...SCOPE,
      external_id: `gone-${padded(index)}`,
      product_id: "prod_gone",
      variant_id: "var_gone",
      matched_by: "vendor_code",
    })),
  ],
  MpSyncRuns: [
    /** Carried by an earlier projection, under the derived id. */
    ...adapterRuns
      .slice(0, 400)
      .filter((run) => run.status !== "running")
      .map((run) => ({ id: `mprun_${run.id}`, ...SCOPE, kind: run.kind, status: run.status })),
    /** Recorded by the scheduler, which names the adapter's run in `source_run_id`. */
    ...adapterRuns
      .slice(400, 600)
      .filter((run) => run.status !== "running")
      .map((run) => ({
        id: `mprun_sched_${run.id}`,
        ...SCOPE,
        kind: run.kind,
        status: run.status,
        source_run_id: run.id,
      })),
  ],
  MpApiCalls: adapterCalls
    .slice(0, CARRIED_CALLS)
    .map((call) => ({ id: `mpcall_${call.id}`, ...SCOPE, endpoint_id: call.endpoint_id })),
});

describe("a projection over 30 000 orders, a journal of 30 000 calls and 1 200 cards", () => {
  let fake: ReturnType<typeof recordingService>;
  let journalAsks: (JournalPage | null)[];
  let first: Awaited<ReturnType<typeof projectFromMirrors>>;
  let second: Awaited<ReturnType<typeof projectFromMirrors>>;
  let eventsAfterFirst: number;
  let callsOfFirst: number;
  let journalLookupsOfFirst: number;

  beforeAll(async () => {
    fake = recordingService(seedTables());
    journalAsks = [];

    currentAdapter = {
      id: "wb",
      label: "Wildberries",
      loadMirror: async (_deps: unknown, kind: string) =>
        kind === "orders"
          ? Array.from({ length: ORDERS }, (_, index) => index)
          : kind === "products"
            ? Array.from({ length: CARDS }, (_, index) => index)
            : [],
      /**
       * A page when it is asked for a page, and the whole journal when it is
       * asked the way the contract read before the bound.
       */
      loadJournal: async (_deps: unknown, page?: JournalPage) => {
        journalAsks.push(page ?? null);
        if (!page) {
          return { runs: adapterRuns, calls: adapterCalls };
        }
        const source: { id: string; sync_run_id?: string }[] =
          page.of === "runs" ? adapterRuns : adapterCalls;
        const rows = source
          .filter((row) => page.after === null || row.id > page.after)
          .filter((row) => !page.syncRunId || row.sync_run_id === page.syncRunId)
          .slice(0, page.take);
        return page.of === "runs" ? { runs: rows, calls: [] } : { runs: [], calls: rows };
      },
      normalize: {
        products: (rows: unknown[]) => (rows as number[]).map(productDraft),
        offers: () => [],
        orders: (rows: unknown[]) => (rows as number[]).map(orderDraft),
        reviews: () => [],
        questions: () => [],
      },
    } as unknown as MarketplaceAdapter;

    const deps = {
      container: {
        resolve: (key: unknown) => {
          if (key === MARKETPLACE_MODULE) {
            return fake.service;
          }
          if (key === ContainerRegistrationKeys.QUERY) {
            /** One variant per card, under the card's own article. */
            return {
              graph: async () => ({
                data: [
                  {
                    id: TENANT,
                    products: Array.from({ length: CARDS }, (_, index) => ({
                      id: `prod_${padded(index)}`,
                      variants: [{ id: `var_${padded(index)}`, sku: `SKU-${padded(index)}` }],
                    })),
                  },
                ],
              }),
            };
          }
          throw new Error(`the projector resolved ${String(key)}, which it has no business resolving`);
        },
      },
      tenantId: TENANT,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    first = await projectFromMirrors(deps as never, "wb");
    eventsAfterFirst = fake.tables.MpOrderStatusEvents.length;
    callsOfFirst = fake.calls.length;
    journalLookupsOfFirst = fake.calls.filter((call) => call.method === "listMpApiCalls").length;
    second = await projectFromMirrors(deps as never, "wb");
  });

  it("writes every order, its line and the status changes it observed", () => {
    expect(first.error).toBeNull();
    expect(first.status).toBe("succeeded");
    expect(first.counts.orders).toBe(ORDERS);
    expect(first.counts.order_lines).toBe(ORDERS);
    /** 15 000 orders seen for the first time, and the even half of the seeded ones moved on. */
    expect(first.counts.status_events).toBe(ORDERS - SEEDED_ORDERS + SEEDED_ORDERS / 2);

    const orders = fake.tables.MpOrders;
    expect(orders).toHaveLength(ORDERS);
    expect(orders.filter((row) => row.id.startsWith("mpord_seed_"))).toHaveLength(SEEDED_ORDERS);
    const idByExternal = new Map(orders.map((row) => [String(row.external_id), row.id]));
    expect(idByExternal.size).toBe(ORDERS);
    for (const row of orders) {
      expect(row.total).toBe(100 + Number(String(row.external_id).slice("ext-".length)));
    }

    const lines = fake.tables.MpOrderLines;
    expect(lines).toHaveLength(ORDERS);
    for (const line of lines) {
      expect(line.order_id).toBe(idByExternal.get(String(line.line_key).split("|")[0]));
      expect(line.price).toBe(100 + Number(String(line.line_key).slice("ext-".length, -2)));
    }

    expect(eventsAfterFirst).toBe(SEEDED_ORDERS + first.counts.status_events);
  });

  it("observes no status change when the same mirrors are projected again", () => {
    expect(second.status).toBe("succeeded");
    expect(second.counts.orders).toBe(ORDERS);
    expect(second.counts.order_lines).toBe(ORDERS);
    expect(second.counts.status_events).toBe(0);
    expect(fake.tables.MpOrders).toHaveLength(ORDERS);
    expect(fake.tables.MpOrderLines).toHaveLength(ORDERS);
    expect(fake.tables.MpOrderStatusEvents).toHaveLength(eventsAfterFirst);
  });

  it("carries the journal rows that were not carried yet, and only those", () => {
    /** 600 runs are neither carried nor recorded by the scheduler, and 6 of them are still running. */
    expect(first.counts.journal_runs).toBe(594);
    expect(first.counts.journal_calls).toBe(CALLS - CARRIED_CALLS);
    expect(second.counts.journal_runs).toBe(0);
    expect(second.counts.journal_calls).toBe(0);

    const calls = fake.tables.MpApiCalls;
    expect(calls).toHaveLength(CALLS);
    expect(new Set(calls.map((row) => row.id)).size).toBe(CALLS);

    const runs = fake.tables.MpSyncRuns.filter((row) => row.kind === "stocks");
    expect(runs).toHaveLength(RUNS - 12);
    expect(runs.some((row) => row.status === "running")).toBe(false);
    /** A run the scheduler recorded is not carried a second time under the derived id. */
    expect(runs.filter((row) => row.id === "mprun_wbrun_0000450")).toHaveLength(0);
  });

  it("links every card, refreshes the links it had and removes the ones to cards that are gone", () => {
    expect(first.counts.products).toBe(CARDS);
    expect(first.link.linked).toHaveLength(CARDS);
    expect(first.counts.links).toBe(CARDS);

    const links = fake.tables.MpLinks;
    expect(links).toHaveLength(CARDS);
    expect(links.some((row) => String(row.external_id).startsWith("gone-"))).toBe(false);
    for (const link of links) {
      const index = String(link.external_id).slice("card-".length);
      expect(link.variant_id).toBe(`var_${index}`);
    }
    expect(links.filter((row) => row.id.startsWith("mplink_seed_"))).toHaveLength(600);
  });

  it("hands no service call more than 500 rows or keys", () => {
    expect(callsOfFirst).toBeGreaterThan(0);
    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
  });

  it("asks the adapter for its journal a page at a time", () => {
    expect(journalAsks.length).toBeGreaterThan(0);
    expect(journalAsks.filter((page) => page === null || page.take > BOUND)).toEqual([]);
  });

  it("looks a page of the journal up in the shared table with one read, not with a walk of the table", () => {
    /** 60 pages of calls, one lookup each. A lookup that pages on would read the table once per page. */
    expect(journalLookupsOfFirst).toBe(CALLS / BOUND);
  });
});
