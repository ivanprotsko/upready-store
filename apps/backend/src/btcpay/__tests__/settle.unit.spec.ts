import { Modules, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f: `settleBtcpaySession`, the one place the webhook
 * and the sweep turn an invoice they read into a paid order. The brief's
 * idempotency requirement is the core of this file: a repeated delivery of the
 * same settled invoice must not process the payment twice, while a run that
 * failed half-way must be retried.
 */

jest.mock("@medusajs/medusa/core-flows", () => {
  const run = jest.fn(async () => ({ result: {} }));
  return { __run: run, processPaymentWorkflow: () => ({ run }) };
});

import { settleBtcpaySession, type BtcpaySessionRow } from "../settle";
import { invoice, sessionData } from "./fixtures";

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

const row = (overrides: Partial<BtcpaySessionRow> = {}, data = sessionData()): BtcpaySessionRow => ({
  id: "payses_1",
  amount: "25.5",
  currency_code: "usd",
  status: "pending",
  data,
  ...overrides,
});

beforeEach(() => {
  workflowRun.mockReset();
  workflowRun.mockImplementation(async () => ({ result: {} }));
  Object.values(logger).forEach((fn) => fn.mockClear());
});

describe("settleBtcpaySession", () => {
  it("captures a Settled invoice: stamps confirmed_at, then runs the payment workflow once", async () => {
    const { container, updatePaymentSession } = setup();

    const outcome = await settleBtcpaySession(container, row(), invoice({ status: "Settled" }), {
      event: "InvoiceSettled",
      logger: logger as never,
      source: "webhook",
    });

    expect(outcome).toBe("captured");
    expect(updatePaymentSession).toHaveBeenCalledTimes(1);
    const written = updatePaymentSession.mock.calls[0][0] as { data: Record<string, unknown>; status?: string };
    expect(written.data.confirmed_at).toEqual(expect.any(String));
    expect(written.data.last_event).toBe("InvoiceSettled");
    expect(written.status).toBeUndefined();
    expect(workflowRun).toHaveBeenCalledTimes(1);
    expect(workflowRun).toHaveBeenCalledWith({
      input: { action: PaymentActions.SUCCESSFUL, data: { session_id: "payses_1", amount: 25.5 } },
    });
  });

  it("does not process a repeated delivery of an invoice already settled into an authorized session", async () => {
    const { container, updatePaymentSession } = setup();
    const settled = sessionData({
      invoice_status: "Settled",
      confirmed_at: "2026-10-05T12:00:00.000Z",
      last_event: "InvoiceSettled",
      expires_at: new Date(1_790_000_900_000).toISOString(),
      monitoring_expires_at: new Date(1_790_087_300_000).toISOString(),
    });

    const outcome = await settleBtcpaySession(
      container,
      row({ status: "authorized" }, settled),
      invoice({ status: "Settled" }),
      { event: "InvoiceSettled", logger: logger as never, source: "webhook" },
    );

    expect(outcome).toBe("already_captured");
    expect(workflowRun).not.toHaveBeenCalled();
    expect(updatePaymentSession).not.toHaveBeenCalled();
  });

  it("runs the workflow again when an earlier run stamped confirmed_at but never authorized the session", async () => {
    const { container } = setup();
    const halfDone = sessionData({ invoice_status: "Settled", confirmed_at: "2026-10-05T12:00:00.000Z" });

    const outcome = await settleBtcpaySession(container, row({ status: "pending" }, halfDone), invoice({ status: "Settled" }), {
      logger: logger as never,
      source: "sweep",
    });

    expect(outcome).toBe("captured");
    expect(workflowRun).toHaveBeenCalledTimes(1);
  });

  it("throws when the workflow fails, so the webhook can answer 500 and BTCPay redeliver", async () => {
    const { container } = setup();
    workflowRun.mockRejectedValueOnce(new Error("lock timeout"));

    await expect(
      settleBtcpaySession(container, row(), invoice({ status: "Settled" }), { logger: logger as never, source: "webhook" }),
    ).rejects.toThrow("lock timeout");
  });

  it("writes an expired invoice as a canceled session and runs nothing", async () => {
    const { container, updatePaymentSession } = setup();

    const outcome = await settleBtcpaySession(container, row(), invoice({ status: "Expired" }), {
      event: "InvoiceExpired",
      logger: logger as never,
      source: "webhook",
    });

    expect(outcome).toBe("updated");
    expect(updatePaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "payses_1", status: PaymentSessionStatus.CANCELED }),
    );
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("writes nothing when nothing changed since the last reading", async () => {
    const { container, updatePaymentSession } = setup();
    const known = sessionData({
      expires_at: new Date(1_790_000_900_000).toISOString(),
      monitoring_expires_at: new Date(1_790_087_300_000).toISOString(),
    });

    const outcome = await settleBtcpaySession(container, row({}, known), invoice(), {
      logger: logger as never,
      source: "sweep",
    });

    expect(outcome).toBe("unchanged");
    expect(updatePaymentSession).not.toHaveBeenCalled();
  });

  it("never captures a Settled invoice whose amount differs from the session's", async () => {
    const { container } = setup();

    const outcome = await settleBtcpaySession(container, row({ amount: "99" }), invoice({ status: "Settled" }), {
      logger: logger as never,
      source: "webhook",
    });

    expect(outcome).toBe("mismatch");
    expect(workflowRun).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("records, but never reverses, a paid session BTCPay later reports invalid", async () => {
    const { container, updatePaymentSession } = setup();
    const paid = sessionData({ invoice_status: "Settled", confirmed_at: "2026-10-05T12:00:00.000Z" });

    const outcome = await settleBtcpaySession(container, row({ status: "authorized" }, paid), invoice({ status: "Invalid", additionalStatus: "Marked" }), {
      logger: logger as never,
      source: "sweep",
    });

    expect(outcome).toBe("updated");
    const written = updatePaymentSession.mock.calls[0][0] as { status?: string; data: Record<string, unknown> };
    expect(written.status).toBeUndefined();
    expect(written.data.invoice_status).toBe("Invalid");
    expect(written.data.confirmed_at).toBe("2026-10-05T12:00:00.000Z");
    expect(logger.warn).toHaveBeenCalled();
  });
});
