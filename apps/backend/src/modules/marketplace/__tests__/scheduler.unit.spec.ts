import * as backoff from "../backoff";
import { MP_MAX_ATTEMPTS, MP_MAX_TOTAL_BACKOFF_MS } from "../backoff";
import type { MarketplaceAdapter, SyncOutcome } from "../contract";
import { MARKETPLACE_MODULE } from "../index";
import { MP_STALE_LOCK_MS } from "../schedule";
import { isUniqueViolation, runOneSync } from "../scheduler";

/**
 * THE SINGLE-RUN RULE AND THE BACKOFF (w16-mp-scheduler-ops, spec 2.6).
 *
 * Both are tested against a fake `mp_sync_run` that behaves like the real
 * table: its `create` refuses a second `running` row for one triple with a
 * Postgres 23505, which is what the partial unique index of
 * `Migration20260916014707` does. The lock is therefore tested as the product
 * implements it — as a database constraint — and not as an `if` somebody could
 * delete without a failing test.
 *
 * `fetch` is spied on in every case. A run that was refused the lock must
 * reach no network at all, and "it returned early" is a claim about code while
 * "zero requests left the process" is a measurement.
 */

type Row = Record<string, unknown> & { id: string };

/** A stand-in for `MarketplaceModuleService` over an array of rows. */
const fakeService = () => {
  const rows: Row[] = [];
  let seq = 0;

  return {
    rows,
    listMpSyncRuns: async (
      filter: Record<string, unknown>,
      options?: { order?: Record<string, string>; take?: number },
    ) => {
      const found = rows
        .filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value))
        .sort(
          (a, b) =>
            (b.started_at as Date).getTime() - (a.started_at as Date).getTime(),
        );
      return options?.take ? found.slice(0, options.take) : found;
    },
    /**
     * The partial unique index, in JavaScript. Nothing is awaited between the
     * check and the push, exactly as Postgres takes the constraint inside the
     * INSERT: two callers that both got past `listMpSyncRuns` still cannot
     * both open a run.
     */
    createMpSyncRuns: async (draft: Record<string, unknown>) => {
      if (
        draft.status === "running" &&
        rows.some(
          (row) =>
            row.status === "running" &&
            row.tenant_id === draft.tenant_id &&
            row.marketplace === draft.marketplace &&
            row.kind === draft.kind,
        )
      ) {
        const error = new Error(
          'duplicate key value violates unique constraint ' +
            '"IDX_mp_sync_run_tenant_id_marketplace_kind_unique" on table "mp_sync_run"',
        ) as Error & { code?: string };
        error.code = "23505";
        throw error;
      }
      seq += 1;
      const row = { id: `mprun_fake_${seq}`, ...draft } as Row;
      rows.push(row);
      return row;
    },
    updateMpSyncRuns: async (patch: Record<string, unknown> & { id: string }) => {
      const row = rows.find((entry) => entry.id === patch.id);
      if (!row) {
        throw new Error(`no such run ${patch.id}`);
      }
      Object.assign(row, patch);
      return row;
    },
  };
};

type Service = ReturnType<typeof fakeService>;

const deps = (
  mp: Service,
  now = new Date("2026-09-16T10:00:00.000Z"),
  waited: number[] = [],
) => ({
  container: {
    resolve: <T,>(key: string): T => {
      if (key !== MARKETPLACE_MODULE) {
        throw new Error(`the scheduler resolved ${key}, which it has no business resolving`);
      }
      return mp as unknown as T;
    },
  },
  tenantId: "ten_test",
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  now: () => now,
  sleep: async (ms: number) => {
    waited.push(ms);
  },
});

