import { createHmac } from "node:crypto";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f: BTCPay's per-shop webhook. `BTCPay-Sig` is checked
 * for real (`verifyBtcpaySignature` is not mocked); the shop's row, the
 * Greenfield read and the payment workflow are. What the brief asks for, each
 * with a request: a good, a wrong, a missing and a tampered signature; the
 * invoice re-read from the server whatever the body says; ignored events
 * answered 2xx; and a repeated delivery that does not pay twice.
 */

jest.mock("@medusajs/medusa/core-flows", () => {
  const run = jest.fn(async () => ({ result: {} }));
  return { __run: run, processPaymentWorkflow: () => ({ run }) };
});

jest.mock("../../../../../tenant-secrets/btcpay", () => ({
  ...jest.requireActual("../../../../../tenant-secrets/btcpay"),
  readBtcpaySecretPublic: jest.fn(),
}));

jest.mock("../../../../../btcpay/client", () => ({
  ...jest.requireActual("../../../../../btcpay/client"),
  getBtcpayInvoice: jest.fn(),
}));

import { POST } from "../route";
import { invoice, sessionData } from "../../../../../btcpay/__tests__/fixtures";
import type { BtcpaySessionData } from "../../../../../btcpay/session";

const { __run: workflowRun } = jest.requireMock("@medusajs/medusa/core-flows") as { __run: jest.Mock };
const { readBtcpaySecretPublic } = jest.requireMock("../../../../../tenant-secrets/btcpay") as {
  readBtcpaySecretPublic: jest.Mock;
};
const { getBtcpayInvoice } = jest.requireMock("../../../../../btcpay/client") as { getBtcpayInvoice: jest.Mock };

const TENANT_ID = "ten_1";
const WEBHOOK_SECRET = "whsec-of-the-store";

const SECRET = {
  id: "tis_1",
  tenant_id: TENANT_ID,
  is_enabled: true,
  credentials: {
    server_url: "https://pay.example.com",
    store_id: "Store1",
    api_key: "greenfield-key",
    webhook_secret: WEBHOOK_SECRET,
  },
};

const sign = (body: Buffer, secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

type Row = { id: string; amount: string; currency_code: string; status: string; data: BtcpaySessionData };

const sessionRow = (overrides: Partial<Row> = {}): Row => ({
  id: "payses_1",
  amount: "25.5",
  currency_code: "usd",
  status: "pending",
  data: sessionData(),
  ...overrides,
});

const buildPg = (row: Row | undefined) => {
  const table = {
    __invoiceId: "",
    select: () => table,
    where: () => table,
    whereRaw: (_sql: string, [invoiceId]: [string]) => {
      table.__invoiceId = invoiceId;
      return table;
    },
    whereNull: () => table,
    orderBy: () => table,
    first: async () => (row && row.data.invoice_id === table.__invoiceId ? row : undefined),
  };
  return (name: string) => {
    if (name === "payment_session") return table;
    throw new Error(`unexpected table ${name}`);
  };
};

const settledBody = { type: "InvoiceSettled", invoiceId: "inv_1", storeId: "Store1", deliveryId: "d_1" };

const callWebhook = async (options: {
  bodyObj?: Record<string, unknown>;
  signature?: string | null;
  row?: Row;
  secret?: typeof SECRET | null;
  noRawBody?: boolean;
}) => {
  const bodyObj = options.bodyObj ?? settledBody;
  readBtcpaySecretPublic.mockResolvedValue(options.secret === undefined ? SECRET : options.secret);

  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const signature = options.signature === undefined ? sign(rawBody, WEBHOOK_SECRET) : options.signature;
  const payment = { updatePaymentSession: jest.fn(async (_input: Record<string, unknown>) => ({})) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.LOGGER]: logger,
    [ContainerRegistrationKeys.PG_CONNECTION]: buildPg(options.row ?? sessionRow()),
    [Modules.PAYMENT]: payment,
  };

  const req = {
    params: { tenant: TENANT_ID },
    headers: signature === null ? {} : { "btcpay-sig": signature },
    body: bodyObj,
    ...(options.noRawBody ? {} : { rawBody }),
    scope: { resolve: (key: string) => services[key] },
  };
  const answer: { status: number; body?: Record<string, unknown> } = { status: 0 };
  const res = {
    status(code: number) {
      answer.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      answer.body = body;
      return res;
    },
  };

  await POST(req as never, res as never);
  return { ...answer, updates: payment.updatePaymentSession.mock.calls.map((call) => call[0]), logger };
};

beforeEach(() => {
  workflowRun.mockReset();
  workflowRun.mockImplementation(async () => ({ result: {} }));
  readBtcpaySecretPublic.mockReset();
  getBtcpayInvoice.mockReset();
  getBtcpayInvoice.mockResolvedValue(invoice({ status: "Settled" }));
});

