import {
  postReadEndpointIds,
  resolveEndpoint,
  validateRegistry,
  WB_READ_ENDPOINTS,
  WbWriteForbiddenError,
  type WbReadEndpoint,
} from "../endpoints";
import { wbRead } from "../transport";

/**
 * The guard suite for the read-only invariant (w01-wb-readonly-client).
 *
 * Ivan's order of 2026-09-16 02:46 WITA: the WB key may carry write rights by
 * mistake, so no code path here may ever send a mutating request to
 * Wildberries, and that has to be enforced by code and proven by a test.
 * This is the proof. `fetch` is a spy in every case, so a test that "passes"
 * because a request silently succeeded is not possible: the assertion is
 * always on how many times the spy was called and with what.
 *
 * Named `.unit.spec.ts` rather than the `.spec.ts` of the brief so that
 * `pnpm test:unit` picks it up: `jest.config.js` matches
 * `**\/src\/**\/__tests__\/**\/*.unit.spec.[jt]s` for TEST_TYPE=unit.
 */

/**
 * THE HAND-WRITTEN HALF OF THE DOUBLE BOOKKEEPING.
 *
 * Every POST in `WB_READ_ENDPOINTS` must also stand here, added by a human who
 * has opened the WB documentation and checked that the method is a query and
 * not a write. Adding a POST to the registry alone turns this suite red, which
 * is the point: a POST is the one shape in which a write could be smuggled in
 * past a reviewer skimming a diff.
 *
 * Checked against the docs on 2026-09-16 (text kept in
 * artifacts/docs/w01-wb-readonly-client/docs/):
 *   content.cards.list   "Returns the listings."
 *   marketplace.stocks   "Returns item inventory."
 */
const POST_READ_ENDPOINT_IDS = ["content.cards.list", "marketplace.stocks"].sort();

const TOKEN = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.test-payload.test-signature";

type SpyLogger = {
  info: jest.Mock;
  warn: jest.Mock;
  lines: () => string;
};

const spyLogger = (): SpyLogger => {
  const info = jest.fn();
  const warn = jest.fn();
  return {
    info,
    warn,
    lines: () =>
      [...info.mock.calls, ...warn.mock.calls].map((call) => call.join(" ")).join("\n"),
  };
};

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify(body),
});

let fetchSpy: jest.Mock;

