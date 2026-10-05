import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * t-2026-10-03-33: an order paid by x402 is captured through the workflow, so
 * `payment.captured` fires (courses, the payment letter). Only settled,
 * uncaptured x402 payments are captured.
 */

const run = jest.fn().mockResolvedValue({ result: {} });
jest.mock("@medusajs/medusa/core-flows", () => ({
  capturePaymentWorkflow: jest.fn(() => ({ run })),
}));

import { captureSettledX402Payments } from "../capture";

const containerWith = (payments: unknown[]) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const query = { graph: jest.fn().mockResolvedValue({ data: [{ id: "order_1", payment_collections: [{ payments }] }] }) };
  const container = {
    resolve: (key: string) => (key === ContainerRegistrationKeys.LOGGER ? logger : key === ContainerRegistrationKeys.QUERY ? query : null),
  };
  return { container: container as never, logger };
};

beforeEach(() => run.mockClear());

describe("captureSettledX402Payments", () => {
  it("captures the settled x402 payment and nothing else", async () => {
    const { container, logger } = containerWith([
      { id: "pay_x402", provider_id: "pp_x402_x402", captured_at: null, canceled_at: null, data: { settled_at: "t", transaction: "0xabc" } },
      { id: "pay_done", provider_id: "pp_x402_x402", captured_at: "t", canceled_at: null, data: { settled_at: "t", transaction: "0x1" } },
      { id: "pay_unsettled", provider_id: "pp_x402_x402", captured_at: null, canceled_at: null, data: { settled_at: null } },
      { id: "pay_robokassa", provider_id: "pp_robokassa_robokassa", captured_at: null, canceled_at: null, data: {} },
    ]);
    await expect(captureSettledX402Payments(container, "order_1")).resolves.toEqual(["pay_x402"]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ input: { payment_id: "pay_x402" } });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("pay_unsettled is not settled"));
  });

  it("does nothing for an order without x402", async () => {
    const { container } = containerWith([]);
    await expect(captureSettledX402Payments(container, "order_1")).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
