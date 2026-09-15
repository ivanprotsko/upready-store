import { MarketplaceWriteRegistryError, MarketplaceWriteRefused } from "../../marketplace-write/types";
import type {
  MarketplaceCredentialBag,
  MarketplaceWriteAuditRow,
  MarketplaceWriteConsent,
  MarketplaceWriteOpClass,
  MarketplaceWriteStore,
} from "../../marketplace-write/types";
import { WB_READ_ONLY_BIT } from "../../wb/token";
import { wbWrite, WB_WRITE_LIVE_ENV } from "../write-transport";

/**
 * The guard suite for the write gates (w20-wb-write-core).
 *
 * Same discipline as the read suite of w01: `fetch` is a spy in every case, so
 * no test can pass because a request quietly succeeded. Every assertion is on
 * how many times the spy was called, with what, and on what the audit journal
 * holds afterwards.
 *
 * The question this suite answers is the one Ivan asked at 02:46 WITA: can
 * anything reach Wildberries by accident? Seven of the nine cases below end in
 * zero fetches, and the one case that sends needs a write credential that is
 * not read-only, a tenant switch, a consent row AND an env var.
 */

/** A WB key, fabricated locally. Never a real credential: the payload is all we read. */
const token = (payload: Record<string, unknown>): string => {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.${body}.test-signature`;
};

const IN_AN_HOUR = Math.floor(Date.now() / 1000) + 3600;
const AN_HOUR_AGO = Math.floor(Date.now() / 1000) - 3600;

/** Access to Content + Marketplace, read-only bit CLEAR: a usable write key. */
const WRITE_KEY = token({ id: "w20-write", sid: "seller-1", acc: 3, s: 0b10010, exp: IN_AN_HOUR });
/** The same, plus bit 30: what every shop actually has today. */
const READ_ONLY_KEY = token({
  id: "w20-read",
  sid: "seller-1",
  acc: 3,
  s: 0b10010 | (1 << WB_READ_ONLY_BIT),
  exp: IN_AN_HOUR,
});
const EXPIRED_KEY = token({ id: "w20-old", sid: "seller-1", acc: 3, s: 0b10010, exp: AN_HOUR_AGO });

const CONSENT: MarketplaceWriteConsent = {
  op_class: "stocks",
  confirmed_by: "tenant-admin-1",
  confirmed_at: new Date("2026-09-16T00:00:00.000Z"),
  note: "Остатки на Wildberries",
};

type Harness = {
  store: MarketplaceWriteStore;
  audit: MarketplaceWriteAuditRow[];
  slotsAsked: string[];
};

const harness = (options: {
  credentials?: Record<string, MarketplaceCredentialBag>;
  enabled?: boolean;
  consent?: MarketplaceWriteConsent | null;
}): Harness => {
  const audit: MarketplaceWriteAuditRow[] = [];
  const slotsAsked: string[] = [];
  const credentials = options.credentials ?? {};

  return {
    audit,
    slotsAsked,
    store: {
      readCredential: async (slot: string) => {
        slotsAsked.push(slot);
        return credentials[slot] ?? null;
      },
      isEnabled: async () => options.enabled ?? true,
      findConsent: async (opClass: MarketplaceWriteOpClass) =>
        options.consent === undefined
          ? CONSENT
          : options.consent && options.consent.op_class === opClass
            ? options.consent
            : null,
      appendAudit: async (row) => {
        audit.push(row);
      },
    },
  };
};

const ctx = (h: Harness, env: NodeJS.ProcessEnv = {}) => ({
  tenantId: "ten_w20",
  actor: "tenant-admin-1",
  store: h.store,
  env,
  logger: { info: jest.fn(), warn: jest.fn() },
});

const STOCKS_CALL = {
  params: { warehouseId: 42 },
  body: { stocks: [{ sku: "1234567890", amount: 7 }] },
};

const OPEN_GATES = {
  credentials: { wildberries_write: { api_key: WRITE_KEY } },
  enabled: true,
  consent: CONSENT,
};

describe("the WB write gates", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch" as never);
    fetchSpy.mockImplementation(() => {
      throw new Error("A test opened a socket. No write test may reach the network.");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env[WB_WRITE_LIVE_ENV];
  });

  it("dry-runs when every gate but the live one is open: zero fetches, one audit row", async () => {
    const h = harness(OPEN_GATES);

    const result = await wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h));

    expect(result.dryRun).toBe(true);
    expect(result.status).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      tenant_id: "ten_w20",
      marketplace: "wb",
      op_class: "stocks",
      endpoint_id: "wb.stocks.update",
      method: "PUT",
      path: "/api/v3/stocks/42",
      dry_run: true,
      outcome: "dry_run",
      actor: "tenant-admin-1",
      status: null,
    });
    expect(h.audit[0].payload_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never asks for the READ slot", async () => {
    const h = harness(OPEN_GATES);

    await wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h));

    expect(h.slotsAsked).toEqual(["wildberries_write"]);
    expect(h.slotsAsked).not.toContain("wildberries");
  });

  it("refuses an unregistered endpoint before anything else happens", async () => {
    const h = harness(OPEN_GATES);

    await expect(
      wbWrite("wb.cards.delete", { body: {} }, ctx(h)),
    ).rejects.toBeInstanceOf(MarketplaceWriteRegistryError);

    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(h.audit).toHaveLength(0);
    expect(h.slotsAsked).toEqual([]);
  });

  it("refuses when only the read credential exists", async () => {
    const h = harness({ ...OPEN_GATES, credentials: { wildberries: { api_key: WRITE_KEY } } });

    await expect(wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h))).rejects.toMatchObject({
      name: "MarketplaceWriteRefused",
      gate: "credential",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(h.audit[0]).toMatchObject({ outcome: "refused", gate: "credential", dry_run: true });
  });

  it("refuses a write key that is marked read-only", async () => {
    const h = harness({ ...OPEN_GATES, credentials: { wildberries_write: { api_key: READ_ONLY_KEY } } });

    await expect(wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h))).rejects.toMatchObject({
      gate: "credential_usable",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(h.audit[0].error).toContain(`bit ${WB_READ_ONLY_BIT}`);
  });

  it("refuses an expired write key", async () => {
    const h = harness({ ...OPEN_GATES, credentials: { wildberries_write: { api_key: EXPIRED_KEY } } });

    await expect(wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h))).rejects.toMatchObject({
      gate: "credential_usable",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses while the shop's switch is off", async () => {
    const h = harness({ ...OPEN_GATES, enabled: false });

    await expect(wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h))).rejects.toMatchObject({
      gate: "enabled",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses a class the owner has not confirmed", async () => {
    const h = harness({ ...OPEN_GATES, consent: null });

    await expect(wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h))).rejects.toMatchObject({
      gate: "consent",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses consent given for another class", async () => {
    const h = harness({
      ...OPEN_GATES,
      consent: { ...CONSENT, op_class: "prices" },
    });

    await expect(wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h))).rejects.toMatchObject({
      gate: "consent",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses a body the documented schema does not accept", async () => {
    const h = harness(OPEN_GATES);

    await expect(
      wbWrite("wb.stocks.update", { params: { warehouseId: 42 }, body: { stocks: [] } }, ctx(h)),
    ).rejects.toMatchObject({ gate: "body" });

    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(h.audit[0]).toMatchObject({ outcome: "refused", gate: "body" });
  });

  it("refuses a missing path parameter before the credential is even read", async () => {
    const h = harness(OPEN_GATES);

    await expect(
      wbWrite("wb.stocks.update", { body: STOCKS_CALL.body }, ctx(h)),
    ).rejects.toBeInstanceOf(MarketplaceWriteRefused);

    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(h.slotsAsked).toEqual([]);
  });

  it("stays a dry run with consent in place while the live env var is unset", async () => {
    const h = harness(OPEN_GATES);

    const result = await wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h, { SOMETHING_ELSE: "1" }));

    expect(result.dryRun).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(h.audit[0].outcome).toBe("dry_run");
  });

  it("sends exactly one request with the registered method and path when every gate is open", async () => {
    const h = harness(OPEN_GATES);
    fetchSpy.mockResolvedValue({ status: 204, text: async () => "" } as never);

    const result = await wbWrite(
      "wb.stocks.update",
      STOCKS_CALL,
      ctx(h, { [WB_WRITE_LIVE_ENV]: "1" }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://marketplace-api.wildberries.ru/api/v3/stocks/42");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(STOCKS_CALL.body);
    expect(init.headers.Authorization).toBe(WRITE_KEY);

    expect(result.dryRun).toBe(false);
    expect(result.status).toBe(204);
    expect(h.audit[0]).toMatchObject({ outcome: "sent", dry_run: false, status: 204 });
  });

  it("sends no body for a mutation WB documents without one", async () => {
    const h = harness({ ...OPEN_GATES, consent: { ...CONSENT, op_class: "fbs_orders" } });
    fetchSpy.mockResolvedValue({ status: 204, text: async () => "" } as never);

    await wbWrite(
      "wb.fbs.order.cancel",
      { params: { orderId: 5632423 } },
      ctx(h, { [WB_WRITE_LIVE_ENV]: "1" }),
    );

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://marketplace-api.wildberries.ru/api/v3/orders/5632423/cancel");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBeUndefined();
  });

  it("journals a 4xx and retries nothing", async () => {
    const h = harness(OPEN_GATES);
    fetchSpy.mockResolvedValue({
      status: 400,
      text: async () => '{"code":"IncorrectRequestBody"}',
    } as never);

    await expect(
      wbWrite("wb.stocks.update", STOCKS_CALL, ctx(h, { [WB_WRITE_LIVE_ENV]: "1" })),
    ).rejects.toMatchObject({ name: "MarketplaceWriteApiError", status: 400 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(h.audit[0]).toMatchObject({ outcome: "sent", status: 400, error: "HTTP 400" });
  });
});
