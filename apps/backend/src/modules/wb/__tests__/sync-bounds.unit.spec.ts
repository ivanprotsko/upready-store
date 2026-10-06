import {
  callsOverBound,
  recordingService,
  type Row,
} from "../../marketplace/__tests__/recording-service";
import { runSync, upsertRows, type WbSyncDeps } from "../sync";
import type WbModuleService from "../service";

/**
 * One run's memory is bounded (t-2026-10-06-21).
 *
 * On 2026-10-06 the backend of the Russian host died five times of
 * `JavaScript heap out of memory` during a Wildberries sync. One statistics
 * answer carried 25 597 orders and the import handed all of them to one
 * `updateWbOrders`, which loads every targeted row whole by a chain of one
 * `id = ?` per row. The assembly-order import read its whole mirror, `raw`
 * included, to learn the order numbers.
 *
 * Every scenario below is checked twice. The first check is the STATE: the
 * rows in the mirror and the counters of the run. It holds for the code before
 * the bound too, which is the proof that the bound changed no row. The second
 * check is the CALLS, and it is the one the old code fails.
 *
 * `BOUND` is written here and not imported, so that against the old code this
 * file fails on its assertions and not on a missing export.
 */
const BOUND = 500;
const ROWS = 30_000;
const TENANT = "ten_bounds";

type Fake = ReturnType<typeof recordingService>;

const deps = (fake: Fake): WbSyncDeps => ({
  wb: fake.service as unknown as WbModuleService,
  tenantId: TENANT,
  token: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.test.test-signature",
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
});

