import {
  assembleRefusal,
  cancelRefusal,
  FbsTransitionError,
  NEW_SUPPLY_PLACEHOLDER,
  planFbsAction,
  type FbsOrderFacts,
  type FbsSupplyFacts,
} from "../fbs-orders";
import { wbWrite, WB_WRITE_LIVE_ENV } from "../write-transport";
import { WB_WRITE_ENDPOINTS } from "../write-endpoints";
import { WB_READ_ONLY_BIT } from "../../wb/token";
import type {
  MarketplaceCredentialBag,
  MarketplaceWriteAuditRow,
  MarketplaceWriteConsent,
  MarketplaceWriteOpClass,
  MarketplaceWriteStore,
} from "../../marketplace-write/types";

/**
 * The FBS desk, proven rather than described (w23-wb-write-fbs-orders).
 *
 * Two halves. The first is the sixth check, the one the write core does not
 * own: does Wildberries HAVE this transition. The second runs the planned
 * calls through the real gates with everything open except the live one, and
 * asserts what this repository can actually produce today — an audit row and
 * zero fetches.
 *
 * `fetch` is a spy that throws in every case, so no test here can pass because
 * a request quietly succeeded.
 */

const order = (over: Partial<FbsOrderFacts> = {}): FbsOrderFacts => ({
  order_id: "5776992764",
  supplier_status: "new",
  wb_status: "waiting",
  supply_id: null,
  is_cancellable: true,
  ...over,
});

const supply = (over: Partial<FbsSupplyFacts> = {}): FbsSupplyFacts => ({
  supply_id: "WB-GI-1234567",
  done: false,
  orders: 3,
  ...over,
});

const plan = (input: Parameters<typeof planFbsAction>[0]) => planFbsAction(input);

