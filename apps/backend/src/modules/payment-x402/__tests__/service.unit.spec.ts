import { ContainerRegistrationKeys, PaymentSessionStatus } from "@medusajs/framework/utils";

/**
 * t-2026-10-03-33: `X402PaymentProviderService` against a stand-in
 * facilitator, swapped in through the provider's own `facilitatorOptions()`
 * seam. Only the tenant row and the session lookup are mocked; the protocol
 * checks, the amounts and the facilitator client run for real.
 */

jest.mock("../../../tenant-secrets/x402", () => ({
  ...jest.requireActual("../../../tenant-secrets/x402"),
  readX402Secret: jest.fn(),
}));
jest.mock("../../../x402/session", () => ({
  ...jest.requireActual("../../../x402/session"),
  findX402SessionsByAuthorization: jest.fn(),
}));

import X402PaymentProviderService from "../service";
import { readX402Secret } from "../../../tenant-secrets/x402";
import { findX402SessionsByAuthorization, type X402SessionData } from "../../../x402/session";
import type { X402FacilitatorOptions } from "../../../x402/facilitator";
import { mockFacilitator, transactionFor, type MockFacilitator } from "../../../x402/__tests__/mock-facilitator";
import { headerFor, NONCE, PAY_TO, PAYER, payloadFor } from "../../../x402/__tests__/fixtures";

const mockReadSecret = readX402Secret as jest.Mock;
const mockFindSessions = findX402SessionsByAuthorization as jest.Mock;

const FACILITATOR = "https://facilitator.test";
const SECRET = {
  id: "tis_1",
  tenant_id: "ten_1",
  is_enabled: true,
  is_test: true,
  credentials: { pay_to: PAY_TO, networks: ["eip155:84532"], facilitator_url: FACILITATOR },
};

class TestService extends X402PaymentProviderService {
  facilitator!: MockFacilitator;

  protected facilitatorOptions(): X402FacilitatorOptions {
    return { fetchImpl: this.facilitator.fetchImpl };
  }
}

const buildService = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new TestService({ logger, [ContainerRegistrationKeys.PG_CONNECTION]: {} } as never, {});
  service.facilitator = mockFacilitator(FACILITATOR);
  return { service, logger };
};

const initiate = (service: TestService, overrides: Record<string, unknown> = {}, amount: unknown = 25.5, currency = "USD") =>
  service.initiatePayment({
    amount,
    currency_code: currency,
    data: { tenant_id: "ten_1", session_id: "payses_1", resource_url: "https://api.shop.test/store/payment-collections/pc_1", ...overrides },
    context: {},
  } as never);

/** Opens a session, signs its first requirement, and opens the signed session, as the checkout does. */
const signedSession = async (service: TestService, edit?: (payload: ReturnType<typeof payloadFor>) => void) => {
  const opened = (await initiate(service)).data as unknown as X402SessionData;
  const payload = payloadFor(opened.payment_required.accepts[0], {
    validAfter: String(Math.floor(Date.now() / 1000) - 600),
    validBefore: String(Math.floor(Date.now() / 1000) + 300),
  });
  edit?.(payload);
  return (await initiate(service, { payment_signature: headerFor(payload) })).data as unknown as X402SessionData;
};

const FLAG = "PAYMENTS_CRYPTO_AVAILABLE";
const previousFlag = process.env[FLAG];

beforeEach(() => {
  mockReadSecret.mockReset();
  mockReadSecret.mockResolvedValue(SECRET);
  mockFindSessions.mockReset();
  mockFindSessions.mockResolvedValue([]);
  process.env[FLAG] = "true";
});

afterAll(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
});

