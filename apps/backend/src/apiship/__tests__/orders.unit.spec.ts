import { apishipFilter, ApishipError, apishipRequest, calculate, listConnections, listPoints } from "../client";
import { cancelOrder, createOrder, getLabels, getOrderStatuses, getWaybills } from "../orders";

/**
 * The ApiShip request core and the order calls, against a fake `fetch`
 * (t-2026-10-14-58). The shapes are the ones measured on the test contour on
 * 14.10.2026 (`probe-order.mjs`, `probe-upload.mjs`, in the task report).
 */
type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

const fakeFetch = (answers: Array<{ status: number; body?: unknown; text?: string }>) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: typeof init.body === "string" ? init.body : undefined,
    });
    const answer = answers.shift() ?? { status: 500, body: { code: "050001", message: "no answer left" } };
    const text = answer.text ?? (answer.body === undefined ? "" : JSON.stringify(answer.body));
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => text,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

const credentials = { token: "tok-123", base: "https://api.example.test/v1" };
const noRetry = { retryDelaysMs: [] as number[] };

describe("apiship: the request core", () => {
  it("sends the token bare, JSON both ways, and parses the answer", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: { orderId: 72242, created: "2026-10-14T08:13:54+03:00" } }]);
    const answer = await apishipRequest<{ orderId: number }>(credentials, "/orders", { method: "POST", body: { a: 1 } }, { fetchImpl });
    expect(answer.orderId).toBe(72242);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.test/v1/orders");
    expect(calls[0].headers.Authorization).toBe("tok-123");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].body).toBe('{"a":1}');
  });

  it("raises a 4xx at once with ApiShip's own code, message and field errors, never the token", async () => {
    const { calls, fetchImpl } = fakeFetch([
      {
        status: 400,
        body: { code: "040000", message: "Ошибка валидации", errors: [{ field: "recipient.phone", message: "обязательное поле" }] },
      },
    ]);
    const error = await apishipRequest(credentials, "/orders", { method: "POST", body: {} }, { fetchImpl, ...noRetry }).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(ApishipError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("040000");
    expect(error.detail).toBe("ApiShip /orders answered 400 040000: Ошибка валидации — recipient.phone: обязательное поле");
    expect(error.detail).not.toContain("tok-123");
    expect(calls).toHaveLength(1);
  });

  it("retries a 5xx per the delay list and gives up with the last answer", async () => {
    const { calls, fetchImpl } = fakeFetch([
      { status: 502, text: "bad gateway" },
      { status: 500, body: { code: "050001", message: "Ошибка сервера" } },
      { status: 200, body: { rows: [] } },
    ]);
    const answer = await apishipRequest<{ rows: unknown[] }>(credentials, "/connections", {}, { fetchImpl, retryDelaysMs: [0, 0] });
    expect(answer.rows).toEqual([]);
    expect(calls).toHaveLength(3);

    const dead = fakeFetch([{ status: 503, text: "" }, { status: 503, text: "" }]);
    const error = await apishipRequest(credentials, "/connections", {}, { fetchImpl: dead.fetchImpl, retryDelaysMs: [0] }).catch(
      (caught) => caught,
    );
    expect(error.status).toBe(503);
    expect(dead.calls).toHaveLength(2);
  });

  it("renders the query filter as ApiShip wants it and refuses a value with a reserved character", () => {
    expect(apishipFilter({ city: "Санкт-Петербург", providerKey: "cdek", availableOperation: [2, 3], id: undefined })).toBe(
      "city=Санкт-Петербург;providerKey=cdek;availableOperation=[2,3]",
    );
    expect(() => apishipFilter({ city: "a;b" })).toThrow(ApishipError);
  });
});

