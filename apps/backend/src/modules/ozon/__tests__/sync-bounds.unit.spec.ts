import {
  callsOverBound,
  recordingService,
  type Row,
} from "../../marketplace/__tests__/recording-service";
import { runSync, type OzonSyncDeps } from "../sync";
import type OzonModuleService from "../service";

/**
 * The Ozon twin of `modules/wb/__tests__/sync-bounds.unit.spec.ts`
 * (t-2026-10-06-21). The two imports share one `upsertRows` shape, so the
 * bound has to hold on both or the next cabinet that grows past a page brings
 * the same crash back under the other name.
 *
 * `BOUND` is written here and not imported, so that against the old code this
 * file fails on its assertions and not on a missing export.
 */
const BOUND = 500;
const CARDS = 15_000;
const TENANT = "ten_bounds";

const padded = (index: number) => String(index).padStart(7, "0");

describe("a stocks answer of 30 000 lines", () => {
  let fetchSpy: jest.SpyInstance;
  let fake: ReturnType<typeof recordingService>;
  let outcome: Awaited<ReturnType<typeof runSync>>;

  beforeAll(async () => {
    /** The FBO line of every card is already mirrored, with an older amount. */
    const seeded: Row[] = Array.from({ length: CARDS }, (_, index) => ({
      id: `ozstock_seed_${padded(index)}`,
      tenant_id: TENANT,
      sku: `sku-${padded(index)}`,
      stock_type: "fbo",
      shipment_type: "",
      present: -1,
      raw: { sku: `sku-${padded(index)}`, type: "fbo", present: -1 },
    }));
    fake = recordingService({ OzonStocks: seeded, OzonSyncRuns: [], OzonApiCalls: [] });

    fetchSpy = jest.spyOn(globalThis, "fetch" as never);
    fetchSpy.mockImplementation(((url: string) => {
      if (!String(url).includes("/v4/product/info/stocks")) {
        throw new Error(`A test asked for an endpoint it did not record: ${url}`);
      }
      const items = Array.from({ length: CARDS }, (_, index) => ({
        offer_id: `offer-${index}`,
        product_id: 500_000 + index,
        stocks: [
          { sku: `sku-${padded(index)}`, type: "fbo", present: index, reserved: 0 },
          { sku: `sku-${padded(index)}`, type: "fbs", present: index + 1, reserved: 1 },
        ],
      }));
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: async () => JSON.stringify({ items, cursor: "", total: CARDS }),
      } as unknown as Response);
    }) as never);

    const deps: OzonSyncDeps = {
      ozon: fake.service as unknown as OzonModuleService,
      tenantId: TENANT,
      credentials: { clientId: "1", apiKey: "test-key" },
      mode: "live",
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };
    outcome = await runSync(deps, "stocks");
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it("mirrors every line once and reports the rows in the run", () => {
    expect(outcome).toMatchObject({ status: "succeeded", rows: CARDS * 2, requests: 1 });

    const mirror = fake.tables.OzonStocks;
    expect(mirror).toHaveLength(CARDS * 2);

    for (const row of mirror) {
      const index = Number(String(row.sku).slice("sku-".length));
      expect(row.present).toBe(row.stock_type === "fbo" ? index : index + 1);
    }

    /** A mirrored line is updated in place: it keeps its id. */
    const kept = mirror.filter((row) => row.id.startsWith("ozstock_seed_"));
    expect(kept).toHaveLength(CARDS);
    expect(kept.every((row) => row.stock_type === "fbo")).toBe(true);
  });

  it("hands no service call more than 500 rows or keys", () => {
    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
  });
});
