import type { MarketplaceAdapter, SyncOutcome } from "../../modules/marketplace/contract";
import { MARKETPLACE_MODULE } from "../../modules/marketplace";
import { decideDue, runOneSync } from "../../modules/marketplace/scheduler";
import { TENANT_MODULE } from "../../modules/tenant";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * MP_SCHEDULER=off (t-2026-09-25-23, Ivan 2026-09-25 ~21:30 WITA).
 *
 * TWO CLAIMS. The job's own tick must do nothing when the switch is off — no
 * tenant lookup, no `runDueSyncs`, therefore no marketplace request and no
 * `mp_sync_run` row, and the log line must print once across two ticks, not
 * every five minutes. «Обновить сейчас» must keep working with the switch on,
 * proven by running the SAME `decideDue` / `runOneSync` the route calls,
 * unmocked, against the real switch.
 */

jest.mock("../../modules/marketplace/scheduler", () => {
  const actual = jest.requireActual("../../modules/marketplace/scheduler");
  return { ...actual, runDueSyncs: jest.fn() };
});

const listTenants = jest.fn();
const infoLogs: string[] = [];
const logger = {
  info: (message: string) => infoLogs.push(message),
  warn: jest.fn(),
  error: jest.fn(),
};

const resolvers: Record<string, unknown> = {};
const container = {
  resolve: (key: string) => {
    if (!(key in resolvers)) {
      throw new Error(`unexpected resolve(${key})`);
    }
    return resolvers[key];
  },
};

beforeEach(() => {
  jest.resetModules();
  delete process.env.MP_SCHEDULER;
  infoLogs.length = 0;
  listTenants.mockReset();
  resolvers[ContainerRegistrationKeys.LOGGER] = logger;
  resolvers[ContainerRegistrationKeys.PG_CONNECTION] = { fake: "pg" };
  resolvers[TENANT_MODULE] = { listTenants };
});

describe("MP_SCHEDULER=off", () => {
  it("skips runDueSyncs entirely and logs the switch once across two runs", async () => {
    process.env.MP_SCHEDULER = "off";
    const { default: marketplaceSyncJob } = require("../marketplace-sync");
    const { runDueSyncs } = require("../../modules/marketplace/scheduler");

    await marketplaceSyncJob(container as any);
    await marketplaceSyncJob(container as any);

    expect(runDueSyncs).not.toHaveBeenCalled();
    expect(listTenants).not.toHaveBeenCalled();
    expect(infoLogs).toEqual([
      "[mp-sync] расписание выключено (MP_SCHEDULER=off) — синхронизация только по кнопке «Обновить сейчас»",
    ]);
  });
});

describe("MP_SCHEDULER unset", () => {
  it("runs exactly as before: today's behaviour, unchanged", async () => {
    const { default: marketplaceSyncJob } = require("../marketplace-sync");
    const { runDueSyncs } = require("../../modules/marketplace/scheduler");
    listTenants.mockResolvedValue([{ id: "ten_test", handle: "demo" }]);
    (runDueSyncs as jest.Mock).mockResolvedValue([]);

    await marketplaceSyncJob(container as any);

    expect(listTenants).toHaveBeenCalledTimes(1);
    expect(runDueSyncs).toHaveBeenCalledTimes(1);
    expect(runDueSyncs).toHaveBeenCalledWith(
      { container, tenantId: "ten_test", logger },
      expect.anything(),
      resolvers[ContainerRegistrationKeys.PG_CONNECTION],
    );
  });
});

describe("manual sync («Обновить сейчас») with the switch off", () => {
  /** A stand-in for `MarketplaceModuleService` over an array of rows. */
  const fakeMpService = () => {
    const rows: Record<string, unknown>[] = [];
    let seq = 0;
    return {
      rows,
      listMpSyncRuns: async (filter: Record<string, unknown>) =>
        rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value)),
      createMpSyncRuns: async (draft: Record<string, unknown>) => {
        seq += 1;
        const row = { id: `mprun_fake_${seq}`, ...draft };
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

  const fakeAdapter = (): MarketplaceAdapter =>
    ({
      id: "wb",
      label: "Wildberries",
      hostSuffixes: [],
      endpoints: [],
      mutationDenyList: [],
      read: async () => {
        throw new Error("not used here");
      },
      inspectCredentials: async () => {
        throw new Error("not used here");
      },
      readCredentials: async () => null,
      syncKinds: ["stocks"],
      runSync: async (): Promise<SyncOutcome> => ({
        kind: "stocks",
        runId: "wbrun_ok",
        rows: 3,
        requests: 1,
        status: "succeeded",
        error: null,
        retryAt: null,
      }),
      loadMirror: async () => [],
      loadJournal: async () => ({ runs: [], calls: [] }),
      normalize: {
        products: () => [],
        offers: () => [],
        orders: () => [],
        reviews: () => [],
        questions: () => [],
      },
    }) as unknown as MarketplaceAdapter;

  it("decideDue and runOneSync do not read MP_SCHEDULER: a forced sync still runs", async () => {
    process.env.MP_SCHEDULER = "off";
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("no test here may reach the network");
    });

    const mp = fakeMpService();
    const deps = {
      container: {
        resolve: <T,>(key: string): T => {
          if (key !== MARKETPLACE_MODULE) {
            throw new Error(`resolved ${key}, which manual sync has no business resolving`);
          }
          return mp as unknown as T;
        },
      },
      tenantId: "ten_test",
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };
    const adapter = fakeAdapter();

    const { verdict } = await decideDue(deps, adapter, "stocks", null, true);
    expect(verdict.due).toBe(true);

    const result = await runOneSync(deps, adapter, "stocks", "token", null, true);

    expect(result.outcome).toBe("succeeded");
    expect(result.rows).toBe(3);
    expect(mp.rows).toHaveLength(1);
    expect(mp.rows[0]).toMatchObject({ status: "succeeded", kind: "stocks" });

    jest.restoreAllMocks();
  });
});