describe("what the FBS desk may ask Wildberries for", () => {
  it("«Собрать» into an open supply is one call, the one that moves the order to confirm", () => {
    const steps = plan({
      action: "assemble",
      orders: [order(), order({ order_id: "5776992765" })],
      supply: supply(),
      supplyName: "n/a",
    });

    expect(steps).toEqual([
      {
        endpointId: "wb.fbs.supply.add-orders",
        call: {
          params: { supplyId: "WB-GI-1234567" },
          body: { orders: [5776992764, 5776992765] },
        },
      },
    ]);
  });

  it("«Собрать» with no supply plans the creation first, because WB has no confirm method", () => {
    const steps = plan({
      action: "assemble",
      orders: [order()],
      supply: null,
      supplyName: "Поставка 2026-09-16",
    });

    expect(steps.map((step) => step.endpointId)).toEqual([
      "wb.fbs.supply.create",
      "wb.fbs.supply.add-orders",
    ]);
    expect(steps[0].call.body).toEqual({ name: "Поставка 2026-09-16" });
  });

  it.each([
    ["complete", "in delivery"],
    ["cancel", "cancelled by the seller"],
    ["cancel_carrier", "cancelled by the carrier"],
  ])("refuses «Собрать» for an order in %s (%s)", (status) => {
    expect(() =>
      plan({
        action: "assemble",
        orders: [order({ supplier_status: status })],
        supply: supply(),
        supplyName: "n/a",
      }),
    ).toThrow(FbsTransitionError);
  });

  it("refuses «Собрать» into a supply that has already been handed over", () => {
    expect(() =>
      plan({
        action: "assemble",
        orders: [order()],
        supply: supply({ done: true }),
        supplyName: "n/a",
      }),
    ).toThrow(/передана в доставку/);
  });

  it("refuses more than the 100 assembly orders WB accepts in one call", () => {
    const many = Array.from({ length: 101 }, (_, index) => order({ order_id: String(5_000_000 + index) }));
    expect(() => plan({ action: "assemble", orders: many, supply: supply(), supplyName: "n/a" })).toThrow(
      /не более 100/,
    );
  });

  it("«Отменить» is one call per order, because WB's cancel takes one id in the path", () => {
    const steps = plan({
      action: "cancel",
      orders: [order(), order({ order_id: "5776992765", supplier_status: "confirm" })],
      supply: null,
      supplyName: "n/a",
    });

    expect(steps).toEqual([
      { endpointId: "wb.fbs.order.cancel", call: { params: { orderId: 5776992764 } } },
      { endpointId: "wb.fbs.order.cancel", call: { params: { orderId: 5776992765 } } },
    ]);
  });

  it("refuses «Отменить» for an order already handed over to Wildberries", () => {
    expect(() =>
      plan({ action: "cancel", orders: [order({ supplier_status: "complete" })], supply: null, supplyName: "n/a" }),
    ).toThrow(/до передачи/);
  });

  it("refuses «Отменить» when WB itself says isCancellable=false", () => {
    expect(() =>
      plan({ action: "cancel", orders: [order({ is_cancellable: false })], supply: null, supplyName: "n/a" }),
    ).toThrow(/isCancellable=false/);
  });

  it("treats an unasked isCancellable as unknown and not as a refusal", () => {
    // `null` is "the status import has not run", which is not "no" (rule 20a).
    expect(cancelRefusal(order({ is_cancellable: null }))).toBeNull();
  });

  it("refuses «Передать в доставку» for an empty or closed supply", () => {
    expect(() => plan({ action: "deliver", orders: [], supply: supply({ orders: 0 }), supplyName: "n/a" })).toThrow(
      /нет ни одного заказа/,
    );
    expect(() => plan({ action: "deliver", orders: [], supply: supply({ done: true }), supplyName: "n/a" })).toThrow(
      /уже закрыта/,
    );
    expect(() => plan({ action: "deliver", orders: [], supply: null, supplyName: "n/a" })).toThrow(/не выбрана/);
  });

  it("plans «Передать в доставку» for a supply that holds orders", () => {
    expect(plan({ action: "deliver", orders: [], supply: supply(), supplyName: "n/a" })).toEqual([
      { endpointId: "wb.fbs.supply.deliver", call: { params: { supplyId: "WB-GI-1234567" } } },
    ]);
  });

  it("gives the panel the same reason the planner would throw", () => {
    const stale = order({ supplier_status: "complete" });
    expect(assembleRefusal(stale)).toMatch(/только заказы в статусе new или confirm/);
    expect(cancelRefusal(stale)).toMatch(/до передачи/);
    expect(assembleRefusal(order())).toBeNull();
  });

  it("registers every endpoint the planner can name, in the fbs_orders class", () => {
    const planned = [
      ...plan({ action: "assemble", orders: [order()], supply: null, supplyName: "x" }),
      ...plan({ action: "cancel", orders: [order()], supply: null, supplyName: "x" }),
      ...plan({ action: "deliver", orders: [], supply: supply(), supplyName: "x" }),
    ].map((step) => step.endpointId);

    for (const id of planned) {
      const entry = WB_WRITE_ENDPOINTS.find((candidate) => candidate.id === id);
      expect(entry).toBeDefined();
      expect(entry?.opClass).toBe("fbs_orders");
    }
  });
});

/* ------------------------------------------------------------------ */

