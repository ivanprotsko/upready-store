import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MarketplaceAdapter, MpOfferDraft } from "../contract";
import { MARKETPLACE_MODULE } from "../index";

/**
 * `projectFromMirrors` resolves its adapter itself, through
 * `requireAdapter(marketplace)` — it takes a marketplace ID, not an adapter
 * object, so the only way to hand it a fake is to replace what the registry
 * hands back. Without this mock every test below silently exercised the REAL
 * `wbAdapter` and died resolving WB's own container keys, never touching the
 * two bugs this file exists to prove.
 */
let currentAdapter: MarketplaceAdapter;
jest.mock("../registry", () => ({
  requireAdapter: (id: string) => {
    if (id !== "wb") {
      throw new Error(`test only registered "wb", asked for ${id}`);
    }
    return currentAdapter;
  },
}));

import { projectFromMirrors } from "../project";

/**
 * Two of the four root causes named in t-2026-09-27-01, reproduced without a
 * database (w28-wb-projection-fix).
 *
 * Both are measured on `upready_store_w28_wbsync`, the restore of the
 * production dump the task ran against: a single `updateMpOffers` /
 * `updateMpOrders` call over the whole normalized table (12 035 offers,
 * 29 007 orders) died with a generated `select … where id = '…' or id = '…'
 * or …`, and `carryJournal` tried to carry every `running` row `wb_sync_run`
 * held (34 stuck `orders` rows going back to 2026-09-16) as a NEW `running`
 * insert, which collided with itself inside one batch on the partial unique
 * index of `Migration20260916014707` — `Mp sync run with tenant_id: …,
 * marketplace: wb, kind: orders, already exists.` That single error was also
 * the entire count of `Transaction query already complete` this task saw:
 * fixing these two made every one of the 863 recorded failures disappear
 * against the real mirror, no third fix required (verified on the stand, not
 * assumed — see the PR body for the counts).
 */

type Row = Record<string, unknown> & { id: string };

/** A stand-in for `MarketplaceModuleService`, enforcing the one constraint the
 * real table does: at most one `running` row per (tenant, marketplace, kind),
 * even across the rows of a single batch insert — exactly what Postgres'
 * partial unique index enforces on `INSERT … VALUES (…), (…), …`. */