describe("initiatePayment", () => {
  it("asks for the cart's total in USDC on the shop's networks, payable to the shop's own address", async () => {
    const { service } = buildService();
    const result = await initiate(service);
    const data = result.data as unknown as X402SessionData;

    expect(result.status).toBe(PaymentSessionStatus.PENDING);
    expect(data).toMatchObject({
      provider: "x402",
      tenant_id: "ten_1",
      session_id: "payses_1",
      amount: "25500000",
      payment_payload: null,
      settled_at: null,
    });
    expect(data.payment_required).toEqual({
      x402Version: 2,
      resource: {
        url: "https://api.shop.test/store/payment-collections/pc_1",
        description: "Order payment, 25.50 USD",
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:84532",
          amount: "25500000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
          extra: { name: "USDC", version: "2" },
        },
      ],
    });
    expect(service.facilitator.calls).toHaveLength(0);
  });

  it("refuses a cart that is not in USD, a zero amount and a shop without settings", async () => {
    const { service } = buildService();
    await expect(initiate(service, {}, 25.5, "EUR")).rejects.toThrow("x402 takes USD carts only");
    await expect(initiate(service, {}, 0)).rejects.toThrow("zero or invalid amount");
    mockReadSecret.mockResolvedValue(null);
    await expect(initiate(service)).rejects.toThrow("x402 is not configured for this shop");
  });

  it("offers no real-money network until the instance allows it", async () => {
    const { service } = buildService();
    mockReadSecret.mockResolvedValue({ ...SECRET, credentials: { ...SECRET.credentials, networks: ["eip155:8453"] } });
    await expect(initiate(service)).rejects.toThrow("None of the shop's x402 networks is offered on this instance");
  });

  it("stores a signed payment that answers the requirements, with its payer and nonce", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    expect(data.payment_payload?.payload.authorization.from).toBe(PAYER);
    expect(data).toMatchObject({ payer: PAYER.toLowerCase(), nonce: NONCE, network: "eip155:84532", testnet: true });
  });

  it.each([
    ["an edited amount", (p: ReturnType<typeof payloadFor>) => (p.accepted.amount = "1"), "invalid_payment_requirements"],
    ["a payment to someone else", (p: ReturnType<typeof payloadFor>) => (p.payload.authorization.to = `0x${"22".repeat(20)}`), "recipient_mismatch"],
    ["a malformed signature", (p: ReturnType<typeof payloadFor>) => (p.payload.signature = "0x00"), "invalid_exact_evm_payload_signature"],
  ])("refuses %s before anyone is asked", async (_label, edit, reason) => {
    const { service } = buildService();
    await expect(signedSession(service, edit)).rejects.toThrow(reason);
    expect(service.facilitator.calls).toHaveLength(0);
  });

  it("refuses an authorization that already paid in another session", async () => {
    const { service } = buildService();
    mockFindSessions.mockResolvedValue([
      { id: "payses_0", payment_collection_id: "pc_0", status: "authorized", data: { settled_at: "2026-10-05T00:00:00Z", transaction: "0x1" } },
    ]);
    await expect(signedSession(service)).rejects.toThrow("already paid in session payses_0");
  });

  it("refuses everything where the instance takes no cryptocurrency", async () => {
    const { service } = buildService();
    process.env[FLAG] = "false";
    await expect(initiate(service)).rejects.toThrow("PAYMENTS_CRYPTO_AVAILABLE");
  });
});