const token = (payload: Record<string, unknown>): string => {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.${body}.test-signature`;
};

const IN_AN_HOUR = Math.floor(Date.now() / 1000) + 3600;
const WRITE_KEY = token({ id: "w23", sid: "seller-1", acc: 3, s: 0b10010, exp: IN_AN_HOUR });
const READ_ONLY_KEY = token({
  id: "w23-ro",
  sid: "seller-1",
  acc: 3,
  s: 0b10010 | (1 << WB_READ_ONLY_BIT),
  exp: IN_AN_HOUR,
});

const FBS_CONSENT: MarketplaceWriteConsent = {
  op_class: "fbs_orders",
  confirmed_by: "tenant-admin-1",
  confirmed_at: new Date("2026-09-16T00:00:00.000Z"),
  note: "Заказы FBS",
};

const harness = (options: { credentials?: Record<string, MarketplaceCredentialBag>; consent?: MarketplaceWriteConsent | null } = {}) => {
  const audit: MarketplaceWriteAuditRow[] = [];
  const credentials = options.credentials ?? { wildberries_write: { api_key: WRITE_KEY } };

  const store: MarketplaceWriteStore = {
    readCredential: async (slot: string) => credentials[slot] ?? null,
    isEnabled: async () => true,
    findConsent: async (opClass: MarketplaceWriteOpClass) => {
      const consent = options.consent === undefined ? FBS_CONSENT : options.consent;
      return consent && consent.op_class === opClass ? consent : null;
    },
    appendAudit: async (row) => {
      audit.push(row);
    },
  };

  return { audit, store };
};

describe("an FBS action with every gate open but the live one", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch" as never);
    fetchSpy.mockImplementation(() => {
      throw new Error("A test opened a socket. No FBS test may reach the network.");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const run = async (h: ReturnType<typeof harness>, steps: ReturnType<typeof plan>) =>
    Promise.all(
      steps.map((step) =>
        wbWrite(step.endpointId, step.call, {
          tenantId: "ten_w23",
          actor: "tenant-admin-1",
          store: h.store,
          // The live gate is absent, which is the state of every deployment.
          env: {},
          logger: { info: jest.fn(), warn: jest.fn() },
        }),
      ),
    );

  it("journals «Отменить» as a dry run and sends nothing", async () => {
    const h = harness();
    const results = await run(
      h,
      plan({ action: "cancel", orders: [order()], supply: null, supplyName: "x" }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results.map((result) => result.dryRun)).toEqual([true]);
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      op_class: "fbs_orders",
      endpoint_id: "wb.fbs.order.cancel",
      method: "PATCH",
      path: "/api/v3/orders/5776992764/cancel",
      dry_run: true,
      outcome: "dry_run",
      gate: null,
    });
  });

  it("journals «Собрать» into an open supply as one dry run", async () => {
    const h = harness();
    const results = await run(
      h,
      plan({ action: "assemble", orders: [order()], supply: supply(), supplyName: "x" }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results.every((result) => result.dryRun)).toBe(true);
    expect(h.audit.map((row) => row.path)).toEqual([
      "/api/marketplace/v3/supplies/WB-GI-1234567/orders",
    ]);
    expect(h.audit[0].payload).toEqual({ orders: [5776992764] });
  });

  it("journals both steps of «Собрать» with no supply, the second naming itself a dry run", async () => {
    const h = harness();
    const results = await run(
      h,
      plan({ action: "assemble", orders: [order()], supply: null, supplyName: "Поставка тест" }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results.every((result) => result.dryRun)).toBe(true);
    expect(h.audit.map((row) => row.path)).toEqual([
      "/api/v3/supplies",
      `/api/marketplace/v3/supplies/${NEW_SUPPLY_PLACEHOLDER}/orders`,
    ]);
    // The placeholder names itself rather than impersonating a WB-GI-… id.
    expect(h.audit[1].path).not.toMatch(/WB-GI/);
  });

  it("refuses at the consent gate when fbs_orders was never confirmed, and journals the refusal", async () => {
    const h = harness({ consent: null });

    await expect(
      run(h, plan({ action: "deliver", orders: [], supply: supply(), supplyName: "x" })),
    ).rejects.toThrow(/fbs_orders/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({ outcome: "refused", gate: "consent", dry_run: true });
  });

  it("refuses a read-only key in the write slot", async () => {
    const h = harness({ credentials: { wildberries_write: { api_key: READ_ONLY_KEY } } });

    await expect(
      run(h, plan({ action: "cancel", orders: [order()], supply: null, supplyName: "x" })),
    ).rejects.toThrow(/read-only/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.audit[0]).toMatchObject({ outcome: "refused", gate: "credential_usable" });
  });

  it("never asks for the READ slot, whatever the action", async () => {
    const asked: string[] = [];
    const h = harness();
    const store: MarketplaceWriteStore = {
      ...h.store,
      readCredential: async (slot) => {
        asked.push(slot);
        return slot === "wildberries_write" ? { api_key: WRITE_KEY } : null;
      },
    };

    await wbWrite(
      "wb.fbs.supply.deliver",
      { params: { supplyId: "WB-GI-1" } },
      {
        tenantId: "ten_w23",
        actor: "tenant-admin-1",
        store,
        env: {},
        logger: { info: jest.fn(), warn: jest.fn() },
      },
    );

    expect(asked).toEqual(["wildberries_write"]);
    expect(asked).not.toContain("wildberries");
  });

  it("names the env var that would make it live, and no test sets it", () => {
    expect(WB_WRITE_LIVE_ENV).toBe("WB_WRITE_LIVE");
    expect(process.env[WB_WRITE_LIVE_ENV]).toBeUndefined();
  });
});
