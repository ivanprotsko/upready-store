import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f, stage 2: the sweep job, which for Bitcart is the
 * real settlement path (one unsigned notification, never retried). The query
 * is faked (its SQL runs against Postgres in the HTTP suite); what this file
 * pins down is the loop: each open session's invoice is read from its own
 * shop's server and applied the way the notification route applies it, a
 * shop without a store is skipped, one failing server does not stop the
 * others, and the run stops starting reads once its time budget is spent.
 */

jest.mock("../../tenant-secrets/bitcart", () => ({
  ...jest.requireActual("../../tenant-secrets/bitcart"),
  readBitcartSecretPublic: jest.fn(),
}));

jest.mock("../../bitcart/client", () => ({
  ...jest.requireActual("../../bitcart/client"),
  getBitcartInvoice: jest.fn(),
}));

// Replaced whole rather than spread over `requireActual`: the real module pulls
// in `@medusajs/medusa/core-flows`, which this loop never reaches.
jest.mock("../../bitcart/settle", () => ({
  BITCART_SESSION_COLUMNS: ["id", "data", "amount", "currency_code", "status"],
  settleBitcartSession: jest.fn(),
}));

import bitcartInvoiceSweepJob, { config, sweepBitcartInvoices, TIME_BUDGET_MS } from "../bitcart-invoice-sweep";
import { readBitcartSecretPublic } from "../../tenant-secrets/bitcart";
import { getBitcartInvoice } from "../../bitcart/client";
import { settleBitcartSession } from "../../bitcart/settle";
import { bitcartInvoice, bitcartSessionData } from "../../bitcart/__tests__/fixtures";

const mockReadSecret = readBitcartSecretPublic as jest.Mock;
const mockGetInvoice = getBitcartInvoice as jest.Mock;
const mockSettle = settleBitcartSession as jest.Mock;

const secretFor = (tenantId: string) => ({
  id: `tis_${tenantId}`,
  tenant_id: tenantId,
  is_enabled: false,
  credentials: {
    server_url: `https://${tenantId}.example.com/api`,
    admin_url: `https://${tenantId}.example.com/admin`,
    store_id: "01JSTORE1",
    api_key: "token",
  },
});

const rowFor = (id: string, tenantId: string, invoiceId: string) => ({
  id,
  amount: "25.5",
  currency_code: "usd",
  status: "pending",
  data: bitcartSessionData({ tenant_id: tenantId, invoice_id: invoiceId }),
});

const buildContainer = (rows: unknown[]) => {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "where", "orWhere", "whereNull", "whereNotIn", "whereRaw", "orWhereRaw", "orderBy"]) {
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

const FLAG = "PAYMENTS_CRYPTO_AVAILABLE";
const previousFlag = process.env[FLAG];

afterAll(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
});

beforeEach(() => {
  process.env[FLAG] = "true";
  mockReadSecret.mockReset();
  mockGetInvoice.mockReset();
  mockSettle.mockReset();
  mockReadSecret.mockImplementation(async (_pg: unknown, tenantId: string) =>
    tenantId === "ten_gone" ? null : secretFor(tenantId),
  );
  mockGetInvoice.mockImplementation(async (_connection: unknown, invoiceId: string) => bitcartInvoice({ id: invoiceId }));
  mockSettle.mockResolvedValue("updated");
});