describe("authorizePayment", () => {
  it("verifies, settles and authorizes with the transaction hash, explorer link and payer", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    const result = await service.authorizePayment({ data } as never);
    const settled = result.data as unknown as X402SessionData;

    expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED);
    expect(settled.transaction).toBe(transactionFor(NONCE));
    expect(settled.explorer_url).toBe(`https://sepolia.basescan.org/tx/${transactionFor(NONCE)}`);
    expect(settled).toMatchObject({ payer: PAYER.toLowerCase(), network: "eip155:84532", testnet: true, last_error: null });
    expect(settled.settled_at).toEqual(expect.any(String));
    expect(service.facilitator.calls.map((call) => call.step)).toEqual(["verify", "settle"]);
  });

  it("never settles a session twice: a settled one authorizes from its own data", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    const first = await service.authorizePayment({ data } as never);
    const again = await service.authorizePayment({ data: first.data } as never);
    expect(again.status).toBe(PaymentSessionStatus.AUTHORIZED);
    expect(service.facilitator.calls).toHaveLength(2);
  });

  it("waits for a signature on a session that has none", async () => {
    const { service } = buildService();
    const opened = (await initiate(service)).data;
    const result = await service.authorizePayment({ data: opened } as never);
    expect(result.status).toBe(PaymentSessionStatus.REQUIRES_MORE);
    expect((result.data as Record<string, unknown>).last_error).toBe("payment_signature_missing");
  });

  it("records the facilitator's refusal and does not settle", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    service.facilitator.verdict.verify = { isValid: false, invalidReason: "insufficient_funds" };
    const result = await service.authorizePayment({ data } as never);
    expect(result.status).toBe(PaymentSessionStatus.ERROR);
    expect((result.data as Record<string, unknown>).last_error).toBe("insufficient_funds");
    expect(service.facilitator.calls.map((call) => call.step)).toEqual(["verify"]);
  });

  it("records a refused settlement, and an unknown outcome loudly", async () => {
    const { service, logger } = buildService();
    const data = await signedSession(service);
    service.facilitator.verdict.settle = { success: false, errorReason: "invalid_exact_evm_transaction_failed", transaction: "", network: "eip155:84532" };
    const refused = await service.authorizePayment({ data } as never);
    expect((refused.data as Record<string, unknown>).last_error).toBe("invalid_exact_evm_transaction_failed");

    service.facilitator.verdict.settle = "http-500";
    const unknown = await service.authorizePayment({ data } as never);
    expect(unknown.status).toBe(PaymentSessionStatus.ERROR);
    expect((unknown.data as Record<string, unknown>).last_error).toBe("settle_outcome_unknown");
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`settlement outcome UNKNOWN for payer ${PAYER}`));
  });

  it("pays nothing to an address the owner has since replaced", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    mockReadSecret.mockResolvedValue({ ...SECRET, credentials: { ...SECRET.credentials, pay_to: `0x${"33".repeat(20)}` } });
    const result = await service.authorizePayment({ data } as never);
    expect((result.data as Record<string, unknown>).last_error).toBe("pay_to_changed");
    expect(service.facilitator.calls).toHaveLength(0);
  });

  it("refuses an authorization another session already settled", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    mockFindSessions.mockResolvedValue([
      { id: "payses_other", payment_collection_id: "pc_2", status: "authorized", data: { settled_at: "x", transaction: "0x1" } },
    ]);
    const result = await service.authorizePayment({ data } as never);
    expect((result.data as Record<string, unknown>).last_error).toBe("authorization_already_settled");
    expect(service.facilitator.calls).toHaveLength(0);
  });

  it("settles nothing new where the instance takes no cryptocurrency", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    process.env[FLAG] = "false";
    await expect(service.authorizePayment({ data } as never)).rejects.toThrow("PAYMENTS_CRYPTO_AVAILABLE");
  });
});

describe("after settling", () => {
  it("captures only a settled payment, and books a refund the owner sends", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    await expect(service.capturePayment({ data } as never)).rejects.toThrow("never settled");
    const settled = (await service.authorizePayment({ data } as never)).data;

    await expect(service.capturePayment({ data: settled } as never)).resolves.toEqual({ data: settled });
    const refunded = await service.refundPayment({ data: settled, amount: 10 } as never);
    expect((refunded.data as unknown as X402SessionData).refunds).toEqual([
      { amount: "10000000", to: PAYER.toLowerCase(), network: "eip155:84532", created_at: expect.any(String) },
    ]);
  });

  it("logs a cancel that comes after the money moved, and changes nothing", async () => {
    const { service, logger } = buildService();
    const settled = (await service.authorizePayment({ data: await signedSession(service) } as never)).data;
    await expect(service.cancelPayment({ data: settled } as never)).resolves.toEqual({ data: settled });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("canceled AFTER settling"));
  });

  it("reports a settled session as authorized and anything else as pending, without calling out", async () => {
    const { service } = buildService();
    const data = await signedSession(service);
    expect((await service.getPaymentStatus({ data } as never)).status).toBe(PaymentSessionStatus.PENDING);
    const settled = (await service.authorizePayment({ data } as never)).data;
    expect((await service.getPaymentStatus({ data: settled } as never)).status).toBe(PaymentSessionStatus.AUTHORIZED);
  });
});
