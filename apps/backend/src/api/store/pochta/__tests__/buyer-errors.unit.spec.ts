import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

jest.mock("../helpers", () => ({
  ...jest.requireActual("../helpers"),
  pochtaContext: jest.fn(),
  buyerPoints: jest.fn(),
}));
jest.mock("../../../../pochta/client", () => ({ listNearbyPostOffices: jest.fn() }));
jest.mock("../../../../pochta/quote", () => ({ findPochtaPoint: jest.fn(), quoteToPoint: jest.fn() }));
jest.mock("../../../../modules/pochta-fulfillment/service", () => ({ quoteItemsOf: () => [] }));

import { buyerPoints, pochtaContext } from "../helpers";
import { findPochtaPoint, quoteToPoint } from "../../../../pochta/quote";
import { GET as getCities } from "../cities/route";
import { GET as getPoints } from "../points/route";
import { GET as getQuote } from "../quote/route";

/**
 * The buyer-facing Russian Post routes never hand the carrier's or our own
 * internal error text to the storefront (t-2026-09-30-01): the answer carries
 * `unavailable: true`, and the detail goes to the log with the shop's id.
 */

const INTERNAL = "Почта России ответила HTTP 502 (upstream 10.0.0.7:443)";

const TENANT = { id: "ten_test", sales_channel_id: "sc_test" };
const SECRET = { credentials: { sender_index: "101000", default_weight_g: 1000 } };
const CREDENTIALS = { token: "t", user_key: null };

const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
const graph = jest.fn(async () => ({ data: [{ id: "cart_1", sales_channel_id: "sc_test", currency_code: "rub" }] }));

const request = (query: Record<string, string>) =>
  ({
    query,
    scope: {
      resolve: (key: string) =>
        key === ContainerRegistrationKeys.LOGGER ? logger : key === ContainerRegistrationKeys.QUERY ? { graph } : null,
    },
  }) as never;

const response = () => {
  const res = { statusCode: 0, body: undefined as unknown, status: jest.fn(), json: jest.fn() };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
};

const expectNoLeak = (res: ReturnType<typeof response>) => {
  expect(res.statusCode).toBe(200);
  expect(JSON.stringify(res.body)).not.toContain("HTTP 502");
  expect(res.body).toMatchObject({ configured: true, unavailable: true });
  expect(res.body).not.toHaveProperty("error");
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(INTERNAL));
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(TENANT.id));
};

beforeEach(() => {
  jest.clearAllMocks();
  (pochtaContext as jest.Mock).mockResolvedValue({ tenant: TENANT, secret: SECRET, credentials: CREDENTIALS });
});

describe("GET /store/pochta/points when the directory fails", () => {
  it("answers a flag and logs the detail", async () => {
    (buyerPoints as jest.Mock).mockRejectedValue(new Error(INTERNAL));
    const res = response();
    await getPoints(request({ city: "Москва" }), res as never);
    expectNoLeak(res);
    expect(res.body).toMatchObject({ city: null, points: [] });
  });
});

describe("GET /store/pochta/cities when the directory fails", () => {
  it("answers a flag and logs the detail", async () => {
    (buyerPoints as jest.Mock).mockRejectedValue(new Error(INTERNAL));
    const res = response();
    await getCities(request({ q: "Мос" }), res as never);
    expectNoLeak(res);
    expect(res.body).toMatchObject({ cities: [] });
  });
});

describe("GET /store/pochta/quote", () => {
  const query = { cart_id: "cart_1", pochta_point_index: "980063", pochta_point_kind: "pvz" };

  it("answers a flag and logs the detail when the tariff call fails", async () => {
    (findPochtaPoint as jest.Mock).mockResolvedValue({ index: "980063", kind: "pvz", weight_limit_g: null });
    (quoteToPoint as jest.Mock).mockRejectedValue(new Error(INTERNAL));
    const res = response();
    await getQuote(request(query), res as never);
    expectNoLeak(res);
    expect(res.body).toMatchObject({ quote: null });
  });

  it("answers a flag and logs the detail when the directory fails, rather than «point not found»", async () => {
    (findPochtaPoint as jest.Mock).mockRejectedValue(new Error(INTERNAL));
    const res = response();
    await getQuote(request(query), res as never);
    expectNoLeak(res);
    expect(res.body).toMatchObject({ quote: null });
  });
});
