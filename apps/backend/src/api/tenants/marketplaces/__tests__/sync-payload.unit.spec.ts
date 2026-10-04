import type { MarketplaceAdapter } from "../../../../modules/marketplace/contract";
import { MP_STALE_LOCK_MS } from "../../../../modules/marketplace/schedule";
import {
  buildSyncPayload,
  syncInProgress,
  syncViewOf,
  type SyncPayloadDeps,
  type SyncRunRow,
} from "../sync-payload";

/**
 * «Обновление» of one marketplace against the screen of all of them
 * (task-07 of ask-20261005-023327-f02b), without a database.
 *
 * The one-marketplace route has to say exactly what the shared route says
 * about that marketplace, and nothing about any other: the same kinds with the
 * same states and dates, only its own warnings, and no key check of another
 * marketplace on the way (Ozon's is a live request). Every adapter and every
 * read below is a stand-in, so nothing here can reach a marketplace.
 */

const NOW = new Date("2026-10-05T03:00:00.000Z");
const TENANT = "tenant_a";

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const run = (over: Partial<SyncRunRow> & Pick<SyncRunRow, "kind" | "status">): SyncRunRow & {
  tenant_id: string;
  marketplace: string;
} => ({
  id: `run_${Math.random().toString(36).slice(2)}`,
  tenant_id: TENANT,
  marketplace: "wb",
  is_fixture: false,
  started_at: minutesAgo(10),
  finished_at: minutesAgo(9),
  retry_at: null,
  attempts: 1,
  rows: 10,
  requests: 1,
  error: null,
  ...over,
});

type Row = ReturnType<typeof run>;

/** A stand-in for the marketplace module: filters like `listMpSyncRuns` does, newest first. */
const fakeMp = (rows: Row[]) => {
  const asked: Record<string, unknown>[] = [];
  const journalled: unknown[] = [];
  const mp = {
    listMpSyncRuns: async (filters: Record<string, unknown>) => {
      asked.push(filters);
      return rows
        .filter((row) =>
          Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
        )
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    },
    createMpApiCalls: async (entry: unknown) => {
      journalled.push(entry);
      return entry;
    },
  } as unknown as SyncPayloadDeps["mp"];
  return { mp, asked, journalled };
};

type FakeAdapterOptions = {
  id: string;
  label: string;
  syncKinds: string[];
  keySet: boolean;
  expiringSoon?: boolean;
};

/** An adapter that counts how often its key was read and asked, and never opens a socket. */
const fakeAdapter = (options: FakeAdapterOptions) => {
  const calls = { read: 0, inspect: 0 };
  const adapter = {
    id: options.id,
    label: options.label,
    syncKinds: options.syncKinds,
    readCredentials: async () => {
      calls.read += 1;
      return options.keySet
        ? { credentials: "secret", isEnabled: true, last4: "c6Sg", updatedAt: minutesAgo(600) }
        : null;
    },
    inspectCredentials: async (credentials: unknown) => {
      calls.inspect += 1;
      return {
        set: Boolean(credentials),
        last4: credentials ? "c6Sg" : null,
        expiresAt: credentials ? "2027-03-17T00:00:00.000Z" : null,
        expired: credentials ? false : null,
        expiresInDays: credentials ? (options.expiringSoon ? 9 : 163) : null,
        expiringSoon: Boolean(credentials && options.expiringSoon),
        readOnly: "unknown",
        readOnlySource: null,
        scopes: [],
        raw: {},
        error: null,
      };
    },
  } as unknown as MarketplaceAdapter;
  return { adapter, calls };
};

const setUp = () => {
  const wb = fakeAdapter({ id: "wb", label: "Wildberries", syncKinds: ["cards", "orders", "fbs_orders"], keySet: true });
  const ozon = fakeAdapter({
    id: "ozon",
    label: "Ozon",
    syncKinds: ["products", "postings"],
    keySet: true,
    expiringSoon: true,
  });
  const rows: Row[] = [
    run({ kind: "cards", status: "succeeded", rows: 423 }),
    run({ kind: "cards", status: "failed", error: "500 Internal Server Error", started_at: minutesAgo(80), finished_at: minutesAgo(79) }),
    run({ kind: "orders", status: "rate_limited", retry_at: new Date(NOW.getTime() + 22 * 60_000) }),
    run({ kind: "fbs_orders", status: "failed", error: "429 Too Many Requests" }),
    run({ kind: "projection", status: "succeeded", rows: 0 }),
    run({ kind: "products", status: "failed", error: "403 Forbidden", marketplace: "ozon" }),
    // Another tenant's row: never part of this tenant's answer.
    run({ kind: "cards", status: "failed", error: "foreign", tenant_id: "tenant_b", started_at: minutesAgo(1) }),
  ];
  return { wb, ozon, rows };
};

