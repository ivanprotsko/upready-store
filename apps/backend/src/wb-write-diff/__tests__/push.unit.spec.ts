import type {
  MarketplaceWriteAuditRow,
  MarketplaceWriteStore,
} from "../../modules/marketplace-write/types";
import { priceBatches, stockBatches } from "../batches";
import { runWriteBatches } from "../push";
import type { PriceDiffRow, StockDiffRow } from "../types";

/**
 * "The dry run produces N audit rows and opens 0 sockets"
 * (w21-wb-write-stocks-prices), measured rather than promised.
 *
 * `fetch` is replaced with a counter for the length of each test: the claim is
 * about the NETWORK, and a claim about the network that never watches the
 * network is a sentence, not a test (rule 18f).
 */

const stockRow = (over: Partial<StockDiffRow> = {}): StockDiffRow => ({
  kind: "stocks",
  product_id: "prod_1",
  product_title: "Мумиё",
  variant_id: "var_1",
  variant_sku: "sku-1",
  nm_id: "94372564",
  barcode: "2037031652319",
  chrt_id: "1000",
  warehouse_id: "985793",
  warehouse_name: "Фабрика Натуральных Продуктов",
  store_value: 7,
  wb_value: 3,
  action: "update",
  reason: null,
  ...over,
});

const priceRow = (over: Partial<PriceDiffRow> = {}): PriceDiffRow => ({
  kind: "prices",
  product_id: "prod_2",
  product_title: "Зубная паста",
  variant_id: "var_2",
  variant_sku: "sku-2",
  nm_id: "94372565",
  currency: "rub",
  store_value: 1100,
  wb_value: 990,
  wb_price: 1980,
  wb_discount: 50,
  proposed_price: 2200,
  action: "update",
  reason: null,
  ...over,
});

/** A key WB's own bit table reads as writable and unexpired, built the way w20's gate suite does. */
const writableKey = (): string => {
  const payload = {
    id: "token-1",
    s: 0,
    sid: "seller-1",
    exp: Math.floor(Date.now() / 1000) + 3_600,
  };
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.signature`;
};

type Harness = { store: MarketplaceWriteStore; audit: MarketplaceWriteAuditRow[] };

const harness = (over: Partial<MarketplaceWriteStore> = {}): Harness => {
  const audit: MarketplaceWriteAuditRow[] = [];
  return {
    audit,
    store: {
      readCredential: async () => ({ api_key: writableKey() }),
      isEnabled: async () => true,
      findConsent: async (opClass) => ({
        op_class: opClass,
        confirmed_by: "tadm_1",
        confirmed_at: new Date(),
        note: null,
      }),
      appendAudit: async (row) => {
        audit.push(row);
      },
      ...over,
    },
  };
};

const silent = { info: () => {}, warn: () => {} };

describe("the dry-run push", () => {
  const realFetch = globalThis.fetch;
  let fetches = 0;

  beforeEach(() => {
    fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new Error("a dry run must not open a socket");
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("writes one audit row per batch and opens no socket, with the live gate shut", async () => {
    const { store, audit } = harness();
    const batches = [
      ...stockBatches([stockRow(), stockRow({ variant_id: "var_1b", barcode: "bar-2" })]),
      ...stockBatches([stockRow({ warehouse_id: "1314012", variant_id: "var_1c" })]),
    ];

    expect(batches).toHaveLength(2);

    const outcome = await runWriteBatches(batches, {
      kind: "stocks",
      ctx: {
        tenantId: "ten_1",
        actor: "script:wb:push",
        store,
        // Gate (e): the variable no deployment sets.
        env: {},
        logger: silent,
      },
    });

    expect(fetches).toBe(0);
    expect(outcome).toMatchObject({ batches: 2, rows: 3, dry_run: 2, refused: 0, sent: 0 });
    expect(audit).toHaveLength(2);
    expect(audit.every((row) => row.dry_run && row.outcome === "dry_run")).toBe(true);
    expect(audit.every((row) => row.op_class === "stocks")).toBe(true);
    expect(audit.map((row) => row.path).sort()).toEqual([
      "/api/v3/stocks/1314012",
      "/api/v3/stocks/985793",
    ]);
  });

  it("journals the same way for prices", async () => {
    const { store, audit } = harness();

    const outcome = await runWriteBatches(priceBatches([priceRow(), priceRow({ nm_id: "3" })]), {
      kind: "prices",
      ctx: { tenantId: "ten_1", actor: "script:wb:push", store, env: {}, logger: silent },
    });

    expect(fetches).toBe(0);
    expect(outcome).toMatchObject({ batches: 1, rows: 2, dry_run: 1 });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      op_class: "prices",
      method: "POST",
      path: "/api/v2/upload/task",
      dry_run: true,
      outcome: "dry_run",
    });
    expect((audit[0].payload as { data: unknown[] }).data).toHaveLength(2);
  });

  it("counts a refusal instead of throwing, and still journals it", async () => {
    const { store, audit } = harness({ readCredential: async () => null });

    const outcome = await runWriteBatches(stockBatches([stockRow()]), {
      kind: "stocks",
      ctx: { tenantId: "ten_1", actor: "script:wb:push", store, env: {}, logger: silent },
    });

    expect(fetches).toBe(0);
    expect(outcome).toMatchObject({ batches: 1, dry_run: 0, refused: 1, sent: 0 });
    expect(outcome.results[0]).toMatchObject({ outcome: "refused", gate: "credential" });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ outcome: "refused", gate: "credential", dry_run: true });
  });

  it("sends nothing when there is nothing to change", async () => {
    const { store, audit } = harness();

    const outcome = await runWriteBatches(stockBatches([stockRow({ action: "equal" })]), {
      kind: "stocks",
      ctx: { tenantId: "ten_1", actor: "script:wb:push", store, env: {}, logger: silent },
    });

    expect(outcome).toMatchObject({ batches: 0, rows: 0, dry_run: 0 });
    expect(audit).toEqual([]);
    expect(fetches).toBe(0);
  });
});
