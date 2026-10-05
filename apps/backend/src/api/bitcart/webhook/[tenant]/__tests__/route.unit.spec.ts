import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * ask-20261005-070255-438f, stage 2: Bitcart's per-shop notification. Bitcart
 * signs nothing, so what this file proves is that the body decides nothing:
 * a body that says "complete" while the server says "paid" pays nothing, an
 * invoice another shop issued is ignored, a repeated notification of a paid
 * session does not pay twice (and reads nothing), and on an instance without
 * cryptocurrency the route reads nothing at all. The shop's row, the invoice
 * read and the payment workflow are mocked; the settlement logic is real.
 */

jest.mock("@medusajs/medusa/core-flows", () => {
  const run = jest.fn(async () => ({ result: {} }));
  return { __run: run, processPaymentWorkflow: () => ({ run }) };
});

jest.mock("../../../../../tenant-secrets/bitcart", () => ({
  ...jest.requireActual("../../../../../tenant-secrets/bitcart"),
  readBitcartSecretPublic: jest.fn(),
}));

jest.mock("../../../../../bitcart/client", () => ({
  ...jest.requireActual("../../../../../bitcart/client"),
  getBitcartInvoice: jest.fn(),
}));

import { POST } from "../route";
import { bitcartInvoice, bitcartSessionData } from "../../../../../bitcart/__tests__/fixtures";
import type { BitcartSessionData } from "../../../../../bitcart/session";

const { __run: workflowRun } = jest.requireMock("@medusajs/medusa/core-flows") as { __run: jest.Mock };
const { readBitcartSecretPublic } = jest.requireMock("../../../../../tenant-secrets/bitcart") as {
  readBitcartSecretPublic: jest.Mock;
};
const { getBitcartInvoice } = jest.requireMock("../../../../../bitcart/client") as { getBitcartInvoice: jest.Mock };

const TENANT_ID = "ten_1";

const SECRET = {
  id: "tis_1",
  tenant_id: TENANT_ID,
  is_enabled: true,
  credentials: {
    server_url: "https://pay.example.com/api",
    admin_url: "https://pay.example.com/admin",
    store_id: "01JSTORE1",
    api_key: "bitcart-token",
  },
};

type Row = { id: string; amount: string; currency_code: string; status: string; data: BitcartSessionData };

const sessionRow = (overrides: Partial<Row> = {}): Row => ({
  id: "payses_1",
  amount: "25.5",
  currency_code: "usd",
  status: "pending",
  data: bitcartSessionData(),
  ...overrides,
});

const buildPg = (row: Row | undefined) => {
  const queried: string[] = [];
  const table = {
    __invoiceId: "",
    select: () => table,
    where: () => table,
    whereRaw: (_sql: string, [invoiceId]: [string]) => {
      table.__invoiceId = invoiceId;
      queried.push(invoiceId);
      return table;
    },
    whereNull: () => table,
    orderBy: () => table,
    first: async () => (row && row.data.invoice_id === table.__invoiceId ? row : undefined),
  };
  const pg = (name: string) => {
    if (name === "payment_session") return table;
    throw new Error(`unexpected table ${name}`);
  };
  return { pg, queried };
};