const answer = (body: unknown) =>
  ({
    status: 200,
    ok: true,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const padded = (index: number) => String(index).padStart(7, "0");

/** One line of `GET /api/v1/supplier/orders`. The field names are WB's, the values invented. */
const statisticsOrder = (index: number) => ({
  srid: `srid-${padded(index)}`,
  nmId: 100_000 + (index % 400),
  supplierArticle: `art-${index % 400}`,
  barcode: `20000000${padded(index)}`,
  totalPrice: 1000 + index,
  discountPercent: 10,
  finishedPrice: 900 + index,
  isCancel: index % 50 === 0,
  warehouseName: "Коледино",
  regionName: "Москва",
  date: "2026-10-01T10:00:00",
  lastChangeDate: "2026-10-05T10:00:00",
});

describe("a statistics answer of 30 000 orders", () => {
  let fetchSpy: jest.SpyInstance;
  let fake: Fake;
  let outcome: Awaited<ReturnType<typeof runSync>>;

  beforeAll(async () => {
    /** Half of the orders are already mirrored, with an older price and WB's whole answer in `raw`. */
    const seeded: Row[] = Array.from({ length: ROWS / 2 }, (_, index) => ({
      id: `wbord_seed_${padded(index)}`,
      tenant_id: TENANT,
      srid: `srid-${padded(index * 2)}`,
      finished_price: 1,
      raw: statisticsOrder(index * 2),
    }));
    fake = recordingService({ WbOrders: seeded, WbSyncRuns: [], WbApiCalls: [] });

    let pages = 0;
    fetchSpy = jest.spyOn(globalThis, "fetch" as never);
    fetchSpy.mockImplementation(((url: string) => {
      if (!String(url).includes("/api/v1/supplier/orders")) {
        throw new Error(`A test asked for an endpoint it did not record: ${url}`);
      }
      pages += 1;
      return Promise.resolve(
        answer(pages === 1 ? Array.from({ length: ROWS }, (_, index) => statisticsOrder(index)) : []),
      );
    }) as never);

    outcome = await runSync(deps(fake), "orders");
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it("mirrors every order once and reports the rows in the run", () => {
    expect(outcome).toMatchObject({ status: "succeeded", rows: ROWS, requests: 2 });
    expect(fake.tables.WbSyncRuns[0]).toMatchObject({ status: "succeeded", rows: ROWS, requests: 2 });

    const mirror = fake.tables.WbOrders;
    expect(mirror).toHaveLength(ROWS);
    expect(new Set(mirror.map((row) => row.srid)).size).toBe(ROWS);

    for (const row of mirror) {
      const index = Number(String(row.srid).slice("srid-".length));
      expect(row.finished_price).toBe(900 + index);
      expect(row.tenant_id).toBe(TENANT);
    }

    /** A mirrored order is updated in place: it keeps its id. */
    const seededIds = mirror.filter((row) => row.id.startsWith("wbord_seed_"));
    expect(seededIds).toHaveLength(ROWS / 2);
    expect(seededIds.every((row) => Number(String(row.srid).slice(-7)) % 2 === 0)).toBe(true);
  });

  it("hands no service call more than 500 rows or keys", () => {
    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
    /** And the lookups read the id and the key, not WB's whole answer. */
    const lookups = fake.calls.filter((call) => call.method === "listWbOrders");
    expect(lookups.length).toBeGreaterThan(0);
    expect(lookups.every((call) => call.select?.join() === "id,srid")).toBe(true);
  });
});

describe("an assembly-order run over a mirror of 30 000 orders", () => {
  let fetchSpy: jest.SpyInstance;
  let fake: Fake;
  let outcome: Awaited<ReturnType<typeof runSync>>;
  let asked: number[][];

  beforeAll(async () => {
    const seeded: Row[] = Array.from({ length: ROWS }, (_, index) => ({
      id: `wbfbs_seed_${padded(index)}`,
      tenant_id: TENANT,
      order_id: String(7_000_000_000 + index),
      supplier_status: null,
      raw: { id: 7_000_000_000 + index, article: `art-${index}`, skus: ["2000000000001"] },
    }));
    fake = recordingService({ WbFbsOrders: seeded, WbSyncRuns: [], WbApiCalls: [] });

    asked = [];
    fetchSpy = jest.spyOn(globalThis, "fetch" as never);
    fetchSpy.mockImplementation(((url: string, init?: { body?: string }) => {
      if (String(url).includes("/api/v3/orders/new")) {
        return Promise.resolve(answer({ orders: [] }));
      }
      if (String(url).includes("/api/v3/orders/status")) {
        const ids = (JSON.parse(init?.body ?? "{}") as { orders: number[] }).orders;
        asked.push(ids);
        return Promise.resolve(
          answer({
            orders: ids.map((id) => ({
              id,
              supplierStatus: "confirm",
              wbStatus: "waiting",
              isCancellable: true,
              isTransferable: false,
            })),
          }),
        );
      }
      if (String(url).includes("/api/v3/orders")) {
        return Promise.resolve(answer({ next: 0, orders: [] }));
      }
      throw new Error(`A test asked for an endpoint it did not record: ${url}`);
    }) as never);

    outcome = await runSync(deps(fake), "fbs_orders");
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it("asks WB for the status of every mirrored order and writes it", () => {
    /** One request for the new orders, one for the list, thirty for the statuses. */
    expect(outcome).toMatchObject({ status: "succeeded", rows: ROWS, requests: 32 });
    expect(asked).toHaveLength(ROWS / 1000);
    expect(asked.every((ids) => ids.length === 1000)).toBe(true);
    expect(new Set(asked.flat()).size).toBe(ROWS);

    expect(fake.tables.WbFbsOrders).toHaveLength(ROWS);
    expect(
      fake.tables.WbFbsOrders.every(
        (row) => row.supplier_status === "confirm" && row.is_cancellable === true,
      ),
    ).toBe(true);
  });

  it("hands no service call more than 500 rows or keys", () => {
    expect(callsOverBound(fake.calls, BOUND)).toEqual([]);
  });

  it("reads the mirror for its order numbers and leaves the raw answer in the database", () => {
    const scans = fake.calls.filter(
      (call) => call.method === "listWbFbsOrders" && call.keys === 0,
    );
    expect(scans).toHaveLength(ROWS / BOUND + 1);
    expect(scans.every((call) => call.select?.join() === "id,order_id")).toBe(true);
  });
});

/**
 * `upsertRows` as it stood before the bound, kept here as the reference: one
 * lookup for every key of the answer, one create, one update.
 */
const unboundedUpsert = async (
  fake: Fake,
  table: string,
  rows: { keys: Record<string, unknown>; values: Record<string, unknown> }[],
): Promise<number> => {
  const service = fake.service as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const keyNames = Object.keys(rows[0].keys);
  const existing = (await service[`list${table}`]({
    tenant_id: TENANT,
    ...Object.fromEntries(
      keyNames.map((name) => [name, [...new Set(rows.map((row) => row.keys[name]))]]),
    ),
  })) as Row[];

  const keyOf = (source: Record<string, unknown>) =>
    keyNames.map((name) => String(source[name])).join(" ");
  const byKey = new Map(existing.map((row) => [keyOf(row), row.id]));

  const toCreate = new Map<string, Record<string, unknown>>();
  const toUpdate: Record<string, unknown>[] = [];
  for (const row of rows) {
    const key = keyOf(row.keys);
    const id = byKey.get(key);
    if (id) {
      toUpdate.push({ id, ...row.values });
    } else {
      toCreate.set(key, { tenant_id: TENANT, ...row.keys, ...row.values });
    }
  }
  if (toCreate.size) {
    await service[`create${table}`]([...toCreate.values()]);
  }
  if (toUpdate.length) {
    await service[`update${table}`](toUpdate);
  }
  return toCreate.size + toUpdate.length;
};

describe("upsertRows writes what one unbounded upsert writes", () => {
  /**
   * 30 000 sales lines on a composite key. Every thousandth line repeats the
   * key of its neighbour, so the copies fall into one batch; another repeats
   * the key of the line 700 places back, so the copies fall into two. Both
   * happen to keys the mirror already holds and to keys it does not.
   */
  const keyIndex = (index: number) => {
    if (index % 1000 === 999) {
      return index - 1;
    }
    if (index % 1000 === 700) {
      return index - 700;
    }
    return index;
  };
  const rows = Array.from({ length: ROWS }, (_, index) => ({
    keys: { srid: `srid-${padded(keyIndex(index))}`, sale_id: `S${padded(keyIndex(index))}` },
    values: { for_pay: index },
  }));
  const seed = (): Row[] =>
    Array.from({ length: 10_000 }, (_, index) => ({
      id: `wbsale_seed_${padded(index)}`,
      tenant_id: TENANT,
      srid: `srid-${padded(index * 2)}`,
      sale_id: `S${padded(index * 2)}`,
      for_pay: -1,
    }));

  let bounded: Fake;
  let reference: Fake;
  let written: number;
  let expected: number;

  beforeAll(async () => {
    bounded = recordingService({ WbSales: seed() });
    reference = recordingService({ WbSales: seed() });
    written = await upsertRows(bounded.service as unknown as WbModuleService, "WbSale", TENANT, rows);
    expected = await unboundedUpsert(reference, "WbSales", rows);
  });

  it("leaves the same rows, with the same ids, and returns the same count", () => {
    expect(written).toBe(expected);
    expect(bounded.tables.WbSales).toEqual(reference.tables.WbSales);
  });

  it("hands no service call more than 500 rows or keys, where the reference hands the whole answer", () => {
    expect(callsOverBound(bounded.calls, BOUND)).toEqual([]);
    expect(callsOverBound(reference.calls, BOUND).length).toBeGreaterThan(0);
  });
});
