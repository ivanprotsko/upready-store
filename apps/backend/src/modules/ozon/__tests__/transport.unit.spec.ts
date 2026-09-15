import {
  mutationSegmentOf,
  postReadEndpointIds,
  resolveEndpoint,
  validateRegistry,
  OZON_HOST,
  OZON_READ_ENDPOINTS,
  OZON_WRITE_PATHS,
  OzonWriteForbiddenError,
  type OzonReadEndpoint,
} from "../endpoints";
import { OZON_TIMEOUT_MS, ozonRead, resetRateLimiter } from "../transport";

/**
 * The guard suite for the read-only invariant (w11-ozon-readonly-client).
 *
 * Ivan's order of 2026-09-16 02:46 WITA: no code path here may ever send a
 * mutating request to Ozon, and that has to be enforced by code and proven by
 * a test. This is the proof. `fetch` is a spy in every case, so a test that
 * "passes" because a request silently succeeded is not possible: the assertion
 * is always on how many times the spy was called and with what.
 *
 * On Ozon this matters more than on Wildberries. 461 of the 467 documented
 * methods are POST, so `POST /v3/product/list` (read) and
 * `POST /v1/review/comment/create` (publishes a comment under a customer's
 * review in the shop's name) are the same verb on the same host. Nothing but
 * the exact path tells them apart.
 *
 * Named `.unit.spec.ts` so `pnpm test:unit` picks it up: `jest.config.js`
 * matches `**\/src\/**\/__tests__\/**\/*.unit.spec.[jt]s` for TEST_TYPE=unit.
 */

/**
 * THE HAND-WRITTEN HALF OF THE DOUBLE BOOKKEEPING.
 *
 * Every POST in `OZON_READ_ENDPOINTS` must also stand here, added by a human
 * who has opened the Ozon documentation and checked that the method is a query
 * and not a write. Adding one to the registry alone turns this suite red,
 * which is the point. On Ozon that covers the WHOLE registry rather than a
 * handful of exceptions.
 *
 * Checked against the saved reference on 2026-09-16
 * (`artifacts/docs/w10-marketplace-spec/docs/docs.ozon.ru-api-seller-index.txt`,
 * line numbers in brackets):
 *   access.roles             [1473]  «Метод для получения информации и ролях и методах…»
 *   seller.info              [1544]  «Информация о кабинете продавца»
 *   product.list             [3374]  «Метод для получения списка всех товаров.»
 *   product.info.list        [3821]  «…для получения информации о товарах по их идентификаторам.»
 *   product.info.attributes  [4318]  «Возвращает описание характеристик товаров…»
 *   product.info.description [4784]  «Получить описание товара»
 *   product.prices           [7036]  «Получить информацию о цене товара»
 *   product.stocks           [6234]  «Возвращает информацию о количестве товаров…»
 *   warehouse.list           [11123] «Метод возвращает список складов FBS и rFBS.»
 *   posting.fbs.list         [16045] «Возвращает список отправлений за указанный период…»
 *   posting.fbs.get          [16902] «Получить информацию об отправлении по идентификатору»
 *   posting.fbo.list         [20103] «Возвращает список отправлений за указанный период времени.»
 *   returns.list             [31441] «Метод для получения информации о возвратах FBO и FBS.»
 *   review.count             [39070] «Получить количество отзывов по статусам»
 *   review.list              [39574] «Получить список отзывов»
 *   question.list            [40344] «Список вопросов»
 *   analytics.stocks         [35728] «…получить аналитику по остаткам товаров на складах…»
 *   analytics.data           [55593] «Укажите период и метрики, которые нужно посчитать.»
 *   rating.summary           [37736] «Рейтинг продавца по следующим показателям…»
 */
const POST_READ_ENDPOINT_IDS = [
  "access.roles",
  "analytics.data",
  "analytics.stocks",
  "posting.fbo.list",
  "posting.fbs.get",
  "posting.fbs.list",
  "product.info.attributes",
  "product.info.description",
  "product.info.list",
  "product.list",
  "product.prices",
  "product.stocks",
  "question.list",
  "rating.summary",
  "returns.list",
  "review.count",
  "review.list",
  "seller.info",
  "warehouse.list",
].sort();

