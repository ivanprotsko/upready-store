import { ContainerRegistrationKeys, MedusaError, PaymentSessionStatus } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f: `BtcpayPaymentProviderService` against a mock
 * BTCPay Server, swapped in through the provider's own `clientOptions()` seam
 * (the counterpart of Tribute's). Only the tenant row is mocked; the Greenfield
 * client, the amounts and the status table run for real.
 */

jest.mock("../../../tenant-secrets/btcpay", () => ({
  ...jest.requireActual("../../../tenant-secrets/btcpay"),
  readBtcpaySecret: jest.fn(),
}));

import BtcpayPaymentProviderService from "../service";
import { readBtcpaySecret } from "../../../tenant-secrets/btcpay";
import type { BtcpayClientOptions } from "../../../btcpay/client";
import { mockBtcpay, type MockBtcpay } from "../../../btcpay/__tests__/mock-btcpay";

const mockReadSecret = readBtcpaySecret as jest.Mock;

const SERVER = "https://pay.example.com";
const SECRET = {
  id: "tis_1",
  tenant_id: "ten_1",
  is_enabled: true,
  credentials: {
    server_url: SERVER,
    store_id: "Store1",
    api_key: "greenfield-key",
    webhook_secret: "whsec",
  },
};

class TestService extends BtcpayPaymentProviderService {
  server!: MockBtcpay;

  protected clientOptions(): BtcpayClientOptions {
    return { fetchImpl: this.server.fetchImpl };
  }
}

const buildService = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new TestService({ logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} } as never, {});
  service.server = mockBtcpay({ serverUrl: SERVER, storeId: "Store1", apiKey: "greenfield-key" });
  return { service, logger };
};

const initiate = (service: TestService, overrides: Record<string, unknown> = {}) =>
  service.initiatePayment({
    amount: 25.5,
    currency_code: "USD",
    data: {
      tenant_id: "ten_1",
      session_id: "payses_1",
      return_url: "https://shop.example.com/api/payment-return?provider=btcpay&cart_id=cart_1&locale=ru",
      locale: "ru",
      ...overrides,
    },
    context: {},
  } as never);

const FLAG = "PAYMENTS_CRYPTO_AVAILABLE";
const previousFlag = process.env[FLAG];

beforeEach(() => {
  mockReadSecret.mockReset();
  mockReadSecret.mockResolvedValue(SECRET);
  process.env[FLAG] = "true";
});

afterAll(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
});

describe("initiatePayment", () => {
  it("creates an invoice for the cart's amount and keeps its checkout link on the session", async () => {
    const { service } = buildService();

    const result = await initiate(service);

    expect(service.server.calls[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/stores/Store1/invoices",
      authorization: "token greenfield-key",
      body: {
        amount: "25.50",
        currency: "USD",
        metadata: { orderId: "payses_1", paymentSessionId: "payses_1" },
        checkout: {
          redirectURL: "https://shop.example.com/api/payment-return?provider=btcpay&cart_id=cart_1&locale=ru",
          redirectAutomatically: true,
          defaultLanguage: "ru",
        },
      },
    });
    expect(result.id).toBe("inv_1");
    expect(result.status).toBe(PaymentSessionStatus.PENDING);
    expect(result.data).toMatchObject({
      provider: "btcpay",
      tenant_id: "ten_1",
      invoice_id: "inv_1",
      store_id: "Store1",
      checkout_link: `${SERVER}/i/inv_1`,
      amount: "25.50",
      currency_code: "usd",
      invoice_status: "New",
      confirmed_at: null,
    });
    // Nothing secret on a session the storefront reads.
    expect(JSON.stringify(result.data)).not.toContain("greenfield-key");
    expect(JSON.stringify(result.data)).not.toContain("whsec");
  });

  it("only offers a return button for an http(s) address, and drops anything else", async () => {
    const { service } = buildService();

    await initiate(service, { return_url: "javascript:alert(1)", locale: "<script>" });

    const body = service.server.calls[0].body as { checkout: Record<string, unknown> };
    expect(body.checkout).toEqual({});
  });

  it("refuses a shop whose BTCPay store is switched off or incomplete", async () => {
    const { service } = buildService();

    mockReadSecret.mockResolvedValueOnce(null);
    await expect(initiate(service)).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });

    mockReadSecret.mockResolvedValueOnce({ ...SECRET, credentials: { ...SECRET.credentials, api_key: "" } });
    await expect(initiate(service)).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });

    expect(service.server.calls).toHaveLength(0);
    expect(mockReadSecret).toHaveBeenCalledWith({}, "ten_1", {});
  });

  it("refuses a zero amount and a session without a tenant", async () => {
    const { service } = buildService();

    await expect(
      service.initiatePayment({ amount: 0, currency_code: "usd", data: { tenant_id: "ten_1", session_id: "s" }, context: {} } as never),
    ).rejects.toMatchObject({ type: MedusaError.Types.INVALID_DATA });
    await expect(initiate(service, { tenant_id: undefined })).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    });
  });
});