beforeEach(() => {
  fetchSpy = jest.fn(async () => okResponse({ ok: true }));
  (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
});

const entry = (overrides: Partial<WbReadEndpoint>): WbReadEndpoint => ({
  id: "probe",
  host: "content-api.wildberries.ru",
  method: "GET",
  path: "/probe",
  docUrl: "https://dev.wildberries.ru/en/docs/openapi/item-management",
  summary: "Probe",
  ...overrides,
});

describe("the registry refuses to hold a write", () => {
  it.each(["PUT", "PATCH", "DELETE"])(
    "validateRegistry throws on a %s entry",
    (method) => {
      expect(() =>
        validateRegistry([entry({ method: method as WbReadEndpoint["method"] })]),
      ).toThrow(WbWriteForbiddenError);
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    },
  );

  it("throws on a POST that cites no documentation for being a read", () => {
    expect(() => validateRegistry([entry({ method: "POST" })])).toThrow(WbWriteForbiddenError);
  });

  it("accepts a POST that cites its documentation", () => {
    expect(() =>
      validateRegistry([
        entry({
          method: "POST",
          readViaPost: {
            docUrl: "https://dev.wildberries.ru/en/docs/openapi/item-management#tag/listings",
            reason: "Method description: \"Returns the listings.\"",
          },
        }),
      ]),
    ).not.toThrow();
  });

  it("throws on a host outside *.wildberries.ru", () => {
    expect(() => validateRegistry([entry({ host: "evil.example" })])).toThrow(
      WbWriteForbiddenError,
    );
  });

  it("throws on a duplicate id", () => {
    expect(() => validateRegistry([entry({}), entry({})])).toThrow(WbWriteForbiddenError);
  });

  it("the registry this repository actually ships passes its own validation", () => {
    expect(() => validateRegistry()).not.toThrow();
    expect(WB_READ_ENDPOINTS.every((item) => item.method === "GET" || item.method === "POST")).toBe(
      true,
    );
  });
});

describe("the POST entries are bookkept twice", () => {
  it("the registry's POST ids equal the list written by hand in this file", () => {
    expect(postReadEndpointIds()).toEqual(POST_READ_ENDPOINT_IDS);
  });

  it("every registered POST cites the doc page that calls it a read", () => {
    for (const id of postReadEndpointIds()) {
      const found = resolveEndpoint(id);
      expect(found.readViaPost?.docUrl).toMatch(/^https:\/\/dev\.wildberries\.ru\//);
      expect(found.readViaPost?.reason.length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("wbRead cannot be talked into a write", () => {
  it.each([
    ["an unregistered id", "content.cards.update"],
    ["a write verb dressed as an id", "PUT /api/v3/stocks/1"],
    ["a foreign host", "https://evil.example/ping"],
    ["a registered path with an unregistered method", "marketplace.stocks.put"],
  ])("refuses %s without opening a socket", async (_label, endpointId) => {
    await expect(wbRead(endpointId, { token: TOKEN })).rejects.toThrow(WbWriteForbiddenError);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses a body on a GET", async () => {
    await expect(
      wbRead("prices.goods.filter", { token: TOKEN, body: { price: 1 } }),
    ).rejects.toThrow(WbWriteForbiddenError);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses a path parameter that was not supplied", async () => {
    await expect(wbRead("marketplace.stocks", { token: TOKEN, body: {} })).rejects.toThrow(
      WbWriteForbiddenError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("exports no escape hatch", async () => {
    const transport = (await import("../transport")) as unknown as Record<string, unknown>;
    const runtimeExports = Object.keys(transport).filter((name) => name !== "__esModule");

    // The whole public surface: the one read, its timeout and its error type.
    // Types are erased by the compiler and never show up here.
    expect(runtimeExports.sort()).toEqual(["WB_TIMEOUT_MS", "WbApiError", "wbRead"]);

    // Named again as a negative, so a future export called something else
    // still trips this: there is no client, no base URL, no raw request.
    for (const forbidden of ["fetch", "client", "axios", "request", "baseUrl", "post", "put"]) {
      expect(runtimeExports).not.toContain(forbidden);
    }
  });
});

describe("a registered read goes out exactly once, with the key in the header", () => {
  it("sends one GET and never logs the key", async () => {
    const logger = spyLogger();

    const result = await wbRead("prices.goods.filter", {
      token: TOKEN,
      query: { limit: 10, offset: 0 },
      logger,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=10&offset=0",
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(TOKEN);
    expect(init.body).toBeUndefined();
    expect(result.status).toBe(200);

    expect(logger.lines()).not.toContain(TOKEN);
    expect(logger.lines()).toContain("Authorization: ***");
  });

  it("sends the one registered POST read with its body and its own method", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ stocks: [] }));

    await wbRead("marketplace.stocks", {
      token: TOKEN,
      params: { warehouseId: 42 },
      body: { chrtIds: [1, 2] },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://marketplace-api.wildberries.ru/api/v3/stocks/42");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ chrtIds: [1, 2] }));
  });

  it("journals the call with the endpoint id and no key", async () => {
    const journal = jest.fn();

    await wbRead("common.seller-info", { token: TOKEN, tenantId: "ten_1", journal });

    expect(journal).toHaveBeenCalledTimes(1);
    const record = journal.mock.calls[0][0];
    expect(record).toMatchObject({
      tenant_id: "ten_1",
      endpoint_id: "common.seller-info",
      host: "common-api.wildberries.ru",
      method: "GET",
      path: "/api/v1/seller-info",
      status: 200,
    });
    expect(JSON.stringify(record)).not.toContain(TOKEN);
  });

  it("every journalled method is one the registry holds", async () => {
    const journal = jest.fn();
    for (const registered of WB_READ_ENDPOINTS) {
      if (registered.path.includes(":")) {
        continue;
      }
      await wbRead(registered.id, { token: TOKEN, journal });
    }
    const methods = new Set(journal.mock.calls.map((call) => call[0].method));
    expect([...methods].every((method) => method === "GET" || method === "POST")).toBe(true);
  });
});