const CREDENTIALS = {
  clientId: "123456",
  apiKey: "b1f7f0e4-9b0a-4f6d-9d0e-0f1a2b3c4d5e",
};

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
    lines: () => [...info.mock.calls, ...warn.mock.calls].map((call) => call.join(" ")).join("\n"),
  };
};

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify(body),
});

const tooManyRequests = (headers: Record<string, string>) => ({
  ok: false,
  status: 429,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  text: async () => JSON.stringify({ code: 8, message: "too many requests" }),
});

let fetchSpy: jest.Mock;

beforeEach(() => {
  fetchSpy = jest.fn(async () => okResponse({ ok: true }));
  (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
  // The 50-per-second spacing is process-local state; a test must not inherit
  // the previous test's clock or it silently sleeps.
  resetRateLimiter();
});

const entry = (overrides: Partial<OzonReadEndpoint>): OzonReadEndpoint => ({
  id: "probe",
  host: OZON_HOST,
  method: "POST",
  path: "/v1/probe",
  docUrl: "https://docs.ozon.ru/api/seller/#operation/Probe",
  summary: "Probe",
  readViaPost: {
    docUrl: "https://docs.ozon.ru/api/seller/#operation/Probe",
    reason: "Описание метода: «Метод для получения пробы.» Ничего не изменяет.",
  },
  ...overrides,
});

describe("the registry refuses to hold a write", () => {
  it.each(["PUT", "PATCH", "DELETE"])("validateRegistry throws on a %s entry", (method) => {
    expect(() =>
      validateRegistry([entry({ method: method as OzonReadEndpoint["method"] })]),
    ).toThrow(OzonWriteForbiddenError);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("throws on a POST that cites no documentation for being a read", () => {
    expect(() => validateRegistry([entry({ readViaPost: undefined })])).toThrow(
      OzonWriteForbiddenError,
    );
  });

  it("throws on a POST whose readViaPost has a doc URL but no reason", () => {
    expect(() =>
      validateRegistry([
        entry({
          readViaPost: { docUrl: "https://docs.ozon.ru/api/seller/", reason: "read" },
        }),
      ]),
    ).toThrow(OzonWriteForbiddenError);
  });

  it("accepts a POST that cites its documentation", () => {
    expect(() => validateRegistry([entry({})])).not.toThrow();
  });

  it("throws on a host that is not api-seller.ozon.ru", () => {
    for (const host of ["evil.example", "api-seller.ozon.ru.evil.example", "docs.ozon.ru"]) {
      expect(() => validateRegistry([entry({ host })])).toThrow(OzonWriteForbiddenError);
    }
  });

  it("throws on a duplicate id", () => {
    expect(() => validateRegistry([entry({}), entry({})])).toThrow(OzonWriteForbiddenError);
  });

  it.each(Object.keys(OZON_WRITE_PATHS))("throws on the deny-listed path %s", (path) => {
    expect(() => validateRegistry([entry({ path })])).toThrow(OzonWriteForbiddenError);
  });

  it("names the documentation title of the mutation it refused", () => {
    expect(() => validateRegistry([entry({ path: "/v1/review/comment/create" })])).toThrow(
      /Оставить комментарий на отзыв/,
    );
  });

  it("throws on a path whose segment names a mutation, even an unknown one", () => {
    // Not in OZON_WRITE_PATHS: a method invented for this test. The blunt
    // second tripwire is what catches it.
    expect(mutationSegmentOf("/v9/product/enrichment/update")).toBe("update");
    expect(() => validateRegistry([entry({ path: "/v9/product/enrichment/update" })])).toThrow(
      /segment "update"/,
    );
  });

  it("does not take a mutation word out of a longer segment", () => {
    // `cancel-reason` is not `cancel`: /v2/posting/fbs/cancel-reason/list is a
    // read of the reason dictionary, and a substring rule would refuse it.
    expect(mutationSegmentOf("/v2/posting/fbs/cancel-reason/list")).toBeNull();
    expect(mutationSegmentOf("/v1/product/info/description")).toBeNull();
  });

  it("the registry this repository actually ships passes its own validation", () => {
    expect(() => validateRegistry()).not.toThrow();
    expect(OZON_READ_ENDPOINTS.length).toBeGreaterThan(0);
    expect(OZON_READ_ENDPOINTS.every((item) => item.host === OZON_HOST)).toBe(true);
    expect(OZON_READ_ENDPOINTS.every((item) => item.method === "POST")).toBe(true);
  });

  it("no registered path stands in the deny-list", () => {
    const overlap = OZON_READ_ENDPOINTS.filter((item) => OZON_WRITE_PATHS[item.path]);
    expect(overlap.map((item) => item.path)).toEqual([]);
  });
});

describe("the POST entries are bookkept twice", () => {
  it("the registry's POST ids equal the list written by hand in this file", () => {
    expect(postReadEndpointIds()).toEqual(POST_READ_ENDPOINT_IDS);
  });

  it("every registered POST cites the doc page that calls it a read", () => {
    for (const id of postReadEndpointIds()) {
      const found = resolveEndpoint(id);
      expect(found.readViaPost?.docUrl).toMatch(/^https:\/\/docs\.ozon\.ru\/api\/seller\//);
      expect(found.readViaPost?.reason.length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("ozonRead cannot be talked into a write", () => {
  it.each([
    ["an unregistered id", "product.import"],
    ["a write verb dressed as an id", "POST /v3/product/import"],
    ["a foreign host", "https://evil.example/v1/roles"],
    ["a deny-listed path as an id", "/v1/review/comment/create"],
    ["a registered path with an unregistered suffix", "product.list.update"],
  ])("refuses %s without opening a socket", async (_label, endpointId) => {
    await expect(ozonRead(endpointId, { credentials: CREDENTIALS })).rejects.toThrow(
      OzonWriteForbiddenError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses a call with no Client-Id", async () => {
    await expect(
      ozonRead("product.list", { credentials: { clientId: "", apiKey: CREDENTIALS.apiKey } }),
    ).rejects.toThrow(OzonWriteForbiddenError);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("refuses a call with no Api-Key", async () => {
    await expect(
      ozonRead("product.list", { credentials: { clientId: CREDENTIALS.clientId, apiKey: "" } }),
    ).rejects.toThrow(OzonWriteForbiddenError);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it("exports no escape hatch", () => {
    // Required, not imported: `await import("../transport")` under
    // moduleResolution nodenext wants a file extension, and the point here is
    // the runtime shape of the module, not its type.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const transport = require("../transport") as Record<string, unknown>;
    const runtimeExports = Object.keys(transport).filter((name) => name !== "__esModule");

    // The whole public surface: the one read, its two documented numbers, its
    // error type and the test seam for the rate limiter. Types are erased by
    // the compiler and never show up here.
    expect(runtimeExports.sort()).toEqual([
      "OZON_MAX_RPS",
      "OZON_TIMEOUT_MS",
      "OzonApiError",
      "ozonRead",
      "resetRateLimiter",
    ]);

    // Named again as a negative, so a future export called something else
    // still trips this: there is no client, no base URL, no raw request.
    for (const forbidden of ["fetch", "client", "axios", "request", "baseUrl", "post", "put"]) {
      expect(runtimeExports).not.toContain(forbidden);
    }
  });
});

describe("a registered read goes out exactly once, with both auth headers", () => {
  it("sends one POST and never logs either credential", async () => {
    const logger = spyLogger();
    fetchSpy.mockResolvedValueOnce(okResponse({ result: { items: [] } }));

    const result = await ozonRead("product.list", {
      credentials: CREDENTIALS,
      body: { filter: { visibility: "ALL" }, last_id: "", limit: 1000 },
      logger,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api-seller.ozon.ru/v3/product/list");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["Client-Id"]).toBe(CREDENTIALS.clientId);
    expect(headers["Api-Key"]).toBe(CREDENTIALS.apiKey);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ filter: { visibility: "ALL" }, last_id: "", limit: 1000 }));
    expect(result.status).toBe(200);

    expect(logger.lines()).not.toContain(CREDENTIALS.apiKey);
    expect(logger.lines()).not.toContain(CREDENTIALS.clientId);
    expect(logger.lines()).toContain("Client-Id: ***, Api-Key: ***");
  });

  it("takes the method from the registry and not from the caller", async () => {
    // There is nowhere to put a method: the option does not exist. This is the
    // assertion that the URL and verb came from the entry.
    await ozonRead("seller.info", { credentials: CREDENTIALS, logger: spyLogger() });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api-seller.ozon.ru/v1/seller/info");
    expect(init.method).toBe(resolveEndpoint("seller.info").method);
  });

  it("journals the call with the endpoint id and neither credential", async () => {
    const journal = jest.fn();

    await ozonRead("access.roles", {
      credentials: CREDENTIALS,
      tenantId: "ten_1",
      journal,
      logger: spyLogger(),
    });

    expect(journal).toHaveBeenCalledTimes(1);
    const record = journal.mock.calls[0][0];
    expect(record).toMatchObject({
      tenant_id: "ten_1",
      endpoint_id: "access.roles",
      host: "api-seller.ozon.ru",
      method: "POST",
      path: "/v1/roles",
      status: 200,
      is_fixture: false,
    });
    expect(JSON.stringify(record)).not.toContain(CREDENTIALS.apiKey);
    expect(JSON.stringify(record)).not.toContain(CREDENTIALS.clientId);
  });

  it("every journalled endpoint id is one the registry holds", async () => {
    const journal = jest.fn();
    for (const registered of OZON_READ_ENDPOINTS) {
      if (registered.path.includes(":") || registered.minIntervalMs) {
        // A placeholder needs params, and a once-a-minute method would make
        // this loop sleep. Both are covered by their own cases.
        continue;
      }
      await ozonRead(registered.id, { credentials: CREDENTIALS, journal, logger: spyLogger() });
    }
    const ids = new Set(journal.mock.calls.map((call) => call[0].endpoint_id));
    const known = new Set(OZON_READ_ENDPOINTS.map((item) => item.id));
    expect([...ids].every((id) => known.has(id))).toBe(true);
    // Every row says POST, which is exactly why the id column is what proves
    // anything on Ozon and the method column proves nothing.
    expect(new Set(journal.mock.calls.map((call) => call[0].method))).toEqual(new Set(["POST"]));
  });
});

describe("429 and the documented rate limits", () => {
  it("waits and retries when the wait is short", async () => {
    fetchSpy
      .mockResolvedValueOnce(tooManyRequests({ "retry-after": "0" }))
      .mockResolvedValueOnce(okResponse({ ok: true }));

    const result = await ozonRead("seller.info", { credentials: CREDENTIALS, logger: spyLogger() });

    expect(result.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fails fast, naming the wait, when Ozon asks for longer than one run may sleep", async () => {
    fetchSpy.mockResolvedValue(tooManyRequests({ "retry-after": "600" }));

    await expect(
      ozonRead("seller.info", { credentials: CREDENTIALS, logger: spyLogger() }),
    ).rejects.toThrow(/retry in 600 s/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("journals the refusal, so a throttled read is not an invisible one", async () => {
    fetchSpy.mockResolvedValue(tooManyRequests({ "retry-after": "600" }));
    const journal = jest.fn();

    await expect(
      ozonRead("seller.info", { credentials: CREDENTIALS, journal, logger: spyLogger() }),
    ).rejects.toThrow();

    expect(journal).toHaveBeenCalledTimes(1);
    expect(journal.mock.calls[0][0]).toMatchObject({ status: 429, endpoint_id: "seller.info" });
  });

  it("carries the once-a-minute limit the docs state for analytics.data", () => {
    // "Метод можно использовать не больше 1 раза в минуту." — the saved page,
    // line 55593. The number is the doc's, not a guess.
    expect(resolveEndpoint("analytics.data").minIntervalMs).toBe(60_000);
    expect(resolveEndpoint("product.list").minIntervalMs).toBeUndefined();
  });
});

describe("the request timeout", () => {
  it("is the default for an ordinary read", async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, "timeout");

    await ozonRead("seller.info", { credentials: CREDENTIALS, logger: spyLogger() });

    expect(timeoutSpy).toHaveBeenLastCalledWith(OZON_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });
});