const notify = async (options: {
  body?: Record<string, unknown>;
  row?: Row | null;
  secret?: typeof SECRET | null;
  tenant?: string;
}) => {
  readBitcartSecretPublic.mockResolvedValue(options.secret === undefined ? SECRET : options.secret);
  const { pg, queried } = buildPg(options.row === null ? undefined : (options.row ?? sessionRow()));
  const payment = { updatePaymentSession: jest.fn(async (_input: Record<string, unknown>) => ({})) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const services: Record<string, unknown> = {
    [ContainerRegistrationKeys.LOGGER]: logger,
    [ContainerRegistrationKeys.PG_CONNECTION]: pg,
    [Modules.PAYMENT]: payment,
  };

  const req = {
    params: { tenant: options.tenant ?? TENANT_ID },
    headers: {},
    body: options.body ?? { id: "01JINV1", status: "complete" },
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
  return { ...answer, updates: payment.updatePaymentSession.mock.calls.map((call) => call[0]), logger, queried };
};

const FLAG = "PAYMENTS_CRYPTO_AVAILABLE";
const previousFlag = process.env[FLAG];

beforeEach(() => {
  workflowRun.mockReset();
  workflowRun.mockImplementation(async () => ({ result: {} }));
  readBitcartSecretPublic.mockReset();
  getBitcartInvoice.mockReset();
  getBitcartInvoice.mockResolvedValue(bitcartInvoice({ status: "complete" }));
  process.env[FLAG] = "true";
});

afterAll(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
});

describe("POST /bitcart/webhook/:tenant", () => {
  it("reads the invoice from the shop's own server with the shop's token, then completes the session once", async () => {
    const answer = await notify({});

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ status: "ok", outcome: "captured" });
    expect(getBitcartInvoice).toHaveBeenCalledWith(
      { serverUrl: SECRET.credentials.server_url, storeId: "01JSTORE1", apiKey: "bitcart-token" },
      "01JINV1",
    );
    expect(readBitcartSecretPublic).toHaveBeenCalledWith(expect.anything(), TENANT_ID, expect.anything(), {
      includeDisabled: true,
    });
    expect(workflowRun).toHaveBeenCalledTimes(1);
    expect(answer.updates[0]).toMatchObject({ data: { last_event: "complete", invoice_status: "complete" } });
  });

  it("pays nothing when the body says complete and the server says the transfer is only seen", async () => {
    getBitcartInvoice.mockResolvedValue(bitcartInvoice({ status: "paid" }));

    const answer = await notify({ body: { id: "01JINV1", status: "complete" } });

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ status: "ok", outcome: "updated" });
    expect(workflowRun).not.toHaveBeenCalled();
    expect(answer.updates[0]).toMatchObject({ status: "pending", data: { invoice_status: "paid" } });
  });

  it("answers a repeated notification of a paid session without reading the server or paying again", async () => {
    const paid = sessionRow({
      status: "authorized",
      data: bitcartSessionData({ invoice_status: "complete", confirmed_at: "2026-10-05T12:00:00.000Z" }),
    });

    const answer = await notify({ row: paid });

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ status: "ok", outcome: "already_captured" });
    expect(getBitcartInvoice).not.toHaveBeenCalled();
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("never pays an invoice the server reports for another store", async () => {
    getBitcartInvoice.mockResolvedValue(bitcartInvoice({ status: "complete", store_id: "01JOTHERSTORE" }));

    const answer = await notify({});

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ status: "ok", outcome: "mismatch" });
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("ignores an invoice no session of this shop issued, and one issued for another shop", async () => {
    const unknown = await notify({ row: null });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ status: "ignored", reason: "unknown_invoice" });

    const foreign = await notify({ row: sessionRow({ data: bitcartSessionData({ tenant_id: "ten_other" }) }) });
    expect(foreign.body).toEqual({ status: "ignored", reason: "unknown_invoice" });

    expect(getBitcartInvoice).not.toHaveBeenCalled();
    expect(workflowRun).not.toHaveBeenCalled();
  });

  it("refuses a body without a plausible invoice id before any query, and a shop with no store", async () => {
    const empty = await notify({ body: { status: "complete" } });
    expect(empty.status).toBe(400);
    expect(empty.body).toEqual({ status: "error", reason: "malformed_payload" });
    expect(empty.queried).toEqual([]);

    const injected = await notify({ body: { id: "x' or '1'='1", status: "complete" } });
    expect(injected.status).toBe(400);

    const notConfigured = await notify({ secret: null });
    expect(notConfigured.status).toBe(404);
    expect(notConfigured.body).toEqual({ status: "error", reason: "shop_not_configured" });
  });

  it("keeps only a status-shaped announcement for the log", async () => {
    getBitcartInvoice.mockResolvedValue(bitcartInvoice({ status: "paid" }));

    const answer = await notify({ body: { id: "01JINV1", status: "<img src=x>" } });

    expect(answer.updates[0]).toMatchObject({ data: { last_event: null } });
  });

  it("answers 502 when the server cannot be read and 500 when completion fails, leaving both to the sweep", async () => {
    getBitcartInvoice.mockRejectedValueOnce(new Error("Bitcart answered HTTP 503"));
    const unreadable = await notify({});
    expect(unreadable.status).toBe(502);
    expect(unreadable.body).toEqual({ status: "error", reason: "invoice_unreadable" });

    workflowRun.mockRejectedValueOnce(new Error("cart locked"));
    const failed = await notify({});
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ status: "error", reason: "completion_failed" });
  });

  it("reads nothing on an instance without cryptocurrency", async () => {
    delete process.env[FLAG];

    const answer = await notify({});

    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ status: "ignored", reason: "unavailable" });
    expect(readBitcartSecretPublic).not.toHaveBeenCalled();
    expect(getBitcartInvoice).not.toHaveBeenCalled();
    expect(answer.queried).toEqual([]);
  });
});
