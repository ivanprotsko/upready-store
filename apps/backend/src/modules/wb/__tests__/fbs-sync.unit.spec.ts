import { runSync, type WbSyncDeps } from "../sync";
import type WbModuleService from "../service";

/**
 * The FBS mirror, proven on recorded answers (w23-wb-write-fbs-orders).
 *
 * The fixtures below are the SHAPE measured against the live cabinet on
 * 2026-09-16 (`scripts/fixtures/w23-probe-fbs.ts`, quoted in
 * artifacts/docs/w23-wb-write-fbs-orders/measurements.md) with invented ids
 * and an invented address: the field names are real, the values are not, and
 * no test of this repository may carry a buyer's address.
 *
 * `fetch` is a spy answering from the fixtures, so the suite proves what the
 * import does with an answer rather than that WB is reachable.
 */

const ORDER_NEW = {
  id: 5776992764,
  rid: "rid-1",
  orderUid: "uid-1",
  article: "Спрей 6%",
  nmId: 1289608338,
  chrtId: 555,
  skus: ["2000000000001"],
  price: 46800,
  convertedPrice: 46800,
  currencyCode: 643,
  deliveryType: "fbs",
  cargoType: 1,
  warehouseId: 1955595,
  officeId: 42,
  createdAt: "2026-09-15T10:00:00Z",
  // The three fields the mirror must drop before writing a row.
  address: { province: "…", city: "…", home: "…" },
  comment: "позвоните заранее",
  userId: { id: 777 },
};

/** `GET /api/v3/orders` carries `supplyId` and does NOT carry the PII trio. */
const ORDER_IN_SUPPLY = {
  id: 5776992765,
  rid: "rid-2",
  orderUid: "uid-2",
  supplyId: "WB-GI-1234567",
  article: "Мазь 15%",
  nmId: 242956159,
  chrtId: 556,
  skus: ["2000000000002"],
  price: 75700,
  convertedPrice: 75700,
  currencyCode: 643,
  deliveryType: "fbs",
  cargoType: 1,
  warehouseId: 1943254,
  officeId: 42,
  createdAt: "2026-09-14T09:00:00Z",
};

const SUPPLY = {
  id: "WB-GI-1234567",
  name: "Поставка 14 сентября",
  done: false,
  cargoType: 1,
  destinationOfficeId: 42,
  createdAt: "2026-09-14T08:00:00Z",
  closedAt: null,
  scanDt: null,
};

const STATUSES = [
  { id: 5776992764, supplierStatus: "new", wbStatus: "waiting", isCancellable: true, isTransferable: false },
  { id: 5776992765, supplierStatus: "confirm", wbStatus: "waiting", isCancellable: true, isTransferable: true },
];

/** A module service that keeps its rows in memory, keyed the way the real one is. */
const fakeService = () => {
  const tables: Record<string, Array<Record<string, unknown> & { id: string }>> = {
    WbFbsOrders: [],
    WbSupplies: [],
    WbSyncRuns: [],
    WbApiCalls: [],
  };
  let seq = 0;

  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) =>
      Array.isArray(value) ? value.map(String).includes(String(row[key])) : String(row[key]) === String(value),
    );

  const api = {} as Record<string, unknown>;

  for (const table of Object.keys(tables)) {
    api[`list${table}`] = async (filter: Record<string, unknown> = {}) =>
      tables[table].filter((row) => matches(row, filter));
    api[`create${table}`] = async (input: unknown) => {
      const rows = Array.isArray(input) ? input : [input];
      const created = rows.map((row) => {
        seq += 1;
        const withId = { ...(row as Record<string, unknown>), id: `${table}_${seq}` };
        tables[table].push(withId);
        return withId;
      });
      return Array.isArray(input) ? created : created[0];
    };
    api[`update${table}`] = async (input: unknown) => {
      const rows = Array.isArray(input) ? input : [input];
      for (const row of rows) {
        const target = tables[table].find((candidate) => candidate.id === (row as { id: string }).id);
        Object.assign(target ?? {}, row);
      }
      return input;
    };
  }

  return { tables, service: api as unknown as WbModuleService };
};

