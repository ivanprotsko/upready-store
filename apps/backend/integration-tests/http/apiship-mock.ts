import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * An ApiShip stand-in for the ApiShip seam test (t-2026-10-14-58), the way
 * `bitcart-mock.ts` stands in for Bitcart: a real HTTP server on a loopback
 * port that the app under test calls with its own `fetch`, so nothing in
 * `src` is stubbed or given a test branch.
 *
 * Every answer shape is the one measured on ApiShip's test contour on
 * 14.10.2026 (the task report keeps the raw probes): the list envelope
 * `{ rows, meta }`, the calculator's two lists, `POST /orders` → `{ orderId,
 * created }`, the status answer `{ orderInfo, status }`, the labels answer
 * with `url` or `failedOrders`, the waybills answer per carrier, and the
 * bare token in `Authorization`.
 *
 * The carrier's side is driven by the test: `advance(orderId, …)` moves an
 * order to `uploaded` with a number, or further, the way the real carrier
 * would in its own time.
 */
export type MockApishipOrder = {
  orderId: number;
  clientNumber: string;
  providerKey: string;
  status: string;
  providerNumber: string;
  canceled: boolean;
  deleted: boolean;
  request: Record<string, unknown>;
};

export type MockApiship = {
  origin: string;
  baseUrl: string;
  token: string;
  calls: Array<{ method: string; path: string; body: unknown; authorized: boolean }>;
  orders: Map<number, MockApishipOrder>;
  webhooks: Array<{ uuid: string; url: string; type: string }>;
  advance: (orderId: number, change: { status: string; providerNumber?: string }) => void;
  close: () => Promise<void>;
};

const TARIFFS: Record<string, Array<{ id: number; name: string; pickupType: number | null; deliveryType: number | null }>> = {
  cdek: [
    { id: 56, name: "Посылка дверь-дверь", pickupType: 1, deliveryType: 1 },
    { id: 55, name: "Посылка дверь-склад", pickupType: 1, deliveryType: 2 },
    { id: 53, name: "Посылка склад-склад", pickupType: 2, deliveryType: 2 },
  ],
  rupost: [
    { id: 692, name: "Отправление EMS", pickupType: 1, deliveryType: 1 },
    { id: 690, name: "Посылка онлайн", pickupType: 2, deliveryType: 2 },
  ],
};

const POINTS: Array<Record<string, unknown>> = [
  { id: 491, providerKey: "cdek", code: "SPB3", name: "SPB3, Санкт-Петербург, пр-т Коломяжский", address: "197341, Санкт-Петербург, пр-т Коломяжский, 28, корп.2", postIndex: "197341", city: "Санкт-Петербург", region: "Санкт-Петербург", lat: 60.008152, lng: 30.29509, timetable: "Пн-Пт 09:00-21:00", availableOperation: 3, type: 1, limits: { maxWeight: 30000 }, enabled: true },
  { id: 2358, providerKey: "cdek", code: "SPB9", name: "SPB9, Санкт-Петербург, пр-т Лиговский", address: "191040, Санкт-Петербург, пр-т Лиговский, 50", postIndex: "191040", city: "Санкт-Петербург", region: "Санкт-Петербург", lat: 59.9234772, lng: 30.3621769, timetable: "Пн-Вс 08:00-21:00", availableOperation: 3, type: 1, limits: { maxWeight: 30000 }, enabled: true },
  { id: 7001, providerKey: "rupost", code: "190000", name: "Отделение 190000", address: "190000, Санкт-Петербург, Почтамтская ул., 9", postIndex: "190000", city: "Санкт-Петербург", region: "Санкт-Петербург", lat: 59.93, lng: 30.3, timetable: "Пн-Пт 08:00-20:00", availableOperation: 3, type: 3, limits: { maxWeight: 20000 }, enabled: true },
];

const PRICES: Record<string, { door: { tariffId: number; cost: number }; point: { tariffId: number; cost: number } }> = {
  cdek: { door: { tariffId: 56, cost: 420 }, point: { tariffId: 55, cost: 250 } },
  rupost: { door: { tariffId: 692, cost: 650 }, point: { tariffId: 690, cost: 350 } },
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const parseFilter = (raw: string | null): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of (raw ?? "").split(";")) {
    const [name, ...rest] = part.split("=");
    if (name) out[name] = rest.join("=");
  }
  return out;
};

export const startApishipMock = async (options: { token: string; port?: number }): Promise<MockApiship> => {
  const state: MockApiship = {
    origin: "",
    baseUrl: "",
    token: options.token,
    calls: [],
    orders: new Map(),
    webhooks: [],
    advance: (orderId, change) => {
      const order = state.orders.get(orderId);
      if (!order) throw new Error(`mock apiship: no order ${orderId}`);
      order.status = change.status;
      if (change.providerNumber !== undefined) order.providerNumber = change.providerNumber;
    },
    close: async () => {},
  };
  let nextOrderId = 72240;
  let nextWebhook = 1;

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const statusAnswer = (order: MockApishipOrder) => ({
    orderInfo: {
      orderId: String(order.orderId),
      providerKey: order.providerKey,
      providerNumber: order.providerNumber,
      additionalProviderNumber: "",
      barcode: "",
      clientNumber: order.clientNumber,
      returnProviderNumber: "",
      checkUrl: "",
      trackingUrl: order.providerKey === "cdek" ? `https://www.cdek.ru/ru/tracking/?order_id=${order.providerNumber}` : "",
    },
    status: {
      key: order.status,
      name: order.status,
      description: "",
      errorCode: "",
      providerCode: "",
      providerName: "",
      providerDescription: "",
      createdProvider: "",
      created: "2026-10-14T08:13:54+03:00",
    },
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = req.method ?? "GET";
    const raw = await readBody(req);
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    const authorized = req.headers.authorization === state.token;
    state.calls.push({ method, path: url.pathname + url.search, body, authorized });
    const path = url.pathname;

    // The storage: a PDF for any file name, on the same origin as the API.
    if (path === "/storage/file/get") {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end(Buffer.from(`%PDF-1.4\n% mock apiship ${url.searchParams.get("file")}\n%%EOF\n`, "latin1"));
      return;
    }
    if (path === "/v1/users/login" && method === "POST") {
      const login = body as { login?: string; password?: string };
      return login?.login === "test" && login?.password === "test"
        ? json(res, 200, { token: state.token })
        : json(res, 403, { code: "040302", message: "Неверный логин или пароль" });
    }
    if (!authorized) {
      return json(res, 401, { code: "040101", message: "Неверный ключ безопасности" });
    }

    if (path === "/v1/connections" && method === "GET") {
      return json(res, 200, {
        rows: [
          { id: "1700", companyId: "1", providerKey: "cdek", name: "", isUseBaseConnect: 0, connectParams: { account: "carrier-login", password: "carrier-password", test: true } },
          { id: "1801", companyId: "1", providerKey: "rupost", name: "", isUseBaseConnect: 0, connectParams: { token: "carrier-token" } },
        ],
        meta: { total: 2, offset: 0, limit: 100 },
      });
    }
    if (path === "/v1/lists/providers") {
      const rows = [
        { key: "cdek", name: "СДЭК", description: null },
        { key: "rupost", name: "Почта России", description: null },
        { key: "boxberry", name: "Boxberry", description: null },
      ];
      return json(res, 200, { rows, meta: { total: rows.length, offset: 0, limit: 500 } });
    }
    if (path === "/v1/lists/tariffs") {
      const filter = parseFilter(url.searchParams.get("filter"));
      const rows = Object.entries(TARIFFS)
        .filter(([key]) => !filter.providerKey || filter.providerKey === key)
        .flatMap(([key, tariffs]) => tariffs.map((tariff) => ({ ...tariff, providerKey: key, aliasName: null, description: null, weightMin: 0, weightMax: 30000 })));
      return json(res, 200, { rows, meta: { total: rows.length, offset: 0, limit: 1000 } });
    }
    if (path === "/v1/lists/points") {
      const filter = parseFilter(url.searchParams.get("filter"));
      const ids = filter.id ? filter.id.replace(/[\[\]]/g, "").split(",").map(Number) : null;
      const rows = POINTS.filter(
        (point) =>
          (!filter.providerKey || point.providerKey === filter.providerKey) &&
          (!filter.city || point.city === filter.city) &&
          (!ids || ids.includes(point.id as number)) &&
          (!filter.code || point.code === filter.code),
      );
      return json(res, 200, { rows, meta: { total: rows.length, offset: 0, limit: 500 } });
    }
    if (path === "/v1/calculator" && method === "POST") {
      const request = body as { providerKeys?: string[]; deliveryTypes?: number[]; to?: { city?: string; countryCode?: string }; places?: Array<{ weight: number }> };
      const keys = request.providerKeys?.length ? request.providerKeys : Object.keys(PRICES);
      const types = request.deliveryTypes?.length ? request.deliveryTypes : [1, 2];
      const serves = (request.to?.countryCode ?? "RU").toUpperCase() === "RU";
      const weight = request.places?.[0]?.weight ?? 1000;
      const tariff = (key: string, side: "door" | "point") => {
        const price = PRICES[key]?.[side];
        if (!price || !serves) return [];
        const name = TARIFFS[key].find((entry) => entry.id === price.tariffId)?.name ?? "";
        return [
          {
            tariffId: price.tariffId,
            tariffName: name,
            tariffProviderId: String(price.tariffId),
            deliveryCost: price.cost + Math.floor(weight / 1000) * 10,
            deliveryCostOriginal: price.cost,
            feesIncluded: false,
            insuranceFee: 0,
            cashServiceFee: 0,
            calendarDaysMin: 2,
            calendarDaysMax: 4,
            pickupTypes: [1, 2],
            deliveryTypes: [side === "door" ? 1 : 2],
            ...(side === "point" ? { pointIds: POINTS.filter((point) => point.providerKey === key).map((point) => point.id) } : {}),
          },
        ];
      };
      return json(res, 200, {
        deliveryToDoor: types.includes(1) ? keys.filter((key) => PRICES[key]).map((key) => ({ providerKey: key, tariffs: tariff(key, "door") })) : [],
        deliveryToPoint: types.includes(2) ? keys.filter((key) => PRICES[key]).map((key) => ({ providerKey: key, tariffs: tariff(key, "point") })) : [],
      });
    }
    if (path === "/v1/orders" && method === "POST") {
      const request = body as { order?: { clientNumber?: string; providerKey?: string; tariffId?: number; pointOutId?: number } ; recipient?: { phone?: string } };
      if (!request.order?.clientNumber || !request.order.providerKey || !request.order.tariffId) {
        return json(res, 400, { code: "040000", message: "Ошибка валидации", errors: [{ field: "order.tariffId", message: "обязательное поле" }] });
      }
      if (!request.recipient?.phone) {
        return json(res, 400, { code: "040000", message: "Ошибка валидации", errors: [{ field: "recipient.phone", message: "обязательное поле" }] });
      }
      const orderId = ++nextOrderId;
      state.orders.set(orderId, {
        orderId,
        clientNumber: request.order.clientNumber,
        providerKey: request.order.providerKey,
        status: "uploading",
        providerNumber: "",
        canceled: false,
        deleted: false,
        request: body as Record<string, unknown>,
      });
      return json(res, 200, { orderId, created: "2026-10-14T08:13:54+03:00" });
    }
    const orderMatch = path.match(/^\/v1\/orders\/(\d+)(?:\/(status|cancel|statusHistory))?$/);
    if (orderMatch) {
      const order = state.orders.get(Number(orderMatch[1]));
      if (!order) return json(res, 404, { code: "040080", message: "Заказ не существует" });
      if (orderMatch[2] === "status") return json(res, 200, statusAnswer(order));
      if (orderMatch[2] === "statusHistory") return json(res, 200, { orderInfo: statusAnswer(order).orderInfo, rows: [statusAnswer(order).status] });
      if (orderMatch[2] === "cancel") {
        if (["onWay", "delivering", "delivered"].includes(order.status)) {
          return json(res, 400, { code: "040000", message: "Отмена невозможна: заказ уже передан на доставку" });
        }
        order.canceled = true;
        return json(res, 200, { orderId: order.orderId, canceled: "2026-10-14T08:12:33+03:00" });
      }
      if (method === "DELETE") {
        order.deleted = true;
        return json(res, 200, { orderId: order.orderId, deleted: "2026-10-14T08:12:34+03:00" });
      }
      if (method === "GET") return json(res, 200, { order: { orderId: order.orderId, clientNumber: order.clientNumber, providerKey: order.providerKey, providerNumber: order.providerNumber || null } });
    }
    if (path === "/v1/orders/statuses" && method === "POST") {
      const ids = ((body as { orderIds?: Array<number | string> })?.orderIds ?? []).map(Number);
      const succeedOrders = ids.filter((id) => state.orders.has(id)).map((id) => statusAnswer(state.orders.get(id) as MockApishipOrder));
      const failedOrders = ids.filter((id) => !state.orders.has(id)).map((id) => ({ orderId: String(id), message: "Указанного заказа не существует" }));
      return json(res, 200, { succeedOrders, failedOrders });
    }
    if (path === "/v1/orders/labels" && method === "POST") {
      const ids = ((body as { orderIds?: number[] })?.orderIds ?? []).map(Number);
      const ready = ids.filter((id) => state.orders.get(id)?.providerNumber);
      const failedOrders = ids.filter((id) => !state.orders.get(id)?.providerNumber).map((id) => ({ orderId: String(id), message: "Заказ не был передан в СД" }));
      return json(res, 200, {
        url: ready.length ? `${state.origin}/storage/file/get?file=labels_${ready.join("_")}.pdf` : null,
        failedOrders: failedOrders.length ? failedOrders : null,
      });
    }
    if (path === "/v1/orders/waybills" && method === "POST") {
      const ids = ((body as { orderIds?: number[] })?.orderIds ?? []).map(Number);
      const byProvider = new Map<string, number[]>();
      const failedOrders: Array<{ orderId: string; message: string }> = [];
      for (const id of ids) {
        const order = state.orders.get(id);
        if (!order?.providerNumber) {
          failedOrders.push({ orderId: String(id), message: "Не получен ID заказа в системе службы доставки" });
          continue;
        }
        byProvider.set(order.providerKey, [...(byProvider.get(order.providerKey) ?? []), id]);
      }
      return json(res, 200, {
        waybillItems: byProvider.size
          ? [...byProvider].map(([providerKey, orderIds]) => ({ providerKey, file: `${state.origin}/storage/file/get?file=act_${providerKey}_${orderIds.join("_")}.pdf`, orderIds: orderIds.map(String) }))
          : null,
        failedOrders: failedOrders.length ? failedOrders : null,
      });
    }
    if (path === "/v1/webhooks" && method === "GET") return json(res, 200, state.webhooks);
    if (path === "/v1/webhooks" && method === "POST") {
      const request = body as { url?: string; type?: string };
      const uuid = `e6f3527e-596d-4b7d-845d-${String(nextWebhook++).padStart(12, "0")}`;
      state.webhooks.push({ uuid, url: request.url ?? "", type: request.type ?? "" });
      return json(res, 200, { uuid });
    }
    const hookMatch = path.match(/^\/v1\/webhooks\/(.+)$/);
    if (hookMatch && method === "DELETE") {
      state.webhooks = state.webhooks.filter((hook) => hook.uuid !== decodeURIComponent(hookMatch[1]));
      return json(res, 200, { deleted: true });
    }
    return json(res, 404, { code: "040400", message: `mock apiship: no route ${method} ${path}` });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  state.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.baseUrl = `${state.origin}/v1`;
  state.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return state;
};
