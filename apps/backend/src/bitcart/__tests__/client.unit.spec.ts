import {
  BitcartClientError,
  bitcartCheckoutLink,
  bitcartRefundLink,
  createBitcartInvoice,
  getBitcartInvoice,
  refundBitcartInvoice,
  type BitcartConnection,
} from "../client";
import { mockBitcart } from "./mock-bitcart";

/**
 * ask-20261005-070255-438f, stage 2: the Merchants API client against a mock
 * server. What a real Bitcart would reject is asserted on the request itself:
 * the path under the API's own prefix, the `Authorization: Bearer <token>`
 * header and the body's shape (`CreateInvoice`, `RefundData`).
 */

const CONNECTION: BitcartConnection = {
  serverUrl: "https://pay.example.com/api",
  storeId: "01JSTORE1",
  apiKey: "bitcart-token",
};

const server = () => mockBitcart({ serverUrl: CONNECTION.serverUrl, storeId: "01JSTORE1", apiKey: "bitcart-token" });

const create = (mock: ReturnType<typeof mockBitcart>, connection: BitcartConnection = CONNECTION) =>
  createBitcartInvoice(
    connection,
    {
      price: "25.50",
      currency: "USD",
      orderId: "payses_1",
      notificationUrl: "https://engine.example.com/bitcart/webhook/ten_1",
      redirectUrl: "https://shop.example.com/api/payment-return?provider=bitcart",
      metadata: { payment_session_id: "payses_1" },
    },
    { fetchImpl: mock.fetchImpl },
  );

describe("createBitcartInvoice", () => {
  it("posts the invoice under the API prefix with the token as Bearer", async () => {
    const mock = server();

    const invoice = await create(mock);

    expect(mock.calls[0]).toEqual({
      method: "POST",
      path: "/api/invoices",
      authorization: "Bearer bitcart-token",
      body: {
        price: "25.50",
        currency: "USD",
        store_id: "01JSTORE1",
        order_id: "payses_1",
        notification_url: "https://engine.example.com/bitcart/webhook/ten_1",
        redirect_url: "https://shop.example.com/api/payment-return?provider=bitcart",
        metadata: { payment_session_id: "payses_1" },
      },
    });
    expect(invoice).toMatchObject({ store_id: "01JSTORE1", price: "25.50", currency: "USD", status: "pending" });
  });

  it("leaves out a notification or return address it does not have", async () => {
    const mock = server();

    await createBitcartInvoice(
      CONNECTION,
      { price: "1.00", currency: "EUR", orderId: "payses_2", notificationUrl: null, redirectUrl: null },
      { fetchImpl: mock.fetchImpl },
    );

    expect(mock.calls[0].body).toEqual({ price: "1.00", currency: "EUR", store_id: "01JSTORE1", order_id: "payses_2" });
  });

  it("throws a client error that names the status only, never the server's detail", async () => {
    const mock = mockBitcart({ serverUrl: CONNECTION.serverUrl, storeId: "01JSTORE1", apiKey: "other-token" });

    const error = await create(mock).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BitcartClientError);
    expect((error as BitcartClientError).status).toBe(403);
    expect((error as BitcartClientError).message).toBe("Bitcart answered HTTP 403");
    expect((error as BitcartClientError).message).not.toContain("Anonymous");
  });
});

describe("getBitcartInvoice and refundBitcartInvoice", () => {
  it("read with the token and refund in the invoice currency, naming the admin host", async () => {
    const mock = server();
    const created = await create(mock);
    mock.setStatus(created.id, "complete");

    const invoice = await getBitcartInvoice(CONNECTION, created.id, { fetchImpl: mock.fetchImpl });
    const refund = await refundBitcartInvoice(
      CONNECTION,
      created.id,
      { amount: "10.00", currency: "USD", adminHost: "https://pay.example.com/admin" },
      { fetchImpl: mock.fetchImpl },
    );

    expect(invoice.status).toBe("complete");
    expect(mock.calls[1]).toMatchObject({
      method: "GET",
      path: `/api/invoices/${created.id}`,
      authorization: "Bearer bitcart-token",
    });
    expect(mock.calls[2]).toMatchObject({
      method: "POST",
      path: `/api/invoices/${created.id}/refunds`,
      body: { amount: "10.00", currency: "USD", admin_host: "https://pay.example.com/admin", send_email: true },
    });
    expect(refund.id).toMatch(/^01JBITCARTREF/);
  });

  it("surface Bitcart's refusal to refund an unpaid invoice as a 422", async () => {
    const mock = server();
    const created = await create(mock);

    await expect(
      refundBitcartInvoice(
        CONNECTION,
        created.id,
        { amount: "10.00", currency: "USD", adminHost: "https://pay.example.com/admin" },
        { fetchImpl: mock.fetchImpl },
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("encode an invoice id into the path and never retry", async () => {
    const mock = server();

    await getBitcartInvoice(CONNECTION, "../stores", { fetchImpl: mock.fetchImpl }).catch(() => undefined);
    expect(mock.calls[0].path).toBe("/api/invoices/..%2Fstores");

    mock.failNext(503);
    await expect(getBitcartInvoice(CONNECTION, "01JINV1", { fetchImpl: mock.fetchImpl })).rejects.toMatchObject({
      status: 503,
    });
    expect(mock.calls).toHaveLength(2);
  });
});

describe("the admin app's pages", () => {
  it("put the checkout page and the refund claim page under the admin address, prefix included", () => {
    expect(bitcartCheckoutLink("https://pay.example.com/admin", "01JINV1")).toBe("https://pay.example.com/admin/i/01JINV1");
    expect(bitcartRefundLink("https://admin.example.com", "01JREF1")).toBe("https://admin.example.com/refunds/01JREF1");
    expect(bitcartCheckoutLink("https://admin.example.com", "a/b")).toBe("https://admin.example.com/i/a%2Fb");
  });
});