describe("authorizePayment and getPaymentStatus read the invoice from the server", () => {
  it("stays pending while the invoice is New or Processing, and captures once it is Settled", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);

    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.PENDING);

    service.server.setStatus("inv_1", "Processing");
    expect((await service.getPaymentStatus({ data } as never)).status).toBe(PaymentSessionStatus.PENDING);

    service.server.setStatus("inv_1", "Settled", "PaidOver");
    const authorized = await service.authorizePayment({ data } as never);
    expect(authorized.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(authorized.data).toMatchObject({ invoice_status: "Settled", additional_status: "PaidOver" });
    expect((authorized.data as Record<string, unknown>).confirmed_at).toEqual(expect.any(String));
  });

  it("answers expired and late-paid invoices with canceled and requires_more, and an invalid one with error", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);

    service.server.setStatus("inv_1", "Expired");
    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.CANCELED);
    service.server.setStatus("inv_1", "Expired", "PaidLate");
    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.REQUIRES_MORE);
    service.server.setStatus("inv_1", "Invalid");
    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.ERROR);
  });

  it("does not ask the server again once the session is confirmed", async () => {
    const { service } = buildService();

    const result = await service.authorizePayment({ data: { confirmed_at: "2026-10-05T12:00:00.000Z" } } as never);

    expect(result.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(service.server.calls).toHaveLength(0);
  });

  it("never captures a settled invoice the server reports for another amount", async () => {
    const { service, logger } = buildService();
    const { data } = await initiate(service);
    const stored = service.server.invoices.get("inv_1")!;
    service.server.invoices.set("inv_1", { ...stored, status: "Settled", amount: "0.01" });

    const result = await service.authorizePayment({ data } as never);

    expect(result.status).toBe(PaymentSessionStatus.ERROR);
    expect((result.data as Record<string, unknown>).confirmed_at).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it("answers the stored status from getPaymentStatus when the server cannot be read", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);
    service.server.failNext(503);

    const result = await service.getPaymentStatus({ data: { ...data, invoice_status: "Processing" } } as never);

    expect(result.status).toBe(PaymentSessionStatus.PENDING);
  });

  it("reads a switched-off shop's invoice anyway: an invoice already issued is not stranded", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);
    mockReadSecret.mockClear();

    await service.authorizePayment({ data } as never);

    expect(mockReadSecret).toHaveBeenCalledWith({}, "ten_1", { includeDisabled: true });
  });
});

describe("refundPayment", () => {
  it("opens a pull payment for exactly the refunded amount in the invoice currency", async () => {
    const { service, logger } = buildService();
    const { data } = await initiate(service);

    const result = await service.refundPayment({
      amount: 10,
      data: { ...data, confirmed_at: "2026-10-05T12:00:00.000Z" },
    } as never);

    expect(service.server.calls[1]).toMatchObject({
      method: "POST",
      path: "/api/v1/invoices/inv_1/refund",
      body: { refundVariant: "Custom", customAmount: "10.00", customCurrency: "USD" },
    });
    expect((result.data as { refunds: unknown[] }).refunds).toEqual([
      expect.objectContaining({
        pull_payment_id: "pp_inv_1",
        view_link: `${SERVER}/pull-payments/pp_inv_1`,
        amount: "10.00",
        currency: "usd",
      }),
    ]);
    // The claim link is a bearer link: in the data, never in the log.
    const logged = logger.info.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("pp_inv_1");
    expect(logged).not.toContain("/pull-payments/");
  });

  it("refuses to refund an invoice that never settled", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);

    await expect(service.refundPayment({ amount: 10, data } as never)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_ALLOWED,
    });
  });
});

describe("on an instance without cryptocurrency (PAYMENTS_CRYPTO_AVAILABLE not true)", () => {
  it("creates no invoice", async () => {
    const { service } = buildService();
    delete process.env[FLAG];

    await expect(initiate(service)).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });
    expect(service.server.calls).toHaveLength(0);
    expect(mockReadSecret).not.toHaveBeenCalled();
  });

  it("authorizes no unconfirmed session, and answers the stored status from getPaymentStatus", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);
    service.server.setStatus("inv_1", "Settled");
    process.env[FLAG] = "false";

    await expect(service.authorizePayment({ data } as never)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_ALLOWED,
    });
    expect((await service.getPaymentStatus({ data } as never)).status).toBe(PaymentSessionStatus.PENDING);
    expect(service.server.calls).toHaveLength(1);
  });

  it("still refunds: giving money back takes none", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);
    delete process.env[FLAG];

    await service.refundPayment({ amount: 5, data: { ...data, confirmed_at: "2026-10-05T12:00:00.000Z" } } as never);

    expect(service.server.calls[1]).toMatchObject({ method: "POST", path: "/api/v1/invoices/inv_1/refund" });
  });
});

describe("cancelPayment and deletePayment", () => {
  it("never call the server: a settled invoice must not be disowned", async () => {
    const { service } = buildService();
    const data = { invoice_id: "inv_1", tenant_id: "ten_1" };

    await service.cancelPayment({ data } as never);
    await service.deletePayment({ data } as never);

    expect(service.server.calls).toHaveLength(0);
  });
});