describe("«Обновление» of one marketplace", () => {
  it("carries the same entry for the marketplace as the shared answer does", async () => {
    const { wb, ozon, rows } = setUp();
    const deps = { pg: null, mp: fakeMp(rows).mp, tenantId: TENANT, now: NOW };

    const all = await buildSyncPayload(deps, [wb.adapter, ozon.adapter]);
    const one = syncViewOf(await buildSyncPayload(deps, [wb.adapter]), "wb");

    expect(one).not.toBeNull();
    expect(one?.marketplace).toEqual(all.marketplaces.find((entry) => entry.id === "wb"));
    expect(one?.schedule).toEqual(all.schedule);
    expect(one?.now).toBe(NOW.toISOString());
  });

  it("lists every kind of the marketplace plus the projection, with null for a kind that never ran", async () => {
    const { wb, rows } = setUp();
    const deps = { pg: null, mp: fakeMp(rows).mp, tenantId: TENANT, now: NOW };

    const one = syncViewOf(await buildSyncPayload(deps, [wb.adapter]), "wb");
    const kinds = one?.marketplace.kinds ?? [];

    expect(kinds.map((kind) => kind.kind)).toEqual(["cards", "orders", "fbs_orders", "projection"]);
    const cards = kinds.find((kind) => kind.kind === "cards");
    expect(cards?.status).toBe("succeeded");
    expect(cards?.rows).toBe(423);
    // The last failure survives the later success.
    expect(cards?.last_failure_error).toBe("500 Internal Server Error");
    expect(kinds.find((kind) => kind.kind === "orders")?.due_reason).toBe("waiting");
  });

  it("names a kind that has never run as null, not as zero rows", async () => {
    const { wb } = setUp();
    const deps = { pg: null, mp: fakeMp([]).mp, tenantId: TENANT, now: NOW };

    const one = syncViewOf(await buildSyncPayload(deps, [wb.adapter]), "wb");

    for (const kind of one?.marketplace.kinds ?? []) {
      expect(kind.status).toBeNull();
      expect(kind.rows).toBeNull();
      expect(kind.last_success_at).toBeNull();
    }
    expect(one?.warnings.every((warning) => warning.type === "never_ran")).toBe(true);
  });

  it("carries only its own warnings, the same ones the shared answer has for it", async () => {
    const { wb, ozon, rows } = setUp();
    const deps = { pg: null, mp: fakeMp(rows).mp, tenantId: TENANT, now: NOW };

    const all = await buildSyncPayload(deps, [wb.adapter, ozon.adapter]);
    const one = syncViewOf(await buildSyncPayload(deps, [wb.adapter]), "wb");

    // The shared answer has warnings of both marketplaces…
    expect(new Set(all.warnings.map((warning) => warning.marketplace))).toEqual(new Set(["wb", "ozon"]));
    // …and the one-marketplace answer only the Wildberries ones, all of them.
    expect(one?.warnings.length).toBeGreaterThan(0);
    expect(one?.warnings.every((warning) => warning.marketplace === "wb")).toBe(true);
    expect(one?.warnings).toEqual(all.warnings.filter((warning) => warning.marketplace === "wb"));
    expect(one?.warnings.map((warning) => [warning.type, warning.kind])).toEqual([["failed", "fbs_orders"]]);
  });

  it("does not read or ask another marketplace's key on the way", async () => {
    const { wb, ozon, rows } = setUp();
    const fake = fakeMp(rows);
    const deps = { pg: null, mp: fake.mp, tenantId: TENANT, now: NOW };

    await buildSyncPayload(deps, [wb.adapter]);

    expect(ozon.calls).toEqual({ read: 0, inspect: 0 });
    expect(wb.calls).toEqual({ read: 1, inspect: 1 });
    expect(fake.asked.every((filters) => filters.marketplace === "wb" && filters.tenant_id === TENANT)).toBe(true);
    // Wildberries' key is decoded, never sent: nothing went into the request journal.
    expect(fake.journalled).toHaveLength(0);
  });

  it("answers null for a marketplace the answer does not hold", async () => {
    const { wb, rows } = setUp();
    const deps = { pg: null, mp: fakeMp(rows).mp, tenantId: TENANT, now: NOW };

    expect(syncViewOf(await buildSyncPayload(deps, [wb.adapter]), "ozon")).toBeNull();
  });

  it("warns about a missing key and nothing else when the marketplace has none", async () => {
    const bare = fakeAdapter({ id: "wb", label: "Wildberries", syncKinds: ["cards"], keySet: false });
    const deps = { pg: null, mp: fakeMp([]).mp, tenantId: TENANT, now: NOW };

    const one = syncViewOf(await buildSyncPayload(deps, [bare.adapter]), "wb");

    expect(one?.marketplace.connection.key).toEqual({ set: false, last4: null });
    expect(one?.warnings.map((warning) => warning.type)).toEqual(["no_key"]);
  });
});

describe("«уже идёт»", () => {
  it("is scoped to the marketplace when one is named", async () => {
    const { mp } = fakeMp([run({ kind: "products", status: "running", marketplace: "ozon", started_at: minutesAgo(2), finished_at: null })]);

    expect(await syncInProgress(mp, TENANT, NOW)).toBe(true);
    expect(await syncInProgress(mp, TENANT, NOW, "ozon")).toBe(true);
    expect(await syncInProgress(mp, TENANT, NOW, "wb")).toBe(false);
  });

  it("does not count a lock older than the stale-lock timeout, or another tenant's", async () => {
    const { mp } = fakeMp([
      run({
        kind: "cards",
        status: "running",
        started_at: new Date(NOW.getTime() - MP_STALE_LOCK_MS - 60_000),
        finished_at: null,
      }),
      run({ kind: "cards", status: "running", tenant_id: "tenant_b", started_at: minutesAgo(1), finished_at: null }),
    ]);

    expect(await syncInProgress(mp, TENANT, NOW, "wb")).toBe(false);
  });
});
