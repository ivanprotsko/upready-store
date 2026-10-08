import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/**
 * t-cherk-22: `TributePaymentProviderService` against a mock Tribute server —
 * `../../tribute/client`'s functions are the one seam replaced here, same
 * role Pochta/CDEK's `fetchImpl` injection plays, applied at the client-call
 * boundary instead since the provider never takes a raw `fetch`.
 */

jest.mock("../../../tribute/client", () => ({
  createTributeOrder: jest.fn(),
  listTributeTransactions: jest.fn(),
  refundTributeTransaction: jest.fn(),
}));

jest.mock("../../../tenant-secrets/tribute", () => ({
  ...jest.requireActual("../../../tenant-secrets/tribute"),
  readTributeSecret: jest.fn(),
}));

import TributePaymentProviderService from "../service";
import { createTributeOrder, listTributeTransactions, refundTributeTransaction } from "../../../tribute/client";
import { readTributeSecret } from "../../../tenant-secrets/tribute";

const mockCreateOrder = createTributeOrder as jest.Mock;
const mockListTx = listTributeTransactions as jest.Mock;
const mockRefund = refundTributeTransaction as jest.Mock;
const mockReadSecret = readTributeSecret as jest.Mock;

const SECRET = {
  id: "tis_1",
  tenant_id: "ten_1",
  is_enabled: true,
  credentials: { api_key: "trbt_live_key", shop_id: null },
};

const buildService = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const container = { logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} };
  return new TributePaymentProviderService(container as never, {});
};

const FLAG = "TRIBUTE_AVAILABLE";
const previousFlag = process.env[FLAG];

beforeEach(() => {
  mockCreateOrder.mockReset();
  mockListTx.mockReset();
  mockRefund.mockReset();
  mockReadSecret.mockReset();
  process.env[FLAG] = "true";
});

afterAll(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
});

describe("initiatePayment", () => {
  it("creates a Tribute order with the amount converted to minor units for the cart's currency", async () => {
    mockReadSecret.mockResolvedValue(SECRET);
    mockCreateOrder.mockResolvedValue({
      uuid: "order-uuid-1",
      status: "pending",
      paymentUrl: "https://t.me/pay/1",
      webappPaymentUrl: "https://t.me/tribute/app?startapp=1",
    });

    const service = buildService();
    const result = await service.initiatePayment({
      amount: 1500,
      currency_code: "RUB",
      data: {
        tenant_id: "ten_1",
        session_id: "payses_1",
        success_url: "https://olavka.com/success",
        fail_url: "https://olavka.com/fail",
      },
      context: {},
    } as never);

    expect(mockCreateOrder).toHaveBeenCalledWith(
      "trbt_live_key",
      expect.objectContaining({ amount: 150000, currency: "rub" }),
      expect.anything(),
    );
    expect(result.id).toBe("order-uuid-1");
    expect((result.data as Record<string, unknown>).confirmed_at).toBeNull();
    expect((result.data as Record<string, unknown>).amount_minor).toBe(150000);
  });

  it("rejects a currency Tribute does not accept", async () => {
    mockReadSecret.mockResolvedValue(SECRET);
    const service = buildService();

    await expect(
      service.initiatePayment({
        amount: 1500,
        currency_code: "JPY",
        data: { tenant_id: "ten_1", session_id: "payses_1", success_url: "https://x/s", fail_url: "https://x/f" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("refuses a shop with no Tribute account configured", async () => {
    mockReadSecret.mockResolvedValue(null);
    const service = buildService();

    await expect(
      service.initiatePayment({
        amount: 1500,
        currency_code: "rub",
        data: { tenant_id: "ten_1", session_id: "payses_1", success_url: "https://x/s", fail_url: "https://x/f" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });
  });

  it("requires both a success and a fail URL", async () => {
    mockReadSecret.mockResolvedValue(SECRET);
    const service = buildService();

    await expect(
      service.initiatePayment({
        amount: 1500,
        currency_code: "rub",
        data: { tenant_id: "ten_1", session_id: "payses_1" },
        context: {},
      } as never),
    ).rejects.toMatchObject({ type: MedusaError.Types.INVALID_DATA });
  });
});

describe("authorizePayment / getPaymentStatus", () => {
  it("is PENDING before confirmed_at is stamped by the webhook", async () => {
    const service = buildService();
    const data = { confirmed_at: null };

    expect((await service.authorizePayment({ data } as never)).status).toBe("pending");
    expect((await service.getPaymentStatus({ data } as never)).status).toBe("pending");
  });

  it("is CAPTURED once the webhook stamped confirmed_at", async () => {
    const service = buildService();
    const data = { confirmed_at: "2026-10-03T12:00:00.000Z" };

    expect((await service.authorizePayment({ data } as never)).status).toBe("captured");
    expect((await service.getPaymentStatus({ data } as never)).status).toBe("captured");
  });
});

describe("refundPayment", () => {
  it("refunds the one refundable, not-yet-refunded sell transaction", async () => {
    mockReadSecret.mockResolvedValue(SECRET);
    mockListTx.mockResolvedValue([
      { id: "tx_1", type: "shop_order_sell", amount: 15, isRefunded: false, isRefundable: true },
    ]);
    mockRefund.mockResolvedValue({ status: "initiated" });

    const service = buildService();
    await service.refundPayment({ data: { tenant_id: "ten_1", order_uuid: "order-uuid-1" } } as never);

    expect(mockRefund).toHaveBeenCalledWith("trbt_live_key", "order-uuid-1", "tx_1", expect.anything());
  });

  it("refuses when there is no refundable transaction (already refunded, or none settled)", async () => {
    mockReadSecret.mockResolvedValue(SECRET);
    mockListTx.mockResolvedValue([
      { id: "tx_1", type: "shop_order_sell", amount: 15, isRefunded: true, isRefundable: false },
    ]);

    const service = buildService();
    await expect(
      service.refundPayment({ data: { tenant_id: "ten_1", order_uuid: "order-uuid-1" } } as never),
    ).rejects.toMatchObject({ type: MedusaError.Types.NOT_ALLOWED });
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe("on an instance without Tribute (TRIBUTE_AVAILABLE not true)", () => {
  const initiate = (service: TributePaymentProviderService) =>
    service.initiatePayment({
      amount: 1500,
      currency_code: "rub",
      data: { tenant_id: "ten_1", session_id: "payses_1", success_url: "https://x/s", fail_url: "https://x/f" },
      context: {},
    } as never);

  it.each([undefined, "false"])("creates no order when the switch is %p, and reads no key", async (value) => {
    mockReadSecret.mockResolvedValue(SECRET);
    if (value === undefined) delete process.env[FLAG];
    else process.env[FLAG] = value;

    await expect(initiate(buildService())).rejects.toMatchObject({
      type: MedusaError.Types.NOT_ALLOWED,
      message: expect.stringContaining("TRIBUTE_AVAILABLE"),
    });
    expect(mockReadSecret).not.toHaveBeenCalled();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("still refunds: giving money back takes no switch", async () => {
    mockReadSecret.mockResolvedValue(SECRET);
    mockListTx.mockResolvedValue([
      { id: "tx_1", type: "shop_order_sell", amount: 15, isRefunded: false, isRefundable: true },
    ]);
    mockRefund.mockResolvedValue({ status: "initiated" });
    delete process.env[FLAG];

    await buildService().refundPayment({ data: { tenant_id: "ten_1", order_uuid: "order-uuid-1" } } as never);
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });
});