const fakeService = (seed: { mpOffers?: Row[] } = {}) => {
  const store = {
    mpProducts: [] as Row[],
    mpOffers: (seed.mpOffers ?? []) as Row[],
    mpOrders: [] as Row[],
    mpOrderLines: [] as Row[],
    mpOrderStatusEvents: [] as Row[],
    mpReviews: [] as Row[],
    mpQuestions: [] as Row[],
    mpLinks: [] as Row[],
    mpSyncRuns: [] as Row[],
    mpApiCalls: [] as Row[],
  };
  let seq = 0;
  const nextId = (prefix: string) => {
    seq += 1;
    return `${prefix}_fake_${seq}`;
  };

  const batchSizes = {
    createMpOffers: [] as number[],
    updateMpOffers: [] as number[],
    createMpSyncRuns: [] as number[],
    createMpApiCalls: [] as number[],
  };

  const assertNoRunningCollision = (batch: Row[]) => {
    const combined = [...store.mpSyncRuns, ...batch];
    const seen = new Set<string>();
    for (const row of combined) {
      if (row.status !== "running") {
        continue;
      }
      const key = `${row.tenant_id}|${row.marketplace}|${row.kind}`;
      if (seen.has(key)) {
        throw new Error(
          `Mp sync run with tenant_id: ${String(row.tenant_id)}, ` +
            `marketplace: ${String(row.marketplace)}, kind: ${String(row.kind)}, already exists.`,
        );
      }
      seen.add(key);
    }
  };

  /**
   * A list of values, the `$gt` id cursor and `take` are what the projector's
   * paged reads ask for (t-2026-10-06-21), so the stand-in answers them the
   * way the generated service does.
   */
  const list =
    (table: keyof typeof store) =>
    async (filter: Record<string, unknown> = {}, config: { take?: number } = {}) => {
      const found = store[table]
        .filter((row) =>
          Object.entries(filter).every(([key, value]) => {
            if (Array.isArray(value)) {
              return value.includes(row[key]);
            }
            if (value !== null && typeof value === "object" && "$gt" in value) {
              return String(row[key]) > String((value as { $gt: unknown }).$gt);
            }
            return row[key] === value;
          }),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return config.take ? found.slice(0, config.take) : found;
    };

  const create =
    (table: keyof typeof store, prefix: string, sizes?: number[]) =>
    async (drafts: Record<string, unknown>[]) => {
      sizes?.push(drafts.length);
      if (table === "mpSyncRuns") {
        assertNoRunningCollision(drafts as Row[]);
      }
      const rows = drafts.map((draft) => ({ id: nextId(prefix), ...draft }) as Row);
      store[table].push(...rows);
      return rows;
    };

  const update =
    (table: keyof typeof store, sizes?: number[]) =>
    async (drafts: (Record<string, unknown> & { id: string })[]) => {
      sizes?.push(drafts.length);
      const arr = Array.isArray(drafts) ? drafts : [drafts];
      for (const draft of arr) {
        const row = store[table].find((existing) => existing.id === draft.id);
        if (row) {
          Object.assign(row, draft);
        }
      }
      return arr;
    };

  return {
    store,
    batchSizes,
    listMpProducts: list("mpProducts"),
    createMpProducts: create("mpProducts", "mpprod"),
    updateMpProducts: update("mpProducts"),
    listMpOffers: list("mpOffers"),
    createMpOffers: create("mpOffers", "mpoffer", batchSizes.createMpOffers),
    updateMpOffers: update("mpOffers", batchSizes.updateMpOffers),
    listMpOrders: list("mpOrders"),
    createMpOrders: create("mpOrders", "mporder"),
    updateMpOrders: update("mpOrders"),
    listMpOrderLines: list("mpOrderLines"),
    createMpOrderLines: create("mpOrderLines", "mporderline"),
    updateMpOrderLines: update("mpOrderLines"),
    listMpOrderStatusEvents: list("mpOrderStatusEvents"),
    createMpOrderStatusEvents: create("mpOrderStatusEvents", "mpstatusevent"),
    listMpReviews: list("mpReviews"),
    createMpReviews: create("mpReviews", "mpreview"),
    updateMpReviews: update("mpReviews"),
    listMpQuestions: list("mpQuestions"),
    createMpQuestions: create("mpQuestions", "mpquestion"),
    updateMpQuestions: update("mpQuestions"),
    listMpLinks: list("mpLinks"),
    createMpLinks: create("mpLinks", "mplink"),
    updateMpLinks: update("mpLinks"),
    softDeleteMpLinks: async () => {},
    listMpSyncRuns: list("mpSyncRuns"),
    /**
     * `projectFromMirrors` opens its OWN run with a single draft (not an
     * array) and reads `.id` straight off the answer — the shape MedusaService
     * itself preserves (one in, one back). `carryJournal` always passes an
     * array. Both call shapes have to survive this fake or the run's own lock
     * row silently comes back `undefined`.
     */
    createMpSyncRuns: async (
      drafts: Record<string, unknown>[] | Record<string, unknown>,
    ): Promise<Row | Row[]> => {
      const arr = Array.isArray(drafts) ? drafts : [drafts];
      const rows = await create("mpSyncRuns", "mprun", batchSizes.createMpSyncRuns)(arr);
      return Array.isArray(drafts) ? rows : rows[0];
    },
    updateMpSyncRuns: update("mpSyncRuns"),
    listMpApiCalls: list("mpApiCalls"),
    createMpApiCalls: create("mpApiCalls", "mpcall", batchSizes.createMpApiCalls),
  };
};

/** An adapter that answers only what `projectFromMirrors` asks of it. */
const fakeAdapter = (overrides: Partial<MarketplaceAdapter> = {}): MarketplaceAdapter =>
  ({
    id: "wb",
    label: "Wildberries",
    hostSuffixes: [],
    endpoints: [],
    mutationDenyList: [],
    read: async () => {
      throw new Error("the projector must never read directly");
    },
    inspectCredentials: async () => {
      throw new Error("not used here");
    },
    readCredentials: async () => null,
    syncKinds: ["cards", "prices", "stocks", "orders"],
    mirrorKinds: {
      products: ["cards"],
      offers: ["prices", "stocks"],
      orders: ["orders"],
      reviews: ["feedbacks"],
      questions: ["questions"],
    },
    runSync: async () => {
      throw new Error("the projector must never run a sync");
    },
    loadMirror: async () => [],
    loadJournal: async () => ({ runs: [], calls: [] }),
    normalize: {
      products: () => [],
      offers: () => [],
      orders: () => [],
      reviews: () => [],
      questions: () => [],
    },
    ...overrides,
  }) as unknown as MarketplaceAdapter;

const deps = (mp: ReturnType<typeof fakeService>) => ({
  container: {
    resolve: (key: unknown) => {
      if (key === MARKETPLACE_MODULE) {
        return mp;
      }
      if (key === ContainerRegistrationKeys.QUERY) {
        return { graph: async () => ({ data: [] }) };
      }
      throw new Error(`the projector resolved ${String(key)}, which it has no business resolving`);
    },
  },
  tenantId: "ten_test",
  logger: { info: () => {}, warn: () => {}, error: () => {} },
});

describe("projectFromMirrors — batches a bulk write past the row count that died live", () => {
  it("never hands updateMpOffers more rows than the batch size, over 1 000 existing offers", async () => {
    const ROWS = 1_000;
    const existing: Row[] = Array.from({ length: ROWS }, (_, i) => ({
      id: `mpoffer_seed_${i}`,
      tenant_id: "ten_test",
      marketplace: "wb",
      offer_key: `key-${i}`,
    }));

    const mp = fakeService({ mpOffers: existing });
    const adapter = fakeAdapter({
      loadMirror: async (_deps, kind) => (kind === "offers" ? Array.from({ length: ROWS }) : []),
      normalize: {
        products: () => [],
        offers: (rows) =>
          rows.map(
            (_, i) =>
              ({
                tenant_id: "ten_test",
                marketplace: "wb",
                source_row_id: `wboffer_${i}`,
                synced_at: new Date(),
                offer_key: `key-${i}`,
                external_id: `ext-${i}`,
                vendor_code: null,
                size_external: null,
                sku_external: null,
                storage_type: null,
                warehouse_id: null,
                warehouse_name: null,
                price: 100,
                discount_price: null,
                currency: "RUB",
                stock: 5,
                reserved: null,
                measured_at: null,
              }) satisfies MpOfferDraft,
          ),
        orders: () => [],
        reviews: () => [],
        questions: () => [],
      },
    });
    currentAdapter = adapter;

    const result = await projectFromMirrors(deps(mp) as never, "wb");

    expect(result.status).toBe("succeeded");
    expect(result.counts.offers).toBe(ROWS);
    /**
     * The measurement, not an assumption: every recorded batch is well under
     * the 1 000 rows the un-fixed code sent in ONE call, and no batch is
     * empty either — chunking must still touch every row.
     */
    expect(mp.batchSizes.updateMpOffers.length).toBeGreaterThan(1);
    for (const size of mp.batchSizes.updateMpOffers) {
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(500);
    }
    expect(mp.batchSizes.updateMpOffers.reduce((sum, n) => sum + n, 0)).toBe(ROWS);
  });
});

describe("projectFromMirrors — carryJournal does not carry a still-running adapter run", () => {
  it("succeeds when the adapter's own journal holds two stuck `running` rows of the same kind", async () => {
    const mp = fakeService();
    const adapter = fakeAdapter({
      loadJournal: async () => ({
        runs: [
          {
            id: "wbrun_stuck_1",
            tenant_id: "ten_test",
            kind: "orders",
            status: "running",
            started_at: new Date("2026-09-16T18:15:00Z"),
            finished_at: null,
            rows: 0,
            requests: 0,
            error: null,
          },
          {
            id: "wbrun_stuck_2",
            tenant_id: "ten_test",
            kind: "orders",
            status: "running",
            started_at: new Date("2026-09-17T15:38:00Z"),
            finished_at: null,
            rows: 0,
            requests: 0,
            error: null,
          },
        ],
        calls: [],
      }),
    });
    currentAdapter = adapter;

    const result = await projectFromMirrors(deps(mp) as never, "wb");

    expect(result.status).toBe("succeeded");
    expect(result.error).toBeNull();
    /** Neither stuck row was carried: both are still `running`, so history has not happened yet. */
    expect(result.counts.journal_runs).toBe(0);
    expect(mp.store.mpSyncRuns.filter((row) => row.status === "running" && row.id !== result.runId))
      .toHaveLength(0);
  });
});