/** An adapter whose only job is to answer `runSync` the way the test wants. */
const fakeAdapter = (
  runSync: (kind: string) => Promise<SyncOutcome>,
): MarketplaceAdapter & { calls: string[] } => {
  const calls: string[] = [];
  return {
    id: "wb",
    label: "Wildberries",
    hostSuffixes: [],
    endpoints: [],
    mutationDenyList: [],
    read: async () => {
      throw new Error("the scheduler must never read directly");
    },
    inspectCredentials: async () => {
      throw new Error("not used here");
    },
    readCredentials: async () => null,
    syncKinds: ["stocks"],
    runSync: async (_deps, kind) => {
      calls.push(kind);
      return runSync(kind);
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
    calls,
  } as unknown as MarketplaceAdapter & { calls: string[] };
};

const succeeded = (rows: number): SyncOutcome => ({
  kind: "stocks",
  runId: "wbrun_ok",
  rows,
  requests: 4,
  status: "succeeded",
  error: null,
  retryAt: null,
});

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => {
      throw new Error("no test here may reach the network");
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("one run per (tenant x marketplace x kind)", () => {
  it("a second start while the first is running does not start, and sends nothing", async () => {
    const mp = fakeService();
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const adapter = fakeAdapter(async () => {
      await held;
      return succeeded(11_605);
    });

    const first = runOneSync(deps(mp), adapter, "stocks", "token");
    const second = runOneSync(deps(mp), adapter, "stocks", "token");

    // The second call has to have made its decision before the first finishes,
    // or the test would be measuring a sequence and calling it a race.
    const secondResult = await second;
    expect(secondResult.outcome).toBe("skipped");
    expect(secondResult.reason).toBe("locked");

    release!();
    const firstResult = await first;
    expect(firstResult.outcome).toBe("succeeded");
    expect(firstResult.rows).toBe(11_605);

    // ONE adapter call, ONE row, ZERO requests from the refused caller.
    expect(adapter.calls).toEqual(["stocks"]);
    expect(mp.rows).toHaveLength(1);
    expect(mp.rows.filter((row) => row.status === "running")).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("recognises the constraint the migration creates", () => {
    const error = new Error("boom") as Error & { code?: string };
    error.code = "23505";
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(new Error("something else"))).toBe(false);
    expect(
      isUniqueViolation({
        message: "insert failed",
        cause: new Error('duplicate key value violates unique constraint on table "mp_sync_run"'),
      }),
    ).toBe(true);
  });

  it("takes over a lock older than the timeout and leaves the dead row visible", async () => {
    const mp = fakeService();
    const now = new Date("2026-09-16T10:00:00.000Z");
    mp.rows.push({
      id: "mprun_dead",
      tenant_id: "ten_test",
      marketplace: "wb",
      kind: "stocks",
      status: "running",
      started_at: new Date(now.getTime() - MP_STALE_LOCK_MS - 60_000),
      finished_at: null,
      rows: 0,
      requests: 0,
      error: null,
    });

    const adapter = fakeAdapter(async () => succeeded(7));
    const result = await runOneSync(deps(mp, now), adapter, "stocks", "token");

    expect(result.outcome).toBe("succeeded");
    expect(result.reason).toBe("stale_lock_taken_over");

    const dead = mp.rows.find((row) => row.id === "mprun_dead")!;
    expect(dead.status).toBe("failed");
    expect(String(dead.error)).toContain("Прогон не завершился");
    expect(mp.rows).toHaveLength(2);
  });
});

describe("the 429 backoff", () => {
  const rateLimited = (retryAt: Date | null): SyncOutcome => ({
    kind: "stocks",
    runId: "wbrun_429",
    rows: 0,
    requests: 1,
    status: "rate_limited",
    error: "WB stocks answered 429: too many requests",
    retryAt,
  });

  it("tries three times, waits no longer than the shared cap, and records the window", async () => {
    const waited: number[] = [];
    const mp = fakeService();
    const now = new Date("2026-09-16T10:00:00.000Z");
    // WB asks for 5 s, which is inside the 30 s cap: the wait is honoured.
    const retryAt = new Date(now.getTime() + 5_000);
    const adapter = fakeAdapter(async () => rateLimited(retryAt));

    const result = await runOneSync(deps(mp, now, waited), adapter, "stocks", "token");

    expect(adapter.calls).toHaveLength(MP_MAX_ATTEMPTS);
    expect(result.attempts).toBe(MP_MAX_ATTEMPTS);
    expect(result.outcome).toBe("rate_limited");
    expect(result.retryAt).toEqual(retryAt);

    // The waits: one fewer than the attempts, each the window WB named.
    expect(waited).toEqual([5_000, 5_000]);
    const total = waited.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeLessThanOrEqual(MP_MAX_TOTAL_BACKOFF_MS);

    const row = mp.rows[0];
    expect(row.status).toBe("rate_limited");
    expect(row.attempts).toBe(MP_MAX_ATTEMPTS);
    expect(row.retry_at).toEqual(retryAt);
    expect(String(row.error)).toContain("429");
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("does not wait out a window longer than the cap: it ends and says when", async () => {
    const waited: number[] = [];
    const mp = fakeService();
    const now = new Date("2026-09-16T10:00:00.000Z");
    // The 10 524 s WB answered on a base token. Sleeping it is a hung sync.
    const retryAt = new Date(now.getTime() + 10_524_000);
    const adapter = fakeAdapter(async () => rateLimited(retryAt));

    const result = await runOneSync(deps(mp, now, waited), adapter, "stocks", "token");

    expect(waited).toEqual([]);
    expect(adapter.calls).toHaveLength(1);
    expect(result.attempts).toBe(1);
    expect(result.outcome).toBe("rate_limited");
    expect(result.retryAt).toEqual(retryAt);
  });

  it("the total wait of any retry chain is bounded by the shared policy", () => {
    // Even with no window named at all, the growing default is capped.
    const worst = Array.from({ length: MP_MAX_ATTEMPTS - 1 }, (_unused, index) =>
      backoff.backoffForMs(null, index + 1),
    );
    expect(worst.every((ms) => ms !== null && ms <= backoff.MP_MAX_BACKOFF_MS)).toBe(true);
    expect(worst.reduce((sum: number, ms) => sum + (ms ?? 0), 0)).toBeLessThanOrEqual(
      MP_MAX_TOTAL_BACKOFF_MS,
    );
  });

  it("a failure is not retried, and the run keeps its message", async () => {
    const waited: number[] = [];
    const mp = fakeService();
    const adapter = fakeAdapter(async () => ({
      kind: "stocks",
      runId: "wbrun_bad",
      rows: 0,
      requests: 1,
      status: "failed" as const,
      error: "WB stocks answered 500: upstream is down",
      retryAt: null,
    }));

    const result = await runOneSync(deps(mp, undefined, waited), adapter, "stocks", "token");

    expect(adapter.calls).toHaveLength(1);
    expect(waited).toEqual([]);
    expect(result.outcome).toBe("failed");
    expect(mp.rows[0].status).toBe("failed");
    expect(String(mp.rows[0].error)).toContain("500");
  });

  it("an adapter that throws leaves a failed row rather than a gap", async () => {
    const mp = fakeService();
    const adapter = fakeAdapter(async () => {
      throw new Error("the WB module is not registered on this stand");
    });

    const result = await runOneSync(deps(mp), adapter, "stocks", "token");

    expect(result.outcome).toBe("failed");
    expect(mp.rows).toHaveLength(1);
    expect(mp.rows[0].status).toBe("failed");
    expect(String(mp.rows[0].error)).toContain("not registered");
  });
});
