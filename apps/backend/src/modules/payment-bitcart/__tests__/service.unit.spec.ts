import { ContainerRegistrationKeys, MedusaError, PaymentSessionStatus } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f, stage 2: `BitcartPaymentProviderService` against a
 * mock Bitcart, swapped in through the provider's own `clientOptions()` seam.
 * Only the tenant row is mocked; the Merchants API client, the amounts and the
 * status table run for real.
 */

jest.mock("../../../tenant-secrets/bitcart", () => ({
  ...jest.requireActual("../../../tenant-secrets/bitcart"),
  readBitcartSecret: jest.fn(),
}));

import BitcartPaymentProviderService from "../service";
import { readBitcartSecret } from "../../../tenant-secrets/bitcart";
import type { BitcartClientOptions } from "../../../bitcart/client";
import { mockBitcart, type MockBitcart } from "../../../bitcart/__tests__/mock-bitcart";

const mockReadSecret = readBitcartSecret as jest.Mock;

const API = "https://pay.example.com/api";
const ADMIN = "https://pay.example.com/admin";
const SECRET = {
  id: "tis_1",
  tenant_id: "ten_1",
  is_enabled: true,
  credentials: {
    server_url: API,
    admin_url: ADMIN,
    store_id: "01JSTORE1",
    api_key: "bitcart-token",
  },
};

class TestService extends BitcartPaymentProviderService {
  server!: MockBitcart;

  protected clientOptions(): BitcartClientOptions {
    return { fetchImpl: this.server.fetchImpl };
  }
}

const buildService = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new TestService({ logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} } as never, {});
  service.server = mockBitcart({ serverUrl: API, storeId: "01JSTORE1", apiKey: "bitcart-token" });
  return { service, logger };
};

const initiate = (service: TestService, overrides: Record<string, unknown> = {}) =>
  service.initiatePayment({
    amount: 25.5,
    currency_code: "USD",
    data: {
      tenant_id: "ten_1",
      session_id: "payses_1",
      return_url: "https://shop.example.com/api/payment-return?provider=bitcart&cart_id=cart_1&locale=ru",
      ...overrides,
    },
    context: {},
  } as never);

const invoiceIdOf = (data: unknown) => (data as { invoice_id: string }).invoice_id;

const FLAG = "PAYMENTS_CRYPTO_AVAILABLE";
const previousFlag = process.env[FLAG];
const previousPublicUrl = process.env.BACKEND_PUBLIC_URL;

beforeEach(() => {
  mockReadSecret.mockReset();
  mockReadSecret.mockResolvedValue(SECRET);
  process.env[FLAG] = "true";
  process.env.BACKEND_PUBLIC_URL = "https://engine.example.com";
});

afterAll(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
  if (previousPublicUrl === undefined) delete process.env.BACKEND_PUBLIC_URL;
  else process.env.BACKEND_PUBLIC_URL = previousPublicUrl;
});

