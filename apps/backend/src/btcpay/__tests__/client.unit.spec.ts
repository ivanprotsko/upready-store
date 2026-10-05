import {
  BtcpayClientError,
  createBtcpayInvoice,
  getBtcpayInvoice,
  refundBtcpayInvoice,
  type BtcpayConnection,
} from "../client";
import { mockBtcpay } from "./mock-btcpay";

/**
 * ask-20261005-070255-438f: the Greenfield client against a mock server. What
 * a real server would reject is asserted on the request itself: the path, the
 * `Authorization: token <key>` header and the body's shape.
 */

const CONNECTION: BtcpayConnection = {
  serverUrl: "https://pay.example.com",
  storeId: "Store1",
  apiKey: "greenfield-key",
};

const create = (server: ReturnType<typeof mockBtcpay>) =>
  createBtcpayInvoice(
    CONNECTION,
    {
      amount: "25.50",
      currency: "USD",
      metadata: { orderId: "payses_1" },
      checkout: { redirectURL: "https://shop.example.com/api/payment-return?provider=btcpay" },
    },
    { fetchImpl: server.fetchImpl },
  );

describe("createBtcpayInvoice", () => {
  it("posts to the store's invoices with the API key as `token`", async () => {
    const server = mockBtcpay({ serverUrl: CONNECTION.serverUrl, storeId: "Store1", apiKey: "greenfield-key" });

    const invoice = await create(server);

    expect(server.calls[0]).toEqual({
      method: "POST",
      path: "/api/v1/stores/Store1/invoices",
      authorization: "token greenfield-key",
      body: {
        amount: "25.50",
        currency: "USD",
        metadata: { orderId: "payses_1" },
        checkout: { redirectURL: "https://shop.example.com/api/payment-return?provider=btcpay" },
      },
    });
    expect(invoice).toMatchObject({ id: "inv_1", status: "New", checkoutLink: "https://pay.example.com/i/inv_1" });
  });

  it("throws a client error that names the status and code, never the response text", async () => {
    const server = mockBtcpay({ serverUrl: CONNECTION.serverUrl, storeId: "Store1", apiKey: "other-key" });

    const error = await create(server).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BtcpayClientError);
    expect((error as BtcpayClientError).status).toBe(401);
    expect((error as BtcpayClientError).message).toBe("BTCPay Server answered HTTP 401 (unauthenticated)");
    expect((error as BtcpayClientError).message).not.toContain("Authentication is required");
  });
});

describe("getBtcpayInvoice and refundBtcpayInvoice", () => {
  it("read and refund on the v2.4 store-less path", async () => {
    const server = mockBtcpay({ serverUrl: CONNECTION.serverUrl, storeId: "Store1", apiKey: "greenfield-key" });
    await create(server);

    const invoice = await getBtcpayInvoice(CONNECTION, "inv_1", { fetchImpl: server.fetchImpl });
    const pullPayment = await refundBtcpayInvoice(
      CONNECTION,
      "inv_1",
      { name: "Refund inv_1", customAmount: "10.00", customCurrency: "USD" },
      { fetchImpl: server.fetchImpl },
    );

    expect(invoice.id).toBe("inv_1");
    expect(server.calls[1]).toMatchObject({ method: "GET", path: "/api/v1/invoices/inv_1" });
    expect(server.calls[2]).toMatchObject({
      method: "POST",
      path: "/api/v1/invoices/inv_1/refund",
      body: { name: "Refund inv_1", refundVariant: "Custom", customAmount: "10.00", customCurrency: "USD" },
    });
    expect(pullPayment).toMatchObject({ id: "pp_inv_1", viewLink: "https://pay.example.com/pull-payments/pp_inv_1" });
  });

  it("fall back to the store-scoped path of BTCPay 2.3 and earlier on a 404", async () => {
    const server = mockBtcpay({
      serverUrl: CONNECTION.serverUrl,
      storeId: "Store1",
      apiKey: "greenfield-key",
      legacyRoutes: true,
    });
    await create(server);

    const invoice = await getBtcpayInvoice(CONNECTION, "inv_1", { fetchImpl: server.fetchImpl });

    expect(invoice.id).toBe("inv_1");
    expect(server.calls.slice(1).map((call) => call.path)).toEqual([
      "/api/v1/invoices/inv_1",
      "/api/v1/stores/Store1/invoices/inv_1",
    ]);
  });

  it("answer 404 for an invoice neither path knows, and do not retry other errors", async () => {
    const server = mockBtcpay({ serverUrl: CONNECTION.serverUrl, storeId: "Store1", apiKey: "greenfield-key" });

    await expect(getBtcpayInvoice(CONNECTION, "inv_missing", { fetchImpl: server.fetchImpl })).rejects.toMatchObject({
      status: 404,
    });
    expect(server.calls).toHaveLength(2);

    server.failNext(503);
    await expect(getBtcpayInvoice(CONNECTION, "inv_missing", { fetchImpl: server.fetchImpl })).rejects.toMatchObject({
      status: 503,
    });
    expect(server.calls).toHaveLength(3);
  });

  it("encode an invoice id into the path", async () => {
    const server = mockBtcpay({ serverUrl: CONNECTION.serverUrl, storeId: "Store1", apiKey: "greenfield-key" });

    await getBtcpayInvoice(CONNECTION, "../stores", { fetchImpl: server.fetchImpl }).catch(() => undefined);

    expect(server.calls[0].path).toBe("/api/v1/invoices/..%2Fstores");
  });
});
