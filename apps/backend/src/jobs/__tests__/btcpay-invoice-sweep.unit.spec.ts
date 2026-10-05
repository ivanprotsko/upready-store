import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f: the sweep job, BTCPay's safety net. The query is
 * faked (its SQL is exercised by the HTTP suite against Postgres); what this
 * file pins down is the loop: each open session's invoice is read from its own
 * shop's server and applied the way the webhook applies it, a shop without a
 * store is skipped, one failing server does not stop the others, and the run
 * stops starting reads once its time budget is spent.
 */

jest.mock("../../tenant-secrets/btcpay", () => ({
  ...jest.requireActual("../../tenant-secrets/btcpay"),
  readBtcpaySecretPublic: jest.fn(),
}));

jest.mock("../../btcpay/client", () => ({
  ...jest.requireActual("../../btcpay/client"),
  getBtcpayInvoice: jest.fn(),
}));

// Replaced whole rather than spread over `requireActual`: the real module pulls
// in `@medusajs/medusa/core-flows`, which this loop never reaches.
jest.mock("../../btcpay/settle", () => ({
  BTCPAY_SESSION_COLUMNS: ["id", "data", "amount", "currency_code", "status"],
  settleBtcpaySession: jest.fn(),
}));

import btcpayInvoiceSweepJob, { config, sweepBtcpayInvoices, TIME_BUDGET_MS } from "../btcpay-invoice-sweep";
import { readBtcpaySecretPublic } from "../../tenant-secrets/btcpay";
import { getBtcpayInvoice } from "../../btcpay/client";
import { settleBtcpaySession } from "../../btcpay/settle";
import { invoice, sessionData } from "../../btcpay/__tests__/fixtures";

const mockReadSecret = readBtcpaySecretPublic as jest.Mock;
const mockGetInvoice = getBtcpayInvoice as jest.Mock;
const mockSettle = settleBtcpaySession as jest.Mock;

const secretFor = (tenantId: string) => ({
  id: `tis_${tenantId}`,
  tenant_id: tenantId,
  is_enabled: false,
  credentials: { server_url: `https://${tenantId}.example.com`, store_id: "Store1", api_key: "key", webhook_secret: "s" },
});

const rowFor = (id: string, tenantId: string, invoiceId: string) => ({
  id,
  amount: "25.5",
  currency_code: "usd",
  status: "pending",
  data: sessionData({ tenant_id: tenantId, invoice_id: invoiceId }),
});

const buildContainer = (rows: unknown[]) => {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "where", "whereNull", "whereNotIn", "whereRaw", "orWhereRaw", "orderBy"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      if (typeof args[0] === "function") {
        (args[0] as (b: unknown) => unknown)(builder);
      }
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(rows);
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.LOGGER]: logger,
    [ContainerRegistrationKeys.PG_CONNECTION]: (table: string) => {
      calls.push({ method: "table", args: [table] });
      return builder;
    },
  };
  return { container: { resolve: (key: string) => services[key] } as never, calls, logger };
};

beforeEach(() => {
  mockReadSecret.mockReset();
  mockGetInvoice.mockReset();
  mockSettle.mockReset();
  mockReadSecret.mockImplementation(async (_pg: unknown, tenantId: string) =>
    tenantId === "ten_gone" ? null : secretFor(tenantId),
  );
  mockGetInvoice.mockImplementation(async (_connection: unknown, invoiceId: string) => invoice({ id: invoiceId }));
  mockSettle.mockResolvedValue("updated");
});

describe("btcpay-invoice-sweep", () => {
  it("runs every minute under a unique name", () => {
    expect(config).toEqual({ name: "btcpay-invoice-sweep", schedule: "* * * * *" });
  });

  it("asks only for BTCPay sessions that are not paid, newest first, in a bounded batch", async () => {
    const { container, calls } = buildContainer([]);

    await sweepBtcpayInvoices(container);

    expect(calls[0]).toEqual({ method: "table", args: ["payment_session"] });
    expect(calls).toContainEqual({ method: "where", args: [{ provider_id: "pp_btcpay_btcpay" }] });
    expect(calls).toContainEqual({ method: "whereNotIn", args: ["status", ["authorized", "captured"]] });
    expect(calls).toContainEqual({ method: "orderBy", args: ["created_at", "desc"] });
    expect(calls).toContainEqual({ method: "limit", args: [50] });
    expect(mockGetInvoice).not.toHaveBeenCalled();
  });

  it("reads each invoice from its own shop's server and applies it as the webhook does", async () => {
    const { container } = buildContainer([rowFor("ps_1", "ten_a", "inv_a"), rowFor("ps_2", "ten_b", "inv_b")]);

    const summary = await sweepBtcpayInvoices(container);

    expect(summary).toEqual({ checked: 2, changed: 2, failed: 0 });
    expect(mockReadSecret).toHaveBeenCalledWith(expect.anything(), "ten_a", expect.anything(), { includeDisabled: true });
    expect(mockGetInvoice.mock.calls.map((call) => [call[0].serverUrl, call[1]])).toEqual([
      ["https://ten_a.example.com", "inv_a"],
      ["https://ten_b.example.com", "inv_b"],
    ]);
    expect(mockSettle).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ id: "ps_1" }),
      expect.objectContaining({ id: "inv_a" }),
      expect.objectContaining({ source: "sweep" }),
    );
  });

  it("reads a shop's row once per run, skips a shop with no store, and survives one failing server", async () => {
    const { container, logger } = buildContainer([
      rowFor("ps_1", "ten_a", "inv_1"),
      rowFor("ps_2", "ten_a", "inv_2"),
      rowFor("ps_3", "ten_gone", "inv_3"),
      rowFor("ps_4", "ten_b", "inv_4"),
    ]);
    mockGetInvoice.mockImplementation(async (_connection: unknown, invoiceId: string) => {
      if (invoiceId === "inv_2") throw new Error("BTCPay Server answered HTTP 502");
      return invoice({ id: invoiceId });
    });
    mockSettle.mockResolvedValue("unchanged");

    const summary = await sweepBtcpayInvoices(container);

    expect(summary).toEqual({ checked: 3, changed: 0, failed: 1 });
    expect(mockReadSecret.mock.calls.filter((call) => call[1] === "ten_a")).toHaveLength(1);
    expect(mockSettle).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("inv_2"));
  });

  it("stops starting reads once the time budget is spent", async () => {
    const { container, logger } = buildContainer([rowFor("ps_1", "ten_a", "inv_1"), rowFor("ps_2", "ten_a", "inv_2")]);
    let clock = 0;
    const now = () => clock;
    mockSettle.mockImplementation(async () => {
      clock += TIME_BUDGET_MS + 1;
      return "updated";
    });

    const summary = await sweepBtcpayInvoices(container, { now });

    expect(summary.checked).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("time budget"));
  });

  it("does not let a second run start while one is still going", async () => {
    let release: () => void = () => undefined;
    const { container } = buildContainer([rowFor("ps_1", "ten_a", "inv_1")]);
    mockSettle.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve("updated");
        }),
    );

    const first = btcpayInvoiceSweepJob(container);
    await new Promise((resolve) => setImmediate(resolve));
    await btcpayInvoiceSweepJob(container);
    expect(mockGetInvoice).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
