import { Modules, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f, stage 2: `settleBitcartSession`, the one place the
 * notification route and the sweep turn an invoice they read into a paid
 * order. Idempotency is the core of this file, as for BTCPay: the same
 * complete invoice read twice must not process the payment twice, while a run
 * that failed half-way must be retried.
 */

jest.mock("@medusajs/medusa/core-flows", () => {
  const run = jest.fn(async () => ({ result: {} }));
  return { __run: run, processPaymentWorkflow: () => ({ run }) };
});

import { bitcartSessionAlreadyPaid, settleBitcartSession, type BitcartSessionRow } from "../settle";
import { bitcartInvoice, bitcartSessionData } from "./fixtures";

const { __run: workflowRun } = jest.requireMock("@medusajs/medusa/core-flows") as { __run: jest.Mock };

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const setup = () => {
  const updatePaymentSession = jest.fn(async (_input: Record<string, unknown>) => ({}));
  const container = {
    resolve: (key: string) => {
      if (key === Modules.PAYMENT) return { updatePaymentSession };
      throw new Error(`unexpected ${key}`);
    },
  };
  return { container: container as never, updatePaymentSession };
};

const row = (overrides: Partial<BitcartSessionRow> = {}, data = bitcartSessionData()): BitcartSessionRow => ({
  id: "payses_1",
  amount: "25.5",
  currency_code: "usd",
  status: "pending",
  data,
  ...overrides,
});

const settle = (container: never, r: BitcartSessionRow, invoice = bitcartInvoice({ status: "complete" })) =>
  settleBitcartSession(container, r, invoice, { event: "complete", logger: logger as never, source: "notification" });

beforeEach(() => {
  workflowRun.mockReset();
  workflowRun.mockImplementation(async () => ({ result: {} }));
  Object.values(logger).forEach((fn) => fn.mockClear());
});

describe("settleBitcartSession", () => {
  it("captures a complete invoice: stamps confirmed_at, then runs the payment workflow once", async () => {
    const { container, updatePaymentSession } = setup();

    const outcome = await settle(container, row());

    expect(outcome).toBe("captured");
    expect(updatePaymentSession).toHaveBeenCalledTimes(1);
    const written = updatePaymentSession.mock.calls[0][0] as { data: Record<string, unknown>; status?: string };
    expect(written.data.confirmed_at).toEqual(expect.any(String));
    expect(written.data.last_event).toBe("complete");
    expect(written.status).toBeUndefined();
    expect(workflowRun).toHaveBeenCalledTimes(1);
    expect(workflowRun).toHaveBeenCalledWith({
      input: { action: PaymentActions.SUCCESSFUL, data: { session_id: "payses_1", amount: 25.5 } },
    });
  });

  it("does not process a complete invoice again once it is settled into an authorized session", async () => {
    const { container, updatePaymentSession } = setup();
    await settle(container, row());
    const first = updatePaymentSession.mock.calls[0][0] as { data: never };

    const outcome = await settle(container, row({ status: "authorized" }, first.data));

    expect(outcome).toBe("already_captured");
    expect(workflowRun).toHaveBeenCalledTimes(1);
    expect(updatePaymentSession).toHaveBeenCalledTimes(1);
    expect(bitcartSessionAlreadyPaid(row({ status: "authorized" }, first.data))).toBe(true);
  });

  it("retries the workflow when an earlier run stamped confirmed_at but never authorized the session", async () => {
    const { container, updatePaymentSession } = setup();
    const halfway = bitcartSessionData({
      invoice_status: "complete",
      confirmed_at: "2026-10-05T12:00:00.000Z",
      expires_at: "2026-10-05T12:05:00.000Z",
      watch_until: "2026-10-06T12:05:00.000Z",
      last_event: "complete",
    });

    const outcome = await settle(container, row({ status: "pending" }, halfway));

    expect(outcome).toBe("captured");
    expect(workflowRun).toHaveBeenCalledTimes(1);
    expect(updatePaymentSession).not.toHaveBeenCalled();
    expect(bitcartSessionAlreadyPaid(row({ status: "pending" }, halfway))).toBe(false);
  });

  it("throws when the workflow fails, so the route answers 500 and the sweep tries again", async () => {
    const { container } = setup();
    workflowRun.mockRejectedValueOnce(new Error("cart locked"));

    await expect(settle(container, row())).rejects.toThrow("cart locked");
  });

  it("never captures an invoice of another store, and says so in the log", async () => {
    const { container, updatePaymentSession } = setup();

    const outcome = await settle(container, row(), bitcartInvoice({ status: "complete", store_id: "01JOTHER" }));

    expect(outcome).toBe("mismatch");
    expect(workflowRun).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("(store_id); not capturing"));
    const written = updatePaymentSession.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(written.data.last_error).toBe("invoice_mismatch:store_id");
    expect(written.data.confirmed_at).toBeNull();
  });

  it("never captures a complete invoice whose price is not the session's own amount", async () => {
    const { container } = setup();

    const outcome = await settle(container, row({ amount: "30" }));

    expect(outcome).toBe("mismatch");
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("writes an expired invoice as canceled, and nothing when it reads the same again", async () => {
    const { container, updatePaymentSession } = setup();

    const outcome = await settle(container, row(), bitcartInvoice({ status: "expired" }));
    expect(outcome).toBe("updated");
    expect(updatePaymentSession.mock.calls[0][0]).toMatchObject({ status: PaymentSessionStatus.CANCELED });

    const stored = (updatePaymentSession.mock.calls[0][0] as { data: never }).data;
    const again = await settleBitcartSession(container, row({ status: "canceled" }, stored), bitcartInvoice({ status: "expired" }), {
      logger: logger as never,
      source: "sweep",
    });
    expect(again).toBe("unchanged");
    expect(updatePaymentSession).toHaveBeenCalledTimes(1);
  });

  it("records a refund of a paid session without un-capturing it", async () => {
    const { container, updatePaymentSession } = setup();
    const paid = bitcartSessionData({
      invoice_status: "complete",
      confirmed_at: "2026-10-05T12:00:00.000Z",
      expires_at: "2026-10-05T12:05:00.000Z",
      watch_until: "2026-10-06T12:05:00.000Z",
    });

    const outcome = await settle(container, row({ status: "authorized" }, paid), bitcartInvoice({ status: "refunded" }));

    expect(outcome).toBe("updated");
    const written = updatePaymentSession.mock.calls[0][0] as { data: Record<string, unknown>; status?: string };
    expect(written.status).toBeUndefined();
    expect(written.data.invoice_status).toBe("refunded");
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("recorded, not reversed"));
  });
});