const deps = (fake: ReturnType<typeof fakeService>): WbSyncDeps => ({
  wb: fake.service,
  tenantId: "ten_w23",
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

describe("the FBS mirror", () => {
  let fetchSpy: jest.SpyInstance;
  let urls: string[];

  beforeEach(() => {
    urls = [];
    fetchSpy = jest.spyOn(globalThis, "fetch" as never);
    fetchSpy.mockImplementation(((url: string) => {
      urls.push(String(url));
      if (String(url).includes("/api/v3/orders/new")) {
        return Promise.resolve(answer({ orders: [ORDER_NEW] }));
      }
      if (String(url).includes("/api/v3/orders/status")) {
        return Promise.resolve(answer({ orders: STATUSES }));
      }
      if (String(url).includes("/api/v3/orders")) {
        return Promise.resolve(answer({ next: 0, orders: [ORDER_IN_SUPPLY] }));
      }
      if (String(url).includes("/api/v3/supplies")) {
        return Promise.resolve(answer({ next: 0, supplies: [SUPPLY] }));
      }
      throw new Error(`A test asked for an endpoint it did not record: ${url}`);
    }) as never);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("mirrors supplies and records the run", async () => {
    const fake = fakeService();
    const outcome = await runSync(deps(fake), "supplies");

    expect(outcome.status).toBe("succeeded");
    expect(fake.tables.WbSupplies).toHaveLength(1);
    expect(fake.tables.WbSupplies[0]).toMatchObject({
      supply_id: "WB-GI-1234567",
      name: "Поставка 14 сентября",
      done: false,
      tenant_id: "ten_w23",
    });
    expect(fake.tables.WbSyncRuns[0]).toMatchObject({ kind: "supplies", status: "succeeded" });
  });

  it("mirrors both order sources and then fills in the statuses", async () => {
    const fake = fakeService();
    const outcome = await runSync(deps(fake), "fbs_orders");

    expect(outcome.status).toBe("succeeded");
    expect(fake.tables.WbFbsOrders).toHaveLength(2);

    const [fresh, inSupply] = fake.tables.WbFbsOrders;
    expect(fresh).toMatchObject({
      order_id: "5776992764",
      article: "Спрей 6%",
      price: 46800,
      supplier_status: "new",
      wb_status: "waiting",
      is_cancellable: true,
    });
    expect(inSupply).toMatchObject({
      order_id: "5776992765",
      supply_id: "WB-GI-1234567",
      supplier_status: "confirm",
      is_transferable: true,
    });

    // The statuses are a second request, and the desk depends on it: neither
    // order method answers with supplierStatus.
    expect(urls.filter((url) => url.includes("/orders/status"))).toHaveLength(1);
  });

  it("never writes the buyer's address, note or user id into the mirror", async () => {
    const fake = fakeService();
    await runSync(deps(fake), "fbs_orders");

    const raw = fake.tables.WbFbsOrders[0].raw as Record<string, unknown>;
    expect(raw.article).toBe("Спрей 6%");
    expect(raw).not.toHaveProperty("address");
    expect(raw).not.toHaveProperty("comment");
    expect(raw).not.toHaveProperty("userId");
    // And nowhere else in the row either.
    expect(JSON.stringify(fake.tables.WbFbsOrders)).not.toContain("позвоните заранее");
  });

  it("does not blank a supply id that another source knew", async () => {
    const fake = fakeService();
    await runSync(deps(fake), "fbs_orders");

    // The order arrived from /orders/new WITHOUT a supplyId field at all; the
    // status pass must not overwrite what it never carried (rule 20a).
    fake.tables.WbFbsOrders[0].supply_id = "WB-GI-7654321";
    await runSync(deps(fake), "fbs_orders");

    expect(fake.tables.WbFbsOrders[0].supply_id).toBe("WB-GI-7654321");
    expect(fake.tables.WbFbsOrders).toHaveLength(2);
  });

  it("records a failed run with the rows it had already written", async () => {
    const fake = fakeService();
    fetchSpy.mockImplementation(((url: string) => {
      if (String(url).includes("/api/v3/orders/new")) {
        return Promise.resolve(answer({ orders: [ORDER_NEW] }));
      }
      return Promise.resolve({
        status: 429,
        ok: false,
        headers: new Headers({ "x-ratelimit-retry": "600" }),
        text: async () => '{"message":"too many requests"}',
      } as unknown as Response);
    }) as never);

    const outcome = await runSync(deps(fake), "fbs_orders");

    expect(outcome.status).toBe("failed");
    // One order was mirrored before the 429: the run row must say 1, not 0.
    expect(outcome.rows).toBe(1);
    expect(fake.tables.WbFbsOrders).toHaveLength(1);
    expect(fake.tables.WbSyncRuns[0]).toMatchObject({ status: "failed", rows: 1 });
  });
});