describe("initiatePayment", () => {
  it("creates an invoice for the cart's amount with its own notification address, and sends the buyer to the admin's checkout page", async () => {
    const { service } = buildService();

    const result = await initiate(service);

    expect(service.server.calls[0]).toMatchObject({
      method: "POST",
      path: "/api/invoices",
      authorization: "Bearer bitcart-token",
      body: {
        price: "25.50",
        currency: "USD",
        store_id: "01JSTORE1",
        order_id: "payses_1",
        notification_url: "https://engine.example.com/bitcart/webhook/ten_1",
        redirect_url: "https://shop.example.com/api/payment-return?provider=bitcart&cart_id=cart_1&locale=ru",
        metadata: { payment_session_id: "payses_1" },
      },
    });
    const invoiceId = invoiceIdOf(result.data);
    expect(result.id).toBe(invoiceId);
    expect(result.status).toBe(PaymentSessionStatus.PENDING);
    expect(result.data).toMatchObject({
      provider: "bitcart",
      tenant_id: "ten_1",
      store_id: "01JSTORE1",
      checkout_link: `${ADMIN}/i/${invoiceId}`,
      amount: "25.50",
      currency_code: "usd",
      invoice_status: "pending",
      exception_status: "none",
      confirmed_at: null,
    });
    expect((result.data as { expires_at: string }).expires_at).toEqual(expect.any(String));
    expect((result.data as { watch_until: string }).watch_until).toEqual(expect.any(String));
    // Nothing secret on a session the storefront reads.
    expect(JSON.stringify(result.data)).not.toContain("bitcart-token");
  });

  it("sends no notification address without BACKEND_PUBLIC_URL, and says the sweep takes over", async () => {
    const { service, logger } = buildService();
    delete process.env.BACKEND_PUBLIC_URL;

    await initiate(service);

    expect(service.server.calls[0].body).not.toHaveProperty("notification_url");
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("sweep job settles it"));
  });

  it("only offers a way back to an http(s) address, and drops anything else", async () => {
    const { service } = buildService();

    await initiate(service, { return_url: "javascript:alert(1)" });

    expect(service.server.calls[0].body).not.toHaveProperty("redirect_url");
  });

  it("refuses a shop whose Bitcart store is switched off or incomplete", async () => {
    const { service } = buildService();

    mockReadSecret.mockResolvedValueOnce(null);
    await expect(initiate(service)).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });

    mockReadSecret.mockResolvedValueOnce({ ...SECRET, credentials: { ...SECRET.credentials, admin_url: "" } });
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
  it("stays pending while the transfer is seen or confirmed once, and captures once it is complete", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);
    const id = invoiceIdOf(data);

    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.PENDING);

    service.server.setStatus(id, "paid");
    expect((await service.getPaymentStatus({ data } as never)).status).toBe(PaymentSessionStatus.PENDING);
    service.server.setStatus(id, "confirmed");
    expect((await service.getPaymentStatus({ data } as never)).status).toBe(PaymentSessionStatus.PENDING);

    service.server.setStatus(id, "complete", "paid_over");
    const authorized = await service.authorizePayment({ data } as never);
    expect(authorized.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(authorized.data).toMatchObject({ invoice_status: "complete", exception_status: "paid_over" });
    expect((authorized.data as Record<string, unknown>).confirmed_at).toEqual(expect.any(String));
  });

  it("answers expired, partly paid and invalid invoices with canceled, requires_more and error", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);
    const id = invoiceIdOf(data);

    service.server.setStatus(id, "expired");
    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.CANCELED);
    service.server.setStatus(id, "expired", "paid_partial");
    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.REQUIRES_MORE);
    service.server.setStatus(id, "invalid", "failed_confirm");
    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.ERROR);
  });

  it("does not ask the server again once the session is confirmed", async () => {
    const { service } = buildService();

    const result = await service.authorizePayment({ data: { confirmed_at: "2026-10-05T12:00:00.000Z" } } as never);

    expect(result.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(service.server.calls).toHaveLength(0);
  });

  it("never captures a complete invoice the server reports for another store or price", async () => {
    const { service, logger } = buildService();
    const { data } = await initiate(service);
    const id = invoiceIdOf(data);

    service.server.patch(id, { status: "complete", store_id: "01JSOMEONEELSE" });
    const foreign = await service.authorizePayment({ data } as never);
    expect(foreign.status).toBe(PaymentSessionStatus.ERROR);
    expect((foreign.data as Record<string, unknown>).confirmed_at).toBeNull();

    service.server.patch(id, { store_id: "01JSTORE1", price: "0.01" });
    expect((await service.authorizePayment({ data } as never)).status).toBe(PaymentSessionStatus.ERROR);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("answers the stored status from getPaymentStatus when the server cannot be read", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);
    service.server.failNext(503);

    const result = await service.getPaymentStatus({ data: { ...data, invoice_status: "expired" } } as never);

    expect(result.status).toBe(PaymentSessionStatus.CANCELED);
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
  it("opens a refund for exactly the refunded amount in the invoice currency, claim link in the data only", async () => {
    const { service, logger } = buildService();
    const { data } = await initiate(service);
    const id = invoiceIdOf(data);
    service.server.setStatus(id, "complete");

    const result = await service.refundPayment({
      amount: 10,
      data: { ...data, confirmed_at: "2026-10-05T12:00:00.000Z" },
    } as never);

    expect(service.server.calls[1]).toMatchObject({
      method: "POST",
      path: `/api/invoices/${id}/refunds`,
      authorization: "Bearer bitcart-token",
      body: { amount: "10.00", currency: "USD", admin_host: ADMIN, send_email: true },
    });
    const refunds = (result.data as { refunds: Array<{ refund_id: string; claim_link: string }> }).refunds;
    expect(refunds).toEqual([
      expect.objectContaining({ amount: "10.00", currency: "usd", claim_link: `${ADMIN}/refunds/${refunds[0].refund_id}` }),
    ]);
    // Whoever opens the claim link first chooses where the money goes: never in the log.
    const logged = logger.info.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain(refunds[0].refund_id);
    expect(logged).not.toContain("/refunds/");
  });

  it("refuses to refund an invoice that never completed", async () => {
    const { service } = buildService();
    const { data } = await initiate(service);

    await expect(service.refundPayment({ amount: 10, data } as never)).rejects.toMatchObject({
      type: MedusaError.Types.NOT_ALLOWED,
    });
    expect(service.server.calls).toHaveLength(1);
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
    service.server.setStatus(invoiceIdOf(data), "complete");
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
    service.server.setStatus(invoiceIdOf(data), "complete");
    delete process.env[FLAG];

    await service.refundPayment({ amount: 5, data: { ...data, confirmed_at: "2026-10-05T12:00:00.000Z" } } as never);

    expect(service.server.calls[1]).toMatchObject({ method: "POST", path: `/api/invoices/${invoiceIdOf(data)}/refunds` });
  });
});

describe("cancelPayment and deletePayment", () => {
  it("never call the server: a completed invoice must not be disowned", async () => {
    const { service } = buildService();
    const data = { invoice_id: "01JINV1", tenant_id: "ten_1" };

    await service.cancelPayment({ data } as never);
    await service.deletePayment({ data } as never);

    expect(service.server.calls).toHaveLength(0);
  });
});