describe("apiship: lists and the calculator", () => {
  it("reads the carriers of the cabinet and keeps nothing of connectParams but the test flag", async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 200,
        body: {
          rows: [
            { id: "1700", providerKey: "cdek", name: "", isUseBaseConnect: 0, connectParams: { account: "secret-login", password: "secret", test: true } },
            { id: "1682", providerKey: "ozonlog", connectParams: {} },
          ],
          meta: { total: 2, offset: 0, limit: 100 },
        },
      },
    ]);
    const connections = await listConnections(credentials, { fetchImpl });
    expect(connections).toEqual([
      { id: "1700", providerKey: "cdek", name: null, isUseBaseConnect: 0, test: true, created: null },
      { id: "1682", providerKey: "ozonlog", name: null, isUseBaseConnect: null, test: null, created: null },
    ]);
    expect(JSON.stringify(connections)).not.toContain("secret");
  });

  it("asks for a city's points with the filter and shapes a point", async () => {
    const { calls, fetchImpl } = fakeFetch([
      {
        status: 200,
        body: {
          rows: [
            {
              id: 491, providerKey: "cdek", code: "SPB3", name: "SPB3, Санкт-Петербург, пр-т Коломяжский",
              address: "пр-т Коломяжский, 28, корп.2", postIndex: "197341", city: "Санкт-Петербург", lat: "60.008152", lng: 30.29509,
              timetable: "Пн-Пт 09:00-21:00", availableOperation: 3, type: 1, limits: { maxWeight: 30000 }, enabled: true,
            },
          ],
          meta: { total: 282, offset: 0, limit: 500 },
        },
      },
    ]);
    const { points, total } = await listPoints(credentials, { providerKey: "cdek", city: "Санкт-Петербург" }, { fetchImpl });
    expect(total).toBe(282);
    expect(decodeURIComponent(calls[0].url)).toContain("filter=providerKey=cdek;city=Санкт-Петербург;availableOperation=[2,3]");
    expect(points[0]).toMatchObject({ id: 491, code: "SPB3", lat: 60.008152, lng: 30.29509, type: 1, limits: { maxWeight: 30000 }, enabled: true });
  });

  it("returns the calculator's two lists, empty tariffs included, as a real answer", async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 200,
        body: {
          deliveryToDoor: [{ providerKey: "cdek", tariffs: [{ tariffId: 56, tariffName: "Посылка дверь-дверь", deliveryCost: 420, calendarDaysMin: 2, calendarDaysMax: 4, pickupTypes: [1], deliveryTypes: [1] }] }],
          deliveryToPoint: [{ providerKey: "cdek", tariffs: [] }],
        },
      },
    ]);
    const answer = await calculate(
      credentials,
      { from: { countryCode: "RU", city: "Москва" }, to: { countryCode: "RU", city: "Санкт-Петербург" }, places: [{ weight: 1000, length: 30, width: 20, height: 10 }] },
      { fetchImpl },
    );
    expect(answer.deliveryToDoor[0].tariffs[0]).toMatchObject({ tariffId: 56, deliveryCost: 420, calendarDaysMin: 2 });
    expect(answer.deliveryToPoint).toEqual([{ providerKey: "cdek", tariffs: [] }]);
  });
});

describe("apiship: orders and documents", () => {
  it("creates an order and reads the id ApiShip answered", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: { orderId: "72242", created: "2026-10-14T08:13:54+03:00" } }]);
    const ack = await createOrder(credentials, { order: {} } as never, { fetchImpl });
    expect(ack).toEqual({ orderId: 72242, created: "2026-10-14T08:13:54+03:00" });
    expect(calls[0].method).toBe("POST");
  });

  it("asks statuses in chunks of a hundred and merges the answers", async () => {
    const page = (ids: number[]) => ({
      status: 200,
      body: { succeedOrders: ids.map((id) => ({ orderInfo: { orderId: String(id) }, status: { key: "uploaded" } })), failedOrders: [] },
    });
    const ids = Array.from({ length: 150 }, (_, index) => index + 1);
    const { calls, fetchImpl } = fakeFetch([page(ids.slice(0, 100)), page(ids.slice(100))]);
    const answer = await getOrderStatuses(credentials, ids, { fetchImpl });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0].body as string).orderIds).toHaveLength(100);
    expect(answer.succeedOrders).toHaveLength(150);
  });

  it("reads a label link, and a per-order refusal as a failed order, not an error", async () => {
    const made = fakeFetch([{ status: 200, body: { url: "https://storage.dev.apiship.ru/file/get?file=1110019183_1.pdf", failedOrders: null } }]);
    expect(await getLabels(credentials, [72242], { fetchImpl: made.fetchImpl })).toEqual({
      url: "https://storage.dev.apiship.ru/file/get?file=1110019183_1.pdf",
      failedOrders: [],
    });
    const pending = fakeFetch([{ status: 200, body: { url: null, failedOrders: [{ orderId: "72243", message: "Заказ не был передан в СД" }] } }]);
    expect(await getLabels(credentials, [72243], { fetchImpl: pending.fetchImpl })).toEqual({
      url: null,
      failedOrders: [{ orderId: "72243", message: "Заказ не был передан в СД" }],
    });
  });

  it("reads one act per carrier", async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 200,
        body: {
          waybillItems: [{ providerKey: "cdek", file: "https://storage.dev.apiship.ru/file/get?file=act.pdf", orderIds: ["72242"] }],
          failedOrders: [{ orderId: "72243", message: "Не получен ID заказа в системе службы доставки" }],
        },
      },
    ]);
    const answer = await getWaybills(credentials, [72242, 72243], "pdf", { fetchImpl });
    expect(answer.waybills).toEqual([{ providerKey: "cdek", file: "https://storage.dev.apiship.ru/file/get?file=act.pdf", orderIds: [72242] }]);
    expect(answer.failedOrders).toHaveLength(1);
  });

  it("cancels with a GET, the way the API spells it", async () => {
    const { calls, fetchImpl } = fakeFetch([{ status: 200, body: { orderId: 72242, canceled: "2026-10-14T08:12:33+03:00" } }]);
    expect(await cancelOrder(credentials, 72242, { fetchImpl })).toEqual({ orderId: 72242, canceled: "2026-10-14T08:12:33+03:00" });
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.example.test/v1/orders/72242/cancel" });
  });
});