describe("bitcart-invoice-sweep", () => {
  it("runs every minute under a name of its own", () => {
    expect(config).toEqual({ name: "bitcart-invoice-sweep", schedule: "* * * * *" });
  });

  it("returns before its first query on an instance without cryptocurrency", async () => {
    const { container, calls } = buildContainer([rowFor("ps_1", "ten_a", "01JINV1")]);
    delete process.env[FLAG];

    const summary = await sweepBitcartInvoices(container);

    expect(summary).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(calls).toHaveLength(0);
    expect(mockGetInvoice).not.toHaveBeenCalled();
  });

  it("asks only for Bitcart sessions that are not paid, not settled for good, newest first, in a bounded batch", async () => {
    const { container, calls } = buildContainer([]);

    await sweepBitcartInvoices(container);

    expect(calls[0]).toEqual({ method: "table", args: ["payment_session"] });
    expect(calls).toContainEqual({ method: "where", args: [{ provider_id: "pp_bitcart_bitcart" }] });
    expect(calls).toContainEqual({ method: "whereNotIn", args: ["status", ["authorized", "captured"]] });
    expect(calls).toContainEqual({
      method: "whereRaw",
      args: [`coalesce("data"->>'invoice_status', '') not in (?, ?)`, ["invalid", "refunded"]],
    });
    expect(calls).toContainEqual({ method: "orWhereRaw", args: [`("data"->>'watch_until')::timestamptz > now()`] });
    expect(calls).toContainEqual({ method: "orderBy", args: ["created_at", "desc"] });
    expect(calls).toContainEqual({ method: "limit", args: [50] });
    expect(mockGetInvoice).not.toHaveBeenCalled();
  });

  it("reads each invoice from its own shop's server and applies it as the notification route does", async () => {
    const { container } = buildContainer([rowFor("ps_1", "ten_a", "01JINVA"), rowFor("ps_2", "ten_b", "01JINVB")]);

    const summary = await sweepBitcartInvoices(container);

    expect(summary).toEqual({ checked: 2, changed: 2, failed: 0 });
    expect(mockReadSecret).toHaveBeenCalledWith(expect.anything(), "ten_a", expect.anything(), { includeDisabled: true });
    expect(mockGetInvoice.mock.calls.map((call) => [call[0].serverUrl, call[1]])).toEqual([
      ["https://ten_a.example.com/api", "01JINVA"],
      ["https://ten_b.example.com/api", "01JINVB"],
    ]);
    expect(mockSettle).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ id: "ps_1" }),
      expect.objectContaining({ id: "01JINVA" }),
      expect.objectContaining({ source: "sweep" }),
    );
  });

  it("reads a shop's row once per run, skips a shop with no store, and survives one failing server", async () => {
    const { container, logger } = buildContainer([
      rowFor("ps_1", "ten_a", "01JINV1"),
      rowFor("ps_2", "ten_a", "01JINV2"),
      rowFor("ps_3", "ten_gone", "01JINV3"),
      rowFor("ps_4", "ten_b", "01JINV4"),
    ]);
    mockGetInvoice.mockImplementation(async (_connection: unknown, invoiceId: string) => {
      if (invoiceId === "01JINV2") throw new Error("Bitcart answered HTTP 502");
      return bitcartInvoice({ id: invoiceId });
    });
    mockSettle.mockResolvedValue("unchanged");

    const summary = await sweepBitcartInvoices(container);

    expect(summary).toEqual({ checked: 3, changed: 0, failed: 1 });
    expect(mockReadSecret.mock.calls.filter((call) => call[1] === "ten_a")).toHaveLength(1);
    expect(mockSettle).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("01JINV2"));
  });

  it("stops starting reads once the time budget is spent", async () => {
    const { container, logger } = buildContainer([rowFor("ps_1", "ten_a", "01JINV1"), rowFor("ps_2", "ten_a", "01JINV2")]);
    let clock = 0;
    const now = () => clock;
    mockSettle.mockImplementation(async () => {
      clock += TIME_BUDGET_MS + 1;
      return "updated";
    });

    const summary = await sweepBitcartInvoices(container, { now });

    expect(summary.checked).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("time budget"));
  });

  it("does not let a second run start while one is still going", async () => {
    let release: () => void = () => undefined;
    const { container } = buildContainer([rowFor("ps_1", "ten_a", "01JINV1")]);
    mockSettle.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve("updated");
        }),
    );

    const first = bitcartInvoiceSweepJob(container);
    await new Promise((resolve) => setImmediate(resolve));
    await bitcartInvoiceSweepJob(container);
    expect(mockGetInvoice).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