describe("BTCPay webhook signature", () => {
  it("accepts a correctly signed delivery, re-reads the invoice and completes the payment", async () => {
    const result = await callWebhook({});

    expect(result).toMatchObject({ status: 200, body: { status: "ok", outcome: "captured" } });
    expect(getBtcpayInvoice).toHaveBeenCalledWith(
      { serverUrl: "https://pay.example.com", storeId: "Store1", apiKey: "greenfield-key" },
      "inv_1",
    );
    expect(workflowRun).toHaveBeenCalledTimes(1);
  });

  it("rejects a signature made with another secret with 401 and reads nothing", async () => {
    const result = await callWebhook({ signature: sign(Buffer.from(JSON.stringify(settledBody)), "another-secret") });

    expect(result.status).toBe(401);
    expect(getBtcpayInvoice).not.toHaveBeenCalled();
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("rejects a missing header and a header without the sha256= prefix", async () => {
    expect((await callWebhook({ signature: null })).status).toBe(401);
    const bare = sign(Buffer.from(JSON.stringify(settledBody)), WEBHOOK_SECRET).slice("sha256=".length);
    expect((await callWebhook({ signature: bare })).status).toBe(401);
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("rejects a tampered body: the signature of the original bytes over a changed body", async () => {
    const genuine = sign(Buffer.from(JSON.stringify(settledBody)), WEBHOOK_SECRET);

    const result = await callWebhook({ bodyObj: { ...settledBody, invoiceId: "inv_2" }, signature: genuine });

    expect(result.status).toBe(401);
  });

  it("answers 400 when the raw body was not preserved, and 404 for a shop without a store", async () => {
    expect((await callWebhook({ noRawBody: true })).status).toBe(400);
    expect((await callWebhook({ secret: null })).status).toBe(404);
  });
});

describe("BTCPay webhook decides from the server, not from the body", () => {
  it("a body that says Settled settles nothing while the server says Processing", async () => {
    getBtcpayInvoice.mockResolvedValue(invoice({ status: "Processing" }));

    const result = await callWebhook({});

    expect(result).toMatchObject({ status: 200, body: { status: "ok", outcome: "updated" } });
    expect(workflowRun).not.toHaveBeenCalled();
    expect(result.updates[0]).toMatchObject({ status: "pending", data: expect.objectContaining({ invoice_status: "Processing" }) });
  });

  it("an expired invoice cancels the session", async () => {
    getBtcpayInvoice.mockResolvedValue(invoice({ status: "Expired" }));

    const result = await callWebhook({ bodyObj: { ...settledBody, type: "InvoiceExpired" } });

    expect(result.status).toBe(200);
    expect(result.updates[0]).toMatchObject({ status: "canceled" });
  });

  it("answers 502 when the shop's server cannot be read, so BTCPay redelivers", async () => {
    getBtcpayInvoice.mockRejectedValue(new Error("BTCPay Server answered HTTP 503"));

    const result = await callWebhook({});

    expect(result.status).toBe(502);
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("answers 500 when the order cannot be completed, so BTCPay redelivers", async () => {
    workflowRun.mockRejectedValueOnce(new Error("lock timeout"));

    const result = await callWebhook({});

    expect(result).toMatchObject({ status: 500, body: { reason: "completion_failed" } });
  });
});

describe("BTCPay webhook ignores, with a 2xx, what is not this shop's business", () => {
  it.each([
    ["a payout event", { type: "PayoutCreated", storeId: "Store1" }],
    ["an invoice event without an invoice id", { type: "InvoiceSettled", storeId: "Store1" }],
    ["another store's invoice", { ...settledBody, storeId: "Store2" }],
    ["an invoice no session of this shop issued", { ...settledBody, invoiceId: "inv_pos" }],
  ])("%s", async (_name, bodyObj) => {
    const result = await callWebhook({ bodyObj });

    expect(result).toMatchObject({ status: 200, body: { status: "ignored" } });
    expect(getBtcpayInvoice).not.toHaveBeenCalled();
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("an invoice of another tenant's session", async () => {
    const result = await callWebhook({ row: sessionRow({ data: sessionData({ tenant_id: "ten_other" }) }) });

    expect(result).toMatchObject({ status: 200, body: { status: "ignored", reason: "unknown_invoice" } });
  });

  it("answers 400 for a signed body with no event type", async () => {
    expect((await callWebhook({ bodyObj: { invoiceId: "inv_1" } })).status).toBe(400);
  });
});

describe("BTCPay webhook idempotency", () => {
  it("a redelivery after the payment went through does not process it twice", async () => {
    const first = await callWebhook({});
    expect(first.body).toMatchObject({ outcome: "captured" });
    expect(workflowRun).toHaveBeenCalledTimes(1);

    // The second delivery sees the row as the first one left it: confirmed and authorized.
    const confirmed = sessionRow({
      status: "authorized",
      data: (first.updates[0] as { data: BtcpaySessionData }).data,
    });
    const second = await callWebhook({
      bodyObj: { ...settledBody, deliveryId: "d_2", isRedelivery: true },
      row: confirmed,
    });

    expect(second).toMatchObject({ status: 200, body: { status: "ok", outcome: "already_captured" } });
    expect(workflowRun).toHaveBeenCalledTimes(1);
  });
});
